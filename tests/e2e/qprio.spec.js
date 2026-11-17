const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// 1.2 2c (features.qPrio, SPEED-AUDIT 2c): while page-critical requests are being queued, images may not take the last slots, so a
// script or stylesheet starts at once instead of waiting behind a full set of images; images near the top go before other images.
const SETUP = `
  window.__net = { log: [], script: {} };
  window.__respond = (url, r) => { window.__net.script[url] = r; };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url, o) {
      window.__net.log.push(url);
      const r = window.__net.script[url] || { status: 200, headers: {}, body: 'x' };
      if (r.hang) return new Promise(() => {});
      if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
      const bytes = new TextEncoder().encode(r.body || 'x');
      return { status: 200, headers: new Headers({ 'content-type': r.type || 'text/plain' }), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
`;
const O = 'https://q.test';
async function setup(page, off) {
  await boot(page, { init: () => { try { localStorage.setItem('limitless:inst:v1', 'gi_t'); localStorage.setItem('gi_t:limitless:idlethreads:v1', '8'); localStorage.setItem('gi_t:limitless:activethreads:v1', '8'); } catch (_) {} } });
  await page.evaluate(SETUP);
  if (off) await page.evaluate(() => { LB_features.qPrio = false; });
}

test('a script is not stuck behind a full set of images', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async (o) => {
    __respond(o + '/first.js', { type: 'application/javascript' });
    await LB_queueFetch(o + '/first.js', {}, 2);   // page-critical traffic is flowing
    for (let i = 0; i < 12; i++) { __respond(o + '/i' + i + '.png', { hang: true }); LB_queueFetch(o + '/i' + i + '.png', {}, 4).catch(() => {}); }
    await new Promise((res) => setTimeout(res, 100));
    const imgs = LB_queueState().fetching;
    __respond(o + '/late.js', { type: 'application/javascript' });
    LB_queueFetch(o + '/late.js', {}, 2).catch(() => {});
    await new Promise((res) => setTimeout(res, 200));
    return { imgs, late: __net.log.includes(o + '/late.js') };
  }, O);
  expect(r.imgs).toBe(6);   // 8 slots, 2 held back
  expect(r.late).toBe(true);
});

test('features.qPrio=false lets images take every slot', async ({ page }) => {
  await setup(page, true);
  const r = await page.evaluate(async (o) => {
    __respond(o + '/first.js', { type: 'application/javascript' });
    await LB_queueFetch(o + '/first.js', {}, 2);
    for (let i = 0; i < 12; i++) { __respond(o + '/i' + i + '.png', { hang: true }); LB_queueFetch(o + '/i' + i + '.png', {}, 4).catch(() => {}); }
    await new Promise((res) => setTimeout(res, 100));
    return LB_queueState().fetching;
  }, O);
  expect(r).toBe(8);
});

test('an image marked near the top goes before the other queued images', async ({ page }) => {
  await setup(page);
  const order = await page.evaluate(async (o) => {
    for (let i = 0; i < 8; i++) { __respond(o + '/f' + i + '.png', { delay: 150 }); LB_queueFetch(o + '/f' + i + '.png', {}, 4).catch(() => {}); }
    __respond(o + '/a.png', { delay: 10 }); __respond(o + '/b.png', { delay: 10 });
    LB_queueFetch(o + '/a.png', {}, 4).catch(() => {});
    LB_queueFetch(o + '/b.png', { __vp: true }, 4).catch(() => {});
    await new Promise((res) => setTimeout(res, 900));
    return __net.log.filter((u) => /\/(a|b)\.png/.test(u)).map((u) => u.slice(-5));
  }, O);
  expect(order).toEqual(['b.png', 'a.png']);
});
