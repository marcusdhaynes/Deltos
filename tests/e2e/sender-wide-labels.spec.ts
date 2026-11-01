import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Exercise the exact shipped backend methods with simulated Gmail responses.
// No private Gmail data is accessed by these tests.
const source=readFileSync(resolve(process.cwd(),'index.html'),'utf8');
const raw=String.raw;
// Load the real concurrency and retry functions from the shipped page rather
// than copying a simplified implementation into the tests.
const helperStart=source.indexOf('async function deltosGmailParallel(');
const helperEnd=source.indexOf('var ut=class{',helperStart);
if(helperStart<0||helperEnd<0)throw Error('Gmail concurrency helpers are missing');
const {deltosGmailParallel,deltosGmailRetry}=new Function(
 source.slice(helperStart,helperEnd)+';return {deltosGmailParallel,deltosGmailRetry}'
)() as {deltosGmailParallel:(items:any[],limit:number,worker:(value:any,index:number)=>Promise<any>)=>Promise<any[]>,
 deltosGmailRetry:(fn:()=>Promise<any>)=>Promise<any>};
const validSender=(value:string)=>{
 const email=value.trim().toLowerCase();
 if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email))throw Error('Invalid sender');
 return email;
};
const addressFrom=(value:string)=>{
 const match=value.match(/<([^<>]*)>\s*$/);
 return (match?match[1]:value).trim().toLowerCase();
};
const simpleSenderFilter=(filter:any,sender:string)=>{
 const criteria=filter.criteria||{};
 if(!criteria.from||Object.keys(criteria).some(key=>key!=='from'&&key!=='excludeChats'))return false;
 return addressFrom(criteria.from.replace(/^"|"$/g,''))===sender;
};
function methodAfter(needle:string,before:string){
 const start=source.indexOf(needle,source.indexOf(before));
 if(start<0)throw Error('Missing '+needle);
 const end=source.indexOf('\n async ',start+8);
 if(end<0)throw Error('Missing end for '+needle);
 const declaration=source.slice(start,end);
 return new Function('v','y','C','h','deltosGmailParallel','deltosGmailRetry','return ({'+declaration+'}).ensureSenderLabel;')(
  validSender,addressFrom,simpleSenderFilter,()=> 'random-id',deltosGmailParallel,deltosGmailRetry
 ) as (from:string,labelId:string)=>Promise<{sender:string,count:number,filterCreated:boolean}>;
}
const demoMethod=methodAfter(' async ensureSenderLabel(from,labelId,onProgress){','var g=class{demo=!0');
const gmailMethod=methodAfter(' async ensureSenderLabel(from,labelId,onProgress){','var ut=class{demo=!1');

test('Demo archives and labels every sender message across Inbox, Archive, Spam and Trash, preserving read state',async()=>{
 const same='billing@sender.example';
 const messages=new Map([
  ['inbox',{from:same,labels:['INBOX','UNREAD']}],
  ['archived',{from:same,labels:['STARRED']}],
  ['spam',{from:same,labels:['SPAM','UNREAD']}],
  ['trash',{from:same,labels:['TRASH']}],
  ['other',{from:'other@sender.example',labels:['INBOX']}]
 ]);
 const rules=new Map();
 const demo={
  messages,ruleMap:rules,
  listLabels:async()=>[{id:'demo-label-paperwork',name:'Paperwork'}]
 };
 const first=await demoMethod.call(demo,'Sender <BILLING@SENDER.EXAMPLE>','demo-label-paperwork');
 expect(first).toEqual({sender:same,count:4,filterCreated:true,futureActive:true});
 for(const id of ['inbox','archived','spam','trash']){
  const labels=messages.get(id)!.labels;
  expect(labels).toContain('demo-label-paperwork');
 }
 expect(messages.get('inbox')!.labels).toContain('UNREAD');
 expect(messages.get('inbox')!.labels).not.toContain('INBOX');
 expect(messages.get('spam')!.labels).toContain('SPAM');
 expect(messages.get('trash')!.labels).toContain('TRASH');
 expect(messages.get('other')!.labels).toEqual(['INBOX']);
 expect([...rules.values()].filter((r:any)=>r.email===same&&(r.label==='demo-label-paperwork'))).toHaveLength(1);
 const repeat=await demoMethod.call(demo,same,'demo-label-paperwork');
 expect(repeat).toEqual({sender:same,count:4,filterCreated:false,futureActive:true});
 expect(rules.size).toBe(1);
});

test('Gmail first installs an idempotent sender filter then labels every matching page including Spam/Trash',async()=>{
 const calls:{path:string,body?:any}[]=[];
 const bulk:{ids:string[],add:string[],remove:string[]}[]=[];
 let existing:any[]=[];
 const gmail={
  filters:async()=>existing,
  call:async(path:string,opts?:any)=>{
   const body=opts?.body?JSON.parse(opts.body):undefined;
   calls.push({path,body});
   if(path==='/settings/filters'){
    existing.push({id:'filter-1',...body});
    return {id:'filter-1'};
   }
   if(path.startsWith('/messages?')){
    const params=new URLSearchParams(path.split('?')[1]);
    if(!params.get('pageToken'))return {messages:[{id:'inbox'},{id:'archive'},{id:'spam'}],nextPageToken:'next'};
    if(params.get('pageToken')==='next')return {messages:[{id:'archive'},{id:'trash'},{id:'sent'}]};
   }
   throw Error('Unexpected request '+path);
  },
  batchModify:async(ids:string[],add:string[],remove:string[])=>{
   bulk.push({ids,add,remove});
  }
 };
 const result=await gmailMethod.call(gmail,'Display Name <billing@sender.example>','Label_123');
 expect(result).toEqual({sender:'billing@sender.example',count:5,filterCreated:true,futureActive:true,futureError:''});
 expect(calls[0]).toEqual({
  path:'/settings/filters',
  body:{criteria:{from:'billing@sender.example'},action:{addLabelIds:['Label_123'],removeLabelIds:['INBOX']}}
 });
 const searches=calls.filter(c=>c.path.startsWith('/messages?')).map(c=>new URLSearchParams(c.path.split('?')[1]));
 expect(searches).toHaveLength(2);
 for(const params of searches){
  expect(params.get('q')).toBe('from:billing@sender.example');
  expect(params.get('includeSpamTrash')).toBe('true');
  expect(params.get('maxResults')).toBe('500');
 }
 expect(searches[1].get('pageToken')).toBe('next');
 expect(bulk.flatMap(batch=>batch.ids)).toEqual(['inbox','archive','spam','trash','sent']);
 for(const batch of bulk){
  expect(batch.add).toEqual(['Label_123']);
  expect(batch.remove).toEqual(['INBOX']);
 }
 const before=calls.length;
 const again=await gmailMethod.call(gmail,'billing@sender.example','Label_123');
 expect(again.filterCreated).toBe(false);
 expect(again.futureActive).toBe(true);
 expect(calls.slice(before).some(c=>c.path==='/settings/filters')).toBe(false);
});

test('Archive Filter moves both historic messages from one sender out of Inbox',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Inbox',exact:true}).click();
 const row=page.locator('.compact-folder-inbox .compact-message')
  .filter({hasText:'Lena Carter'}).first();
 await expect(row).toBeVisible();
 const box=await row.boundingBox();
 if(!box)throw Error('Missing Lena sender row');
 const sx=box.x+box.width/2,sy=box.y+box.height/2;
 await page.mouse.move(sx,sy);await page.mouse.down();
 await page.mouse.move(sx+85,sy,{steps:8});
 const plus=page.getByRole('button',{name:'Create a new label'});
 await expect(plus).toBeVisible();
 const target=await plus.boundingBox();
 if(!target)throw Error('Missing create-label bubble');
 await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:10});
 await page.mouse.up();
 await page.getByRole('textbox',{name:'New Gmail label'}).fill('Sender Paperwork');
 await page.getByRole('button',{name:'Create & Archive'}).click();
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 await expect(page.locator('#toast-root')).toContainText('Archived + labeled 2 messages from lena@atelier-studio.com');
 // Both messages leave Inbox and Triage after archive-and-label.
 const matching=page.locator('.compact-folder-inbox .compact-message').filter({hasText:'Lena Carter'});
 await expect(matching).toHaveCount(0);
 await expect(page.locator('#toast-root')).toContainText('future Gmail filter active');
});

test('Backfills every Gmail sender message even when future filter creation is denied',async()=>{
 const calls:{path:string}[]=[];
 const modifications:{ids:string[],add:string[],remove:string[]}[]=[];
 const backend={
  filters:async()=>[],
  call:async(path:string,opts?:any)=>{
   calls.push({path});
   if(path==='/settings/filters')throw Error('403 insufficient authentication scopes');
   if(path.startsWith('/messages?'))return {messages:[{id:'1'},{id:'2'}]};
   throw Error('Unexpected '+path);
  },
  batchModify:async(ids:string[],add:string[],remove:string[])=>{modifications.push({ids,add,remove})}
 };
 const result=await gmailMethod.call(backend,'billing@sender.example','Label_123');
 expect(result).toMatchObject({
  count:2,filterCreated:false,futureActive:false,
  futureError:'403 insufficient authentication scopes'
 });
 expect(modifications).toEqual([{ids:['1','2'],add:['Label_123'],remove:['INBOX']}]);
 expect(calls.some(c=>c.path.startsWith('/messages?'))).toBe(true);
});

test('Inbox shows counts and a visible filter result; Filters shows actual destinations and matching messages',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Inbox',exact:true}).click();
 const header=page.locator('.compact-folder-heading');
 await expect(header.locator('[data-filter-kind="archive"]')).toContainText('Archive filtered: 0');
 await expect(header.locator('[data-filter-kind="delete"]')).toContainText('Delete filtered: 0');
 const row=page.locator('.compact-folder-inbox .compact-message').filter({hasText:'Lena Carter'}).first();
 const box=await row.boundingBox();
 if(!box)throw Error('Missing sender row');
 const sx=box.x+box.width/2,sy=box.y+box.height/2;
 await page.mouse.move(sx,sy);await page.mouse.down();
 await page.mouse.move(sx+90,sy,{steps:10});
 const plus=page.getByRole('button',{name:'Create a new label'});
 const b=await plus.boundingBox();
 if(!b)throw Error('Missing plus bubble');
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();
 await page.getByRole('textbox',{name:'New Gmail label'}).fill('Visible Label');
 await page.getByRole('button',{name:'Create & Archive'}).click();
 await expect(header.locator('[data-filter-kind="archive"]')).toContainText('Archive filtered: 2');
 await expect(header.locator('[data-filter-progress="done"]')).toContainText('Archived + labeled 2');
 await page.getByRole('button',{name:'Filters',exact:true}).click();
 await expect(page.getByText('Archive → Visible Label')).toBeVisible();
 await page.getByRole('button',{name:'View messages in Visible Label'}).click();
 await expect(page.locator('.deltos-filter-preview')).toContainText('Messages in Visible Label: 2');
 await expect(page.locator('.deltos-filter-preview')).toContainText('Lena Carter');
});

function shippedGmailMethod(method:string,nextMethod:string){
 const start=source.indexOf('async '+method+'(',source.indexOf('var ut=class{'));
 const end=source.indexOf(nextMethod,start);
 if(start<0||end<0)throw Error('Missing shipped method '+method);
 const body=source.slice(start,end);
 return new Function('deltosGmailParallel','deltosGmailRetry','y',
  'return ({'+body+'}).'+method+';')(deltosGmailParallel,deltosGmailRetry,addressFrom);
}
const exactSenderMessages=shippedGmailMethod('exactSenderMessages','async blockSender(');
const concurrentBatchModify=shippedGmailMethod('batchModify','async profileEmail(');

test('Delete filtering fetches sender metadata with twelve parallel workers and excludes unrelated senders',async()=>{
 const ids=Array.from({length:34},(_,i)=>'id-'+i);
 let active=0,peak=0,pageCalls=0;
 const backend={
  call:async(path:string)=>{
   if(!path.startsWith('/messages?'))throw Error('Unexpected '+path);
   const params=new URLSearchParams(path.split('?')[1]);
   pageCalls++;
   return params.get('pageToken')==='next'
    ?{messages:ids.slice(20).map(id=>({id}))}
    :{messages:ids.slice(0,20).map(id=>({id})),nextPageToken:'next'};
  },
  details:async(id:string)=>{
   active++;peak=Math.max(peak,active);
   await new Promise(resolve=>setTimeout(resolve,12));
   active--;
   return{id,from:id==='id-4'?'other@example.com':'billing@sender.example',labels:id==='id-2'?['INBOX']:[]};
  }
 };
 const matches=await exactSenderMessages.call(backend,'billing@sender.example');
 expect(pageCalls).toBe(2);
 expect(peak).toBe(12);
 expect(matches).toHaveLength(33);
 expect(matches.some(([id]:[string,boolean])=>id==='id-4')).toBe(false);
 expect(matches.find(([id]:[string,boolean])=>id==='id-2')[1]).toBe(true);
});

test('Gmail batch modification runs at most three requests at a time and retries transient errors',async()=>{
 const ids=Array.from({length:1750},(_,i)=>'msg-'+i);
 let active=0,peak=0,failFirst=true;
 const changed:string[]=[];
 const backend={
  call:async(path:string,opts:any)=>{
   expect(path).toBe('/messages/batchModify');
   const payload=JSON.parse(opts.body);
   active++;peak=Math.max(peak,active);
   await new Promise(resolve=>setTimeout(resolve,15));
   active--;
   if(failFirst){failFirst=false;throw Error('429 userRateLimitExceeded')}
   changed.push(...payload.ids);
   expect(payload.addLabelIds).toEqual(['Label_X']);
   expect(payload.removeLabelIds).toEqual(['INBOX']);
  }
 };
 await concurrentBatchModify.call(backend,ids,['Label_X'],['INBOX']);
 expect(peak).toBe(3);
 expect(new Set(changed).size).toBe(1750);
 expect(changed).toHaveLength(1750);
});

test('Permanent Gmail permission errors are not retried or mistaken for success',async()=>{
 let attempts=0;
 await expect(deltosGmailRetry(async()=>{attempts++;throw Error('403 insufficient authentication scopes')})).rejects.toThrow('403 insufficient authentication scopes');
 expect(attempts).toBe(1);
});

test('Concurrent archive processing completes every batch and reports aggregate progress',async()=>{
 const calls:{path:string,body?:any}[]=[];
 const ids=Array.from({length:1250},(_,i)=>'bulk-'+i);
 let active=0,peak=0;
 const counts:number[]=[];
 const backend={
  filters:async()=>[],
  call:async(path:string,opts?:any)=>{
   if(path==='/settings/filters')return{id:'f1'};
   if(path.startsWith('/messages?')){
    const params=new URLSearchParams(path.split('?')[1]);
    const token=params.get('pageToken');
    const offset=token?Number(token):0;
    return{messages:ids.slice(offset,offset+500).map(id=>({id})),
     ...(offset+500<ids.length?{nextPageToken:String(offset+500)}:{})};
   }
   throw Error('Unexpected '+path);
  },
  batchModify:async(batch:string[],add:string[],remove:string[])=>{
   active++;peak=Math.max(peak,active);
   await new Promise(resolve=>setTimeout(resolve,15));active--;
   calls.push({path:'/messages/batchModify',body:{ids:batch,add,remove}});
  }
 };
 const result=await gmailMethod.call(backend,'billing@sender.example','Label_X',(p:any)=>counts.push(p.count));
 expect(result.count).toBe(1250);
 expect(peak).toBe(3);
 expect(counts[counts.length-1]).toBe(1250);
 expect(new Set(calls.flatMap(c=>c.body.ids)).size).toBe(1250);
});
