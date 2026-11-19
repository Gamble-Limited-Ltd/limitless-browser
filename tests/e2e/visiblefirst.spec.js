const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// 1.2 G1 (features.visibleFirst, default off): images in the viewport are fetched before below-the-fold ones, even when the page
// lists the below-the-fold ones first. The fixture positions 14 images below the fold first in the DOM and 2 in view last.
const SETUP = `
  window.__net = [];
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url) {
      window.__net.push(url);
      if (url === 'https://vf.test/') { const b = new TextEncoder().encode(window.__html); return { status: 200, headers: new Headers({ 'content-type': 'text/html' }), arrayBuffer: async () => b.buffer.slice(0) }; }
      await new Promise((r) => setTimeout(r, 150));
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
      return { status: 200, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => png.buffer.slice(0) };
    },
  };
`;
let html = '<html><head><title>vf</title></head><body style="margin:0">';
for (let i = 0; i < 14; i++) html += `<img src="https://vf.test/below${i}.png" width="50" height="50" style="position:absolute;left:${i * 20}px;top:900px">`;
html += '<img src="https://vf.test/viewA.png" width="50" height="50" style="position:absolute;left:0;top:40px">';
html += '<img src="https://vf.test/viewB.png" width="50" height="50" style="position:absolute;left:80px;top:40px"></body></html>';

async function run(page, on) {
  await boot(page, { init: () => { try { localStorage.setItem('limitless:inst:v1', 'gi_t'); localStorage.setItem('gi_t:limitless:idlethreads:v1', '2'); localStorage.setItem('gi_t:limitless:activethreads:v1', '2'); } catch (_) {} } });
  await page.evaluate(SETUP);
  await page.evaluate(([h, on]) => { window.__html = h; if (on) LB_features.visibleFirst = true; }, [html, on]);
  await page.evaluate(() => LB_go('https://vf.test/'));
  await expect.poll(() => page.evaluate(() => __net.filter((u) => /view[AB]/.test(u)).length), { timeout: 20000 }).toBe(2);
  return page.evaluate(() => __net.filter((u) => /\.png/.test(u)).map((u) => u.slice(16, -4)));
}

test('visibleFirst on: in-view images are fetched before the below-the-fold ones listed first', async ({ page }) => {
  const order = await run(page, true);
  expect(Math.max(order.indexOf('viewA'), order.indexOf('viewB'))).toBeLessThan(4);
});

test('visibleFirst off (default): the order is unchanged, in-view images come last', async ({ page }) => {
  const order = await run(page, false);
  expect(Math.min(order.indexOf('viewA'), order.indexOf('viewB'))).toBeGreaterThan(5);
});
