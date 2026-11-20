const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { SETUP } = require('./s3-helpers');

// LD-14 (features.lazyFrames): a cross-origin iframe is not fetched until it is near the viewport (or 8 s after load); same-origin
// iframes and loading=eager ones load at once; a site's loading=lazy is no longer flipped to eager.
const O = 'https://lazy.test';
const PAGE = '<html><head><title>t</title></head><body><p id="ok">top</p>' +
  '<iframe id="near" src="https://embed.test/near.html" width="300" height="100"></iframe>' +
  '<iframe id="same" src="/same.html" width="300" height="100"></iframe>' +
  '<div style="height:6000px"></div>' +
  '<iframe id="far" src="https://embed.test/far.html" width="300" height="100"></iframe>' +
  '<iframe id="eager" loading="eager" src="https://embed.test/eager.html" width="300" height="100"></iframe>' +
  '<iframe id="sitelazy" loading="lazy" src="https://embed.test/sitelazy.html" width="300" height="100"></iframe>' +
  '</body></html>';

async function load(page, features) {
  await boot(page, { features: { ownRelay: true, ownSockets: 4, pageCache: true, warm: true, ...features } });
  await page.evaluate(SETUP);
  await page.evaluate(([o, html]) => {
    const e = (n) => ({ headers: { 'content-type': 'text/html' }, body: '<html><head><title>e</title></head><body><p>embed ' + n + '</p></body></html>' });
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: html });
    for (const n of ['near', 'far', 'eager', 'sitelazy']) __respond('https://embed.test/' + n + '.html', e(n));
    __respond(o + '/same.html', e('same'));
  }, [O, PAGE]);
  await page.evaluate(() => window.LB_featuresReady);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/');
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.shown != null; }, null, { timeout: 15000 });
  const fr = await (await page.locator('#frame').elementHandle()).contentFrame();
  await fr.waitForSelector('#ok');
  return fr;
}
const count = (page, n) => page.evaluate((n) => window.__count(new RegExp(n + '\\.html')), n);

test('lazyFrames: far embed waits for scroll, near, same-origin and eager load at once', async ({ page }) => {
  const fr = await load(page, { lazyFrames: true });
  for (const n of ['near', 'same', 'eager']) await expect.poll(() => count(page, n)).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  expect(await count(page, 'far')).toBe(0);
  expect(await count(page, 'sitelazy')).toBe(0);
  expect(await fr.evaluate(() => document.getElementById('sitelazy').getAttribute('loading'))).toBe('lazy');
  await fr.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => count(page, 'far')).toBeGreaterThan(0);
  await expect.poll(() => count(page, 'sitelazy')).toBeGreaterThan(0);
  expect(await fr.evaluate(() => document.getElementById('far').getAttribute('src'))).toMatch(/^(data|blob):/);
});

test('lazyFrames off: every embed is fetched before the page shows', async ({ page }) => {
  await load(page, { lazyFrames: false });
  expect(await count(page, 'far')).toBeGreaterThan(0);
});
