// @ts-check
// Launch rehearsal: real nginx (web) + gate + relay against a MOCK GATE. Never public.
// Run through deploy/rehearsal/run.sh (starts the stack, sets REHEARSAL_BASE / REHEARSAL_MOCK).
// Mock users: alice (approved, password alice-pass-1), bob (not approved, password bob-pass-1).
const { test, expect } = require('@playwright/test');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const SESSION_COOKIE = 'lb_session'; // plain-http dev origin: no __Host- prefix (limitless-gate CLAUDE.md)

const mock = async (path) => {
  const res = await fetch(`${MOCK}/__mock${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`mock ${path}: ${res.status}`);
};

/** Redirect flow through the mock GATE. Leaves the page wherever the gate sends it. */
async function signInRedirect(page, who = 'alice') {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
  await page.waitForURL(`${MOCK}/oidc/authorize**`);
  await page.locator(`input[name=user][value=${who}]`).check();
  await page.locator('#continue').click();
  await page.waitForLoadState('load');
}

async function signInAlice(page) {
  await signInRedirect(page, 'alice');
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
}

let internet = true;
test.beforeAll(async () => {
  try {
    const r = await fetch('https://example.com/', { signal: AbortSignal.timeout(8000) });
    internet = r.ok;
  } catch {
    internet = false;
  }
});
test.beforeEach(async () => {
  await mock('/reset');
});
test.afterEach(async () => {
  await mock('/reset');
});

test.describe('without a session', () => {
  test('/legal/ is served ungated', async ({ request }) => {
    const res = await request.get('/legal/');
    expect(res.status()).toBe(200);
  });

  test('/ shows the themed sign-in page with the stamp', async ({ page }) => {
    // HTML requests get the sign-in page itself (nginx error_page = @signin); the app is not in it.
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in with GLL ID' })).toBeVisible();
    await expect(page.locator('img.stamp').first()).toHaveAttribute('src', /portfolio-stamp/);
    // Themed: the stylesheet and the stamp art are served ungated by nginx.
    for (const p of ['/theme/themes.css', '/theme/brand/portfolio-stamp-product-dark.svg']) {
      expect((await page.request.get(p)).status(), p).toBe(200);
    }
    await expect(page.locator('#url')).toHaveCount(0);
  });

  for (const path of ['/index.html', '/version.json', '/patcher.html']) {
    test(`${path} is not served`, async ({ request }) => {
      // Assets and fetches get the bare status.
      expect((await request.get(path)).status()).toBe(401);
      // A browser navigation gets the sign-in page, never the file.
      const html = await request.get(path, { headers: { accept: 'text/html' } });
      const body = await html.text();
      expect(body).toContain('Sign in with GLL ID');
      expect(body).not.toContain('id="url"');
      expect(body).not.toContain('"sha"');
    });
  }

  test('/wisp/ refuses without a session', async ({ page }) => {
    await page.goto('/legal/');
    const code = await page.evaluate(
      (base) =>
        new Promise((resolve) => {
          const ws = new WebSocket(`${base.replace('http', 'ws')}/wisp/`);
          ws.onopen = () => resolve('open');
          ws.onerror = () => resolve('error');
          ws.onclose = () => resolve('closed');
        }),
      BASE,
    );
    expect(code).not.toBe('open');
  });
});

test.describe('alice (approved)', () => {
  test('redirect sign-in lands on the app shell without page errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await signInAlice(page);
    expect(page.url()).toBe(`${BASE}/`);
    expect((await page.request.get('/version.json')).status()).toBe(200);
    expect((await page.request.get('/patcher.html')).status()).toBe(200);
    await page.waitForTimeout(1500);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('direct sign-in form works, wrong password shows an error', async ({ page }) => {
    await page.goto('/');
    await page.fill('#identifier', 'alice');
    await page.fill('#password', 'not-the-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('.err')).toContainText('not right');
    expect((await page.request.get('/index.html')).status()).toBe(401);

    await page.fill('#identifier', 'alice');
    await page.fill('#password', 'alice-pass-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  });

  test('logout clears the session', async ({ page, context }) => {
    await signInAlice(page);
    expect((await context.cookies()).some((c) => c.name === SESSION_COOKIE)).toBe(true);
    const res = await page.request.post('/auth/logout', { headers: { origin: BASE }, maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect((await context.cookies()).some((c) => c.name === SESSION_COOKIE)).toBe(false);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in with GLL ID' })).toBeVisible();
    expect((await page.request.get('/index.html')).status()).toBe(401);
  });

  test('logout is refused from a foreign Origin (CSRF)', async ({ page, context }) => {
    await signInAlice(page);
    const res = await page.request.post('/auth/logout', { headers: { origin: 'http://evil.example' }, maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect((await context.cookies()).some((c) => c.name === SESSION_COOKIE)).toBe(true);
  });
});

test.describe('bob (not approved)', () => {
  test('GATE denies at authorize: invite-only page, no session', async ({ page, context }) => {
    await signInRedirect(page, 'bob');
    await expect(page.getByRole('heading', { name: /invite only/i })).toBeVisible();
    expect((await context.cookies()).some((c) => c.name === SESSION_COOKIE)).toBe(false);
    expect((await page.request.get('/index.html')).status()).toBe(401);
  });
});

test.describe('GATE outage', () => {
  test('new sign-ins show "GLL ID is unavailable." (direct and redirect)', async ({ page }) => {
    await mock('/outage/503');
    await page.goto('/');
    await page.fill('#identifier', 'alice');
    await page.fill('#password', 'alice-pass-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'GLL ID is unavailable.' })).toBeVisible();

    // Redirect flow: authorize still answers, the gate's token call gets 503.
    await signInRedirect(page, 'alice');
    await expect(page.getByRole('heading', { name: 'GLL ID is unavailable.' })).toBeVisible();
    expect((await page.request.get('/index.html')).status()).toBe(401);
  });
});

test.describe('relay', () => {
  test('a real public page loads inside the app frame', async ({ page }) => {
    test.skip(!internet, 'VM has no outbound internet (https://example.com unreachable)');
    await signInAlice(page);
    await page.locator('#url').focus();
    await page.locator('#url').fill('https://example.com');
    await page.keyboard.press('Enter');
    await expect(page.frameLocator('#frame').locator('body')).toContainText('documentation examples', { timeout: 45000 });
  });

  test('connections to our relay are spread over /wisp/N/ shards and version.json carries the feature switches', async ({ page }) => {
    test.skip(!internet, 'VM has no outbound internet (https://example.com unreachable)');
    await signInAlice(page);
    const v = await (await page.request.get('/version.json')).json();
    expect(v.features).toEqual({ ownSockets: 4, worker: true, respCache: true });
    await page.locator('#url').focus();
    await page.locator('#url').fill('https://example.com');
    await page.keyboard.press('Enter');
    await expect(page.frameLocator('#frame').locator('body')).toContainText('documentation examples', { timeout: 45000 });
    const keys = await page.evaluate(() => Object.keys(libcurl.wisp.wisp_connections));
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k).toMatch(/\/wisp\/[1-4]\/$/);
  });

  test('internal and blocked destinations are refused', async ({ page }) => {
    test.skip(!internet, 'VM has no outbound internet; the positive control needs it');
    await signInAlice(page);
    const probe = (url) =>
      page.evaluate(async (u) => {
        try {
          const r = await libcurl.fetch(u);
          return `OK ${r.status}`;
        } catch (e) {
          return `ERR ${String(e).slice(0, 120)}`;
        }
      }, url);
    // Positive control: the same path works for a public host, so the refusals below are the relay's doing.
    expect(await probe('http://example.com/')).toMatch(/^OK 200/);
    const targets = [
      'http://127.0.0.1:8580/',
      'http://127.0.0.1:8590/',
      'http://10.88.80.1/',
      'http://169.254.169.254/',
      'http://example.com:25/',
    ];
    for (const t of targets) expect(await probe(t), t).toMatch(/^ERR/);
  });
});

// Slowest test last: it waits out the gate's 60 s access cache (not configurable by env).
test.describe('revocation', () => {
  test('revoking alice cuts her sockets and ends access within ~70 s; bob (not approved) is cut off too', async ({ page, browser }) => {
    test.setTimeout(180000);
    // Bob gets a session although GATE has not approved him (approval lagging behind sign-in): a new session is
    // trusted for one cache period, then the access check says no.
    await mock('/lenient/on');
    const bobCtx = await browser.newContext({ baseURL: BASE });
    const bob = await bobCtx.newPage();
    await signInRedirect(bob, 'bob');
    await expect(bob.locator('#url')).toBeVisible({ timeout: 30000 });
    await mock('/lenient/off');
    await signInAlice(page);
    expect((await page.request.get('/index.html')).status()).toBe(200);
    // Own WISP socket, so the cut is observable (the app also holds one).
    await page.evaluate(
      (base) =>
        new Promise((resolve, reject) => {
          const ws = new WebSocket(`${base.replace('http', 'ws')}/wisp/`);
          // @ts-ignore test hook
          window.__closed = new Promise((r) => {
            ws.onclose = (ev) => r(ev.code);
          });
          ws.onopen = () => resolve(true);
          ws.onerror = () => reject(new Error('wisp open failed'));
        }),
      BASE,
    );
    const revokedAt = Date.now();
    await mock('/users/alice/revoke');
    // @ts-ignore test hook
    const code = await page.evaluate(() => Promise.race([window.__closed, new Promise((r) => setTimeout(() => r('timeout'), 100000))]));
    expect(code, 'wisp socket should be cut').not.toBe('timeout');
    expect(Date.now() - revokedAt).toBeLessThan(100000);
    // The HTML request is gated by the same verdict.
    await expect
      .poll(async () => (await page.request.get('/index.html', { headers: { accept: 'text/html' } })).status(), { timeout: 30000 })
      .toBe(403);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /invite only/i })).toBeVisible();
    await expect(page.locator('.chip')).toContainText('alice@rehearsal.test');

    // Bob's next navigation: invite page with his email; sign out works. His session is trusted for one cache
    // period after sign-in, and the cut above can land early in that period (it follows the 60 s recheck timer),
    // so wait for his verdict to turn rather than assuming it already has.
    await expect
      .poll(async () => (await bob.request.get('/index.html', { headers: { accept: 'text/html' } })).status(), { timeout: 90000 })
      .toBe(403);
    await bob.goto('/');
    await expect(bob.getByRole('heading', { name: /invite only/i })).toBeVisible();
    await expect(bob.locator('.chip')).toContainText('bob@rehearsal.test');
    expect((await bob.request.get('/index.html')).status()).toBe(403);
    await bob.getByRole('button', { name: 'Sign out' }).click();
    await expect(bob.getByRole('link', { name: 'Sign in with GLL ID' })).toBeVisible();
    expect((await bobCtx.cookies()).some((c) => c.name === SESSION_COOKIE)).toBe(false);
    await bobCtx.close();
  });
});
