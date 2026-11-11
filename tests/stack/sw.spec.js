// @ts-check
// S2: the service worker must never undermine invite-only access (docs/1.0/SPEED.md 3.5, docs/ACCESS-CONTROL.md).
// Run through deploy/rehearsal/run.sh (use flock /tmp/limitless-rehearsal.lock). Real nginx + gate + relay, mock GATE.
const { test, expect } = require('@playwright/test');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';

const mock = async (path) => {
  const res = await fetch(`${MOCK}/__mock${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`mock ${path}: ${res.status}`);
};

async function signIn(page, who = 'alice') {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
  await page.waitForURL(`${MOCK}/oidc/authorize**`);
  await page.locator(`input[name=user][value=${who}]`).check();
  await page.locator('#continue').click();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
}

/** Sign in, let the worker install, reload so it controls the page and the shell is cached. */
async function warmWorker(page) {
  await signIn(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const cached = await page.evaluate(async () => {
    const out = [];
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(cached).toContain('/vendor/libcurl/0.7.4/libcurl.wasm');
  expect(cached).toContain('/index.html');
  return cached;
}

test.beforeEach(async () => { await mock('/reset'); });
test.afterEach(async () => { await mock('/reset'); });

test.describe('service worker with a warm cache', () => {
  test('the worker, its precache and the lazy skins file are all served through the gate', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const anon = await ctx.request.get('/sw.js');
    expect(anon.status()).toBe(401);
    for (const p of ['/vendor/libcurl/0.7.4/libcurl.wasm', '/vendor/acorn/8.14.0/acorn.min.js', '/theme/skins.css']) {
      expect((await ctx.request.get(p)).status(), p + ' must be gated').toBe(401);
    }
    await ctx.close();
  });

  test('signed out (cookie gone) with a warm worker: the sign-in page, never the cached app', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await warmWorker(page);
    await ctx.clearCookies();
    for (const path of ['/', '/index.html']) {
      await page.goto(path);
      await expect(page.getByRole('link', { name: 'Sign in with GLL ID' })).toBeVisible();
      await expect(page.locator('#url')).toHaveCount(0);
    }
    // a typed-in address of a cached file is a navigation, so it goes to the network and the gate answers
    await page.goto('/vendor/acorn/8.14.0/acorn.min.js');
    await expect(page.getByRole('link', { name: 'Sign in with GLL ID' })).toBeVisible();   // nginx answers a document request with the sign-in page
    expect(await page.content()).not.toContain('acorn.parse');
    // the 401 page was not stored under the file's name
    const stored = await page.evaluate(async () => {
      const c = await caches.open((await caches.keys())[0]);
      const hit = await c.match('/vendor/acorn/8.14.0/acorn.min.js');
      return hit ? (await hit.text()).slice(0, 200) : null;
    });
    expect(stored === null || stored.indexOf('Sign in') === -1).toBe(true);
    await ctx.close();
  });

  test('revoked (GATE says no) with a warm worker: the invite-only page after the gate recheck', async ({ browser }) => {
    test.setTimeout(180000);
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await warmWorker(page);
    await mock('/users/alice/revoke');
    // the gate rechecks access on a 60 s timer; document requests follow its verdict
    await expect
      .poll(async () => (await page.request.get('/index.html', { headers: { accept: 'text/html' } })).status(), { timeout: 100000 })
      .toBe(403);
    for (const path of ['/', '/index.html']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: /invite only/i })).toBeVisible();
      await expect(page.locator('#url')).toHaveCount(0);
    }
    // and an open tab that boots after the revoke is sent back through the gate by the 403 on version.json
    await ctx.close();
  });
});
