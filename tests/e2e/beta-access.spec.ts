import { test, expect } from '@playwright/test';

test('Demo users can find exact Google OAuth beta access guidance before sign-in',async({page})=>{
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');
 await expect(page.locator('#search')).toBeVisible();
 const help=page.getByLabel('Beta sign-in help');
 await expect(help).toBeVisible();
 await help.click();
 const panel=page.locator('.deltos-beta-popover');
 await expect(panel).toBeVisible();
 await expect(panel).toContainText('approved beta testers');
 await expect(panel).toContainText('Google Cloud controls');
 await expect(page.getByRole('button',{name:'Sign in with Google'})).toBeVisible();
 expect(errors).toEqual([]);
});
