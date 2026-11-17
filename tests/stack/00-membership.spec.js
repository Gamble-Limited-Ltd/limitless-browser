// @ts-check
// Membership (1.0 S5, MEMBERSHIP.md 12) through the rehearsal: Executive invite -> redeem by the named account -> sign-in -> ceremony ->
// certificate PDF -> public verify (no name) -> suspend cuts the VPS stand-in socket within 2 s.
// Named 00- so it runs first: it needs bob untouched (no ceremony yet); the other specs finish bob's ceremony via helpers-member.js.
// Needs the gate with MEMBERSHIP=on:
//   LB_REHEARSAL_MEMBERSHIP=1 flock /tmp/limitless-rehearsal.lock deploy/rehearsal/run.sh tests/stack/00-membership.spec.js
const { test, expect } = require('@playwright/test');
const { finishCeremony } = require('./helpers-member');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const VPS_PORT = process.env.REHEARSAL_VPS_PORT || '8592';
const API = '/_lb/admin/api';

test.skip(process.env.LB_REHEARSAL_MEMBERSHIP !== '1', 'needs the gate with MEMBERSHIP=on (LB_REHEARSAL_MEMBERSHIP=1)');
test.describe.configure({ mode: 'serial' });

const mock = async (path) => {
  const res = await fetch(`${MOCK}/__mock${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`mock ${path}: ${res.status}`);
};

/** Sign in as a mock user; lands wherever the gate sends this member (the app, or a ceremony page). */
async function signIn(browser, who) {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
  await page.waitForURL(`${MOCK}/oidc/authorize**`);
  await page.locator(`input[name=user][value=${who}]`).check();
  await page.locator('#continue').click();
  await page.waitForLoadState('load');
  return { context, page, req: context.request };
}

const post = (req, path, body) =>
  req.post(`${API}${path}`, { data: body, headers: { origin: BASE, 'content-type': 'application/json' } });
const form = (req, path, data) => req.post(path, { form: data, maxRedirects: 0, headers: { origin: BASE } });

const OPEN = ({ id, token, port }) => {
  window.__s = window.__s || {};
  const rec = (window.__s[id] = { opened: false, first: null, close: null, at: 0 });
  const ws = new WebSocket(`ws://127.0.0.1:${port}/wisp/`, ['lb.v1', 'lbt.' + token]);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { rec.opened = true; };
  ws.onmessage = (e) => { if (rec.first === null) rec.first = new Uint8Array(e.data)[0]; };
  ws.onclose = (e) => { rec.close = e.code; rec.at = Date.now(); };
};
const wsState = (page, id) => page.evaluate((i) => window.__s[i], id);

test.beforeAll(async () => { await mock('/reset'); });

test('an invite for a non-kmlhs.org email is refused', async ({ browser }) => {
  const owner = await signIn(browser, 'owner');
  // The owner goes through the ceremony too (1.0.1) and keeps 0000; until signed the gate holds them like anyone.
  expect((await owner.req.get('/_lb/me', { maxRedirects: 0 })).status()).not.toBe(200);
  await finishCeremony(owner.req);
  expect((await (await owner.req.get('/auth/welcome/state')).json()).number).toBe('0000');
  expect((await post(owner.req, '/step-up', { login: 'owner', password: 'owner-pass-1' })).status()).toBe(200);
  const r = await post(owner.req, '/membership/invites', { loginName: 'bob', email: 'bob@example.com', message: 'Hello' });
  expect(r.status()).toBe(400);
  expect((await r.json()).error).toBe('kmlhs_only');
  await owner.context.close();
});

test('Executive invite, redeem, sign-in, ceremony, certificate, public verify, suspend cuts the VPS socket', async ({ browser }) => {
  test.setTimeout(120000);
  const owner = await signIn(browser, 'owner');
  expect((await post(owner.req, '/step-up', { login: 'owner', password: 'owner-pass-1' })).status()).toBe(200);

  // Boss creates the invite for the named account (bob is not approved in GLL ID yet).
  const created = await post(owner.req, '/membership/invites', { loginName: 'bob', email: 'bob@kmlhs.org', message: 'Welcome to Limitless.' });
  expect(created.status()).toBe(200);
  const { link } = await created.json();
  const invitePath = new URL(link).pathname;
  expect(invitePath).toMatch(/^\/auth\/invite\/.+/);

  // The invitee opens it signed out (ungated), accepts: GLL ID approves the named account, the invite is used once.
  const anon = await browser.newContext({ baseURL: BASE });
  const view = await anon.request.get(invitePath);
  expect(view.status()).toBe(200);
  expect(await view.text()).toContain('You are invited.');
  const accept = await form(anon.request, `${invitePath}/accept`, {});
  expect(accept.status()).toBe(303);
  expect((await anon.request.get(invitePath)).status()).toBe(403); // single use
  await anon.close();

  // Bob signs in and is held at the welcome ceremony (no browsing, no relay token yet).
  const bob = await signIn(browser, 'bob');
  expect((await bob.req.get('/_lb/me', { maxRedirects: 0 })).status()).not.toBe(200); // held by nginx at the ceremony
  await bob.page.goto('/');   // opening the app lands on the designed ceremony, not the gate's fallback form under "/"
  await expect(bob.page).toHaveURL(/\/auth\/welcome$/);
  await expect(bob.page.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible(); // the designed page (S6), invited kind
  expect(await (await bob.req.get('/auth/welcome/state')).json()).toMatchObject({ kind: 'invited', tier: 'executive', number: null, signed: false });
  await bob.page.getByRole('button', { name: 'Begin' }).click();
  await expect(bob.page.getByRole('heading', { name: 'Choose your number' })).toBeVisible();
  expect((await bob.req.post('/_lb/relay-token', { headers: { origin: BASE } })).status()).toBe(403);

  // Ceremony: number (Executive block 0010-0099), then sign the Charter.
  expect((await form(bob.req, '/auth/welcome/number', { n: '0042' })).status()).toBe(303);
  await bob.page.goto('/auth/welcome');
  await expect(bob.page.getByRole('heading', { name: 'Sign the Charter' })).toBeVisible();
  expect((await form(bob.req, '/auth/welcome/sign', { name: 'Robert Example', agree: 'on' })).status()).toBe(303);
  await bob.page.goto('/auth/welcome');
  await expect(bob.page.locator('.reveal svg text.num')).toHaveText('Nº 0042');
  expect((await bob.req.get('/_lb/me')).status()).toBe(200);

  // Certificate PDF for the member; /_lb/me names the code.
  const me = await (await bob.req.get('/_lb/me')).json();
  expect(me).toMatchObject({ membership: 'on', number: '0042', tier: 'executive', standing: 'good', name: 'Robert Example' });
  const pdf = await bob.req.get('/_lb/me/certificate.pdf?variant=screen');
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  // Public verify (ungated): status, number, tier, date; never a name.
  const v = await fetch(`${BASE}/_lb/verify/${encodeURIComponent(me.certificateCode)}`);
  expect(v.status).toBe(200);
  const vb = await v.json();
  expect(vb).toMatchObject({ status: 'genuine', number: '0042', tier: 'executive' });
  expect(JSON.stringify(vb)).not.toContain('Robert');
  expect(JSON.stringify(vb)).not.toContain('Example');

  // A VPS stand-in socket opens with S5's member id and the plan weight; suspension cuts it within 2 s.
  const tok = await expect.poll(async () => (await bob.req.post('/_lb/relay-token', { headers: { origin: BASE } })).status(), { timeout: 15000 }).toBe(200)
    .then(async () => (await bob.req.post('/_lb/relay-token', { headers: { origin: BASE } })).json());
  const claims = JSON.parse(Buffer.from(tok.token.split('.')[1], 'base64url').toString());
  expect(claims.sub).toMatch(/^m_[0-9a-f]{24}$/);
  expect(claims.plan).toBe('executive');
  await bob.page.goto('/'); // the app page (the ceremony pages' CSP blocks the socket)
  await expect(bob.page.locator('#url')).toBeVisible({ timeout: 30000 });
  await bob.page.evaluate(OPEN, { id: 'live', token: tok.token, port: VPS_PORT });
  await expect.poll(async () => (await wsState(bob.page, 'live')).first, { timeout: 8000 }).toBe(3);
  const bobSub = (await (await owner.req.get(`${API}/users`)).json()).users.find((u) => u.loginName === 'bob').sub;
  const t0 = Date.now();
  expect((await post(owner.req, '/membership/standing', { sub: bobSub, action: 'suspend' })).status()).toBe(200);
  await expect.poll(async () => (await wsState(bob.page, 'live')).close, { timeout: 8000, intervals: [100] }).toBe(4403);
  const took = (await wsState(bob.page, 'live')).at - t0;
  console.log(`suspend took ${took} ms`);
  expect(took).toBeLessThan(2000);
  expect((await bob.req.post('/_lb/relay-token', { headers: { origin: BASE } })).status()).toBe(403);
  // Page requests are gated by nginx with a 5 s auth cache (200 only), so the page itself is closed within that window.
  await expect.poll(async () => (await bob.req.get('/_lb/me', { maxRedirects: 0 })).status(), { timeout: 10000 }).not.toBe(200);

  // Cleanup so the later specs can use bob: lift the suspension (the refusals above are already asserted).
  expect((await post(owner.req, '/membership/standing', { sub: bobSub, action: 'lift' })).status()).toBe(200);
  await bob.context.close();
  await owner.context.close();
});
