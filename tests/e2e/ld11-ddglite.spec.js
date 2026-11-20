const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { SETUP } = require('./s3-helpers');
const { openSettings } = require('./helpers-ui');

// LD-11: "DuckDuckGo Lite (fastest)" is an extra search engine; the default stays DuckDuckGo.
test('engine list has DuckDuckGo Lite (fastest), default unchanged, a search goes to lite.duckduckgo.com', async ({ page }) => {
  const errors = await boot(page, { features: { ownRelay: true, ownSockets: 4, pageCache: true, warm: true } });
  await page.evaluate(SETUP);
  await page.evaluate(() => {
    __respond('https://lite.duckduckgo.com/lite/?q=hello', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>lite</title></head><body><p id="ok">results</p></body></html>' });
  });
  expect(await page.evaluate(() => LB_ls.getItem('limitless:engine:v1'))).toBeNull();   // nothing saved: default engine is still DuckDuckGo
  await page.locator('#ntEngine').click();
  await expect(page.locator('#ntEngineDropdown button.active')).toHaveAttribute('data-engine', 'ddg');
  const lite = page.locator('#ntEngineDropdown button[data-engine="ddglite"]');
  await expect(lite).toHaveText('DuckDuckGo Lite (fastest)');
  await lite.click();
  expect(await page.evaluate(() => LB_ls.getItem('limitless:engine:v1'))).toBe('ddglite');
  await page.locator('#ntSearch').fill('hello');
  await page.locator('#ntSearch').press('Enter');
  await expect.poll(() => page.evaluate(() => window.__count(/^https:\/\/lite\.duckduckgo\.com\/lite\/\?q=hello/))).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Settings engine rows list DuckDuckGo Lite (fastest)', async ({ page }) => {
  await boot(page, { features: { ownRelay: true, ownSockets: 4, pageCache: true, warm: true } });
  await openSettings(page);
  await expect(page.locator('#settingsEngineRows')).toContainText('DuckDuckGo Lite (fastest)');
});
