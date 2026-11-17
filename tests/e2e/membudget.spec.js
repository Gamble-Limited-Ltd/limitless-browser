const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// SPEED-AUDIT 7: caches next to the page are sized from navigator.deviceMemory (features.memBudget).

const MB = 1024 * 1024;
for (const [mem, low, cache, bf, memo] of [[4, true, 32, 24, 8e6], [2, true, 32, 24, 8e6], [8, false, 96, 64, 24e6], [undefined, false, 96, 64, 24e6]]) {
  test(`deviceMemory ${mem}: memCache ${cache} MB, Instant Back ${bf} MB, rewrite memo ${memo} chars`, async ({ page }) => {
    await boot(page, { init: (n) => { if (n !== undefined) Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => n, configurable: true }); }, arg: mem });
    const r = await page.evaluate(() => {
      const b = LB_memBudget();
      return { b, bfCap: LB_bf.MAX_BYTES };
    });
    expect(r.b).toEqual({ low, memCacheBytes: cache * MB, bfBytes: bf * MB, memoChars: memo });
    expect(r.bfCap).toBe(bf * MB);
  });
}

test('features.memBudget=false keeps today\'s values on a 4 GB device', async ({ page }) => {
  await boot(page, { init: () => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 4, configurable: true }) });
  const r = await page.evaluate(() => { LB_features.memBudget = false; return LB_memBudget(); });
  expect(r).toEqual({ low: false, memCacheBytes: 96 * MB, bfBytes: 64 * MB, memoChars: 24e6 });
});
