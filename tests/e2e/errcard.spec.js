const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// 1.2 M (features.errCard, features.scriptDedup; docs/1.1/audit/SITES-MEDIA.md 3.1, 3.8, 3.9): an empty 4xx/5xx page ends in a card, not
// a blank tab at "Ready", and the same script URL is not fetched again during one page load. No solving, no evasion: a plain card.
const SETUP = `
  window.__net = { log: [], script: {} };
  window.__respond = (url, r) => { window.__net.script[url] = r; };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url, o) {
      window.__net.log.push(url);
      const r = window.__net.script[url] || { status: 404, headers: {}, body: '' };
      const bytes = new TextEncoder().encode(r.body || '');
      return { status: r.status || 200, headers: new Headers(r.headers || {}), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
`;
const O = 'https://ec.test';
const HTML = { 'content-type': 'text/html' };

test('an empty 403 shows the refused card; a 404 with text, or a script shell, still renders', async ({ page }) => {
  await boot(page);
  await page.evaluate(SETUP);
  await page.evaluate(([o, H]) => {
    __respond(o + '/empty', { status: 403, headers: H, body: '' });
    __respond(o + '/notfound', { status: 404, headers: H, body: '<html><head><title>Missing</title></head><body><h1>Page not found</h1><p>Try the home page instead.</p></body></html>' });
    __respond(o + '/shell', { status: 404, headers: H, body: '<html><head><script src="/app.js"></script></head><body><div id="root"></div></body></html>' });
    LB_go(o + '/empty');
  }, [O, HTML]);
  const f = page.frameLocator('#frame');
  await expect(f.locator('h1')).toHaveText('This site sent back an empty page', { timeout: 6000 });
  await expect(f.locator('dd', { hasText: 'http-403' })).toHaveCount(1);
  await page.evaluate((o) => LB_go(o + '/notfound'), O);
  await expect(f.locator('h1')).toHaveText('Page not found', { timeout: 6000 });
  await page.evaluate((o) => LB_go(o + '/shell'), O);
  await expect(f.locator('#root')).toHaveCount(1, { timeout: 6000 });
});

test('features.errCard=false leaves the blank page as before', async ({ page }) => {
  await boot(page);
  await page.evaluate(SETUP);
  await page.evaluate((o) => { LB_features.errCard = false; __respond(o + '/empty', { status: 403, headers: { 'content-type': 'text/html' }, body: '' }); LB_go(o + '/empty'); }, O);
  await page.waitForTimeout(2500);
  await expect(page.frameLocator('#frame').locator('h1')).toHaveCount(0);
});

test('the same script URL is fetched once per page load; a new load fetches it again; off fetches every time', async ({ page }) => {
  await boot(page);
  await page.evaluate(SETUP);
  const r = await page.evaluate(async (o) => {
    __respond(o + '/s.js', { headers: { 'content-type': 'application/javascript', 'cache-control': 'no-store' }, body: 'var a = 1;' });
    const count = () => __net.log.filter((u) => u === o + '/s.js').length;
    const a = await LB_queueFetch(o + '/s.js', {}, 2), b = await LB_queueFetch(o + '/s.js', {}, 2);
    const same = new Uint8Array(b.buf).length === new Uint8Array(a.buf).length && b !== a;
    const once = count();
    __lbPerf.start(o + '/next');   // a new navigation
    await LB_queueFetch(o + '/s.js', {}, 2);
    const next = count();
    LB_features.scriptDedup = false;
    await LB_queueFetch(o + '/s.js', {}, 2); await LB_queueFetch(o + '/s.js', {}, 2);
    return { once, next, off: count(), same };
  }, O);
  expect(r).toEqual({ once: 1, next: 2, off: 4, same: true });
});
