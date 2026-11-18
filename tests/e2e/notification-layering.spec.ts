import { test, expect } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test(`Notifications stays above app buttons on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');

    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel).toBeVisible();

    // Reproduce the reported stacking failure even when a normal action
    // button intersects the open Notifications panel.
    const layers = await page.evaluate(() => {
      const container = document.querySelector('.global-notifications');
      const panel = document.querySelector('.shared-notif-panel');
      if (!(container instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
        throw new Error('Notifications panel was not mounted');
      }
      const rect = panel.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + Math.min(rect.height / 2, 85);
      const competingButton = document.createElement('button');
      competingButton.textContent = 'Underlying app action';
      competingButton.style.cssText = [
        'position:fixed', 'z-index:250', 'pointer-events:auto',
        `left:${x - 50}px`, `top:${y - 15}px`,
        'width:100px', 'height:30px'
      ].join(';');
      document.body.append(competingButton);
      const target = document.elementFromPoint(x, y);
      const popupIsTop = !!target && panel.contains(target);
      competingButton.remove();

      const dialogProbe = document.createElement('div');
      dialogProbe.className = 'modal-overlay';
      document.body.append(dialogProbe);
      const dialogZ = Number(getComputedStyle(dialogProbe).zIndex);
      dialogProbe.remove();

      return {
        popupIsTop,
        popupZ: Number(getComputedStyle(container).zIndex),
        dialogZ
      };
    });
    expect(layers.popupIsTop).toBe(true);
    expect(layers.popupZ).toBeGreaterThan(250);
    expect(layers.dialogZ).toBeGreaterThan(layers.popupZ);

    await panel.getByRole('button', { name: 'All', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await panel.getByRole('button', { name: 'Close notifications' }).click();
    await expect(panel).toHaveCount(0);
  });
}
