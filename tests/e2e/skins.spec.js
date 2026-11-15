const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// S2 (SPEED.md 3.3): theme/skins.css is fetched only once a skin is active.
test('skins.css is fetched only when a skin is active, and again at boot when one is saved', async ({ page }) => {
  const seen = [];
  page.on('request', (r) => seen.push(r.url()));
  const errors = await boot(page);
  const skinReq = () => seen.filter((u) => u.endsWith('/theme/skins.css')).length;
  expect(skinReq()).toBe(0);
  await page.evaluate(() => document.querySelector('.skin-tile[data-skinval="chrome"]').click());
  await expect.poll(skinReq).toBe(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-skin'))).toBe('chrome');
  await expect.poll(() => page.evaluate(() => !!(document.getElementById('skinStyles') || {}).sheet)).toBe(true);
  seen.length = 0;
  await page.reload();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  await expect.poll(skinReq).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-skin'))).toBe('chrome');
  expect(errors).toEqual([]);
});
