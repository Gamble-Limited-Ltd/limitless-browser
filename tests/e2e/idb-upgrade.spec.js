const { test, expect } = require('@playwright/test');

// Hotfix 0.2.1: 0.2.0 opens the resource cache at version 3. A tab still running 0.1.0 holds version 2 open and
// never closes it, so the upgrade is blocked. Boot must not wait on the cache: it starts without it, and the
// network session still comes up (otherwise every page fails with "libcurl not ready").
test('a blocked cache upgrade does not stop the network session from starting', async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext();
  const old = await ctx.newPage();
  await old.goto('/index.html');
  await expect(old.locator('#url')).toBeVisible({ timeout: 30000 });
  // Make this tab behave like 0.1.0: hold a version-2 connection open and ignore versionchange.
  const name = await old.evaluate(async () => {
    const id = localStorage.getItem('limitless:inst:v1');
    const n = id + '_ProxyCacheOld';
    return n;
  });
  // Simulate with the real database name: delete it, recreate at v2, keep the handle open.
  await old.evaluate(async () => {
    const n = localStorage.getItem('limitless:inst:v1') + '_ProxyCache';
    await new Promise((r) => { const d = indexedDB.deleteDatabase(n); d.onsuccess = d.onerror = d.onblocked = () => r(); });
    window.__held = await new Promise((res, rej) => {
      const q = indexedDB.open(n, 2);
      q.onupgradeneeded = () => { const s = q.result.createObjectStore('resources', { keyPath: 'url' }); s.createIndex('byLastAccessed', 'lastAccessed'); };
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  });
  expect(name).toBeTruthy();
  const fresh = await ctx.newPage();
  await fresh.goto('/index.html');
  await expect(fresh.locator('#url')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => fresh.evaluate(() => !!(window.LB_net && window.LB_net.curl)), { timeout: 20000 }).toBe(true);
  await ctx.close();
});
