/* Gmail API per-user quota management. Avoid burst requests; do not touch authentication data.
   Google's published Gmail API limit is 6,000 units/user/minute. Deltos voluntarily
   reserves a lower 3,600-unit rolling-minute budget for breathing room. */
(function(root){
 'use strict';
 const LIMIT=3600, WINDOW=60000, MAX_PARALLEL=4;
 const queue=[], STORAGE='deltos-gmail-budget-v2-';
 let active=0,pumping=false,timer=null,cache=new Map(),pending=new Map();
 const account=()=>{try{return (localStorage.getItem('deltos-last-google-account')||'pending').toLowerCase()}catch{return'pending'}};
 const key=()=>STORAGE+encodeURIComponent(account());
 const read=()=>{try{return JSON.parse(localStorage.getItem(key())||'null')||{events:[],pauseUntil:0,strikes:0}}catch{return{events:[],pauseUntil:0,strikes:0}}};
 const write=data=>{try{localStorage.setItem(key(),JSON.stringify(data))}catch{}};
 function estimate(path,method){
  method=(method||'GET').toUpperCase();
  const pathname=String(path).split('?')[0];
  const full=/[?&]format=(full|raw|html)/.test(path);
  if(pathname.endsWith('/messages/batchModify')||pathname.endsWith('/messages/batchDelete'))return 50;
  if(pathname.endsWith('/messages/send')||pathname.endsWith('/drafts/send'))return 100;
  if(pathname.endsWith('/messages')&&method==='GET')return 5;
  if(pathname.endsWith('/profile'))return 1;
  if(pathname.endsWith('/labels')&&method==='GET')return 1;
  if(pathname.endsWith('/settings/filters')&&method==='GET')return 1;
  if(/\/messages\/[^/]+$/.test(pathname))return method==='GET'?(full?60:20):5;
  if(/\/drafts\/[^/]+$/.test(pathname))return method==='GET'?(full?60:20):15;
  if(pathname.endsWith('/drafts')&&method==='GET')return 5;
  if(method==='GET')return 10;
  return 50; // Conservatively budget unknown mutations.
 }
 async function reserve(cost){
  const claim=()=>{
   const now=Date.now(),data=read();
   data.events=Array.isArray(data.events)?data.events.filter(x=>x&&Number(x.t)>now-WINDOW):[];
   if(Number(data.pauseUntil)>now)return Number(data.pauseUntil)-now;
   const used=data.events.reduce((sum,x)=>sum+Number(x.u||0),0);
   if(used+cost>LIMIT){
    const spent=data.events.slice().sort((a,b)=>a.t-b.t);
    let free=used,until=now+WINDOW;
    for(const x of spent){free-=x.u;if(free+cost<=LIMIT){until=x.t+WINDOW+250;break}}
    return Math.max(250,until-now);
   }
   data.events.push({t:now,u:cost});write(data);return 0;
  };
  if(typeof navigator!=='undefined'&&navigator.locks?.request){
   try{return await navigator.locks.request('deltos-gmail-quota-'+account(),claim)}
   catch(error){console.warn('Gmail shared quota lock unavailable; using local budget:',error?.message||error)}
  }
  return claim();
 }
 function wake(wait){
  if(timer!==null)return;
  timer=setTimeout(()=>{timer=null;void pump()},Math.max(50,Math.min(wait||150,2147483647)));
 }
 async function pump(){
  if(pumping)return;
  pumping=true;
  try{
   while(active<MAX_PARALLEL&&queue.length){
    queue.sort((a,b)=>b.priority-a.priority||a.seq-b.seq);
    const item=queue[0],delay=await reserve(item.cost);
    if(delay>0){wake(delay);break}
    queue.shift();active++;
    Promise.resolve().then(item.work).then(item.resolve,item.reject).finally(()=>{
     active=Math.max(0,active-1);void pump();
    });
   }
  }finally{pumping=false}
 }
 let sequence=0;
 function run(cost,work,priority=0){
  return new Promise((resolve,reject)=>{
   queue.push({cost:Math.min(LIMIT,Math.max(1,cost||10)),work,priority,seq:sequence++,resolve,reject});
   void pump();
  });
 }
 function pause(retryAfter){
  const parsed=Number(retryAfter),ms=Number.isFinite(parsed)&&parsed>=0?Math.max(60000,parsed*1000):70000;
  const data=read();
  data.strikes=Math.min(5,(Number(data.strikes)||0)+1);
  const until=Date.now()+Math.min(300000,Math.max(ms,60000*Math.pow(1.5,data.strikes-1)));
  data.pauseUntil=Math.max(Number(data.pauseUntil)||0,until);
  write(data);wake(until-Date.now());
 }
 function success(){
  const d=read();if(d.strikes){d.strikes=0;write(d)}
 }
 function cached(key){
  const x=cache.get(key);
  if(x&&x.expires>Date.now())return x.value;
  cache.delete(key);return null;
 }
 function ttl(path){
  if(/\/messages\/[^/]+\?/.test(path))return 45000;
  if(/\/messages\?/.test(path))return 12000;
  if(/\/labels(?:\?|$)|\/settings\/filters(?:\?|$)/.test(path))return 30000;
  if(/\/profile(?:\?|$)/.test(path))return 180000;
  return 0;
 }
 function readRequest(path,work){
  const id=account()+'|'+path,life=ttl(path),hit=life?cached(id):null;
  if(hit!==null)return Promise.resolve(hit);
  if(pending.has(id))return pending.get(id);
  const task=run(estimate(path,'GET'),work,0).then(value=>{
   if(life){if(cache.size>250)cache.clear();cache.set(id,{expires:Date.now()+life,value})}
   return value;
  }).finally(()=>pending.delete(id));
  pending.set(id,task);return task;
 }
 function changed(path,options){
  if(!path){cache.clear();pending.clear();return}
  const accountPrefix=account()+'|';
  const changedIds=new Set();
  const direct=String(path).match(/\/messages\/([^/?]+)\/(?:modify|trash|untrash|delete)$/);
  if(direct)changedIds.add(decodeURIComponent(direct[1]));
  if(/\/messages\/batch(?:Modify|Delete)$/.test(path)){
   try{const body=JSON.parse(options?.body||'{}');for(const id of body.ids||[])changedIds.add(String(id))}catch{}
  }
  for(const k of cache.keys()){
   if(!k.startsWith(accountPrefix))continue;
   const p=k.slice(accountPrefix.length);
   // New listings must be fetched after an action. Unchanged headers stay cached.
   if(p.startsWith('/messages?')||p.startsWith('/threads?')||
      p.startsWith('/drafts?')||p.startsWith('/labels')||p.startsWith('/settings/filters')){
    cache.delete(k);continue;
   }
   const match=p.match(/^\/messages\/([^/?]+)(?:\?|$)/);
   if(match&&changedIds.has(decodeURIComponent(match[1])))cache.delete(k);
   if(changedIds.size===0&&p.startsWith('/messages/'))cache.delete(k);
  }
  // An in-flight lookup begun before a mutation must not become the next cache hit.
  for(const k of pending.keys()){
   if(k.startsWith(accountPrefix))pending.delete(k);
  }
 }
 function status(){const d=read();return{queued:queue.length,active,pausedUntil:d.pauseUntil||0,usedInWindow:(d.events||[]).filter(x=>x.t>Date.now()-WINDOW).reduce((a,b)=>a+b.u,0),limit:LIMIT}}
 root.DeltosGmailQuota={run,estimate,pause,success,readRequest,changed,status};
})(window);
