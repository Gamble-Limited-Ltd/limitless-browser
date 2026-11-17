const { test, expect } = require('@playwright/test');
const { setup } = require('./s3-helpers');

// S3 4.5 + audit 2b: CSS url() rewriting: fonts and images become blob: URLs (no base64 text), other URLs made absolute,
// data:/blob:/# left alone, every occurrence replaced in one pass; @font-face subsets outside Latin and the private use area are not fetched.
const O = 'https://css.test';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('css url() rewrite: fonts and images inline, the rest absolute, repeats and odd cases handled', async ({ page }) => {
  const errors = await setup(page);
  const css = [
    '@font-face{font-family:F;src:url(/f/a.woff2) format("woff2")}',
    '.a{background:url("img/p.png")} .b{background:url(\'img/p.png\')} .c{background:url( img/p.png )}',
    '.d{background:url(data:image/gif;base64,R0lGOD)} .e{background:url(#frag)} .f{background:url(/x/page.html)}',
    '.g{background:url(/missing/gone.png)}',
    '@font-face{font-family:C;src:url(/f/cyr.woff2) format("woff2");unicode-range:U+0301,U+0400-045F,U+0490-0491}',
    '@font-face{font-family:L;src:url(/f/lat.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+2000-206F}',
    '@font-face{font-family:I;src:url(/f/icons.woff2) format("woff2");unicode-range:U+E000-E0FF}',
  ].join('\n');
  await page.evaluate(([o, css, png]) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><link rel="stylesheet" href="/s.css"></head><body><p>x</p></body></html>' });
    __respond(o + '/s.css', { headers: { 'content-type': 'text/css' }, body: css });
    __respond(o + '/f/a.woff2', { headers: { 'content-type': 'font/woff2' }, body: 'WOFFDATA' });
    for (const n of ['cyr', 'lat', 'icons']) __respond(o + '/f/' + n + '.woff2', { headers: { 'content-type': 'font/woff2' }, body: n });
    const bin = atob(png); __respond(o + '/img/p.png', { headers: { 'content-type': 'image/png' }, body: bin });
  }, [O, css, PNG]);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/');
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.shown != null; }, null, { timeout: 15000 });
  const fr = await (await page.locator('#frame').elementHandle()).contentFrame();
  const out = await fr.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n'));
  const body = (u) => fr.evaluate(async (u) => (await fetch(u)).text(), u);   // blob: URLs made by the app open inside the page
  const woff = /font-family:F;src:url\("(blob:[^"]+)"\)/.exec(out);
  expect(woff).not.toBeNull();
  expect(await body(woff[1])).toBe('WOFFDATA');
  const imgs = [...out.matchAll(/\.[abc]\{background:url\("(blob:[^"]+)"\)\}/g)].map((m) => m[1]);
  expect(imgs.length).toBe(3);
  expect(new Set(imgs).size).toBe(1);   // one fetch result reused
  expect(out.split('base64').length - 1).toBe(1);   // only the .d data: URI that was already in the CSS
  expect(out).toContain('url(data:image/gif;base64,R0lGOD)');
  expect(out).toContain('url(#frag)');
  expect(out).toContain('url("https://css.test/x/page.html")');
  expect(out).not.toContain('url(/missing/gone.png)');   // rewritten (the stub answers 404 with a body, which is inlined exactly as before)
  expect(out).toMatch(/font-family:C;src:url\("data:,"\)/);   // Cyrillic subset: not fetched, never a direct load
  expect(out).toMatch(/font-family:L;src:url\("blob:/);
  expect(out).toMatch(/font-family:I;src:url\("blob:/);
  expect(await page.evaluate(() => [LB_fontRangeWanted('U+4E00-4FFF'), LB_fontRangeWanted('U+0100-024F'), LB_fontRangeWanted('U+1F3??'), LB_fontRangeWanted('U+00??')])).toEqual([false, false, false, true]);
  expect(errors).toEqual([]);
});

test('features.cssBlobs=false keeps the data: URIs of before', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(([o, png]) => {
    window.LB_features.cssBlobs = false;
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><link rel="stylesheet" href="/s.css"></head><body><p>x</p></body></html>' });
    __respond(o + '/s.css', { headers: { 'content-type': 'text/css' }, body: '@font-face{font-family:F;src:url(/f/a.woff2)} .a{background:url(img/p.png)}' });
    __respond(o + '/f/a.woff2', { headers: { 'content-type': 'font/woff2' }, body: 'WOFFDATA' });
    __respond(o + '/img/p.png', { headers: { 'content-type': 'image/png' }, body: atob(png) });
  }, [O, PNG]);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/');
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.shown != null; }, null, { timeout: 15000 });
  const out = await (await (await page.locator('#frame').elementHandle()).contentFrame()).evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n'));
  expect(out).toContain('url("data:font/woff2;base64,' + Buffer.from('WOFFDATA').toString('base64') + '")');
  expect(out).toMatch(/\.a\{background:url\("data:image\/png;base64,/);
  expect(out).not.toContain('blob:');
  expect(errors).toEqual([]);
});

test('one file per @font-face: woff2 wins, other formats are never fetched', async ({ page }) => {
  await setup(page);
  const css = '@font-face{font-family:M;src:url(/m.eot);src:url(/m.eot?#iefix) format("embedded-opentype"),url(/m.woff) format("woff"),url(/m.woff2) format("woff2"),url(/m.ttf) format("truetype")}';
  await page.evaluate(([o, css]) => {
    window.__fetched = [];
    const f0 = window.LB_net.curl.fetch.bind(window.LB_net.curl);
    window.LB_net.curl.fetch = (u, o2) => { window.__fetched.push(u); return f0(u, o2); };
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><link rel="stylesheet" href="/s.css"></head><body><p>x</p></body></html>' });
    __respond(o + '/s.css', { headers: { 'content-type': 'text/css' }, body: css });
    for (const e of ['eot', 'woff', 'woff2', 'ttf']) __respond(o + '/m.' + e, { headers: { 'content-type': 'font/' + e }, body: e });
  }, [O, css]);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/');
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.shown != null; }, null, { timeout: 15000 });
  const fonts = await page.evaluate(() => window.__fetched.filter((u) => /\/m\./.test(u)));
  expect(fonts).toEqual([O + '/m.woff2']);
});
