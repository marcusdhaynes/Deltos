/* Deltos durable, account-isolated mailbox mirror.
   IndexedDB holds preview metadata and Gmail history cursors, never OAuth tokens,
   full MIME bodies, or attachments. A failure transparently falls back to Gmail.
   The mirror is populated progressively as the user views mailbox pages. */
(function(root){
 'use strict';
 const DB_NAME='deltos-mail-mirror-v1';
 const DB_VERSION=1;
 const STALE_MS=15000;
 const MAX_HISTORY_PAGES=10;
 const MAX_NEW_DETAILS=80;
 const sessions=new Map();
 let dbPromise;
 function accountKey(value){return String(value||'').trim().toLowerCase()}
 function account(){try{return accountKey(localStorage.getItem('deltos-last-google-account'))}catch{return''}}
 function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('IndexedDB request failed'))})}
 function open(){
  if(!root.indexedDB)return Promise.reject(Error('IndexedDB unavailable'));
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
   const req=indexedDB.open(DB_NAME,DB_VERSION);
   req.onupgradeneeded=()=>{
    const db=req.result;
    if(!db.objectStoreNames.contains('messages')){
     const store=db.createObjectStore('messages',{keyPath:'key'});
     store.createIndex('by_account','account',{unique:false});
    }
    if(!db.objectStoreNames.contains('state'))db.createObjectStore('state',{keyPath:'account'});
   };
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||Error('Mailbox storage unavailable'));
   req.onblocked=()=>reject(Error('Mailbox storage upgrade blocked'));
  }).catch(error=>{dbPromise=null;throw error});
  return dbPromise;
 }
 async function getState(account){
  const db=await open(),tx=db.transaction('state','readonly');
  return await request(tx.objectStore('state').get(account))||null;
 }
 async function getRows(account){
  const db=await open(),tx=db.transaction('messages','readonly');
  return await request(tx.objectStore('messages').index('by_account').getAll(IDBKeyRange.only(account)));
 }
 async function get(account,id){
  const db=await open(),tx=db.transaction('messages','readonly');
  const row=await request(tx.objectStore('messages').get(account+':'+id));
  return row?.message||null;
 }
 async function getMany(account,ids){
  const db=await open(),tx=db.transaction('messages','readonly'),store=tx.objectStore('messages');
  const entries=await Promise.all(ids.map(async id=>[id,await request(store.get(account+':'+id))]));
  return new Map(entries.filter(([,row])=>row?.message).map(([id,row])=>[id,row.message]));
 }
 function sortRows(rows){return rows.map(row=>row.message).filter(Boolean)
  .sort((a,b)=>Number(b.timestamp||0)-Number(a.timestamp||0)||String(b.id).localeCompare(String(a.id)))}
 async function inbox(account,limit=100){
  const rows=await getRows(account);
  return sortRows(rows).filter(item=>item.labels?.includes('INBOX')&&!item.labels?.includes('TRASH')&&!item.labels?.includes('SPAM')).slice(0,limit);
 }
 function slim(message){
  if(!message||typeof message.id!=='string'||!Array.isArray(message.labels))return null;
  return {
   id:message.id,threadId:message.threadId||message.id,
   from:String(message.from||''),sender:String(message.sender||''),
   subject:String(message.subject||''),snippet:String(message.snippet||'').slice(0,300),
   timestamp:Number(message.timestamp||0),bundle:message.bundle||'',
   unread:!!message.unread,pinned:!!message.pinned,labels:[...message.labels]
  };
 }
 function complete(tx){return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Storage transaction failed'));
  tx.onabort=()=>reject(tx.error||Error('Storage transaction aborted'));
 })}
 async function commit(account,updates,deletions,state){
  const db=await open(),tx=db.transaction(['messages','state'],'readwrite');
  const end=complete(tx),rows=tx.objectStore('messages');
  for(const id of deletions||[])rows.delete(account+':'+id);
  for(const message of updates||[]){
   const item=slim(message);if(item)rows.put({key:account+':'+item.id,account,message:item});
  }
  if(state)tx.objectStore('state').put({...state,account});
  await end;
 }
 async function clear(account){
  if(!account)return;
  const db=await open(),tx=db.transaction(['messages','state'],'readwrite'),end=complete(tx);
  const index=tx.objectStore('messages').index('by_account'),keys=await request(index.getAllKeys(IDBKeyRange.only(account)));
  for(const key of keys)tx.objectStore('messages').delete(key);
  tx.objectStore('state').delete(account);
  await end;
 }
 function withLock(account,work){
  const previous=sessions.get(account)||Promise.resolve();
  const next=previous.catch(()=>{}).then(work);
  sessions.set(account,next);
  next.finally(()=>{if(sessions.get(account)===next)sessions.delete(account)}).catch(()=>{});
  return next;
 }
 async function fetchChanges(backend,bookmark){
  const changed=new Map(),deleted=new Set(),created=new Set(),seenPages=new Set();
  let pageToken=null,latest=bookmark;
  for(let page=0;page<MAX_HISTORY_PAGES;page++){
   const params=new URLSearchParams({startHistoryId:bookmark,maxResults:'500'});
   if(pageToken)params.set('pageToken',pageToken);
   const response=await backend.call('/history?'+params.toString());
   latest=response.historyId||latest;
   for(const event of response.history||[]){
    for(const eventKey of ['messagesAdded','messagesDeleted','labelsAdded','labelsRemoved']){
     for(const entry of event[eventKey]||[]){
      const message=entry?.message;
      if(!message?.id)continue;
      const id=String(message.id);
      if(eventKey==='messagesDeleted'){deleted.add(id);changed.delete(id);created.delete(id);continue}
      if(deleted.has(id))deleted.delete(id);
      if(!changed.has(id))changed.set(id,{added:new Set(),removed:new Set()});
      const record=changed.get(id);
      if(eventKey==='messagesAdded')created.add(id);
      if(eventKey==='labelsAdded')for(const label of entry.labelIds||[]){record.added.add(label);record.removed.delete(label)}
      if(eventKey==='labelsRemoved')for(const label of entry.labelIds||[]){record.removed.add(label);record.added.delete(label)}
     }
    }
   }
   pageToken=response.nextPageToken||null;
   if(!pageToken)return{changed,created,deleted,latest};
   if(seenPages.has(pageToken))throw Error('Gmail history returned a repeated page');
   seenPages.add(pageToken);
  }
  const error=Error('Gmail history is too large for one incremental cycle');
  error.code='DELTOS_HISTORY_RESET';throw error;
 }
 function isHistoryGone(error){return error?.code==='DELTOS_HISTORY_RESET'||
   /(?:404|history.*(?:invalid|expired|not found)|startHistoryId|requested entity was not found)/i.test(String(error?.message||''))}
 async function initial(backend,account,remote,onProgress){
  // Take the bookmark before the snapshot to avoid losing changes occurring mid-import.
  const profile=await backend.call('/profile');
  const result=await remote();
  const items=(result.messages||[]).map(slim).filter(Boolean);
  await commit(account,items,[],{
   historyId:String(profile.historyId||''),nextPage:result.nextPage||null,lastSync:Date.now()
  });
  return {...result,mirrorAuthoritative:true};
 }
 async function incremental(backend,account,state,pageSize,onProgress){
  const updates=await fetchChanges(backend,state.historyId);
  const known=await getMany(account,[...updates.changed.keys()]);
  const toFetch=new Set();
  const patched=[];
  for(const [id,delta] of updates.changed){
   if(updates.deleted.has(id))continue;
   const original=known.get(id);
   if(original){
    const labels=new Set(original.labels||[]);
    for(const label of delta.removed)labels.delete(label);
    for(const label of delta.added)labels.add(label);
    patched.push({...original,labels:[...labels],
     unread:labels.has('UNREAD'),pinned:labels.has('STARRED')});
   }else if(updates.created.has(id)||delta.added.has('INBOX'))toFetch.add(id);
  }
  if(toFetch.size>MAX_NEW_DETAILS){
   const err=Error('Large history burst; refreshing first mailbox page instead');
   err.code='DELTOS_HISTORY_RESET';throw err;
  }
  const newMessages=await Promise.all([...toFetch].map(async id=>{
   try{return slim(await backend.details(id,false))}
   catch(error){if(/404|not found/i.test(String(error?.message||'')))return null;throw error}
  }));
  await commit(account,[...patched,...newMessages.filter(Boolean)],updates.deleted,{
   ...state,historyId:String(updates.latest||state.historyId),lastSync:Date.now()
  });
  const messages=await inbox(account,pageSize);
  onProgress?.(messages);
  return{messages,nextPage:state.nextPage||null,mirrorAuthoritative:true};
 }
 async function list(backend,{folder,spec,cursor,pageSize,onProgress,remote,force=false}){
  const identity=account();
  if(!identity||!root.indexedDB)return remote();
  if(cursor){
   const data=await remote();
   try{await commit(identity,data.messages||[],[],null)}
   catch(error){console.warn('Mailbox mirror page write skipped:',error?.message||error)}
   return data;
  }
  return withLock(identity,async()=>{
   try{
    let state=await getState(identity);
    if(!state?.historyId)return await initial(backend,identity,remote,onProgress);
    const existing=await inbox(identity,pageSize);
    if(existing.length)onProgress?.(existing);
    if(!force&&Date.now()-Number(state.lastSync||0)<STALE_MS)
     return{messages:existing,nextPage:state.nextPage||null,mirrorAuthoritative:true};
    try{return await incremental(backend,identity,state,pageSize,onProgress)}
    catch(error){
     if(isHistoryGone(error)){
      return await initial(backend,identity,remote,onProgress);
     }
     if(existing.length){
      console.warn('Gmail sync deferred; showing locally cached mailbox:',error?.message||error);
      return{messages:existing,nextPage:state.nextPage||null,mirrorAuthoritative:true,stale:true};
     }
     throw error;
    }
   }catch(error){
    // All IndexedDB failures must retain the original Gmail path.
    if(/indexeddb|storage|transaction|database/i.test(String(error?.message||''))){
     console.warn('Mailbox mirror unavailable; using Gmail directly:',error?.message||error);
     return remote();
    }
    throw error;
   }
  });
 }
 async function appliedMutation(path,options){
  const identity=account();
  if(!identity||!root.indexedDB)return;
  try{
   const decoded=decodeURIComponent(String(path||'')),payload=JSON.parse(options?.body||'{}');
   const modify=decoded.match(/^\/messages\/([^/]+)\/modify$/);
   const batch=decoded==='/messages/batchModify';
   const ids=modify?[modify[1]]:batch?(payload.ids||[]):[];
   const additions=payload.addLabelIds||[],removals=payload.removeLabelIds||[];
   const state=await getState(identity);
   if(!state)return;
   let changed=[];
   if(ids.length){
    const known=await getMany(identity,ids);
    for(const id of ids){
     const original=known.get(id);if(!original)continue;
     const labels=new Set(original.labels||[]);
     for(const label of removals)labels.delete(label);
     for(const label of additions)labels.add(label);
     changed.push({...original,labels:[...labels],
      unread:labels.has('UNREAD'),pinned:labels.has('STARRED')});
    }
   }
   await commit(identity,changed,[],{...state,lastSync:0});
  }catch(error){console.warn('Mailbox mirror mutation update deferred:',error?.message||error)}
 }
 root.DeltosMailMirror={account,list,inbox,get,getState,appliedMutation,clear};
})(window);
