import { test, expect } from '@playwright/test';

test('HTML-only Gmail messages render as formatted content, not source code',async({page})=>{
  const errors=[];
  const attemptedImages=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',req=>{
    if(req.url().includes('tracking.example.invalid'))attemptedImages.push(req.url());
  });
  const now=Date.now();
  await page.addInitScript(({now})=>{
    localStorage.setItem('inbox-gmail-token',JSON.stringify({
      access_token:'fake-browser-test-token',refresh_token:'',expires_at:now+3600000
    }));
  },{now});
  const html='<html><head><style>h1{color:navy}</style></head><body>'+
    '<h1>Payment returned to your bank</h1>'+
    '<table><tr><th>Transaction</th><td>$20.00</td></tr></table>'+
    '<img src="https://tracking.example.invalid/pixel.png" width="1" height="1">'+
    '<script>parent.__mailInjected=true</script></body></html>';
  const encoded=Buffer.from(html,'utf8').toString('base64url');
  const message={
    id:'html-1',threadId:'thread-1',snippet:'Payment returned',
    internalDate:String(now),labelIds:['INBOX','UNREAD'],
    payload:{mimeType:'multipart/alternative',headers:[
      {name:'From',value:'PayPal <notices@example.test>'},
      {name:'To',value:'tester@example.test'},
      {name:'Date',value:new Date(now).toUTCString()},
      {name:'Subject',value:'HTML rendering test'}
    ],parts:[{mimeType:'text/html',body:{data:encoded}}]}
  };
  await page.route('**/gmail/v1/users/me/**',async route=>{
    const {pathname}=new URL(route.request().url());
    if(pathname.endsWith('/profile'))return route.fulfill({json:{emailAddress:'tester@example.test'}});
    if(pathname.endsWith('/messages'))return route.fulfill({json:{messages:[{id:'html-1',threadId:'thread-1'}],resultSizeEstimate:1}});
    if(pathname.includes('/messages/html-1'))return route.fulfill({json:message});
    return route.fulfill({json:{}});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Inbox',exact:true}).click();
  const card=page.locator('.compact-message').filter({hasText:'HTML rendering test'}).first();
  await expect(card).toBeVisible({timeout:20000});
  await card.click();
  await expect(page.locator('.deltos-rich-email-toolbar')).toBeVisible();
  const frame=page.frameLocator('.deltos-email-frame');
  await expect(frame.getByRole('heading',{name:'Payment returned to your bank'})).toBeVisible();
  await expect(frame.locator('table')).toContainText('Transaction');
  expect(await page.evaluate(()=>window.__mailInjected===true)).toBe(false);
  expect(attemptedImages).toEqual([]);
  expect(errors).toEqual([]);
});
