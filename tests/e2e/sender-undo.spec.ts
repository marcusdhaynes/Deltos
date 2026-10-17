import { test, expect } from '@playwright/test';

test('sender-wide triage and Undo restore the visible message without reload',async({page})=>{
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/');
  await expect(page.locator('#search')).toBeVisible();
  await page.getByText('Triage',{exact:true}).first().click();
  const current=page.locator('.triage-deck .deck-top');
  await expect(current).toBeVisible();
  const firstSender=await current.locator('.deck-id strong').innerText();
  expect(firstSender.length).toBeGreaterThan(0);
  await page.keyboard.press('ArrowLeft');
  const undo=page.getByRole('button',{name:'Undo last action'});
  await expect(undo).toBeEnabled({timeout:10000});
  await undo.click();
  await expect(page.locator('.triage-deck .deck-top .deck-id strong')).toHaveText(firstSender,{timeout:10000});
  expect(errors).toEqual([]);
});
