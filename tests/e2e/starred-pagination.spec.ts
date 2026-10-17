import {test,expect} from '@playwright/test';

test('Starred Drafts starts at ten, shows ten more at a time, and can collapse',async({page})=>{
 await page.addInitScript(()=>{
  const drafts=Array.from({length:23},(_,i)=>({
   id:'pagination-draft-'+i,to:'friend@example.test',subject:'Draft pagination '+i,
   body:'Draft body '+i,updated:Date.now()-i*60000
  }));
  localStorage.setItem('deltos-demo-drafts',JSON.stringify(drafts));
  const sources=Object.fromEntries(drafts.map(d=>['draft:'+d.id,'Drafts']));
  localStorage.setItem('deltos-star-sources:demo',JSON.stringify(sources));
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Starred',exact:true}).click();
 const group=page.locator('.deltos-starred-drafts');
 await expect(group.locator('.compact-message')).toHaveCount(10);
 await expect(group.locator('.deltos-starred-count')).toHaveText('23');
 await expect(group.locator('.deltos-starred-shown')).toHaveText('Showing 10 of 23');
 await group.getByRole('button',{name:'Show 10 more Drafts starred messages'}).click();
 await expect(group.locator('.compact-message')).toHaveCount(20);
 await expect(group.locator('.deltos-starred-shown')).toHaveText('Showing 20 of 23');
 await group.getByRole('button',{name:'Show 10 more Drafts starred messages'}).click();
 await expect(group.locator('.compact-message')).toHaveCount(23);
 await expect(group.getByRole('button',{name:'Show 10 more Drafts starred messages'})).toHaveCount(0);
 await group.getByRole('button',{name:'Show first 10 Drafts starred messages'}).click();
 await expect(group.locator('.compact-message')).toHaveCount(10);
});

test('Starred groups paginate independently without revealing extra entries in other groups',async({page})=>{
 const now=Date.now();
 await page.addInitScript(({now})=>{
  localStorage.setItem('inbox-gmail-token',JSON.stringify({
   access_token:'fake-star-pagination-token',refresh_token:'',expires_at:now+3600000
  }));
 },{now});
 const mails=Array.from({length:27},(_,i)=>({
  id:'mail-'+i,threadId:'thread-'+i,
  snippet:'Starred test message '+i,internalDate:String(now-i*60000),
  labelIds:i<14?['INBOX','STARRED']:['TRASH','STARRED'],
  payload:{headers:[
   {name:'From',value:'Tester <tester@example.test>'},
   {name:'Subject',value:'Starred test '+i},
   {name:'Date',value:new Date(now-i*60000).toUTCString()}
  ]}
 }));
 await page.route('**/gmail/v1/users/me/**',async route=>{
  const {pathname,searchParams}=new URL(route.request().url());
  if(pathname.endsWith('/profile'))return route.fulfill({json:{emailAddress:'tester@example.test'}});
  if(pathname.endsWith('/drafts'))return route.fulfill({json:{drafts:[]}});
  if(pathname.endsWith('/messages'))return route.fulfill({json:{
   messages:mails.map(m=>({id:m.id,threadId:m.threadId})),resultSizeEstimate:mails.length
  }});
  const id=pathname.split('/').pop();
  const found=mails.find(m=>m.id===id);
  if(found)return route.fulfill({json:found});
  return route.fulfill({json:{}});
 });
 await page.goto('/');
 await expect(page.locator('#search')).toBeVisible();
 await page.getByRole('button',{name:'Starred',exact:true}).click();
 const inbox=page.locator('.deltos-starred-inbox'),trash=page.locator('.deltos-starred-trash');
 await expect(inbox.locator('.compact-message')).toHaveCount(10);
 await expect(trash.locator('.compact-message')).toHaveCount(10);
 await expect(inbox.locator('.deltos-starred-count')).toHaveText('14');
 await expect(trash.locator('.deltos-starred-count')).toHaveText('13');
 await inbox.getByRole('button',{name:'Show 10 more Inbox starred messages'}).click();
 await expect(inbox.locator('.compact-message')).toHaveCount(14);
 await expect(trash.locator('.compact-message')).toHaveCount(10);
 await trash.getByRole('button',{name:'Show 10 more Trash starred messages'}).click();
 await expect(trash.locator('.compact-message')).toHaveCount(13);
 await inbox.getByRole('button',{name:'Show first 10 Inbox starred messages'}).click();
 await expect(inbox.locator('.compact-message')).toHaveCount(10);
 await expect(trash.locator('.compact-message')).toHaveCount(13);
});
