// @ts-check
// Paid tiers (1.0 S9, PAID-TIERS-PLAN 10c) through the rehearsal: plans_open OFF refuses requests; Boss opens it; alice asks for Cardinal with
// the tick box; the request reaches the admin queue and the support-copy outbox; approving grants Cardinal with a receipt; the public
// verify route answers without a name. Run:
//   flock /tmp/limitless-rehearsal.lock env LB_REHEARSAL_MEMBERSHIP=1 GATE_CONTEXT=$HOME/gll-worktrees/lbgate-s9 deploy/rehearsal/run.sh tests/stack/plans.spec.js
const { test, expect } = require('@playwright/test');
const { finishCeremony } = require('./helpers-member');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const API = '/_lb/admin/api';

test.skip(process.env.LB_REHEARSAL_MEMBERSHIP !== '1', 'needs the gate with MEMBERSHIP=on (LB_REHEARSAL_MEMBERSHIP=1)');
test.describe.configure({ mode: 'serial' });

const mock = async (path) => {
  const res = await fetch(`${MOCK}/__mock${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`mock ${path}: ${res.status}`);
};
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
const json = { origin: BASE, 'content-type': 'application/json' };
const admin = (req, path, body) => req.post(`${API}${path}`, { data: body, headers: json });
const form = (req, path, data) => req.post(path, { form: data, maxRedirects: 0, headers: { origin: BASE } });

test.beforeAll(async () => { await mock('/reset'); });

test('plans_open off refuses; on, a request reaches the queue and the support copy; approve grants a receipt; verify has no name', async ({ browser }) => {
  test.setTimeout(120000);
  const owner = await signIn(browser, 'owner');
  expect((await admin(owner.req, '/step-up', { login: 'owner', password: 'owner-pass-1' })).status()).toBe(200);
  const alice = await signIn(browser, 'alice');
  await finishCeremony(alice.req); // earlier specs may have done it already, so her number is read, not fixed
  const aliceMe = await (await alice.req.get('/_lb/me')).json();
  const ask = { tier: 'cardinal', note: 'For school research', allowed: true };

  const closed = await alice.req.post('/_lb/plan-request', { data: ask, headers: json });
  expect(closed.status()).toBe(403);
  expect((await (await alice.req.get('/_lb/me')).json()).plan.plansOpen).toBe(false);

  expect((await admin(owner.req, '/membership/settings', { plansOpen: true })).status()).toBe(200);
  expect((await alice.req.post('/_lb/plan-request', { data: { ...ask, allowed: false }, headers: json })).status()).toBe(400);
  expect((await alice.req.post('/_lb/plan-request', { data: ask, headers: json })).status()).toBe(200);
  expect((await alice.req.post('/_lb/plan-request', { data: ask, headers: json })).status()).toBe(409);

  const queue = await (await owner.req.get(`${API}/membership/requests`)).json();
  expect(queue.requests).toHaveLength(1);
  expect(queue.requests[0]).toMatchObject({ tier: 'cardinal', number: aliceMe.number, note: 'For school research' });
  const mail = (await (await owner.req.get(`${API}/membership/outbox`)).json()).mail;
  expect(mail[0].to).toBe('gamblelimitedsupport@taps-holdings.org');
  expect(mail[0].body).not.toContain('Stack Tester');

  expect((await admin(owner.req, '/membership/requests/approve', { id: queue.requests[0].id, amount: 15, howPaid: 'cash' })).status()).toBe(200);
  const me = await (await alice.req.get('/_lb/me')).json();
  expect(me.plan.tier).toBe('cardinal');
  expect(me.receipts).toHaveLength(1);
  expect(me.plan.request.status).toBe('approved');

  const v = await fetch(`${BASE}/_lb/verify/${encodeURIComponent(me.certificateCode)}`);
  expect(v.status).toBe(200);
  expect(JSON.stringify(await v.json())).not.toContain('Stack');
  await alice.context.close();
  await owner.context.close();
});
