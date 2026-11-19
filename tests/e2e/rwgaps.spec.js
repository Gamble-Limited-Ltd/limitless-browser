const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { SETUP } = require('./s3-helpers');

// 1.3 L3: features.rwGaps routes runtime loads that the older hooks missed through the proxy (off by default). Run under lockdown so a
// direct load shows up as a counted CSP block; with the switch on the proxy must fetch the URL instead and nothing is blocked.
const page_ = (script) => '<html><head><title>t</title></head><body><p id="ok">hello</p><div id="d"></div><script>' + script + '</script></body></html>';

async function run(page, script, features) {
  await boot(page, { features: { ownRelay: true, ownSockets: 4, pageCache: true, warm: true, lockdown: true, ...features } });
  await page.evaluate(SETUP);
  await page.evaluate((html) => {
    __respond('https://gap.test/', { headers: { 'content-type': 'text/html' }, body: html });
    for (const [u, t] of [['a.jpg', 'image/jpeg'], ['b.jpg', 'image/jpeg'], ['a.mp3', 'audio/mpeg'], ['a.js', 'text/javascript'], ['bg.png', 'image/png'], ['f.woff2', 'font/woff2']]) {
      __respond('https://cdn.gap.test/' + u, { headers: { 'content-type': t }, body: 'x' });
    }
  }, page_(script));
  await page.evaluate(() => window.LB_featuresReady);
  await page.evaluate(() => { window.LB_go('https://gap.test/'); });
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.shown != null; }, null, { timeout: 15000 });
  const fr = await (await page.locator('#frame').elementHandle()).contentFrame();
  await fr.waitForSelector('#ok');
  return fr;
}
const blocked = (page) => page.evaluate(() => (window.LB_rewrite.stats().cspBlocked || {})['cdn.gap.test'] || 0);

test('rwGaps: setAttribute srcset, new Audio(url) go through the proxy', async ({ page }) => {
  await run(page, 'var i=new Image();i.setAttribute("srcset","https://cdn.gap.test/a.jpg 1x");document.body.appendChild(i);' +
    'var p=document.createElement("picture"),s=document.createElement("source");s.setAttribute("srcset","https://cdn.gap.test/b.jpg 1x");p.appendChild(s);document.body.appendChild(p);' +
    'window.aud=new Audio("https://cdn.gap.test/a.mp3");', { rwGaps: true });
  for (const f of ['a.jpg', 'b.jpg', 'a.mp3']) await expect.poll(() => page.evaluate((f) => window.__count(new RegExp(f)), f)).toBeGreaterThan(0);
  expect(await blocked(page)).toBe(0);
});

test('rwGaps: setAttribute src on a script and href on a preload link go through the proxy', async ({ page }) => {
  await run(page, 'var s=document.createElement("script");s.setAttribute("src","https://cdn.gap.test/a.js");document.head.appendChild(s);' +
    'var l=document.createElement("link");l.rel="preload";l.setAttribute("as","script");l.setAttribute("href","https://cdn.gap.test/b.jpg");document.head.appendChild(l);', { rwGaps: true });
  await expect.poll(() => page.evaluate(() => window.__count(/cdn\.gap\.test\/a\.js/))).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await blocked(page)).toBe(0);
});

test('switch off: the same runtime loads still go direct (and are blocked under lockdown)', async ({ page }) => {
  await run(page, 'var i=new Image();i.setAttribute("srcset","https://cdn.gap.test/a.jpg 1x");document.body.appendChild(i);', {});
  expect(await page.evaluate(() => window.LB_features.rwGaps)).toBe(false);
  await expect.poll(() => blocked(page)).toBeGreaterThan(0);
});
