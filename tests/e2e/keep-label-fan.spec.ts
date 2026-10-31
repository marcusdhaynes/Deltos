import {test,expect} from '@playwright/test';

test('Right arrow opens the predictive label fan without changing the message',async({page})=>{
 await page.goto('/');
 const row=page.locator('.compact-folder-inbox .compact-message').first();
 await expect(row).toBeVisible();
 const id=await row.getAttribute('data-id');
 await row.focus();
 await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toBeVisible();
 await expect(page.locator('.deltos-fan-choice:not(.deltos-fan-add)')).toHaveCount(4);
 await expect(page.getByRole('button',{name:'Create a new label'})).toBeVisible();
 await expect(page.locator('.compact-message[data-id="'+id+'"]')).toBeVisible();
 await page.getByRole('button',{name:'Cancel label selection'}).click();
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 await expect(page.locator('.compact-message[data-id="'+id+'"]')).toBeVisible();
});

test('New label bubble creates and applies a Gmail label in the demo',async({page})=>{
 await page.goto('/');
 const row=page.locator('.compact-folder-inbox .compact-message').first();
 await row.focus();
 await page.keyboard.press('ArrowRight');
 await page.getByRole('button',{name:'Create a new label'}).click();
 await expect(page.getByRole('textbox',{name:'New Gmail label'})).toBeFocused();
 await page.getByRole('textbox',{name:'New Gmail label'}).fill('Storage Statements');
 await page.keyboard.press('Enter');
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 await expect(page.locator('#toast-root')).toContainText('Storage Statements');
});

test('Triage right-drag can release directly over a predicted bubble',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Triage',exact:true}).click();
 const card=page.locator('.deck-card.deck-top');
 await expect(card).toBeVisible();
 const original=await card.locator('.deck-subject').innerText();
 const box=await card.boundingBox();
 if(!box)throw Error('No deck position');
 const sx=box.x+box.width*.5,sy=box.y+box.height*.5;
 await page.mouse.move(sx,sy);
 await page.mouse.down();
 await page.mouse.move(sx+85,sy,{steps:8});
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toBeVisible();
 const target=page.locator('.deltos-fan-choice[data-deltos-rank="1"]');
 await expect(target).toBeVisible();
 const targetBox=await target.boundingBox();
 if(!targetBox)throw Error('No prediction bubble');
 await page.mouse.move(targetBox.x+targetBox.width/2,targetBox.y+targetBox.height/2,{steps:10});
 await page.mouse.up();
 await expect(page.locator('.triage-notif')).toContainText('Read + Keep');
 await expect(page.locator('.deck-card.deck-top .deck-subject')).not.toHaveText(original);
});

test('The four prediction bubbles appear in the requested 3 / 1 / + / 2 / 4 arc',async({page})=>{
 await page.goto('/');
 const row=page.locator('.compact-folder-inbox .compact-message').first();
 await row.focus();await page.keyboard.press('ArrowRight');
 const xy=async selector=>{
   const box=await page.locator(selector).boundingBox();
   if(!box)throw Error('Bubble not rendered: '+selector);
   return {x:box.x+box.width/2,y:box.y+box.height/2};
 };
 const [a,b,c,d,plus]=await Promise.all([
  xy('[data-deltos-rank="1"]'),xy('[data-deltos-rank="2"]'),
  xy('[data-deltos-rank="3"]'),xy('[data-deltos-rank="4"]'),
  xy('.deltos-fan-add')
 ]);
 expect(c.y).toBeLessThan(a.y);expect(a.y).toBeLessThan(plus.y);
 expect(plus.y).toBeLessThan(b.y);expect(b.y).toBeLessThan(d.y);
 expect(c.x).toBeLessThan(a.x);expect(a.x).toBeLessThan(plus.x);
 expect(d.x).toBeLessThan(b.x);expect(b.x).toBeLessThan(plus.x);
});


test('The wider fan forms a rounded arc with separated circular targets on desktop, mobile and short screens',async({page})=>{
 for(const size of [{width:1280,height:800},{width:390,height:844},{width:900,height:580},{width:375,height:600}]){
  await page.setViewportSize(size);
  await page.goto('/');
  const row=page.locator('.compact-folder-inbox .compact-message').first();
  await expect(row).toBeVisible();
  await row.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.deltos-fan-choice')).toHaveCount(5);
  const boxes=await Promise.all(['3','1','new','2','4'].map(async rank=>{
   const selector=rank==='new'?'.deltos-fan-add':'[data-deltos-rank="'+rank+'"]';
   const box=await page.locator(selector).boundingBox();
   if(!box)throw Error('Missing fan bubble at '+size.width+'x'+size.height+': '+rank);
   expect(box.x).toBeGreaterThanOrEqual(3);
   expect(box.y).toBeGreaterThanOrEqual(3);
   expect(box.x+box.width).toBeLessThanOrEqual(size.width-3);
   expect(box.y+box.height).toBeLessThanOrEqual(size.height-3);
   return {rank,cx:box.x+box.width/2,cy:box.y+box.height/2,r:box.width/2};
  }));
  const [three,one,plus,two,four]=boxes;
  expect(three.cx).toBeLessThan(one.cx-45);
  expect(one.cx).toBeLessThan(plus.cx-39);
  expect(four.cx).toBeLessThan(two.cx-45);
  expect(two.cx).toBeLessThan(plus.cx-39);
  expect(three.cy).toBeLessThan(one.cy-40);
  expect(one.cy).toBeLessThan(plus.cy-40);
  expect(plus.cy).toBeLessThan(two.cy-40);
  expect(two.cy).toBeLessThan(four.cy-40);
  for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){
   const first=boxes[a],second=boxes[b];
   const distance=Math.hypot(first.cx-second.cx,first.cy-second.cy);
   expect(distance).toBeGreaterThan(first.r+second.r+4);
  }
  await page.getByRole('button',{name:'Cancel label selection'}).click();
 }
});
