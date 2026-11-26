const { test, expect } = require('@playwright/test');
const { setup } = require('./s3-helpers');

// CL-6 step A (features.blobReuse): two tabs with the same script share one blob: URL; it is revoked when no page uses it.
const O = 'https://br.test';
const PAGE = (t) => `<html><head><title>${t}</title><script src="/same.js"></script></head><body><h1>${t}</h1></body></html>`;
const PLAIN = '<html><head><title>p</title></head><body>p</body></html>';

async function loadPage(page, url) {
  await page.evaluate((u) => { window.LB_go(u); }, url);
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.load != null; }, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
const scriptSrc = async (page) => (await (await page.locator('#frame').elementHandle()).contentFrame()).evaluate(() => (/ src="([^"]+)"/.exec(document.querySelector('script[data-original-src]').outerHTML) || [])[1]);

async function run(page, on) {
  await setup(page);
  await page.evaluate(([o, on, a, b, p]) => {
    Object.assign(LB_features, { blobReuse: on, instantBack: false });
    __respond(o + '/a', { headers: { 'content-type': 'text/html' }, body: a });
    __respond(o + '/b', { headers: { 'content-type': 'text/html' }, body: b });
    __respond(o + '/p', { headers: { 'content-type': 'text/html' }, body: p });
    __respond(o + '/same.js', { headers: { 'content-type': 'application/javascript' }, body: 'window.__same = 1;' });
  }, [O, on, PAGE('A'), PAGE('B'), PLAIN]);
  await loadPage(page, O + '/a');
  const s1 = await scriptSrc(page);
  await page.locator('#newTab').click();
  await loadPage(page, O + '/b');
  const s2 = await scriptSrc(page);
  const live = await page.evaluate(() => [...LB_sb.map.values()].map((e) => e.refs));
  await loadPage(page, O + '/p');
  await page.locator('.tab[data-tab-id="1"]').click();
  await loadPage(page, O + '/p');
  await page.waitForTimeout(2600);
  const after = await page.evaluate(() => LB_sb.map.size);
  return { s1, s2, live, after };
}

test('blobReuse: two tabs share one script blob URL; navigating both away revokes it', async ({ page }) => {
  const r = await run(page, true);
  expect(r.s1).toMatch(/^blob:/);
  expect(r.s2).toBe(r.s1);
  expect(r.live).toEqual([2]);
  expect(r.after).toBe(0);
});

test('blobReuse off: per-page blobs as before', async ({ page }) => {
  const r = await run(page, false);
  expect(r.s1).toMatch(/^blob:/);
  expect(r.s2).not.toBe(r.s1);
  expect(r.live).toEqual([]);
});
