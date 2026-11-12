const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// Slice 1.0-compat (docs/1.0/LOADING-REVIEW.md L1, L6, L12). Same stubbed libcurl as pipeline.spec.js: the network is a
// stub with per-URL delays, so any request Playwright sees to the fake origin left the page directly (outside the relay).

const SETUP = `
  window.__net = { log: [], script: {} };
  window.__respond = (url, r) => { window.__net.script[url] = r; };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url, o) {
      window.__net.log.push({ url, t: performance.now() });
      const r = window.__net.script[url] || { status: 404, headers: {}, body: 'nope' };
      if (r.fail) throw new TypeError('network error');
      if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
      const bytes = new TextEncoder().encode(r.body);
      return { status: r.status || 200, headers: new Headers(r.headers || {}), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
  window.__count = (re) => window.__net.log.filter((x) => re.test(x.url)).length;
  window.__waitMark = (name, ms) => new Promise((res) => {
    const t0 = performance.now();
    const iv = setInterval(() => { const c = window.__lbPerf.cur; const m = c ? c.marks : {}; if (m[name] != null || performance.now() - t0 > ms) { clearInterval(iv); res({ ...m }); } }, 20);
  });
`;

const O = 'https://compat.test';
const HTML = { 'content-type': 'text/html' };
const JS = { 'content-type': 'application/javascript' };

async function setup(page) {
  const direct = [];
  page.on('request', (r) => { if (r.url().startsWith(O)) direct.push(r.url()); });
  const errors = await boot(page);
  await page.evaluate(SETUP);
  return { direct, errors };
}
const pageFrame = (page) => page.frames().find((f) => f.url().startsWith('blob:'));
async function inFrame(page, fn, arg) {
  for (let i = 0; i < 100; i++) { const f = pageFrame(page); if (f) return f.evaluate(fn, arg); await page.waitForTimeout(50); }
  throw new Error('no page frame');
}

test('L1: a script that misses the deadline is never loaded directly; it runs when it arrives', async ({ page }) => {
  const { direct } = await setup(page);
  await page.evaluate(async (o) => {
    LB_features.scriptTimeoutMs = 300;
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><script src="/slow.js"></script></head><body><h1>hi</h1></body></html>' });
    __respond(o + '/slow.js', { headers: { 'content-type': 'application/javascript' }, body: 'window.__slowRan = (window.__slowRan||0)+1;', delay: 1500 });
    LB_go(o + '/');
  }, O);
  const m = await page.evaluate(() => __waitMark('shown', 5000));
  expect(m.shown).toBeLessThan(1400);   // the page did not wait for the slow script
  await expect.poll(() => inFrame(page, () => window.__slowRan || 0), { timeout: 8000 }).toBe(1);
  expect(direct).toEqual([]);
});

test('L1: a script that fails is not loaded directly either', async ({ page }) => {
  const { direct } = await setup(page);
  await page.evaluate(async (o) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><script src="/gone.js"></script></head><body><h1>hi</h1></body></html>' });
    __respond(o + '/gone.js', { fail: true });
    LB_go(o + '/');
  }, O);
  await page.evaluate(() => __waitMark('shown', 5000));
  await page.waitForTimeout(1500);
  expect(direct).toEqual([]);
});

test('L1: features.noDirect=false keeps the old direct fallback', async ({ page }) => {
  const { direct } = await setup(page);
  await page.evaluate(async (o) => {
    LB_features.noDirect = false; LB_features.scriptTimeoutMs = 300;
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><script src="/slow.js"></script></head><body><h1>hi</h1></body></html>' });
    __respond(o + '/slow.js', { headers: { 'content-type': 'application/javascript' }, body: '1', delay: 1500 });
    LB_go(o + '/');
  }, O);
  await page.evaluate(() => __waitMark('shown', 5000));
  await expect.poll(() => direct.length, { timeout: 5000 }).toBeGreaterThan(0);
});

test('L1: a script that fails at runtime (dynamic) is not loaded directly', async ({ page }) => {
  const { direct } = await setup(page);
  await page.evaluate(async (o) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title></head><body><script>var s=document.createElement("script");s.src="/dyn-gone.js";s.onerror=function(){window.__dynErr=1};document.body.appendChild(s);</script></body></html>' });
    __respond(o + '/dyn-gone.js', { fail: true });
    LB_go(o + '/');
  }, O);
  await page.evaluate(() => __waitMark('shown', 5000));
  await expect.poll(() => inFrame(page, () => window.__dynErr || 0), { timeout: 8000 }).toBe(1);
  expect(direct).toEqual([]);
});

