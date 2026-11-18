// Shared by the stack specs: with MEMBERSHIP=on a fresh account stops at the welcome ceremony (403 on /_lb/me). This finishes it
// through the gate's own routes (number = the gate's suggestion, then sign). A no-op when membership is off or the account is through.
const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';

/** @param {import('@playwright/test').APIRequestContext} req */
async function finishCeremony(req) {
  if ((await req.get('/_lb/me', { maxRedirects: 0 })).status() === 200) return;
  const st = await req.get('/auth/welcome/state');
  if (st.status() !== 200) return; // membership off (404) or not signed in: nothing to do
  const state = await st.json();
  const headers = { origin: BASE };
  if (state.number === null) {
    const r = await req.post('/auth/welcome/number', { form: { n: state.suggested }, maxRedirects: 0, headers });
    if (r.status() !== 303) throw new Error(`ceremony number: ${r.status()}`);
  }
  const r = await req.post('/auth/welcome/sign', { form: { name: 'Stack Tester', agree: 'on' }, maxRedirects: 0, headers });
  if (r.status() !== 303) throw new Error(`ceremony sign: ${r.status()}`);
}

/** True when the gate runs with MEMBERSHIP=on (the welcome state route exists). Needs a signed-in request context. */
const membershipOn = async (req) => (await req.get('/auth/welcome/state')).status() === 200;

/** Ordinal has no VPS relay under membership: the owner grants `loginName` a Cardinal plan through the admin API. */
async function grantRelayPlan(browser, loginName, tier = 'cardinal') {
  const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
  const context = await browser.newContext({ baseURL: BASE });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
    await page.waitForURL(`${MOCK}/oidc/authorize**`);
    await page.locator('input[name=user][value=owner]').check();
    await page.locator('#continue').click();
    await page.waitForLoadState('load');
    await finishCeremony(context.request); // the owner goes through the ceremony too (1.0.1); the admin API is closed until then
    const api = (p, data) => context.request.post(`/_lb/admin/api${p}`, { data, headers: { origin: BASE, 'content-type': 'application/json' } });
    if ((await api('/step-up', { login: 'owner', password: 'owner-pass-1' })).status() !== 200) throw new Error('step-up failed');
    const users = (await (await context.request.get('/_lb/admin/api/users')).json()).users;
    const sub = users.find((u) => u.loginName === loginName).sub;
    const r = await api('/membership/grant', { sub, tier, howPaid: 'stack test', amount: 0 });
    if (r.status() !== 200) throw new Error(`grant ${tier}: ${r.status()}`);
  } finally {
    await context.close();
  }
}

module.exports = { finishCeremony, membershipOn, grantRelayPlan };
