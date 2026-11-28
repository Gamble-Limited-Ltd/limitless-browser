const fs = require('fs');
const vm = require('vm');
const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { setup } = require('./s3-helpers');

// TL-7: proxied code never reaches the real navigator.serviceWorker through a child window; the boot sweep removes foreign workers;
// sw.js answers 404 to /~lb/ requests made by a worker.
const O = 'https://sg.test';
const pageFrame = (page) => page.frames().find((f) => f.url().startsWith('blob:'));
async function inFrame(page, fn, arg) {
  for (let i = 0; i < 100; i++) { const f = pageFrame(page); if (f) return f.evaluate(fn, arg); await page.waitForTimeout(50); }
  throw new Error('no page frame');
}

test('child windows of a proxied page get the fake serviceWorker container', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate((o) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title></head><body><h1>hi</h1></body></html>' });
    LB_go(o + '/');
  }, O);
  await page.evaluate(() => __waitMark('shown', 8000));
  const r = await inFrame(page, async () => {
    const fake = navigator.serviceWorker;
    const out = {};
    const probe = (w) => { const c = w.navigator.serviceWorker; return c === fake; };
    const a = document.createElement('iframe'); document.body.appendChild(a);
    out.blank = probe(a.contentWindow);
    const s = document.createElement('iframe'); s.srcdoc = '<p>x</p>'; document.body.appendChild(s);
    out.srcdoc = probe(s.contentWindow);
    await new Promise((ok) => s.addEventListener('load', ok, { once: true }));
    out.srcdocLoaded = probe(s.contentWindow);
    const outer = document.createElement('iframe'); document.body.appendChild(outer);
    const inner = outer.contentWindow.document.createElement('iframe');
    outer.contentWindow.document.body.appendChild(inner);
    out.nested = probe(inner.contentWindow);
    const w = window.open('');
    out.open = w === null || !w.navigator || probe(w);   // the runtime returns a handle, not a window, but a real one must be guarded
    out.registerBlocked = true;
    for (const f of [a, s, outer, inner]) {
      try { const reg = await f.contentWindow.navigator.serviceWorker.register('/~lb/js/x.js'); if (reg && reg.scope === undefined) out.registerBlocked = false; } catch (_) {}
    }
    return out;
  });
  expect(r).toMatchObject({ blank: true, srcdoc: true, srcdocLoaded: true, nested: true, open: true });
  const real = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((x) => (x.active || x.waiting || x.installing || {}).scriptURL || ''));
  expect(real.filter((u) => u.includes('x.js'))).toEqual([]);
  expect(await page.evaluate(() => LB_swGuard.stats().patchedFrames)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('boot sweep removes a foreign registration and counts it', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => navigator.serviceWorker.register('/tests/e2e/fixtures/foreign-sw.js', { scope: '/tests/e2e/fixtures/' }));
  const scripts = () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((x) => (x.active || x.waiting || x.installing || {}).scriptURL || ''));
  await expect.poll(scripts).toEqual([expect.stringMatching(/foreign-sw\.js$/)]);
  await page.reload();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  await expect.poll(scripts, { timeout: 15000 }).toEqual([]);
  expect(await page.evaluate(() => LB_swGuard.stats().removed)).toBe(1);
});

test('sw.js answers 404 to a /~lb/ request from a worker, and leaves other requests alone', async () => {
  let handler;
  const caches = { open: async () => ({ match: async () => new Response('c') }) };
  const self = { location: { origin: 'https://x.test' }, addEventListener: (t, f) => { if (t === 'fetch') handler = f; }, skipWaiting() {}, clients: {} };
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), { self, URL, Response, caches, fetch: () => {} });
  const run = (path, destination) => {
    let res = 'pass';
    handler({ clientId: '', request: { url: 'https://x.test' + path, destination, method: 'GET', mode: 'same-origin', headers: new Headers() }, respondWith: (p) => { res = p; } });
    return Promise.resolve(res);
  };
  for (const d of ['serviceworker', 'sharedworker', 'worker']) expect((await run('/~lb/js/x.js', d)).status).toBe(404);
  expect(await run('/~lb/js/x.js', 'script')).toBe('pass');
  expect(await run('/vendor/a.js', 'worker')).not.toHaveProperty('status', 404);
});
