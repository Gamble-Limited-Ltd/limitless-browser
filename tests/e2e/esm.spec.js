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

// ES modules run from blob: URLs over http(s): a big data: URL as <script type=module src> blocked the parser for 24-26 s on Steam.
test('module graph: entry and relative dependency run from blob: URLs via the import map, nothing loads directly', async ({ page }) => {
  const { direct, errors } = await setup(page);
  const big = '/*' + 'x'.repeat(300000) + '*/';
  await page.evaluate(([o, big]) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>m</title><script type="module" src="/app/main.js"></script></head><body><p id="x">x</p></body></html>' });
    __respond(o + '/app/main.js', { headers: { 'content-type': 'application/javascript' }, body: big + 'import { v } from "./dep.js"; window.__ran = v + ":" + import.meta.url;' });
    __respond(o + '/app/dep.js', { headers: { 'content-type': 'application/javascript' }, body: 'export const v = "dep";' });
  }, [O, big]);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/');
  await page.evaluate(() => __waitMark('shown', 15000));
  let r = null;
  for (let i = 0; i < 40 && !(r && r.ran); i++) { r = await inFrame(page, () => ({ ran: window.__ran, src: document.querySelector('script[type=module]').getAttribute('src') || document.querySelector('script[type=module]').getAttribute('data-original-src'), map: (document.querySelector('script[type=importmap]') || {}).textContent || '' })); await page.waitForTimeout(100); }
  expect(r.ran).toBe('dep:' + O + '/app/main.js');
  const srcAttr = await inFrame(page, () => document.querySelector('script[type=module]').attributes.src.value);
  expect(srcAttr).toMatch(/^blob:/);
  expect(r.map).toContain('blob:');
  expect(r.map).not.toContain('data:text/javascript');
  expect(direct).toEqual([]);
  expect(errors).toEqual([]);
});
