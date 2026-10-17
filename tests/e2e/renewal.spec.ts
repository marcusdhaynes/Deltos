import {test,expect} from '@playwright/test';

test('persistent OAuth session silently resumes after access token expiry',async({page})=>{
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const now=Date.now();
 await page.addInitScript(({now})=>{
  localStorage.setItem('deltos-auth-session','A'.repeat(43));
  localStorage.setItem('inbox-gmail-token',JSON.stringify({
   access_token:'expired-token',refresh_token:'',expires_at:now-1000
  }));
 },{now});
 await page.route('http://127.0.0.1:4173/',async route=>{
  const response=await route.fetch();
  const html=(await response.text()).replace(
   '<meta name="deltos-auth-backend" content="" />',
   '<meta name="deltos-auth-backend" content="https://auth.example.invalid" />'
  );
  await route.fulfill({response,body:html});
 });
 let renewals=0;
 await page.route('https://auth.example.invalid/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/session/token'){
   renewals++;
   return route.fulfill({json:{
    access_token:'renewed-from-server',
    expires_at:Date.now()+3600000,
    email:'tester@example.test'
   }});
  }
  return route.fulfill({status:404,json:{error:'Not found'}});
 });
 await page.route('**/gmail/v1/users/me/**',async route=>{
  const {pathname}=new URL(route.request().url());
  if(pathname.endsWith('/profile'))return route.fulfill({json:{emailAddress:'tester@example.test'}});
  if(pathname.endsWith('/messages'))return route.fulfill({json:{messages:[]}});
  return route.fulfill({json:{}});
 });
 await page.goto('/');
 await expect(page.locator('#search')).toBeVisible();
 await expect.poll(()=>renewals).toBeGreaterThan(0);
 const values=await page.evaluate(()=>({
  token:JSON.parse(localStorage.getItem('inbox-gmail-token')||'{}').access_token,
  session:localStorage.getItem('deltos-auth-session')
 }));
 expect(values.token).toBe('renewed-from-server');
 expect(values.session).toBe('A'.repeat(43));
 expect(errors).toEqual([]);
});
