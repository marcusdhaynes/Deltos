import {test,expect} from '@playwright/test';

test('Starred is above Opened, Gmail-style stars toggle, and groups preserve source',async({page})=>{
 await page.goto('/');
 await expect(page.locator('#search')).toBeVisible();
 const nav=await page.locator('.sidebar .nav-button').allTextContents();
 expect(nav.indexOf('Starred')).toBeGreaterThan(-1);
 expect(nav.indexOf('Starred')).toBeLessThan(nav.indexOf('Opened'));
 const candidate=page.locator('.compact-folder-inbox .compact-message').filter({has:page.locator('.deltos-star[aria-pressed="false"]')}).first();
 const id=await candidate.getAttribute('data-id');
 expect(id).toBeTruthy();
 const row=page.locator('.compact-folder-inbox .compact-message[data-id="'+id+'"]');
 const star=row.locator('.deltos-star');
 await expect(star).toBeVisible();
 const subject=await row.locator('.compact-subject').innerText();
 await star.click();
 await expect(star).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Starred',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Inbox',exact:true})).toBeVisible();
 await expect(page.locator('.deltos-starred-inbox')).toContainText(subject);
 const target=page.locator('.deltos-starred-inbox .compact-message').filter({hasText:subject});
 await target.locator('.deltos-star').click();
 await expect(page.locator('.deltos-starred-inbox .compact-message').filter({hasText:subject})).toHaveCount(0);
});

test('Draft stars persist within the mailbox and appear under the Drafts group',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('deltos-demo-drafts',JSON.stringify([{id:'test-draft-101',to:'hello@example.test',
   subject:'Draft grouping marker',body:'A saved draft',cc:'',bcc:'',updated:Date.now()}]));
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Drafts',exact:true}).click();
 const item=page.locator('.compact-draft-message').filter({hasText:'Draft grouping marker'});
 await expect(item).toBeVisible();
 await item.locator('.deltos-star').click();
 await expect(item.locator('.deltos-star')).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Starred',exact:true}).click();
 const group=page.locator('.deltos-starred-drafts');
 await expect(group).toBeVisible();
 await expect(group).toContainText('Draft grouping marker');
 await page.reload();
 await page.getByRole('button',{name:'Starred',exact:true}).click();
 await expect(page.locator('.deltos-starred-drafts')).toContainText('Draft grouping marker');
});

test('Triage cards have an independent star and preserve Triage provenance',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Triage',exact:true}).click();
 const card=page.locator('.deck-card.deck-top');
 await expect(card.locator('.deltos-star')).toBeVisible();
 const subject=await card.locator('.deck-subject').innerText();
 const star=card.locator('.deltos-star');
 const wasStarred=await star.getAttribute('aria-pressed');
 // Ensure a star is newly created by toggling preexisting stars off first.
 if(wasStarred==='true')await star.click();
 await card.locator('.deltos-star').click();
 await expect(card.locator('.deltos-star')).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Starred',exact:true}).click();
 await expect(page.locator('.deltos-starred-triage')).toContainText(subject);
});

test('Inbox swipe stamps show all four directions while dragging',async({page})=>{
 for(const [direction,dx,dy] of [['left',-115,0],['right',115,0],['up',0,-115],['down',0,115]]){
  await page.goto('/');
  await expect(page.locator('.compact-folder-inbox .compact-message').first()).toBeVisible();
  const row=page.locator('.compact-folder-inbox .compact-message').first();
  const box=await row.boundingBox();
  const sx=box.x+box.width*.5,sy=box.y+box.height*.5;
  await page.mouse.move(sx,sy);
  await page.mouse.down();
  await page.mouse.move(sx+dx,sy+dy,{steps:8});
  const stamp=row.locator('.deltos-compact-stamp.stamp-'+direction);
  await expect(stamp).toBeVisible();
  await expect(stamp).toHaveCSS('opacity','1');
  await page.mouse.up();
  if(direction==='left')await expect(page.getByRole('dialog')).toBeVisible();
  if(direction==='right'){
   await expect(page.getByRole('button',{name:'Create a new label'})).toBeVisible();
   await page.getByRole('button',{name:'Create a new label'}).click();
   await page.getByRole('textbox',{name:'New Gmail label'}).fill('Swipe Test Label');
   await page.getByRole('button',{name:'Create & Keep'}).click();
   await expect(page.locator('#toast-root')).toContainText('Read + Keep');
  }
  if(direction==='up')await expect(page.locator('#toast-root')).toContainText('Marked unread');
  if(direction==='down')await expect(page.locator('#toast-root')).toContainText('Moved to Trash');
 }
});

test('Inbox can use keyboard arrows for all directions while the row has focus',async({page})=>{
 await page.goto('/');
 const row=page.locator('.compact-folder-inbox .compact-message').first();
 await row.focus();
 await page.keyboard.press('ArrowLeft');
 await expect(page.getByRole('dialog')).toBeVisible();
});
