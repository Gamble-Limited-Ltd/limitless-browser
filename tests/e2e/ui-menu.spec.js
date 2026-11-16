// S6 toolbar and the Limitless menu (docs/1.0/UI.md 2).
const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { me, bootMember } = require('./helpers-ui');

test('the toolbar shows only back, forward, reload, the address bar, extensions and the menu button', async ({ page }) => {
  await boot(page);
  const vis = await page.evaluate(() => [...document.querySelectorAll('.navbar button')].filter((b) => b.offsetParent !== null).map((b) => b.id));
  expect(vis.sort()).toEqual(['back', 'bookmarkBtn', 'blockToggle', 'extPuzzleBtn', 'fwd', 'lbMenuBtn', 'reload'].sort());
  expect(await page.locator('.omnibox #blockToggle').count()).toBe(1);
  expect(await page.locator('.omnibox #bookmarkBtn').count()).toBe(1);
});

test('the menu header shows the name, then the number, tier and standing', async ({ page }) => {
  await bootMember(page, me({ tier: 'cardinal' }, { tier: 'cardinal' }));
  await page.locator('#lbMenuBtn').click();
  await expect(page.locator('#lbMenu .lb-mh-name')).toHaveText('Alex Morgan');
  await expect(page.locator('#lbMenu .lb-mh-sub')).toHaveText('No. 0047 · Cardinal · Good standing');
});

test('keyboard: arrows move, Escape closes and returns focus, items run the old controls', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('#lbMenuBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#lbMenu')).toBeVisible();
  await expect(page.locator('#lbMenu .lb-mi').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#lbMenu .lb-mi[data-id="home"]')).toBeFocused();
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  await expect(page.locator('#lbMenu .lb-mi[data-id="dev"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#lbMenu')).toBeHidden();
  await expect(page.locator('#lbMenuBtn')).toBeFocused();
  await page.locator('#lbMenuBtn').click();
  await page.locator('#lbMenu .lb-mi[data-id="settings"]').click();
  await expect(page.locator('#settingsPage')).toBeVisible();
  expect(errors).toEqual([]);
});

test('developer mode shows the logs, inspector and metrics buttons and is remembered', async ({ page }) => {
  await boot(page);
  for (const id of ['devToggle', 'codeBtn', 'metricsBtn']) await expect(page.locator('#' + id)).toBeHidden();
  await page.locator('#lbMenuBtn').click();
  await page.locator('#lbMenu .lb-mi[data-id="dev"]').click();
  for (const id of ['devToggle', 'codeBtn', 'metricsBtn']) await expect(page.locator('#' + id)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('limitless:devmode:v1'))).toBe('1');
  await page.reload();
  await expect(page.locator('#devToggle')).toBeVisible({ timeout: 30000 });
});

test('under an upstream skin the old toolbar returns and the menu button is hidden', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => document.documentElement.setAttribute('data-skin', 'chrome'));
  await expect(page.locator('#lbMenuBtn')).toBeHidden();
  await expect(page.locator('#blockToggle')).not.toHaveJSProperty('parentElement.className', 'omnibox-actions');
});

test('every icon-only toolbar button has an accessible name', async ({ page }) => {
  await boot(page);
  const bad = await page.evaluate(() => [...document.querySelectorAll('.navbar button, .titlebar button')].filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim() || b.title)).map((b) => b.id || b.className));
  expect(bad).toEqual([]);
});

test('Report a problem posts the gate contract (/_lb/report, category id, site only when ticked) and says when it fails', async ({ page }) => {
  const bodies = [];
  let status = 200;
  await page.route('**/_lb/report', (route) => { bodies.push(route.request().postDataJSON()); return route.fulfill({ status, contentType: 'application/json', body: '{"ok":true}' }); });
  await boot(page);
  await page.evaluate(() => window.LBReport.open('Broken site', 'news.example.org'));
  await expect(page.locator('#lbRepCat')).toHaveValue('broken');
  await page.locator('#lbRepSend').click();
  await expect(page.locator('#lbRepMsg')).toHaveText('Write a few words about what happened first.');
  expect(bodies).toEqual([]);
  await page.locator('#lbRepNote').fill('Images missing');
  await page.locator('#lbRepHost').check();
  await page.locator('#lbRepSend').click();
  await expect(page.locator('#lbRepMsg')).toHaveText('Thank you. Your report was sent.');
  expect(bodies).toEqual([{ category: 'broken', note: 'Images missing', includeSite: true, site: 'https://news.example.org/' }]);
  await page.keyboard.press('Escape');
  status = 503;
  await page.locator('#lbMenuBtn').click();
  await page.locator('#lbMenu .lb-mi[data-id="report"]').click();
  await page.locator('#lbRepCat').selectOption('slow');
  await page.locator('#lbRepNote').fill('It crawls');
  await page.locator('#lbRepSend').click();
  await expect(page.locator('#lbRepMsg')).toHaveText('Reports are not available right now. Please try again later.');
  expect(bodies[1]).toEqual({ category: 'slow', note: 'It crawls' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#lbReportDlg')).toHaveCount(0);
});
