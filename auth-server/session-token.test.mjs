import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from './session-token.mjs';

const SESSION = 'A'.repeat(43);
function fakePool({
  token='old-access',
  exp=Date.now()+3600000,
  rowPresent=true,
  failOn=''
}={}) {
  const statements=[];
  const state={
    row:rowPresent?{
      email:'tester@example.test',
      refresh_cipher:'refresh-value',
      access_cipher:token,
      access_expires_ms:exp
    }:null,
    released:false,
    transaction:false
  };
  const db={
    async query(sql,params=[]) {
      statements.push(sql);
      if(failOn&&sql.startsWith(failOn))throw Error('simulated database failure');
      if(sql==='BEGIN')state.transaction=true;
      if(sql==='ROLLBACK')state.transaction=false;
      if(sql==='COMMIT')state.transaction=false;
      if(sql.startsWith('SELECT')) {
        assert.equal(state.transaction,true,'SELECT FOR UPDATE must use the same transaction');
        return {rows:state.row?[{...state.row}]:[]};
      }
      if(sql.startsWith('UPDATE deltos_sessions SET access_cipher')) {
        state.row.access_cipher=params[1];
        state.row.access_expires_ms=params[2];
      }
      if(sql.startsWith('DELETE FROM deltos_sessions'))state.row=null;
      return {rows:[]};
    },
    release(){state.released=true;}
  };
  return {pool:{connect:async()=>db},statements,state};
}
function make(pool,requestRefresh=async()=>({access_token:'new-access',expires_in:3600})) {
  return createSessionToken({
    pool,requestRefresh,
    encrypt:v=>v,decrypt:v=>v,hash:()=> 'hashed-session'
  });
}

test('valid unexpired session: no needless Google refresh',async()=>{
  const db=fakePool();
  const get=make(db.pool,async()=>{throw Error('should not refresh')});
  const result=await get(SESSION);
  assert.equal(result.access_token,'old-access');
  assert.equal(result.email,'tester@example.test');
  assert.equal(db.state.released,true);
  assert.equal(db.state.transaction,false);
  assert.equal(db.statements.filter(s=>s==='COMMIT').length,1);
});

test('expired token: refresh persists and commits atomically',async()=>{
  const db=fakePool({exp:Date.now()-1000});
  let invoked=0;
  const get=make(db.pool,async refresh=>{
    invoked++;
    assert.equal(refresh,'refresh-value');
    return {access_token:'new-access',expires_in:3600};
  });
  assert.equal((await get(SESSION)).access_token,'new-access');
  assert.equal(invoked,1);
  assert.equal(db.state.row.access_cipher,'new-access');
  assert.equal(db.state.transaction,false);
  assert.equal(db.state.released,true);
});

test('temporary Google outage: rollback and retain session',async()=>{
  const db=fakePool({exp:Date.now()-1000});
  const get=make(db.pool,async()=>{const e=Error('unavailable');e.code='temporarily_unavailable';throw e});
  await assert.rejects(get(SESSION),e=>e.statusCode===503);
  assert.equal(db.state.row.refresh_cipher,'refresh-value');
  assert.equal(db.state.transaction,false);
  assert.ok(db.statements.includes('ROLLBACK'));
  assert.equal(db.state.released,true);
});

test('revoked Google grant: expire server session, return reconnect status',async()=>{
  const db=fakePool({exp:Date.now()-1000});
  const get=make(db.pool,async()=>{const e=Error('invalid_grant');e.code='invalid_grant';throw e});
  await assert.rejects(get(SESSION),e=>e.statusCode===401);
  assert.equal(db.state.row,null);
  assert.equal(db.state.transaction,false);
  assert.ok(db.statements.includes('COMMIT'));
  assert.equal(db.state.released,true);
});

test('database failure after lock: rollback before releasing client',async()=>{
  const db=fakePool({failOn:'UPDATE deltos_sessions SET last_used'});
  const get=make(db.pool);
  await assert.rejects(get(SESSION),/database failure/);
  assert.equal(db.state.transaction,false);
  assert.ok(db.statements.includes('ROLLBACK'));
  assert.equal(db.state.released,true);
});

test('missing and malformed sessions never open a DB transaction',async()=>{
  const db=fakePool({rowPresent:false});
  const get=make(db.pool);
  assert.equal(await get('short'),null);
  assert.equal(db.statements.length,0);
  assert.equal(await get(SESSION),null);
  assert.equal(db.state.transaction,false);
  assert.equal(db.state.released,true);
  assert.ok(db.statements.includes('ROLLBACK'));
});
