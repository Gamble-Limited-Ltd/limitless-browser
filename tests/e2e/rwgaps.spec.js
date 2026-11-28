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
    for (const [u, t] of [['a.jpg', 'image/jpeg'], ['b.jpg', 'image/jpeg'], ['a.mp3', 'audio/mpeg'], ['a.js', 'text/javascript'], ['bg.png', 'image/png'], ['f.woff2', 'font/woff2'], ['a.css', 'text/css']]) {
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

test('rwGaps: CSS url() from script (setProperty, style element text) goes through the proxy', async ({ page }) => {
  const fr = await run(page, 'document.getElementById("d").style.setProperty("background-image","url(https://cdn.gap.test/bg.png)");' +
    'var st=document.createElement("style");st.textContent="@font-face{font-family:F;src:url(https://cdn.gap.test/f.woff2)} #ok{background:url(https://cdn.gap.test/a.jpg)}";document.head.appendChild(st);', { rwGaps: true });
  await fr.evaluate(() => getComputedStyle(document.getElementById('d')).backgroundImage);
  for (const f of ['bg.png', 'f.woff2', 'a.jpg']) await expect.poll(() => page.evaluate((f) => window.__count(new RegExp(f)), f)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await blocked(page)).toBe(0);
  expect(await fr.locator('#ok').textContent()).toBe('hello');
});

test('rwGaps: srcset and imagesrcset in innerHTML markup go through the proxy', async ({ page }) => {
  await run(page, 'var h=document.getElementById("d");h.innerHTML="<link rel=preload as=image imagesrcset=\\"https://cdn.gap.test/a.jpg 1x\\" href=\\"https://cdn.gap.test/a.jpg\\"><img srcset=\\"https://cdn.gap.test/b.jpg 1x\\">";', { rwGaps: true });
  await expect.poll(() => page.evaluate(() => window.__count(/b\.jpg/))).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await blocked(page)).toBe(0);
});

test('rwGaps: CSS url() in insertRule, replaceSync and style text nodes goes through the proxy', async ({ page }) => {
  const fr = await run(page, 'var st=document.createElement("style");document.head.appendChild(st);st.sheet.insertRule("#ok{background:url(https://cdn.gap.test/bg.png)}",0);' +
    'var cs=new CSSStyleSheet();cs.replaceSync("#d{background:url(https://cdn.gap.test/a.jpg)}");document.adoptedStyleSheets=[cs];' +
    'var s2=document.createElement("style");s2.appendChild(document.createTextNode("#d{border-image:url(https://cdn.gap.test/b.jpg)}"));document.head.appendChild(s2);' +
    'var s3=document.createElement("style");s3.innerHTML="@font-face{font-family:G;src:url(https://cdn.gap.test/f.woff2)}";document.head.appendChild(s3);', { rwGaps: true });
  await fr.evaluate(() => getComputedStyle(document.getElementById('d')).backgroundImage);
  for (const f of ['bg.png', 'a.jpg', 'b.jpg', 'f.woff2']) await expect.poll(() => page.evaluate((f) => window.__count(new RegExp(f)), f)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await blocked(page)).toBe(0);
});

test('rwGaps: insertRule with url() keeps rule order and the returned index (CSS-in-JS)', async ({ page }) => {
  const fr = await run(page, 'var st=document.createElement("style");document.head.appendChild(st);var sh=st.sheet;' +
    'window.ix=[sh.insertRule("#ok{color:red}",0),sh.insertRule("#ok{background:url(https://cdn.gap.test/bg.png)}",1),sh.insertRule("#ok{color:blue}",2)];window.sh=sh;', { rwGaps: true });
  expect(await fr.evaluate(() => window.ix)).toEqual([0, 1, 2]);
  await expect.poll(() => page.evaluate(() => window.__count(/bg\.png/))).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const rules = await fr.evaluate(() => Array.from(window.sh.cssRules, (r) => r.cssText));
  expect(rules.length).toBe(3);
  expect(rules[0]).toContain('red');
  expect(rules[1]).toContain('background');
  expect(rules[1]).not.toContain('cdn.gap.test');
  expect(rules[2]).toContain('blue');
  expect(await fr.evaluate(() => getComputedStyle(document.getElementById('ok')).color)).toBe('rgb(0, 0, 255)');
});

test('rwGaps: link href set before rel still goes through the proxy', async ({ page }) => {
  await run(page, 'var l=document.createElement("link");l.href="https://cdn.gap.test/a.css";l.rel="stylesheet";document.head.appendChild(l);' +
    'var p=document.createElement("link");p.href="https://cdn.gap.test/b.jpg";p.rel="preload";p.as="image";document.head.appendChild(p);', { rwGaps: true });
  await expect.poll(() => page.evaluate(() => window.__count(/a\.css/))).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await blocked(page)).toBe(0);
});

test('switch off: the same runtime loads still go direct (and are blocked under lockdown)', async ({ page }) => {
  await run(page, 'var i=new Image();i.setAttribute("srcset","https://cdn.gap.test/a.jpg 1x");document.body.appendChild(i);', {});
  expect(await page.evaluate(() => window.LB_features.rwGaps)).toBe(false);
  await expect.poll(() => blocked(page)).toBeGreaterThan(0);
});
