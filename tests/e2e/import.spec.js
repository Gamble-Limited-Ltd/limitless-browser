const { test, expect } = require('@playwright/test');
const { boot, LEGACY_FEATURES } = require('./helpers');

// 1.2 D2 (features.importHelper, SPEED-AUDIT D2): import(x) in a proxied script becomes __lbImport(x, scriptUrl), which loads the module
// through the proxy as a blob: URL. A failure rejects; it never falls back to the real URL. Stubbed libcurl as in esm.spec.js.
const SETUP = `
  window.__net = { log: [], script: {} };
  window.__respond = (url, r) => { window.__net.script[url] = r; };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url, o) {
      window.__net.log.push({ url });
      const r = window.__net.script[url] || { status: 404, headers: {}, body: 'nope' };
      const bytes = new TextEncoder().encode(r.body);
      return { status: r.status || 200, headers: new Headers(r.headers || {}), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
  window.__waitMark = (name, ms) => new Promise((res) => {
    const t0 = performance.now();
    const iv = setInterval(() => { const c = window.__lbPerf.cur; const m = c ? c.marks : {}; if (m[name] != null || performance.now() - t0 > ms) { clearInterval(iv); res({ ...m }); } }, 20);
  });
`;
const O = 'https://compat.test';
const HTML = { 'content-type': 'text/html' };
const JS = { 'content-type': 'application/javascript' };
const pageFrame = (page) => page.frames().find((f) => f.url().startsWith('blob:'));
async function inFrame(page, fn, arg) {
  for (let i = 0; i < 100; i++) { const f = pageFrame(page); if (f) return f.evaluate(fn, arg); await page.waitForTimeout(50); }
  throw new Error('no page frame');
}
async function load(page, features) {
  const direct = [];
  page.on('request', (r) => { if (r.url().startsWith(O)) direct.push(r.url()); });
  const errors = await boot(page, { features });
  await page.evaluate(SETUP);
  await page.evaluate(([o, H, J]) => {
    __respond(o + '/', { headers: H, body: '<html><head><title>d2</title><script src="/app.js"></script></head><body><p>x</p></body></html>' });
    __respond(o + '/app.js', { headers: J, body: 'window.__done = []; import("/chunks/a.js").then(function (m) { window.__a = m.v + ":" + m.w; }); import("/chunks/missing.js").catch(function (e) { window.__miss = String(e); });' });
    __respond(o + '/chunks/a.js', { headers: J, body: 'import { d } from "./dep.js"; export const v = d + "!"; export const w = import.meta.url; export const l = import("./late.js");' });
    __respond(o + '/chunks/dep.js', { headers: J, body: 'export const d = "dep";' });
    __respond(o + '/chunks/late.js', { headers: J, body: 'export const z = 1;' });
  }, [O, HTML, JS]);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/');
  await page.evaluate(() => __waitMark('shown', 15000));
  return { direct, errors };
}

test('import() of a lazy chunk runs through the proxy; a missing chunk rejects; nothing loads directly', async ({ page }) => {
  const { direct, errors } = await load(page, { ...LEGACY_FEATURES });
  let r = null;
  for (let i = 0; i < 60 && !(r && r.a && r.miss); i++) { r = await inFrame(page, () => ({ a: window.__a, miss: window.__miss })); if (!(r.a && r.miss)) await page.waitForTimeout(100); }
  expect(r.a).toBe('dep!:' + O + '/chunks/a.js');
  expect(r.miss).toContain('Failed to fetch dynamically imported module');
  expect(direct).toEqual([]);
  expect(await page.evaluate(() => window.__net.log.map((x) => x.url).filter((u) => /chunks\/(a|dep|missing)\.js/.test(u)).length)).toBe(3);
  expect(errors).toEqual([]);
});

test('features.importHelper=false leaves import() alone', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { LB_features.importHelper = false; });
  const r = await page.evaluate(() => ({ off: LB_features.importHelper, sync: LB_rewrite.sync('import("/a.js")', false) }));
  expect(r.off).toBe(false);
  expect(r.sync).toBe('import("/a.js")');
  expect(await page.evaluate(() => LB_rewrite.sync('import("/a.js")', true))).toContain('__lbImport("/a.js","__LB_IMU__")');
});
