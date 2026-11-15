const { test, expect } = require('@playwright/test');
const { SETUP, setup } = require('./s3-helpers');

// S3 (1.0): client speed extras.

test('rewrite cache: a second visit (new page load, empty memo) reads the rewritten script from IndexedDB', async ({ page }) => {
  const errors = await setup(page);
  const first = await page.evaluate(async () => {
    const src = __big();
    const out = await LB_rewrite.async(src);
    await new Promise((r) => setTimeout(r, 300));   // let the put finish
    return { same: out === LB_rewrite.sync(src), persist: LB_rewrite.stats().persistHits, n: await LB_rewrite.kv.count() };
  });
  expect(first.same).toBe(true);
  expect(first.persist).toBe(0);
  expect(first.n).toBe(1);
  await page.reload();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  await page.evaluate(SETUP);
  await page.evaluate(() => LB_rewrite.kv.open());   // the app opens it when idle; the lookup never waits for the open
  const second = await page.evaluate(async () => {
    const src = __big();
    const out = await LB_rewrite.async(src);
    return { same: out === LB_rewrite.sync(src), s: LB_rewrite.stats() };
  });
  expect(second.same).toBe(true);
  expect(second.s.persistHits).toBe(1);
  expect(second.s.worker).toBe(0);
  expect(errors).toEqual([]);
});

test('rewrite cache: features.rewriteCache=false reads and writes nothing', async ({ page }) => {
  await page.route('**/version.json', (r) => r.fulfill({ contentType: 'application/json', body: '{"version":"x","sha":"abc","features":{"ownRelay":true,"rewriteCache":false}}' }));
  await setup(page);
  const r = await page.evaluate(async () => {
    await window.LB_featuresReady;
    await LB_rewrite.async(__big());
    await new Promise((res) => setTimeout(res, 300));
    return { n: await LB_rewrite.kv.count(), f: window.LB_features.rewriteCache };
  });
  expect(r.f).toBe(false);
  expect(r.n).toBe(0);
});
