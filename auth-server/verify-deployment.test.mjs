import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAuthDeployment } from './verify-deployment.mjs';

const base='https://deltos-backend.example.test';
const google = () => {
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  const params={client_id:'integration-test-client',redirect_uri:base+'/auth/callback',
    access_type:'offline',response_type:'code',code_challenge_method:'S256',
    code_challenge:'sample-pkce-challenge',state:'sample-state'};
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  return url.toString();
};
function responses({health=200,callback=google(),cookie=true,token=401}={}) {
  const calls=[];
  const request=async (url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/health'))
      return new Response(JSON.stringify({status:health===200?'ok':'unavailable'}),{status:health});
    if(url.endsWith('/auth/start'))
      return new Response(null,{status:302,headers:{
        location:callback,
        'set-cookie':cookie?'deltos_auth_state=random; HttpOnly; Secure; SameSite=Lax':'invalid'
      }});
    if(url.endsWith('/session/token'))
      return new Response(JSON.stringify({error:'Not connected'}),{status:token});
    throw Error('Unexpected endpoint '+url);
  };
  return {request,calls};
}

test('accepts valid HTTPS auth backend with strict PKCE and unauthenticated guard',async()=>{
  const mock=responses();
  const result=await verifyAuthDeployment(base,mock.request);
  assert.deepEqual(result,{status:'ready',callback:base+'/auth/callback'});
  assert.equal(mock.calls.length,3);
  assert.ok(mock.calls.every(call=>call.options.redirect==='manual'));
});
test('rejects insecure non-origin backend URLs',async()=>{
  const mock=responses();
  for(const bad of ['http://evil.test','https://evil.test/admin',
    'https://u:p@evil.test','https://evil.test/?token=value']){
    await assert.rejects(verifyAuthDeployment(bad,mock.request));
  }
  assert.equal(mock.calls.length,0);
});
test('requires healthy connected Postgres',async()=>{
  await assert.rejects(verifyAuthDeployment(base,responses({health:503}).request),/health endpoint/);
});
test('requires exact backend OAuth callback',async()=>{
  await assert.rejects(verifyAuthDeployment(base,responses({
    callback:google().replace(encodeURIComponent(base+'/auth/callback'),
      encodeURIComponent('https://other.example.test/auth/callback'))
  }).request),/redirect URI/);
});
test('rejects non-Google authorization redirects',async()=>{
  await assert.rejects(verifyAuthDeployment(base,responses({
    callback:'https://attacker.example.test/o/oauth2/v2/auth'
  }).request),/official Google/);
});
test('requires secure OAuth state cookie',async()=>{
  await assert.rejects(verifyAuthDeployment(base,responses({cookie:false}).request),/cookie/);
});
test('requires authenticated token access',async()=>{
  await assert.rejects(verifyAuthDeployment(base,responses({token:200}).request),/Unauthenticated/);
});
