// @ts-check
// Owner admin panel through the real stack (nginx, check service, relay) against the mock GATE.
// Run through deploy/rehearsal/run.sh. Mock users: owner (owner-pass-1, the gate's OWNER_SUB), alice (approved), bob (not approved).
const { test, expect } = require('@playwright/test');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const API = '/_lb/admin/api';

const mock = async (path) => {
  const res = await fetch(`${MOCK}/__mock${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`mock ${path}: ${res.status}`);
};

async function signInRedirect(page, who) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
  await page.waitForURL(`${MOCK}/oidc/authorize**`);
  await page.locator(`input[name=user][value=${who}]`).check();
  await page.locator('#continue').click();
  await page.waitForLoadState('load');
}

/** A signed-in browser context for one mock user. */
async function user(browser, who) {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await signInRedirect(page, who);
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  return { context, page, req: context.request };
}

const post = (req, path, body) =>
  req.post(`${API}${path}`, { data: body, headers: { origin: BASE, 'content-type': 'application/json' } });

async function stepUp(req) {
  const r = await post(req, '/step-up', { login: 'owner', password: 'owner-pass-1' });
  expect(r.status()).toBe(200);
}

test.beforeEach(async () => { await mock('/reset'); });

test.describe('admin API access', () => {
  test('no session: 401 from nginx; normal user: 404; owner: 200', async ({ browser, request }) => {
    expect((await request.get(`${API}/whoami`)).status()).toBe(401);
    const alice = await user(browser, 'alice');
    expect((await alice.req.get(`${API}/whoami`)).status()).toBe(404);
    expect((await alice.req.get(`${API}/users`)).status()).toBe(404);
    await alice.context.close();
    const owner = await user(browser, 'owner');
    const who = await owner.req.get(`${API}/whoami`);
    expect(who.status()).toBe(200);
    expect(await who.json()).toMatchObject({ owner: true, version: 'rehearsal' });
    await owner.context.close();
  });

  test('writes need a step-up and our Origin', async ({ browser }) => {
    const owner = await user(browser, 'owner');
    const noStep = await post(owner.req, '/flags', { signinsPaused: true });
    expect(noStep.status()).toBe(403);
    expect(await noStep.json()).toEqual({ error: 'stepup' });
    await stepUp(owner.req);
    const foreign = await owner.req.post(`${API}/flags`, { data: { signinsPaused: true }, headers: { origin: 'https://evil.example', 'content-type': 'application/json' } });
    expect(foreign.status()).toBe(403);
    await owner.context.close();
  });
});

test.describe('admin page', () => {
  test('the owner sees the entry and the panel; a normal user does not', async ({ browser }) => {
    const alice = await user(browser, 'alice');
    expect(await alice.page.evaluate(() => window.LB_adminProbe())).toBe(false);
    await expect(alice.page.locator('#lbAboutAdmin')).toBeHidden();
    await alice.context.close();

    const owner = await user(browser, 'owner');
    expect(await owner.page.evaluate(() => window.LB_adminProbe())).toBe(true);
    await owner.page.evaluate(() => window.LB_go('limitless://admin'));
    const root = owner.page.locator('#lbAdmin');
    for (const name of ['Users', 'Usage', 'Switches', 'Health']) {
      await expect(root.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    await expect(root).toContainText('alice');
    await expect(root).toContainText('rehearsal');
    await owner.context.close();
  });
});

test.describe('approve and revoke end to end', () => {
  test('approving bob lets him in; revoking cuts him off at once', async ({ browser }) => {
    const owner = await user(browser, 'owner');
    await stepUp(owner.req);

    const approve = await post(owner.req, '/users/approve', { loginName: 'bob' });
    expect(approve.status()).toBe(200);
    expect(await approve.json()).toMatchObject({ loginName: 'bob', created: true });
    const list = await (await owner.req.get(`${API}/users`)).json();
    expect(list.source).toBe('gll-id');
    expect(list.users.some((u) => u.loginName === 'bob' && u.approved === true)).toBe(true);

    const bob = await user(browser, 'bob');
    expect((await bob.req.get('/version.json')).status()).toBe(200);
    const bobSub = (await (await owner.req.get(`${API}/users`)).json()).users.find((u) => u.loginName === 'bob').sub;
    try {
      const revoke = await post(owner.req, '/users/revoke', { sub: bobSub });
      expect(revoke.status()).toBe(200);
      // Revoke deletes bob's sessions and kills him: no waiting for the 60 s access-check cache.
      expect((await bob.req.get('/version.json')).status()).toBe(401);
      expect((await owner.req.get('/version.json')).status()).toBe(200);
    } finally {
      // The kill row lives in the gate's database, which the mock reset does not touch.
      await post(owner.req, '/kill', { sub: bobSub, on: false });
    }
    await bob.context.close();
    await owner.context.close();
  });
});

test.describe('maintenance', () => {
  test('non-owners get the maintenance page, the owner keeps working, then it ends', async ({ browser }) => {
    const owner = await user(browser, 'owner');
    const alice = await user(browser, 'alice');
    await stepUp(owner.req);
    try {
      expect((await post(owner.req, '/flags', { maintenance: true })).status()).toBe(200);
      const asset = await alice.req.get('/version.json');
      expect(asset.status()).toBe(401);
      const html = await alice.req.get('/', { headers: { accept: 'text/html' } });
      const body = await html.text();
      expect(body).toContain('down for maintenance');
      expect(body).not.toContain('id="url"');
      expect((await owner.req.get('/version.json')).status()).toBe(200);
    } finally {
      await post(owner.req, '/flags', { maintenance: false, signinsPaused: false });
    }
    expect((await alice.req.get('/version.json')).status()).toBe(200);
    await alice.context.close();
    await owner.context.close();
  });
});
