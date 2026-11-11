const { test, expect } = require('@playwright/test');
const { setup } = require('./s3-helpers');

// S3 step 2: client-side causes of real-site failures, reproduced with small pages (tests/stack/real-sites.json lists the sites).
const O = 'https://fx.test';

async function open(page, url) {
  await page.evaluate((u) => { window.LB_go(u); }, url);
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.load != null; }, null, { timeout: 15000 });
  await page.waitForTimeout(400);
}
const frameJs = async (page, js) => (await (await page.locator('#frame').elementHandle()).contentFrame()).evaluate(js);

// login.microsoftonline.com: the page posts to itself with window.origin as targetOrigin. The proxied frame has an opaque
// origin ("null"), so the browser threw "Invalid target origin 'null'" and the sign-in page never built.
test('postMessage with the page origin as targetOrigin works inside the proxied frame', async ({ page }) => {
  const errors = await setup(page);
  const body = `<html><head><title>pm</title></head><body><script>
    window.__got = [];
    window.addEventListener('message', function (e) { window.__got.push(e.data); });
    try { window.postMessage('self-origin', window.origin); } catch (e) { window.__err1 = String(e); }
    try { window.postMessage('location-origin', location.origin); } catch (e) { window.__err2 = String(e); }
    try { window.postMessage({ k: 1 }, { targetOrigin: 'https://other.example' }); } catch (e) { window.__err3 = String(e); }
    try { window.postMessage('null-origin', 'null'); } catch (e) { window.__err4 = String(e); }
  </script></body></html>`;
  await page.evaluate(([o, b]) => { __respond(o + '/pm', { headers: { 'content-type': 'text/html' }, body: b }); }, [O, body]);
  await open(page, O + '/pm');
  const r = await frameJs(page, '({ got: window.__got, e1: window.__err1 || null, e2: window.__err2 || null, e3: window.__err3 || null, e4: window.__err4 || null })');
  expect(r.e1).toBeNull();
  expect(r.e2).toBeNull();
  expect(r.e3).toBeNull();
  expect(r.e4).toBeNull();
  await expect.poll(() => frameJs(page, 'window.__got.filter((m) => m === "self-origin" || m === "location-origin" || (m && m.k === 1) || m === "null-origin").length')).toBe(4);
  expect(errors).toEqual([]);
});
