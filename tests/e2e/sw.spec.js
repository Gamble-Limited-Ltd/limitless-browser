const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// S2 (SPEED.md 3.5): service worker app shell. The source tree reports LB_BUILD_SHA 'dev', which skips the worker, so
// these tests stamp a sha with an init script and answer /version.json themselves.
const SHA = 'swtest1';
const stamp = (sha) => { window.LB_BUILD_SHA = sha; window.LB_SW_DELAY = 0; };

async function withVersion(page, features, status = 200) {
  await page.route('**/version.json', (route) => {
    if (status !== 200) return route.fulfill({ status, contentType: 'text/plain', body: 'no' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '9.9.9', sha: SHA, date: 'x', security: false, features }) });
  });
}
const registrations = (page) => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => (r.active || r.waiting || r.installing || {}).scriptURL || ''));
const cacheKeys = (page) => page.evaluate(async () => {
  const out = [];
  for (const n of await caches.keys()) { const c = await caches.open(n); for (const r of await c.keys()) out.push(n + ' ' + new URL(r.url).pathname); }
  return out;
});

test('registers a worker, caches the shell, and never touches gated or dynamic paths', async ({ page }) => {
  await withVersion(page, { sw: true });
  const errors = await boot(page, { init: stamp, arg: SHA });
  await expect.poll(() => registrations(page)).toEqual([expect.stringMatching(/\/sw\.js$/)]);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(async () => (await cacheKeys(page)).filter((k) => k.startsWith('lb-shell-')).length).toBeGreaterThan(0);
  const keys = (await cacheKeys(page)).join('\n');
  expect(keys).toContain('/vendor/libcurl/0.7.4/libcurl.wasm');
  expect(keys).toContain('/vendor/acorn/8.14.0/acorn.min.js');
  for (const bad of ['/version.json', '/CHANGELOG.md', '/wisp/', '/auth/', '/_lb/', '/legal/', '/sw.js']) expect(keys).not.toContain(bad);
  expect(errors).toEqual([]);
});

test('features.sw = false unregisters the worker and clears its caches on the next load', async ({ page }) => {
  let features = { sw: true };
  await page.route('**/version.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '9.9.9', sha: SHA, date: 'x', security: false, features }) }));
  await boot(page, { init: stamp, arg: SHA });
  await expect.poll(() => registrations(page)).toHaveLength(1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => (await cacheKeys(page)).length).toBeGreaterThan(0);
  features = { sw: false };
  await page.reload();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => registrations(page)).toEqual([]);
  await expect.poll(() => cacheKeys(page)).toEqual([]);
});

test('a 401 or 403 from version.json at boot sends the page back through the gate (one reload, no loop)', async ({ page }) => {
  await withVersion(page, {}, 401);
  let docLoads = 0;
  page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) docLoads++; });
  await page.addInitScript(stamp, SHA);
  await page.goto('/index.html');
  await expect.poll(() => docLoads, { timeout: 15000 }).toBe(2);
  await page.waitForTimeout(3000);
  expect(docLoads).toBe(2);
});
