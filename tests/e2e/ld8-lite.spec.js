const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { SETUP } = require('./s3-helpers');

// LD-8 (features.liteView): Lite view shows Readability's article from the HTML go() already fetched, with no site script and
// images through the proxy path; a non-article gets a message; a slow load past LB_liteOfferMs offers it once; switch off = no button.
const O = 'https://lite.test';
const ART = '<html><head><title>Big Story</title><script>window.__ran=1;document.title="ran"</script></head><body><nav>menu</nav><article><h1>Big Story</h1>' +
  '<p class="byline">By Ada Writer</p>' + ('<p>This is a long paragraph about nothing in particular, written so the reader has enough text to call it an article. </p>'.repeat(14)) +
  '<img src="/pic.svg" alt="pic"><img src="https://i.ytimg.com/vi/x/hq.jpg" alt="yt"><p>Read the <a href="/next">Next page</a> for more, or the <a href="javascript:alert(1)" onclick="alert(1)">bad</a> link, which matters less in a long sentence about this whole article and its subject, and then some more words to keep the paragraph weighty.</p>' +
  '<iframe src="https://evil.test/"></iframe><script>window.__ran2=1</script></article></body></html>';
const THIN = '<html><head><title>Hi</title></head><body><p>hello</p></body></html>';
const SVG = { headers: { 'content-type': 'image/svg+xml' }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' };

async function load(page, features, pages, url = '/a') {
  await boot(page, { features: { ownRelay: true, ownSockets: 4, pageCache: true, warm: true, liteView: true, ...features } });
  await page.evaluate(SETUP);
  await page.evaluate(([o, pages, svg]) => {
    for (const [p, r] of Object.entries(pages)) __respond(o + p, r.headers ? r : { headers: { 'content-type': 'text/html' }, ...r });
    __respond(o + '/pic.svg', svg);
  }, [O, pages, SVG]);
  await page.evaluate(() => window.LB_featuresReady);
  await page.evaluate((u) => { window.LB_go(u); }, O + url);
}
const shown = (page) => page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.shown != null; }, null, { timeout: 15000 });

test('article: text shown, no script ran, image via proxy, link opens normal view, back works', async ({ page }) => {
  await load(page, {}, { '/a': { body: ART }, '/next': { body: THIN } });
  await shown(page);
  await expect(page.locator('#lbLiteBtn')).toBeVisible();
  const before = await page.evaluate(() => window.__net.log.filter((x) => /\/a$/.test(x.url)).length);
  await page.locator('#lbLiteBtn').click();
  const lite = page.locator('#lbLite');
  await expect(lite.locator('h1')).toHaveText('Big Story');
  await expect(lite).toContainText('Ada Writer');
  await expect(lite).toContainText('long paragraph about nothing');
  expect(await page.evaluate(() => [window.__ran, window.__ran2])).toEqual([undefined, undefined]);
  expect(await page.evaluate((b) => window.__net.log.filter((x) => /\/a$/.test(x.url)).length === b, before)).toBe(true);
  await expect(lite.locator('iframe, script')).toHaveCount(0);
  await expect(lite).toContainText('bad link');
  await expect(lite.locator('[href^="javascript"], [onclick]')).toHaveCount(0);
  await expect(lite.locator('img')).toHaveCount(1);   // the YouTube image is blocked like any page image, never fetched
  await expect(lite.locator('img')).toHaveAttribute('src', /^blob:/);
  expect(await page.evaluate(() => window.__count(/ytimg/))).toBe(0);
  expect(await page.evaluate(() => window.__count(/pic\.svg/))).toBeGreaterThan(0);
  expect(await page.locator('#url').inputValue()).toBe('limitless://lite?u=' + encodeURIComponent(O + '/a'));
  await lite.locator('a', { hasText: 'Next page' }).click();
  await expect(lite).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__count(/\/next$/))).toBeGreaterThan(0);
  await page.evaluate((u) => window.LB_go(u), O + '/a'); await shown(page);
  await page.locator('#lbLiteBtn').click();
  await lite.locator('#lbLiteBack').click();
  await expect(lite).toBeHidden();
});

test('non-article: message, back to full page', async ({ page }) => {
  await load(page, {}, { '/a': { body: THIN } });
  await shown(page);
  await page.locator('#lbLiteBtn').click();
  await expect(page.locator('#lbLiteMsg')).toHaveText('Lite view is not available for this page.');
  await page.locator('#lbLiteBack').click();
  await expect(page.locator('#lbLite')).toBeHidden();
});

test('slow load offers Lite view once; switch off hides button and offer', async ({ page }) => {
  const slow = { '/a': { body: ART.replace('<img src="/pic.svg" alt="pic">', '<script src="/slow.js"></script>') }, '/slow.js': { headers: { 'content-type': 'text/javascript' }, body: '1', delay: 3000 } };
  await load(page, {}, slow);
  await page.evaluate(() => { window.LB_liteOfferMs = 600; });
  await page.evaluate((u) => window.LB_go(u), O + '/a');
  await expect(page.locator('#lbLiteOffer')).toBeVisible({ timeout: 6000 });
  await expect(page.locator('#lbLiteOffer')).toContainText('Taking long. Open Lite view?');
  await page.locator('#lbLiteOfferBtn').click();
  await expect(page.locator('#lbLite h1')).toHaveText('Big Story');
  await expect(page.locator('#lbLiteOffer')).toBeHidden();
});

test('feature off: no button, no offer', async ({ page }) => {
  await load(page, { liteView: false }, { '/a': { body: ART } });
  await page.evaluate(() => { window.LB_liteOfferMs = 0; });
  await shown(page);
  await page.waitForTimeout(500);
  await expect(page.locator('#lbLiteBtn')).toBeHidden();
  await expect(page.locator('#lbLiteOffer')).toBeHidden();
  await page.locator('#lbMenuBtn').click();
  await expect(page.locator('#lbMenu .lb-mi[data-id="lite"]')).toBeHidden();
});

for (const [w, h, theme] of [[1366, 768, 'luxury'], [390, 800, 'ledger']]) {
  test(`looks right at ${w} wide in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await load(page, {}, { '/a': { body: ART } });
    await shown(page);
    await page.evaluate((t) => document.documentElement.setAttribute('data-lb-theme', t), theme);
    await page.locator('#lbLiteBtn').click();
    const body = page.locator('#lbLite .lb-lite-body');
    await expect(body).toBeVisible();
    const m = await page.evaluate(() => { const e = document.querySelector('#lbLite'); const i = e.querySelector('.lb-lite-in'); const cs = getComputedStyle(e); return { sw: e.scrollWidth, cw: e.clientWidth, iw: i.getBoundingClientRect().width, bg: cs.backgroundColor, fg: cs.color }; });
    expect(m.sw).toBeLessThanOrEqual(m.cw);
    expect(m.iw).toBeLessThanOrEqual(m.cw);
    expect(m.bg).not.toBe(m.fg);
  });
}
