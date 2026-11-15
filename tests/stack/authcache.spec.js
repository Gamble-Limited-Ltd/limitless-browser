// @ts-check
// nginx auth cache (docs/1.0/RELAY.md 3.1) and per-hop timing headers (RELAY.md 2.2) through the real stack.
// Run through deploy/rehearsal/run.sh under `flock /tmp/limitless-rehearsal.lock`.
// Invite only must hold: signed-out, unapproved and revoked users are refused (app files and /wisp/); 401/403 are never cached.
const { test, expect } = require('@playwright/test');
const { finishCeremony } = require('./helpers-member');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const API = '/_lb/admin/api';
const CACHE_WINDOW_MS = 5000; // proxy_cache_valid 200 5s in deploy/web/nginx.conf
const SLACK_MS = 2500;

async function signInRedirect(page, who) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
  await page.waitForURL(`${MOCK}/oidc/authorize**`);
  await page.locator(`input[name=user][value=${who}]`).check();
  await page.locator('#continue').click();
  await page.waitForLoadState('load');
}
async function user(browser, who) {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await signInRedirect(page, who);
  await finishCeremony(context.request);
  await page.goto('/');
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  return { context, page, req: context.request };
}
const post = (req, path, body) =>
  req.post(`${API}${path}`, { data: body, headers: { origin: BASE, 'content-type': 'application/json' } });
const cacheState = (res) => (res.headers()['server-timing'] || '').match(/authcache;desc=(\w+)/)?.[1];

/** Open a WISP socket from inside a page of that user; resolves 'open' or 'refused'. */
const wispOpens = (page) =>
  page.evaluate(
    (base) =>
      new Promise((resolve) => {
        const ws = new WebSocket(`${base.replace('http', 'ws')}/wisp/`);
        const t = setTimeout(() => resolve('timeout'), 8000);
        ws.onopen = () => { clearTimeout(t); ws.close(); resolve('open'); };
        ws.onerror = () => { clearTimeout(t); resolve('refused'); };
        ws.onclose = () => { clearTimeout(t); resolve('refused'); };
      }),
    BASE,
  );

test.describe('auth cache', () => {
  test('a signed-in user gets MISS then HIT, with per-hop timing on app files and the WISP upgrade', async ({ browser }) => {
    const u = await user(browser, 'alice');
    await new Promise((r) => setTimeout(r, CACHE_WINDOW_MS + 500)); // start from an expired entry
    const first = await u.req.get('/version.json');
    const second = await u.req.get('/version.json');
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    expect(['MISS', 'EXPIRED']).toContain(cacheState(first));
    expect(cacheState(second)).toBe('HIT');
    expect(first.headers()['server-timing']).toMatch(/gate;dur=\d+, authcache;desc=(MISS|EXPIRED), edge;desc=""/);
    // Per-hop numbers for the S4 report: gate time (whole ms from Server-Timing) on misses, round trip on hits and misses.
    const gate = [], missMs = [], hitMs = [];
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, CACHE_WINDOW_MS + 300));
      let t = Date.now();
      const m = await u.req.get('/version.json');
      missMs.push(Date.now() - t);
      gate.push(Number((m.headers()['server-timing'].match(/gate;dur=(\d+)/) || [])[1]));
      t = Date.now();
      await u.req.get('/version.json');
      hitMs.push(Date.now() - t);
    }
    const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log(`PERHOP gate_dur_ms(miss)=${med(gate)} roundtrip_ms miss=${med(missMs)} hit=${med(hitMs)} samples=${JSON.stringify({ gate, missMs, hitMs })}`);
    // ungated paths run no auth subrequest: no timing header
    expect((await u.req.get('/legal/')).headers()['server-timing']).toBeUndefined();
    await u.context.close();
  });

  test('signed-out and forged-cookie requests are refused and never cached', async ({ request, playwright }) => {
    for (let i = 0; i < 3; i++) {
      const r = await request.get('/version.json');
      expect(r.status()).toBe(401);
      expect(cacheState(r)).not.toBe('HIT');
    }
    const forged = await playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie: 'lb_session=forged-value' } });
    for (let i = 0; i < 3; i++) {
      const r = await forged.get('/index.html');
      expect(r.status()).toBe(401);
      expect(cacheState(r)).not.toBe('HIT');
    }
    await forged.dispose();
  });

  test('unapproved user (bob) never gets in; revoked user is refused within the cache window, WISP at once', async ({ browser }) => {
    test.setTimeout(120000);
    const owner = await user(browser, 'owner');
    await post(owner.req, '/step-up', { login: 'owner', password: 'owner-pass-1' });

    // bob is not approved: GATE denies at authorize, so there is no session at all
    const denied = await browser.newContext({ baseURL: BASE });
    const dp = await denied.newPage();
    await dp.goto('/');
    await dp.getByRole('link', { name: 'Sign in with GLL ID' }).click();
    await dp.waitForURL(`${MOCK}/oidc/authorize**`);
    await dp.locator('input[name=user][value=bob]').check();
    await dp.locator('#continue').click();
    await dp.waitForLoadState('load');
    for (let i = 0; i < 2; i++) expect((await denied.request.get('/version.json')).status()).toBe(401);
    expect(await wispOpens(dp)).toBe('refused');
    await denied.close();

    // approve bob, sign him in, warm the cache
    expect((await post(owner.req, '/users/approve', { loginName: 'bob' })).status()).toBe(200);
    const bob = await user(browser, 'bob');
    const bobSub = (await (await owner.req.get(`${API}/users`)).json()).users.find((u) => u.loginName === 'bob').sub;
    try {
      expect((await bob.req.get('/version.json')).status()).toBe(200);
      expect(cacheState(await bob.req.get('/version.json'))).toBe('HIT');
      expect(await wispOpens(bob.page)).toBe('open');

      const revokedAt = Date.now();
      expect((await post(owner.req, '/users/revoke', { sub: bobSub })).status()).toBe(200);
      // Right after the revoke the app-file check may still answer from the cache, but a new WISP socket is refused
      // (the gate checks the session itself) and the cached answer cannot outlive the window.
      expect(await wispOpens(bob.page)).toBe('refused');
      let status = 200;
      while (status === 200 && Date.now() - revokedAt < CACHE_WINDOW_MS + SLACK_MS + 2000) {
        status = (await bob.req.get('/version.json')).status();
        if (status === 200) await new Promise((r) => setTimeout(r, 250));
      }
      const refusedAfter = Date.now() - revokedAt;
      expect(status).toBe(401);
      expect(refusedAfter, 'refused within the cache window bound').toBeLessThanOrEqual(CACHE_WINDOW_MS + SLACK_MS);
      expect((await bob.req.get('/index.html')).status()).toBe(401);
      expect((await owner.req.get('/version.json')).status()).toBe(200);
    } finally {
      await post(owner.req, '/kill', { sub: bobSub, on: false });
    }
    await bob.context.close();
    await owner.context.close();
  });
});
