const { test, expect } = require('@playwright/test');
const { setup } = require('./s3-helpers');

// S3 4.1: tab sleeping.
const O = 'https://sl.test';
const FORM = (t) => `<html><head><title>${t}</title></head><body style="margin:0"><h1>${t}</h1><input id="i" value=""><div style="height:4000px"></div></body></html>`;
const MIN = 60000;

async function loadPage(page, url) {
  await page.evaluate((u) => { window.LB_go(u); }, url);
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.load != null; }, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
const frameJs = async (page, js) => (await (await page.locator('#frame').elementHandle()).contentFrame()).evaluate(js);

test('tab sleeping: an unused tab sleeps after the set time and wakes where it was; typed input blocks it', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(([o, a, b]) => { __respond(o + '/a', { headers: { 'content-type': 'text/html' }, body: a }); __respond(o + '/b', { headers: { 'content-type': 'text/html' }, body: b }); }, [O, FORM('A'), FORM('B')]);
  await loadPage(page, O + '/a');
  await frameJs(page, 'window.scrollTo(0, 700)');
  await page.locator('#newTab').click();
  await loadPage(page, O + '/b');
  const st1 = await page.evaluate(() => LB_sleep.state());
  expect(st1.find((t) => t.id === 1).blob).toBe(true);
  // not yet: 5 minutes
  expect(await page.evaluate((m) => LB_sleep.run(Date.now() + 5 * m, 10), MIN)).toBe(0);
  expect(await page.evaluate((m) => LB_sleep.run(Date.now() + 11 * m, 10), MIN)).toBe(1);
  const st2 = await page.evaluate(() => LB_sleep.state());
  expect(st2.find((t) => t.id === 1)).toMatchObject({ sleeping: true, blob: false });
  expect(await page.evaluate(() => LB_bf.map.has(1))).toBe(false);
  // wake
  await page.locator('.tab[data-tab-id="1"]').click();
  await expect.poll(() => frameJs(page, 'document.title')).toBe('A');
  await expect.poll(() => frameJs(page, 'Math.round(window.scrollY)')).toBe(700);
  expect((await page.evaluate(() => LB_sleep.state())).find((t) => t.id === 1).sleeping).toBe(false);
  expect(errors).toEqual([]);
});

test('tab sleeping: a tab with typed text does not sleep; the setting 0 and features.tabSleep=false never sleep', async ({ page }) => {
  await setup(page);
  await page.evaluate(([o, a, b]) => { __respond(o + '/a', { headers: { 'content-type': 'text/html' }, body: a }); __respond(o + '/b', { headers: { 'content-type': 'text/html' }, body: b }); }, [O, FORM('A'), FORM('B')]);
  await loadPage(page, O + '/a');
  await frameJs(page, "(() => { const i = document.getElementById('i'); i.value = 'typed'; })()");
  await page.locator('#newTab').click();
  await loadPage(page, O + '/b');
  expect((await page.evaluate(() => LB_sleep.state())).find((t) => t.id === 1).dirty).toBe(true);
  expect(await page.evaluate((m) => LB_sleep.run(Date.now() + 60 * m, 10), MIN)).toBe(0);
  expect(await page.evaluate((m) => LB_sleep.run(Date.now() + 60 * m, 0), MIN)).toBe(0);
});

test('tab sleeping: switch off in version.json', async ({ page }) => {
  await page.route('**/version.json', (r) => r.fulfill({ contentType: 'application/json', body: '{"version":"x","sha":"abc","features":{"tabSleep":false}}' }));
  await setup(page);
  await page.evaluate(([o, a, b]) => { __respond(o + '/a', { headers: { 'content-type': 'text/html' }, body: a }); __respond(o + '/b', { headers: { 'content-type': 'text/html' }, body: b }); }, [O, FORM('A'), FORM('B')]);
  await page.evaluate(() => window.LB_featuresReady);
  await loadPage(page, O + '/a');
  await page.locator('#newTab').click();
  await loadPage(page, O + '/b');
  expect(await page.evaluate((m) => LB_sleep.run(Date.now() + 60 * m, 10), MIN)).toBe(0);
});
