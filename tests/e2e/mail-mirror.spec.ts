import {test,expect} from '@playwright/test';

// These tests exercise the shipped IndexedDB implementation and simulated Gmail
// responses. No real Gmail credentials, accounts or messages are used.
test('a mailbox snapshot persists across reload, and history replaces full refetch',async({page})=>{
 await page.goto('/');
 const first=await page.evaluate(async()=>{
  const mirror=(window as any).DeltosMailMirror;
  localStorage.setItem('deltos-last-google-account','mirror-a@example.test');
  await mirror.clear('mirror-a@example.test');
  let full=0;
  const backend={
   call:async(path:string)=>{
    if(path==='/profile')return{historyId:'100'};
    if(path.startsWith('/history?'))return{historyId:'105',history:[
     {labelsRemoved:[{message:{id:'old'},labelIds:['INBOX']}]},
     {messagesAdded:[{message:{id:'new'}}]}
    ]};
    throw Error('Unexpected Gmail call: '+path);
   },
   details:async(id:string)=>({id,threadId:id,subject:'New arrival',from:'new@example.test',
    sender:'New',snippet:'New email',timestamp:200,labels:['INBOX','UNREAD'],unread:true})
  };
  const remote=async()=>{full++;return{
   messages:[{id:'old',threadId:'old',subject:'Before sync',from:'old@example.test',
    sender:'Old',snippet:'Initial email',timestamp:100,labels:['INBOX'],unread:false}],
   nextPage:'older'
  }};
  const seeded=await mirror.list(backend,{folder:'triage',spec:{mode:'any',text:''},
    cursor:null,pageSize:50,remote});
  const state=await mirror.getState('mirror-a@example.test');
  return{seeded:seeded.messages.map((x:any)=>x.id),cursor:state.historyId,full};
 });
 expect(first).toEqual({seeded:['old'],cursor:'100',full:1});
 await page.reload();
 const second=await page.evaluate(async()=>{
  const mirror=(window as any).DeltosMailMirror;
  localStorage.setItem('deltos-last-google-account','mirror-a@example.test');
  let full=0,history=0;
  const backend={
   call:async(path:string)=>{
    if(path.startsWith('/history?')){
     history++;
     const params=new URLSearchParams(path.split('?')[1]);
     if(params.get('startHistoryId')!=='100')throw Error('Incorrect history cursor');
     return{historyId:'105',history:[
      {labelsRemoved:[{message:{id:'old'},labelIds:['INBOX']}]},
      {messagesAdded:[{message:{id:'new'}}]}
     ]};
    }
    throw Error('Unexpected call: '+path);
   },
   details:async(id:string)=>({id,threadId:id,subject:'New arrival',from:'new@example.test',
    sender:'New',snippet:'New email',timestamp:200,labels:['INBOX','UNREAD'],unread:true})
  };
  const remote=async()=>{full++;return{messages:[],nextPage:null}};
  const result=await mirror.list(backend,{folder:'triage',spec:{mode:'any',text:''},
    cursor:null,pageSize:50,force:true,remote});
  const state=await mirror.getState('mirror-a@example.test');
  const archived=await mirror.get('mirror-a@example.test','old');
  return{result:result.messages.map((x:any)=>x.id),cursor:state.historyId,
   archivedLabels:archived.labels,full,history};
 });
 expect(second).toEqual({result:['new'],cursor:'105',archivedLabels:[],full:0,history:1});
});
test('expired history cursors recover with a fresh bounded snapshot',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const mirror=(window as any).DeltosMailMirror;
  localStorage.setItem('deltos-last-google-account','mirror-b@example.test');
  await mirror.clear('mirror-b@example.test');
  let profile=0,remoteCalls=0;
  const backend={
   call:async(path:string)=>{
    if(path==='/profile')return{historyId:String(++profile*100)};
    if(path.startsWith('/history?'))throw Error('Requested entity was not found (404)');
    throw Error('Unexpected '+path);
   },
   details:async()=>{throw Error('History invalidation must not fetch headers')},
  };
  const remote=async()=>{
   remoteCalls++;
   const messages=[{id:'one',threadId:'one',from:'x@example.test',sender:'X',subject:'Snapshot',
    snippet:'Cached',timestamp:100,labels:['INBOX']}];
   if(remoteCalls===1)messages.push({id:'stale-old',threadId:'stale-old',
    from:'old@example.test',sender:'Old',subject:'No longer in Inbox',
    snippet:'Old cache',timestamp:98,labels:['INBOX']});
   return{messages,nextPage:'more'};
  };
  await mirror.list(backend,{folder:'inbox',spec:{mode:'any',text:''},
   cursor:null,pageSize:50,remote});
  const renewed=await mirror.list(backend,{folder:'inbox',spec:{mode:'any',text:''},
   cursor:null,pageSize:50,force:true,remote});
  const state=await mirror.getState('mirror-b@example.test');
  const stale=await mirror.get('mirror-b@example.test','stale-old');
  return{calls:remoteCalls,cursor:state.historyId,ids:renewed.messages.map((x:any)=>x.id),
   staleRemoved:stale===null};
 });
 expect(result).toEqual({calls:2,cursor:'200',ids:['one'],staleRemoved:true});
});
test('account isolation and local Gmail mutations do not cross mailboxes',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const mirror=(window as any).DeltosMailMirror;
  for(const account of ['mirror-c@example.test','mirror-d@example.test'])await mirror.clear(account);
  const remote=async()=>({messages:[{
   id:'same-id',threadId:'same-id',from:'f@example.test',sender:'F',
   subject:'Shared message ID',snippet:'Sample',timestamp:100,labels:['INBOX','UNREAD']
  }],nextPage:null});
  for(const account of ['mirror-c@example.test','mirror-d@example.test']){
   localStorage.setItem('deltos-last-google-account',account);
   await mirror.list({call:async()=>({historyId:'10'})},{folder:'inbox',
     spec:{mode:'any',text:''},cursor:null,pageSize:50,remote});
  }
  localStorage.setItem('deltos-last-google-account','mirror-c@example.test');
  await mirror.appliedMutation('/messages/same-id/modify',{body:JSON.stringify({
   addLabelIds:['STARRED'],removeLabelIds:['INBOX','UNREAD']
  })});
  const a=await mirror.get('mirror-c@example.test','same-id');
  const b=await mirror.get('mirror-d@example.test','same-id');
  const state=await mirror.getState('mirror-c@example.test');
  return{a:a.labels.sort(),b:b.labels.sort(),lastSync:state.lastSync};
 });
 expect(result).toEqual({a:['STARRED'],b:['INBOX','UNREAD'],lastSync:0});
});
test('a transient history failure shows cached mail without advancing the cursor',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const mirror=(window as any).DeltosMailMirror;
  const account='mirror-e@example.test';
  localStorage.setItem('deltos-last-google-account',account);
  await mirror.clear(account);
  let remoteCalls=0;
  const remote=async()=>{remoteCalls++;return{messages:[{
   id:'offline-mail',threadId:'offline-mail',from:'f@example.test',sender:'F',
   subject:'Still available',snippet:'Offline preview',timestamp:111,labels:['INBOX']
  }],nextPage:null}};
  await mirror.list({call:async()=>({historyId:'300'})},{folder:'inbox',
    spec:{mode:'any',text:''},cursor:null,pageSize:50,remote});
  const stale=await mirror.list({call:async()=>{throw Error('503 temporarily unavailable')}},{
    folder:'inbox',spec:{mode:'any',text:''},cursor:null,pageSize:50,force:true,remote});
  const state=await mirror.getState(account);
  return{stale:stale.stale,ids:stale.messages.map((x:any)=>x.id),cursor:state.historyId,remoteCalls};
 });
 expect(result).toEqual({stale:true,ids:['offline-mail'],cursor:'300',remoteCalls:1});
});

test('saved folders and cached search are isolated and filter by Gmail labels',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const mirror=(window as any).DeltosMailMirror,identity='preview@example.test';
  localStorage.setItem('deltos-last-google-account',identity);
  await mirror.clear(identity);
  await mirror.remember([
   {id:'archived',threadId:'archived',from:'receipt@example.test',sender:'Receipts',
    subject:'Electric receipt',snippet:'Paid',timestamp:300,labels:['Label_ELECTRIC']},
   {id:'starred',threadId:'starred',from:'finance@example.test',sender:'Finance',
    subject:'Budget',snippet:'Spreadsheet',timestamp:200,labels:['INBOX','STARRED']},
   {id:'deleted',threadId:'deleted',from:'spam@example.test',sender:'Spam',
    subject:'Deleted',snippet:'Deleted',timestamp:100,labels:['TRASH']}
  ]);
  const ids=async(folder:string,query='')=>(await mirror.preview(folder,query,{mode:'any',field:'all'},25))
   .map((m:any)=>m.id);
  return{archived:await ids('done'),label:await ids('label:Label_ELECTRIC'),
   search:await ids('label:Label_ELECTRIC','electric'),
   nonmatching:await ids('label:Label_ELECTRIC','nonexistent'),
   starred:await ids('starred'),trash:await ids('trash')};
 });
 expect(result).toEqual({archived:['archived'],label:['archived'],search:['archived'],
  nonmatching:[],starred:['starred'],trash:['deleted']});
});
test('paging a mirrored mailbox persists the next Gmail cursor',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const m=(window as any).DeltosMailMirror,account='pages@example.test';
  localStorage.setItem('deltos-last-google-account',account);
  await m.clear(account);
  const message=(id:string,timestamp:number)=>({id,threadId:id,from:'x@example.test',
   sender:'X',subject:id,snippet:'',timestamp,labels:['INBOX']});
  await m.list({call:async()=>({historyId:'900'})},{
   folder:'inbox',spec:{mode:'any',text:''},cursor:null,pageSize:50,
   remote:async()=>({messages:[message('first',200)],nextPage:'next-2'})
  });
  await m.list({},{
   folder:'inbox',spec:{mode:'any',text:''},cursor:'next-2',pageSize:50,
   remote:async()=>({messages:[message('second',100)],nextPage:'next-3'})
  });
  const state=await m.getState(account);
  const messages=await m.inbox(account,100);
  return{cursor:state.nextPage,ids:messages.map((x:any)=>x.id)};
 });
 expect(result).toEqual({cursor:'next-3',ids:['first','second']});
});
