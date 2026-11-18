const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { SETUP } = require('./s3-helpers');

// 1.3 L1: features.lockdown puts a wide CSP on the proxied page so nothing loads straight from the internet (off by default).
const OLD = 'frame-src blob: data: about:;';
const PAGE = '<html><head><title>t</title></head><body><p id="ok">hello</p><div id="d"></div><script>' +
  'document.getElementById("d").style.setProperty("background-image","url(https://leak.example.test/a.png)");' +
  '</script></body></html>';

async function run(page, features) {
  await boot(page, { features: { ownRelay: true, ownSockets: 4, pageCache: true, warm: true, ...features } });
  await page.evaluate(SETUP);
  await page.evaluate((html) => { __respond('https://lock.test/', { headers: { 'content-type': 'text/html' }, body: html }); }, PAGE);
  await page.evaluate(() => window.LB_featuresReady);
  await page.evaluate(() => { window.LB_go('https://lock.test/'); });
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.shown != null; }, null, { timeout: 15000 });
  const fr = await (await page.locator('#frame').elementHandle()).contentFrame();
  await fr.waitForSelector('#ok');
  return fr;
}

// the proxy runtime removes the markup CSP meta from the live DOM (the policy stays in force), so read the frame's source
const cspOf = (page) => page.evaluate(async () => {
  const f = document.getElementById('frame');
  const html = f.srcdoc || (f.src.startsWith('blob:') ? await (await fetch(f.src)).text() : decodeURIComponent(f.src.replace(/^data:[^,]*,/, '')));
  const m = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
  return m && m[1];
});

test('switch off: the CSP meta is exactly the old string and nothing is counted', async ({ page }) => {
  const fr = await run(page, {});
  expect(await cspOf(page)).toBe(OLD);
  expect(await page.evaluate(() => window.LB_features.lockdown)).toBe(false);
  expect(await page.evaluate(() => window.LB_lockdown)).toBeUndefined();
  expect(await page.evaluate(() => window.LB_rewrite.stats().cspBlocked)).toBeUndefined();
});

test('switch on: a direct load is blocked and counted, the page still renders', async ({ page }) => {
  const fr = await run(page, { lockdown: true });
  const csp = await cspOf(page);
  expect(csp).toContain("default-src " + new URL(page.url()).origin + " blob: data: 'unsafe-inline' 'unsafe-eval'");
  expect(csp).toContain(OLD);
  await fr.evaluate(() => getComputedStyle(document.getElementById('d')).backgroundImage);
  await expect.poll(() => page.evaluate(() => (window.LB_rewrite.stats().cspBlocked || {})['leak.example.test'] || 0)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.LB_lockdown.recent.some((u) => u.includes('leak.example.test')))).toBe(true);
  expect(await fr.locator('#ok').textContent()).toBe('hello');
});
