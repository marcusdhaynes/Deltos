import { test, expect } from '@playwright/test';

test('demo opens without runtime errors and search stays usable', async ({page}) => {
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#search')).toBeVisible();
  await expect(page.locator('#search')).toHaveAttribute('aria-label','Search messages');
  await page.locator('#search').fill('Airbnb');
  await expect(page.locator('#search')).toHaveValue('Airbnb');
  await page.locator('#search').fill('');
  await expect(page.locator('header .deltos-search')).toBeVisible();
  const gaps=await page.evaluate(()=>{
    const header=document.querySelector('.header');
    const search=header.querySelector('.deltos-search');
    const brand=header.querySelector('.brand');
    const right=header.querySelector('.header-right');
    const a=search.getBoundingClientRect(),b=brand.getBoundingClientRect(),c=right.getBoundingClientRect();
    return {left:a.left-b.right,right:c.left-a.right,searchWidth:a.width};
  });
  expect(Math.abs(gaps.left-gaps.right)).toBeLessThanOrEqual(3);
  expect(gaps.searchWidth).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test('demo navigation does not lose keyboard focus or throw',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#search')).toBeVisible();
  const triage=page.getByText('Triage',{exact:true}).first();
  await triage.click();
  await expect(page.locator('.triage-deck')).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.triage-deck')).toBeVisible();
  expect(errors).toEqual([]);
});


test('Triage opens by default and precedes Inbox in the sidebar',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.triage-deck')).toBeVisible();
 const nav=await page.locator('.sidebar .nav-button').allTextContents();
 const triageIndex=nav.findIndex(label=>label.trim()==='Triage');
 const inboxIndex=nav.findIndex(label=>label.trim().startsWith('Inbox'));
 expect(triageIndex).toBeGreaterThanOrEqual(0);
 expect(inboxIndex).toBeGreaterThan(triageIndex);
 await page.locator('.sidebar .nav-button').filter({hasText:/^Inbox/}).click();
 await expect(page.locator('.compact-folder-inbox')).toBeVisible();
 await page.reload();
 await expect(page.locator('.triage-deck')).toBeVisible();
});

test('programmatic focus never shows a box around Triage on load or refresh',async({page})=>{
 await page.goto('/');
 const deck=page.locator('.triage-deck');
 for(let attempt=0;attempt<2;attempt++){
  await expect(deck).toBeVisible();
  await expect(deck).toBeFocused();
  const style=await deck.evaluate(element=>getComputedStyle(element).outlineStyle);
  expect(style).toBe('none');
  if(attempt===0)await page.reload();
 }
 // Retaining keyboard focus must not affect the page's swipe shortcuts.
 await page.keyboard.press('ArrowUp');
 await expect(deck).toBeVisible();
});

test('expired Gmail token does not open a disconnect prompt on refresh',async({page})=>{
 const dialogs=[];
 page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss()});
 await page.addInitScript(()=>{
  localStorage.setItem('inbox-gmail-token',JSON.stringify({access_token:'expired-token',expires_at:Date.now()-60000}));
  localStorage.setItem('deltos-last-google-account','expired@example.test');
 });
 await page.goto('/');
 await expect(page.locator('.triage-deck')).toBeVisible();
 await page.reload();
 await expect(page.locator('.triage-deck')).toBeVisible();
 expect(dialogs).toEqual([]);
 await expect(page.getByText('Bringing back a little inbox magic…')).toHaveCount(0);
});
test('Triage renders before a slow Gmail profile response',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('inbox-gmail-token',JSON.stringify({access_token:'test-token',expires_at:Date.now()+3600000}));
  localStorage.setItem('deltos-last-google-account','slow@example.test');
 });
 await page.route('https://gmail.googleapis.com/**',async route=>{
  await new Promise(resolve=>setTimeout(resolve,3000));
  if(route.request().url().includes('/profile'))return route.fulfill({json:{emailAddress:'slow@example.test'}});
  return route.fulfill({json:{messages:[]}});
 });
 await page.goto('/');
 await expect(page.locator('.triage-deck')).toBeVisible({timeout:2000});
 await expect(page.locator('.sidebar')).toBeVisible({timeout:2000});
 await expect(page.getByText('Bringing back a little inbox magic…')).toHaveCount(0);
});

test('recent session preview paints before a slow Gmail network request',async({page})=>{
 await page.addInitScript(()=>{
  const account='cached@example.test';
  localStorage.setItem('inbox-gmail-token',JSON.stringify({access_token:'slow-cached-token',expires_at:Date.now()+3600000}));
  localStorage.setItem('deltos-last-google-account',account);
  sessionStorage.setItem('deltos-visible-mail-v1',JSON.stringify({
   account,savedAt:Date.now(),items:[{id:'cached-1',threadId:'cached-1',sender:'Cached Sender',
    from:'cached@example.test',subject:'Instant preview from this tab',
    snippet:'Preview without full body',timestamp:Date.now(),bundle:'',unread:true,pinned:false,
    labels:['INBOX','UNREAD']}]
  }));
 });
 await page.route('https://gmail.googleapis.com/**',async route=>{
  await new Promise(resolve=>setTimeout(resolve,3800));
  if(route.request().url().includes('/profile'))return route.fulfill({json:{emailAddress:'cached@example.test'}});
  return route.fulfill({json:{messages:[]}});
 });
 await page.goto('/');
 await expect(page.locator('.deck-subject').filter({hasText:'Instant preview from this tab'})).toBeVisible({timeout:2200});
 await expect(page.getByText('Bringing back a little inbox magic…')).toHaveCount(0);
});

test('Gmail quota coordinator caches identical requests and budgets costly methods',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.triage-deck')).toBeVisible();
 const outcome=await page.evaluate(async()=>{
  const quota=window.DeltosGmailQuota;
  let fetches=0;
  const first=()=>quota.readRequest('/profile',async()=>{fetches++;return{ok:true}});
  const values=await Promise.all([first(),first(),first()]);
  return{fetches,values,costList:quota.estimate('/messages?maxResults=50','GET'),
   costGet:quota.estimate('/messages/id?format=metadata','GET'),
   costBatch:quota.estimate('/messages/batchModify','POST'),
   costFull:quota.estimate('/messages/id?format=full','GET'),
   budget:quota.status().limit};
 });
 expect(outcome.fetches).toBe(1);
 expect(outcome.values).toEqual([{ok:true},{ok:true},{ok:true}]);
 expect(outcome.costList).toBe(5);
 expect(outcome.costGet).toBe(20);
 expect(outcome.costBatch).toBe(50);
 expect(outcome.costFull).toBe(60);
 expect(outcome.budget).toBeLessThan(6000);
});
test('Gmail quota error activates a shared cooldown instead of retry storms',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('inbox-gmail-token',JSON.stringify({access_token:'quota-test-token',expires_at:Date.now()+3600000}));
  localStorage.setItem('deltos-last-google-account','quota-test@example.test');
 });
 let attempts=0;
 await page.route('https://gmail.googleapis.com/**',async route=>{
  attempts++;
  await route.fulfill({status:403,contentType:'application/json',
   body:JSON.stringify({error:{code:403,message:"Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'."}})});
 });
 await page.goto('/');
 await expect(page.locator('.triage-deck')).toBeVisible();
 await expect.poll(async()=>page.evaluate(()=>window.DeltosGmailQuota.status().pausedUntil),{timeout:5000}).toBeGreaterThan(0);
 await page.waitForTimeout(500);
 expect(attempts).toBeLessThanOrEqual(4);
 const status=await page.evaluate(()=>window.DeltosGmailQuota.status());
 expect(status.pausedUntil).toBeGreaterThan(Date.now()+20000);
});
