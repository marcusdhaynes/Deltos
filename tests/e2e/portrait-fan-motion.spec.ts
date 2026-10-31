import {test,expect,type Page,type Locator} from '@playwright/test';

async function beginDrag(page:Page,card:Locator,distance=112){
 const box=await card.boundingBox();
 if(!box)throw Error('Mail card not on screen');
 const sx=box.x+box.width*.50,sy=box.y+box.height*.50;
 await page.mouse.move(sx,sy);
 await page.mouse.down();
 await page.mouse.move(sx+distance,sy,{steps:16});
 return {sx,sy,initial:box};
}

async function visibleFanFits(page:Page,size:{width:number,height:number}){
 await expect(page.locator('.deltos-fan-choice')).toHaveCount(5);
 for(const rank of ['1','2','3','4','new']){
  const selector=rank==='new'?'.deltos-fan-add':'[data-deltos-rank="'+rank+'"]';
  const item=page.locator(selector);
  await expect(item).toBeVisible();
  const box=await item.boundingBox();
  if(!box)throw Error('Missing '+rank+' at '+size.width+'x'+size.height);
  expect(box.x,'left side of '+rank).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width,'right side of '+rank).toBeLessThanOrEqual(size.width);
  expect(box.y,'top side of '+rank).toBeGreaterThanOrEqual(0);
  expect(box.y+box.height,'bottom side of '+rank).toBeLessThanOrEqual(size.height);
 }
}

test('Phone and portrait layouts shrink the Inbox mail and keep all five options on screen',async({page})=>{
 for(const size of [
  {width:320,height:640},{width:360,height:740},
  {width:390,height:844},{width:430,height:932},
  {width:768,height:1024},{width:900,height:1200}
 ]){
  await page.setViewportSize(size);
  await page.goto('/');
  const row=page.locator('.compact-folder-inbox .compact-message').first();
  await expect(row).toBeVisible();
  const {initial}=await beginDrag(page,row);
  await visibleFanFits(page,size);
  await expect(row).toHaveAttribute('data-portrait-fan-drag','true');
  await expect.poll(async()=>{
   const now=await row.boundingBox();return now?now.width/initial.width:1
  }).toBeLessThan(.90);
  await page.mouse.move(12,12,{steps:8});
  await page.mouse.up();
  await expect(page.locator('.deltos-fan-choice')).toHaveCount(0);
  await expect(row).not.toHaveAttribute('data-portrait-fan-drag','true');
  await expect.poll(async()=>{
   const now=await row.boundingBox();return now?now.width/initial.width:0
  }).toBeGreaterThan(.98);
 }
});

test('On portrait Triage, the top card shrinks and gives way to all five visible labels',async({page})=>{
 for(const size of [{width:360,height:740},{width:390,height:844},{width:768,height:1024}]){
  await page.setViewportSize(size);
  await page.goto('/');
  if(size.width<=790)await page.locator('.mobile-menu').click();
  await page.getByRole('button',{name:'Triage',exact:true}).click();
  const card=page.locator('.deck-card.deck-top');
  await expect(card).toBeVisible();
  const {initial}=await beginDrag(page,card);
  await visibleFanFits(page,size);
  await expect(card).toHaveAttribute('data-portrait-fan-drag','true');
  await expect.poll(async()=>{
   const box=await card.boundingBox();return box?box.width/initial.width:1
  }).toBeLessThan(.85);
  await page.mouse.move(8,8,{steps:8});
  await page.mouse.up();
  await expect(page.locator('.deltos-fan-choice')).toHaveCount(0);
  await expect(card).not.toHaveAttribute('data-portrait-fan-drag','true');
  await expect.poll(async()=>{
   const now=await card.boundingBox();return now?now.width/initial.width:0
  }).toBeGreaterThan(.98);
 }
});

test('Moving to a label progressively highlights it, shrinks the card and drops on release',async({page})=>{
 const size={width:390,height:844};
 await page.setViewportSize(size);
 await page.goto('/');
 const card=page.locator('.compact-folder-inbox .compact-message').first();
 const {initial}=await beginDrag(page,card,92);
 await visibleFanFits(page,size);
 const target=page.locator('[data-deltos-rank="4"]');
 const targetBox=await target.boundingBox();
 if(!targetBox)throw Error('Outer label missing');
 const x=targetBox.x+targetBox.width/2,y=targetBox.y+targetBox.height/2;
 await page.mouse.move(x,y,{steps:18});
 await expect(target).toHaveAttribute('data-deltos-over','true');
 await expect(target).toHaveClass(/deltos-fan-hot/);
 await expect.poll(async()=>{
  const box=await target.boundingBox();
  const style=await target.evaluate(node=>parseFloat(getComputedStyle(node).width));
  return box?box.width/style:0;
 }).toBeGreaterThan(1.08);
 await expect.poll(async()=>{
  const box=await card.boundingBox();return box?box.width/initial.width:1;
 }).toBeLessThan(.81);
 await page.mouse.up();
 await expect(page.locator('.deltos-fan-choice')).toHaveCount(0);
 await expect(page.locator('#toast-root')).toContainText('Archived + labeled');
});

test.describe('Real touch pointer on a small portrait phone',()=>{
 test.use({viewport:{width:360,height:740},hasTouch:true,isMobile:true});
 test('Finger drag reveals the bubbles and selects the highlighted label on touch release',async({page})=>{
  await page.goto('/');
  const row=page.locator('.compact-folder-inbox .compact-message').first();
  await expect(row).toBeVisible();
  const box=await row.boundingBox();
  if(!box)throw Error('Missing touch card');
  const sx=box.x+box.width/2,sy=box.y+box.height/2;
  const dev=await page.context().newCDPSession(page);
  const touch=async(type:'touchStart'|'touchMove'|'touchEnd',x:number,y:number)=>
   dev.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
  await touch('touchStart',sx,sy);
  for(let i=1;i<=10;i++)await touch('touchMove',sx+105*i/10,sy);
  await visibleFanFits(page,{width:360,height:740});
  await expect(row).toHaveAttribute('data-portrait-fan-drag','true');
  const bubble=page.locator('[data-deltos-rank="1"]');
  const target=await bubble.boundingBox();
  if(!target)throw Error('Missing label target');
  const tx=target.x+target.width/2,ty=target.y+target.height/2;
  for(let i=1;i<=18;i++)await touch('touchMove',sx+105+(tx-(sx+105))*i/18,sy+(ty-sy)*i/18);
  await expect(bubble).toHaveAttribute('data-deltos-over','true');
  await touch('touchEnd',tx,ty);
  await expect(page.locator('.deltos-fan-choice')).toHaveCount(0);
  await expect(page.locator('#toast-root')).toContainText('Archived + labeled');
  await dev.detach();
 });
});
