import { test, expect } from '@playwright/test';

/** Check actual hit testing, not just a CSS z-index number.
 * A competing app button is inserted exactly under the open popup.
 * If another stacking context or clip hides the popup this will fail. */
async function assertPopupIsOnTop(page: any, selector: string) {
  return page.evaluate((popupSelector: string) => {
    const popup = document.querySelector(popupSelector);
    if (!(popup instanceof HTMLElement)) throw new Error('Popup missing: ' + popupSelector);
    const rect = popup.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) throw new Error('Popup has no area: ' + popupSelector);
    const x = Math.min(window.innerWidth - 3, Math.max(3, rect.left + Math.min(rect.width / 2, 45)));
    const y = Math.min(window.innerHeight - 3, Math.max(3, rect.top + Math.min(rect.height / 2, 50)));
    const obstruction = document.createElement('button');
    obstruction.textContent = 'Competing app control';
    obstruction.style.cssText = 'position:fixed;z-index:1000;pointer-events:auto;'
      + 'left:' + (x - 35) + 'px;top:' + (y - 15) + 'px;width:70px;height:30px;';
    document.body.appendChild(obstruction);
    const top = document.elementFromPoint(x, y);
    const above = top !== null && popup.contains(top);
    obstruction.remove();
    return { above, popup: popupSelector, at: [x, y], actual: top?.className?.toString() || top?.tagName };
  }, selector);
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test(`all header search popups appear above overlapping controls on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    await page.locator('.search-scope-btn').click();
    await expect(page.locator('.search-choice-pop')).toBeVisible();
    expect(await assertPopupIsOnTop(page, '.search-choice-pop')).toMatchObject({ above: true });
    expect(await page.locator('.header').evaluate(e => Number(getComputedStyle(e).zIndex))).toBeGreaterThan(1000);

    await page.locator('.search-clock-btn').click();
    await expect(page.locator('.search-choice-pop')).toHaveCount(0);
    await expect(page.locator('.search-time-pop')).toBeVisible();
    expect(await assertPopupIsOnTop(page, '.search-time-pop')).toMatchObject({ above: true });

    await page.locator('.search-time-pop .search-time-modes button').filter({ hasText: 'Range' }).click();
    await expect(page.locator('.search-time-pop')).toBeVisible();
    expect(await assertPopupIsOnTop(page, '.search-time-pop')).toMatchObject({ above: true });
  });

  test(`notifications and Triage help popups stay above action controls on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await expect(page.locator('.shared-notif-panel')).toBeVisible();
    expect(await assertPopupIsOnTop(page, '.shared-notif-panel')).toMatchObject({ above: true });
    await page.getByRole('button', { name: 'Close notifications' }).click();

    await page.getByRole('button', { name: 'How triage works' }).click();
    await expect(page.locator('.triage-info-pop')).toBeVisible();
    expect(await assertPopupIsOnTop(page, '.triage-info-pop')).toMatchObject({ above: true });
  });
}
