const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// features.swDoc (docs/1.2/SWCURL-DESIGN.md 3): the frame document is served by sw.js from /~lb/doc/<appKey>.<docId>; requests of that frame to
// other origins come back to the app page and go through the proxy path (stubbed libcurl here, as in compat.spec.js).
// Network proof: context.route sees every request that reaches the network, from the page or from the worker, so a request that was
// bounced through the proxy never shows up there.

const O = 'https://lane.test';
const SETUP = `
  window.__net = { log: [], script: {} };
  window.__respond = (url, r) => { window.__net.script[url] = r; };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url, o) {
      window.__net.log.push({ url, h: o && o.headers });
      const r = window.__net.script[url] || { status: 404, headers: {}, body: 'nope' };
      const bytes = new TextEncoder().encode(r.body);
      return { status: r.status || 200, headers: new Headers(r.headers || {}), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
  window.__count = (re) => window.__net.log.filter((x) => re.test(x.url)).length;
`;
const PAGE = `<html><head><title>lane</title>
<style>#b{width:4px;height:4px;background:url(${O}/bg.png)}</style></head>
<body><div id="b"></div><h1 id="h">hello</h1>
<script type="module">import('${O}/mod.js').then((m) => { window.__mod = m.default; }).catch((e) => { window.__modErr = String(e); });</script>
</body></html>`;

async function setup(page, context, features) {
  const direct = [];
  await context.route(O + '/**', (route) => { direct.push(route.request().url()); route.fulfill({ status: 418, body: 'direct' }); });
  const errors = await boot(page, { features: { ownRelay: true, ownSockets: 4, ...features } });
  await page.evaluate(() => window.LB_featuresReady);
  await page.evaluate(SETUP);
  return { direct, errors };
}
async function load(page, html) {
  await page.evaluate(([o, html]) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: html });
    __respond(o + '/mod.js', { headers: { 'content-type': 'application/javascript' }, body: 'export default 42;' });
    __respond(o + '/bg.png', { headers: { 'content-type': 'image/png' }, body: 'x' });
    LB_go(o + '/');
  }, [O, html]);
  await expect.poll(() => page.evaluate(() => (window.__lbPerf.cur ? window.__lbPerf.cur.marks.shown : 0) || 0), { timeout: 20000 }).toBeGreaterThan(0);
}
const pageFrame = (page) => page.frames().find((f) => /^blob:|\/~lb\/doc\//.test(f.url()));

test('off by default: the frame is a blob: document and no lane starts', async ({ page, context }) => {
  const { direct } = await setup(page, context, {});
  expect(await page.evaluate(() => window.LB_features.swDoc)).toBe(false);
  await load(page, PAGE);
  expect(pageFrame(page).url()).toMatch(/^blob:/);
  expect(await page.evaluate(() => window.LB_swDoc.state)).not.toBe('ready');
  // the control: an inline <style> url() of another origin is fetched by the browser itself today (the leak the lane closes)
  await expect.poll(() => direct, { timeout: 15000 }).toContain(O + '/bg.png');
});

test('on: the frame is served from /~lb/doc/ and import() and inline CSS url() reach the proxy, nothing direct', async ({ page, context }) => {
  const { direct, errors } = await setup(page, context, { swDoc: true });
  await expect.poll(() => page.evaluate(() => window.LB_swDoc.state), { timeout: 15000 }).toBe('ready');
  await load(page, PAGE);
  const f = pageFrame(page);
  expect(f.url()).toMatch(/\/~lb\/doc\/[a-z0-9]+\.[a-z0-9]+$/);
  await expect.poll(() => f.evaluate(() => window.__mod), { timeout: 15000 }).toBe(42);
  await expect.poll(() => page.evaluate(() => window.__count(/\/bg\.png/)), { timeout: 15000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__count(/\/mod\.js/))).toBeGreaterThan(0);
  expect(direct).toEqual([]);
  expect(await page.evaluate(() => window.LB_swDoc.stats.bounced)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('on: the document is not served to a top-level navigation, and a missing one is a 404', async ({ page, context }) => {
  await setup(page, context, { swDoc: true });
  await expect.poll(() => page.evaluate(() => window.LB_swDoc.state), { timeout: 15000 }).toBe('ready');
  await load(page, PAGE);
  const url = pageFrame(page).url();
  const res = await page.request.get(url);
  expect(res.status()).toBe(404);   // fetch() from a page is not an iframe navigation: the worker leaves it to the server, which has no such file
  const tab = await context.newPage();
  const nav = await tab.goto(url);
  expect(nav.status()).toBe(404);
  expect(await tab.content()).not.toContain('hello');
});

test('on: a worker without the lane (older release) is detected and blob: documents are used', async ({ page, context }) => {
  await context.route('**/sw.js', (r) => r.fulfill({ contentType: 'application/javascript', body: "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',(e)=>e.waitUntil(self.clients.claim()));" }));
  await setup(page, context, { swDoc: true });
  await expect.poll(() => page.evaluate(() => window.LB_swDoc.state), { timeout: 15000 }).toBe('off');
  await load(page, PAGE);
  expect(pageFrame(page).url()).toMatch(/^blob:/);
});

test('on: features.sw = false keeps the lane off (blob: documents)', async ({ page, context }) => {
  await setup(page, context, { swDoc: true, sw: false });
  expect(await page.evaluate(() => window.LB_swDoc.start())).toBe(false);
  await load(page, PAGE);
  expect(pageFrame(page).url()).toMatch(/^blob:/);
});
