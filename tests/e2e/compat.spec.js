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


// L6: parsed scripts run from a blob: URL (or data: when features.blobScripts is false) and page code that looks for
// itself by src still finds the original URL.
const SELF = `(function(){var cs=document.currentScript;
  window.__self={byQuery:!!document.querySelector('script[src*="banner.js"]'),byAll:document.querySelectorAll('script[src*="banner.js"]').length,
    cur:cs&&cs.src,attr:cs&&cs.getAttribute('src'),scan:[].slice.call(document.scripts).some(function(s){return (s.getAttribute('src')||'').indexOf('banner.js')>-1;})};})();`;

async function selfLookup(page, features) {
  await setup(page);
  await page.evaluate(async ([o, feats, self]) => {
    Object.assign(LB_features, feats);
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><script src="/banner.js" data-domain-script="x"></script></head><body><h1>hi</h1></body></html>' });
    __respond(o + '/banner.js', { headers: { 'content-type': 'application/javascript' }, body: self });
    LB_go(o + '/');
  }, [O, features, SELF]);
  await expect.poll(() => inFrame(page, () => !!window.__self), { timeout: 8000 }).toBe(true);
  return inFrame(page, () => ({ self: window.__self, raw: [...document.scripts].filter((s) => s.hasAttribute('data-original-src')).map((s) => s.outerHTML.slice(0, 200)) }));
}

test('L6: a script that looks for itself by src finds the original URL', async ({ page }) => {
  const r = await selfLookup(page, {});
  expect(r.self).toEqual({ byQuery: true, byAll: 1, cur: O + '/banner.js', attr: O + '/banner.js', scan: true });
});

test('L6: parsed scripts load from blob: URLs', async ({ page }) => {
  const on = await selfLookup(page, {});
  expect(on.raw.join('')).toMatch(/src="blob:/);
});

test('L6: features.blobScripts=false keeps data: scripts and the old lookup', async ({ page }) => {
  const off = await selfLookup(page, { blobScripts: false });
  expect(off.raw.join('')).toMatch(/src="data:/);
});

// L12: the image pre-warm result is handed to the frame's first request for that URL, whatever the cache decides.
test('L12: an image that cannot be cached is downloaded once, not twice', async ({ page }) => {
  await setup(page);
  await page.evaluate(async (o) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title></head><body><img id="i" src="/nostore.png"></body></html>' });
    __respond(o + '/nostore.png', { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' }, body: 'not-really-a-png' });
    LB_go(o + '/');
  }, O);
  await page.evaluate(() => __waitMark('shown', 5000));
  await expect.poll(() => inFrame(page, () => !!document.getElementById('i').getAttribute('data-blob-src')), { timeout: 8000 }).toBe(true);
  expect(await page.evaluate(() => __count(/nostore\.png/))).toBe(1);
});

test('L12: the media limiter hands slots on without polling', async ({ page }) => {
  await page.addInitScript(() => { window.__t50 = 0; const st = window.setTimeout; window.setTimeout = function (f, ms, ...a) { if (ms === 50) window.__t50++; return st.call(this, f, ms, ...a); }; });
  await setup(page);
  const n = 40;
  await page.evaluate(async ([o, n]) => {
    let html = '<html><head><title>t</title></head><body>';
    for (let i = 0; i < n; i++) { html += '<img id="i' + i + '" src="/p' + i + '.png">'; __respond(o + '/p' + i + '.png', { headers: { 'content-type': 'image/png' }, body: 'x' + i, delay: 100 }); }
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: html + '</body></html>' });
    LB_features.lazyImg = false;
    LB_go(o + '/');
  }, [O, n]);
  await page.evaluate(() => __waitMark('shown', 8000));
  // every image gets its blob; the old 50 ms poll made the tail wait on timer ticks
  await expect.poll(() => inFrame(page, () => document.querySelectorAll('img[data-blob-src]').length), { timeout: 8000 }).toBe(n);
  expect(await inFrame(page, () => window.__t50)).toBe(0);
});
