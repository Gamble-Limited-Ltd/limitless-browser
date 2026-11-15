// S6 address bar (domain picked out) and tab layout (docs/1.0/UI.md 3).
const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

test('the address bar picks out the registrable domain, and focus shows the raw URL', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { document.getElementById('url').value = 'https://www.example.co.uk/some/path?q=1'; });
  const v = page.locator('#lbUrlView');
  await expect(v).toBeVisible();
  await expect(v.locator('.lb-uv-m').first()).toHaveText('https://www.');
  await expect(v.locator('.lb-uv-d')).toHaveText('example.co.uk');
  await expect(v.locator('.lb-uv-p')).toHaveText('/some/path?q=1');
  await page.locator('#url').focus();
  await expect(v).toBeHidden();
  expect(await page.evaluate(() => { const i = document.getElementById('url'); return i.selectionEnd - i.selectionStart === i.value.length; })).toBe(true);
  await page.evaluate(() => document.getElementById('url').blur());
  await expect(v).toBeVisible();
});

test('internal pages and IP hosts are not split wrongly', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => window.LBUI.splitUrl('limitless://newtab'))).toBe(null);
  expect(await page.evaluate(() => window.LBUI.splitUrl('http://10.0.0.1:8080/x'))).toEqual(['http://', '10.0.0.1', ':8080/x']);
  expect(await page.evaluate(() => window.LBUI.splitUrl('https://a.b.example.com/'))).toEqual(['https://a.b.', 'example.com', '/']);
});

test('vertical tabs: setting, persisted key, rail width, collapse by toggle and by narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-lb-tabs'))).toBe('top');
  await page.evaluate(() => { document.getElementById('settingsBtn').click(); document.querySelector('.settings-nav-item[data-section="appearance"]').click(); });
  await page.locator('#lbTabLayoutSeg button[data-v="side"]').click();
  expect(await page.evaluate(() => localStorage.getItem('limitless:tablayout:v1'))).toBe('side');
  const w = () => page.evaluate(() => document.querySelector('.titlebar').getBoundingClientRect().width);
  expect(await w()).toBe(220);
  await page.locator('#lbRailToggle').click();
  expect(await w()).toBe(52);
  await page.locator('#lbRailToggle').click();
  expect(await w()).toBe(220);
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect.poll(w).toBe(52);
  await page.reload();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-lb-tabs'))).toBe('side');
});

test('under an upstream skin the tab strip stays on top', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('limitless:tablayout:v1', 'side'));
  await boot(page);
  await page.evaluate(() => document.documentElement.setAttribute('data-skin', 'chrome'));
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.titlebar')).position)).not.toBe('absolute');
});
