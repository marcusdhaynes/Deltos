import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Exercise the exact shipped backend methods with simulated Gmail responses.
// No private Gmail data is accessed by these tests.
const source=readFileSync(resolve(process.cwd(),'index.html'),'utf8');
const raw=String.raw;
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
 return new Function('v','y','C','h','return ({'+declaration+'}).ensureSenderLabel;')(
  validSender,addressFrom,simpleSenderFilter,()=> 'random-id'
 ) as (from:string,labelId:string)=>Promise<{sender:string,count:number,filterCreated:boolean}>;
}
const demoMethod=methodAfter(' async ensureSenderLabel(from,labelId){','var g=class{demo=!0');
const gmailMethod=methodAfter(' async ensureSenderLabel(from,labelId){','var ut=class{demo=!1');

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
 expect(first).toEqual({sender:same,count:4,filterCreated:true});
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
 expect(repeat).toEqual({sender:same,count:4,filterCreated:false});
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
 expect(result).toEqual({sender:'billing@sender.example',count:5,filterCreated:true});
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
 expect(calls.slice(before).some(c=>c.path==='/settings/filters')).toBe(false);
});

test('Archive Filter moves both historic messages from one sender out of Inbox',async({page})=>{
 await page.goto('/');
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
 await expect(page.locator('#toast-root')).toContainText('2 messages from lena@atelier-studio.com archived and labeled');
 // Both messages leave Inbox and Triage after archive-and-label.
 const matching=page.locator('.compact-folder-inbox .compact-message').filter({hasText:'Lena Carter'});
 await expect(matching).toHaveCount(0);
 await expect(page.locator('#toast-root')).toContainText('future mail filtered');
});
