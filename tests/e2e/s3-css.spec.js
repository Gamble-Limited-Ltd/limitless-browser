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

// LD-13 (features.fontSwap): every @font-face gets font-display: swap unless it says optional or fallback; script-made FontFace too.
async function fontPage(page, features, css, fonts = {}, saver = false) {
  const { boot } = require('./helpers');
  const { SETUP } = require('./s3-helpers');
  await boot(page, { features: { ownRelay: true, ownSockets: 4, pageCache: true, warm: true, ...features } });
  await page.evaluate(SETUP);
  if (saver) await page.evaluate(() => LB_ls.setItem('limitless:datasaver:v1', '1'));
  await page.evaluate(([o, css, fonts, saver]) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><link rel="stylesheet" href="/s.css">'+ (saver ? '' : '<style>@font-face{font-family:I;src:url(/f/i.woff2)}</style>') + '</head><body><p id="ok">x</p></body></html>' });
    __respond(o + '/s.css', { headers: { 'content-type': 'text/css' }, body: css });
    for (const [n, size] of Object.entries(fonts)) __respond(o + '/f/' + n + '.woff2', { headers: { 'content-type': 'font/woff2' }, body: 'x'.repeat(size) });
    __respond(o + '/f/i.woff2', { headers: { 'content-type': 'font/woff2' }, body: 'i' });
  }, [O, css, fonts, saver]);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/');
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.shown != null; }, null, { timeout: 15000 });
  const fr = await (await page.locator('#frame').elementHandle()).contentFrame();
  return { fr, styles: await fr.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n')) };
}
const FACES = [
  '@font-face{font-family:M;src:url(/f/a.woff2)}',
  '@font-face{font-family:B;src:url(/f/a.woff2);font-display:block}',
  '@font-face{font-family:A;src:url(/f/a.woff2);font-display: auto}',
  '@font-face{font-family:O;src:url(/f/a.woff2);font-display:optional}',
  '@font-face{font-family:F;src:url(/f/a.woff2);font-display:fallback}',
  '@font-face{font-family:S;src:url(/f/a.woff2);font-display:swap}',
].join('\n');
const face = (out, fam) => new RegExp('@font-face\\s*\\{[^}]*font-family:' + fam + ';[^}]*\\}').exec(out)[0];

test('fontSwap: missing, block and auto become swap; optional, fallback and swap stay; inline style too', async ({ page }) => {
  const { styles } = await fontPage(page, { fontSwap: true }, FACES, { a: 4 });
  for (const fam of ['M', 'B', 'A', 'S', 'I']) { const f = face(styles, fam); expect(f).toContain('font-display:swap'); expect(f).not.toMatch(/font-display:\s*(block|auto)/); }
  expect(face(styles, 'O')).toContain('font-display:optional');
  expect(face(styles, 'F')).toContain('font-display:fallback');
});

test('fontSwap off: font faces are left as the site wrote them', async ({ page }) => {
  const { styles } = await fontPage(page, { fontSwap: false }, FACES, { a: 4 });
  expect(face(styles, 'M')).not.toContain('font-display');
  expect(face(styles, 'B')).toContain('font-display:block');
});

test('fontSwap: script-made FontFace gets display swap unless it names one', async ({ page }) => {
  const { fr } = await fontPage(page, { fontSwap: true }, FACES, { a: 4 });
  expect(await fr.evaluate(() => [new FontFace('X', 'url(data:,)').display, new FontFace('Y', 'url(data:,)', { display: 'optional' }).display, new FontFace('Z', 'url(data:,)') instanceof FontFace])).toEqual(['swap', 'optional', true]);
});

test('fontSwap: with Data saver a face over 150 KB after the first two is dropped', async ({ page }) => {
  const css = ['a', 'b', 'c', 'd'].map((n) => '@font-face{font-family:' + n + ';src:url(/f/' + n + '.woff2)}').join('\n');
  const big = 200 * 1024;
  const run = async (saverOn) => {
    const ctx = await page.context().browser().newContext();
    const p = await ctx.newPage();
    const { styles } = await fontPage(p, { fontSwap: true }, css, { a: big, b: big, c: big, d: 10 }, saverOn);
    await ctx.close();
    return styles;
  };
  const s = await run(true);
  expect(face(s, 'a')).toContain('blob:'); expect(face(s, 'b')).toContain('blob:');
  expect(face(s, 'c')).toContain('url("data:,")');   // third face and big: fallback family
  expect(face(s, 'd')).toContain('blob:');   // small faces stay
  expect(face(await run(false), 'c')).toContain('blob:');
});
