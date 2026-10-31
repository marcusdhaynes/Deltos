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
