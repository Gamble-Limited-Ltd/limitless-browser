const { test, expect } = require('@playwright/test');
const { setup } = require('./s3-helpers');

// S3 4.5: CSS url() rewriting: fonts and images inlined as data URIs (base64 off the main thread), other URLs made absolute,
// data:/blob:/# left alone, every occurrence replaced in one pass.
const O = 'https://css.test';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('css url() rewrite: fonts and images inline, the rest absolute, repeats and odd cases handled', async ({ page }) => {
  const errors = await setup(page);
  const css = [
    '@font-face{font-family:F;src:url(/f/a.woff2) format("woff2")}',
    '.a{background:url("img/p.png")} .b{background:url(\'img/p.png\')} .c{background:url( img/p.png )}',
    '.d{background:url(data:image/gif;base64,R0lGOD)} .e{background:url(#frag)} .f{background:url(/x/page.html)}',
    '.g{background:url(/missing/gone.png)}',
  ].join('\n');
  await page.evaluate(([o, css, png]) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><link rel="stylesheet" href="/s.css"></head><body><p>x</p></body></html>' });
    __respond(o + '/s.css', { headers: { 'content-type': 'text/css' }, body: css });
    __respond(o + '/f/a.woff2', { headers: { 'content-type': 'font/woff2' }, body: 'WOFFDATA' });
    const bin = atob(png); __respond(o + '/img/p.png', { headers: { 'content-type': 'image/png' }, body: bin });
  }, [O, css, PNG]);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/');
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.shown != null; }, null, { timeout: 15000 });
  const out = await (await (await page.locator('#frame').elementHandle()).contentFrame()).evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n'));
  expect(out).toContain('url("data:font/woff2;base64,' + Buffer.from('WOFFDATA').toString('base64') + '")');
  expect((out.match(/url\("data:image\/png;base64,/g) || []).length).toBe(3);   // .a .b .c, one fetch result reused
  expect(out).toContain('url(data:image/gif;base64,R0lGOD)');
  expect(out).toContain('url(#frag)');
  expect(out).toContain('url("https://css.test/x/page.html")');
  expect(out).not.toContain('url(/missing/gone.png)');   // rewritten (the stub answers 404 with a body, which is inlined exactly as before)
  expect(errors).toEqual([]);
});
