const { test, expect } = require('@playwright/test');
const { setup } = require('./s3-helpers');

// CL-11 (features.cssImgLate): CSS background images are fetched by the frame after the page is shown, so a slow image
// (Discord names about 265) no longer holds the first paint. Off: the page waits for them, as before.
const O = 'https://late.test';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function run(page, on) {
  await setup(page);
  await page.evaluate(([o, png, on]) => {
    window.LB_features.cssImgLate = on; window.LB_features.instantBack = false;
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><link rel="stylesheet" href="/s.css"></head><body><p>x</p></body></html>' });
    __respond(o + '/s.css', { headers: { 'content-type': 'text/css' }, body: '@font-face{font-family:F;src:url(/f.woff2)} .a{background:url(img/p.png)} .b{background:url(img/p.png)}' });
    __respond(o + '/f.woff2', { headers: { 'content-type': 'font/woff2' }, body: 'W' });
    __respond(o + '/img/p.png', { headers: { 'content-type': 'image/png' }, body: atob(png), delay: 2500 });
  }, [O, PNG, on]);
  const t0 = Date.now();
  await page.evaluate((u) => { window.LB_go(u); }, O + '/');
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.shown != null; }, null, { timeout: 15000 });
  return Date.now() - t0;
}
const styles = async (page) => (await (await page.locator('#frame').elementHandle()).contentFrame()).evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n'));

test('cssImgLate on: shown before a slow CSS image arrives, then the frame swaps in one blob', async ({ page }) => {
  const ms = await run(page, true);
  expect(ms).toBeLessThan(2000);
  await page.waitForFunction(() => { const f = document.getElementById('frame').contentDocument; return [...f.querySelectorAll('style')].every((s) => !s.textContent.includes('lbci=')); }, null, { timeout: 15000 });
  const out = await styles(page);
  const imgs = [...out.matchAll(/\.[ab]\{background:url\("?(blob:[^")]+)"?\)\}/g)].map((m) => m[1]);
  expect(imgs.length).toBe(2);
  expect(new Set(imgs).size).toBe(1);
  expect(out).toMatch(/font-family:F;src:url\("blob:/);   // fonts are still ready before the page is shown
});

test('cssImgLate off: the page waits for the CSS image', async ({ page }) => {
  const ms = await run(page, false);
  expect(ms).toBeGreaterThanOrEqual(2400);
  const out = await styles(page);
  expect(out).not.toContain('lbci=');
  expect(out).toMatch(/\.a\{background:url\("blob:/);
});
