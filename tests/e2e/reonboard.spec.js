// @ts-check
// 1.1 re-onboarding: the gate resets every member but the owner to welcome step 0. Returning members hold the cached shell, so the boot
// access check must send them to /auth/welcome (never "invite only"), and the splash cache must not show the old number.
const { test, expect } = require('@playwright/test');

const ME = 'limitless:me:v1';
const welcomePage = (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>welcome</title><h1 id="w">Welcome</h1>' });
const cache = (page) => page.addInitScript((k) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, JSON.stringify({ name: 'Alex Morgan', number: '0047', tier: 'cardinal' })); } }, ME);
const okVersion = (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 'dev', sha: 'dev', features: { ownRelay: true } }) });

for (const mode of ['403 welcome', 'redirect to the ceremony']) {
  test(`boot: ${mode} on version.json goes to /auth/welcome and clears the splash cache`, async ({ page }) => {
    await cache(page);
    await page.route('**/auth/welcome', welcomePage);
    await page.route('**/auth/invite', (r) => r.fulfill({ contentType: 'text/html', body: '<h1>invite only</h1>' }));
    await page.route('**/version.json*', (r) => (mode === '403 welcome'
      ? r.fulfill({ status: 403, headers: { 'x-lb-reason': 'welcome' }, body: '' })
      : r.fulfill({ status: 302, headers: { location: '/auth/welcome' }, body: '' })));
    await page.goto('/index.html');
    await page.waitForURL('**/auth/welcome', { timeout: 30000 });
    await expect(page.locator('#w')).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), ME)).toBeNull();
  });
}

test('boot: a plain 403 (no reason) still goes to the invite page', async ({ page }) => {
  await page.route('**/auth/invite', (r) => r.fulfill({ contentType: 'text/html', body: '<h1>invite only</h1>' }));
  await page.route('**/version.json*', (r) => r.fulfill({ status: 403, body: '' }));
  await page.goto('/index.html');
  await page.waitForURL('**/auth/invite', { timeout: 30000 });
});

test('/_lb/me without a number clears the cached splash number', async ({ page }) => {
  await cache(page);
  await page.route('**/_lb/me', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ membership: 'on', tier: 'ordinal', standing: 'good', busy: false, plan: { tier: 'ordinal' } }) }));
  await page.route('**/version.json*', okVersion);
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), ME), { timeout: 20000 }).toBeNull();
});

test('/_lb/me 403 (welcome) clears the cached splash number', async ({ page }) => {
  await cache(page);
  await page.route('**/_lb/me', (r) => r.fulfill({ status: 403, body: '' }));
  await page.route('**/version.json*', okVersion);
  await page.goto('/index.html');
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), ME), { timeout: 20000 }).toBeNull();
});
