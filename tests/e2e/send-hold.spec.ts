import {test,expect} from '@playwright/test';

test('Send is never activated by a tap and requires a full three-second hold',async({page})=>{
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');
 await expect(page.locator('#search')).toBeVisible();
 await page.locator('.fab').click();
 const form=page.getByRole('dialog');
 await expect(form).toBeVisible();
 await form.getByPlaceholder('someone@example.com').fill('test@example.test');
 await form.getByPlaceholder('Subject').fill('Three-second send test');
 await form.getByPlaceholder('Write something lovely…').fill('The send control must require a sustained hold.');
 const send=form.getByRole('button',{name:'Hold Send for 3 seconds'});
 await send.click();
 await expect(form).toBeVisible();
 await send.hover();
 await page.mouse.down();
 await page.waitForTimeout(3150);
 await page.mouse.up();
 await expect(form).toBeHidden({timeout:10000});
 await expect(page.getByText('Demo message sent (not delivered to anyone).')).toBeVisible();
 expect(errors).toEqual([]);
});
