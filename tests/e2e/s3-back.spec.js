const { test, expect } = require('@playwright/test');
const { setup } = require('./s3-helpers');

// S3 4.2: instant Back and Forward from memory.
const O = 'https://s3.test';
const TALL = (t) => `<html><head><title>${t}</title></head><body style="margin:0"><h1 id="${t}">${t}</h1><div style="height:4000px"></div></body></html>`;
const SMALL = (t) => `<html><head><title>${t}</title></head><body><h1>${t}</h1></body></html>`;

async function loadPage(page, url) {
  await page.evaluate((u) => { window.LB_go(u); }, url);
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.load != null; }, null, { timeout: 15000 });
  await page.waitForTimeout(200);
}
const inFrame = async (page, js) => (await (await page.locator('#frame').elementHandle()).contentFrame()).evaluate(js);

test('instant Back: no network, under 150 ms, scroll restored; Forward too', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(([o, a, b]) => {
    __respond(o + '/a', { headers: { 'content-type': 'text/html' }, body: a });
    __respond(o + '/b', { headers: { 'content-type': 'text/html' }, body: b });
  }, [O, TALL('A'), SMALL('B')]);
  await loadPage(page, O + '/a');
  await inFrame(page, 'window.scrollTo(0, 900)');
  await loadPage(page, O + '/b');
  const before = await page.evaluate(() => __count(/s3\.test\/a/));
  await page.locator('#back').click();
  const m = await page.evaluate(async () => {
    const c = window.__lbPerf.cur; const t0 = performance.now();
    while (c.marks.load == null && performance.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 5));
    return { ...c.marks };
  });
  expect(m.load).toBeLessThan(150);
  expect(await page.evaluate(() => __count(/s3\.test\/a/))).toBe(before);
  await expect.poll(() => inFrame(page, 'document.title')).toBe('A');
  await expect.poll(() => inFrame(page, 'Math.round(window.scrollY)')).toBe(900);
  await page.locator('#fwd').click();
  await expect.poll(() => inFrame(page, 'document.title')).toBe('B');
  expect(await page.evaluate(() => __count(/s3\.test\/b/))).toBe(1);
  expect(errors).toEqual([]);
});

test('instant Back off (features.instantBack=false): Back fetches again', async ({ page }) => {
  await page.route('**/version.json', (r) => r.fulfill({ contentType: 'application/json', body: '{"version":"x","sha":"abc","features":{"ownRelay":true,"instantBack":false}}' }));
  await setup(page);
  await page.evaluate(async ([o, a, b]) => {
    await window.LB_featuresReady;
    __respond(o + '/a', { headers: { 'content-type': 'text/html' }, body: a });
    __respond(o + '/b', { headers: { 'content-type': 'text/html' }, body: b });
  }, [O, SMALL('A'), SMALL('B')]);
  await loadPage(page, O + '/a');
  await loadPage(page, O + '/b');
  await page.locator('#back').click();
  await expect.poll(() => page.evaluate(() => __count(/s3\.test\/a/))).toBe(2);
});

test('instant Back: a no-store document is not kept', async ({ page }) => {
  await setup(page);
  await page.evaluate(([o, a, b]) => {
    __respond(o + '/a', { headers: { 'content-type': 'text/html', 'cache-control': 'no-store' }, body: a });
    __respond(o + '/b', { headers: { 'content-type': 'text/html' }, body: b });
  }, [O, SMALL('A'), SMALL('B')]);
  await loadPage(page, O + '/a');
  await loadPage(page, O + '/b');
  expect(await page.evaluate((u) => !!LB_bf.find(1, u), O + '/a')).toBe(false);
  await page.locator('#back').click();
  await expect.poll(() => page.evaluate(() => __count(/s3\.test\/a/))).toBe(2);
});

test('instant Back: at most 3 entries per tab and 64 MB in total', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const mk = () => URL.createObjectURL(new Blob(['x']));
    for (let i = 0; i < 5; i++) LB_bf.save(1, 'https://e.test/' + i, mk(), 1000, 't');
    const per = LB_bf.map.get(1).length;
    LB_bf.map.clear(); LB_bf.total = 0;
    LB_bf.save(1, 'https://e.test/a', mk(), 40 * 1024 * 1024, 't');
    LB_bf.save(2, 'https://e.test/b', mk(), 40 * 1024 * 1024, 't');
    return { per, total: LB_bf.total, hasA: !!LB_bf.find(1, 'https://e.test/a'), hasB: !!LB_bf.find(2, 'https://e.test/b') };
  });
  expect(r.per).toBe(3);
  expect(r.total).toBeLessThanOrEqual(64 * 1024 * 1024);
  expect(r.hasA).toBe(false);
  expect(r.hasB).toBe(true);
});
