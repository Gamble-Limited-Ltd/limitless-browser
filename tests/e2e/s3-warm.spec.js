const { test, expect } = require('@playwright/test');
const { setup } = require('./s3-helpers');

// S3 4.6: warm favourite sites. HEAD / to the hosts of the favourites (6) and the last 3 visited sites, answer discarded.
const favs = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://fav${i}.test/some/page`, name: `f${i}` }));

async function seed(page, n) {
  await page.evaluate(([f, r]) => {
    const id = localStorage.getItem('limitless:inst:v1');
    localStorage.setItem(id + ':limitless:favorites:v1', JSON.stringify(f));
    localStorage.setItem(id + ':limitless:recent', JSON.stringify(r));
    window.__net.log.length = 0;
  }, [favs(n), [1, 2, 3, 4].map((i) => ({ url: `https://recent${i}.test/x`, time: 1 }))]);
}

test('warm: HEAD / for at most 6 favourites and 3 recent sites, nothing stored', async ({ page }) => {
  const errors = await setup(page);
  await seed(page, 8);
  const r = await page.evaluate(async () => {
    const n = LB_warm.run();
    await new Promise((res) => setTimeout(res, 200));
    return { n, log: window.__net.log.map((x) => x.url), count: await LB_cache.count() };
  });
  expect(r.n).toBe(9);
  expect(r.log.sort()).toEqual([...Array.from({ length: 6 }, (_, i) => `https://fav${i}.test/`), 'https://recent1.test/', 'https://recent2.test/', 'https://recent3.test/'].sort());
  expect(r.count).toBe(0);
  expect(errors).toEqual([]);
});

test('warm: skipped with Data saver on and when features.warm=false', async ({ page }) => {
  await setup(page);
  await seed(page, 2);
  const saver = await page.evaluate(() => { const id = localStorage.getItem('limitless:inst:v1'); localStorage.setItem(id + ':limitless:datasaver:v1', '1'); return LB_warm.run(); });
  expect(saver).toBe(0);
  await page.evaluate(() => { const id = localStorage.getItem('limitless:inst:v1'); localStorage.removeItem(id + ':limitless:datasaver:v1'); window.LB_features.warm = false; });
  expect(await page.evaluate(() => LB_warm.run())).toBe(0);
});
