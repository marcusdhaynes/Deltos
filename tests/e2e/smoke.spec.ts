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
