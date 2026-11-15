// @ts-check
// VPS relay (1.0 S4) through the rehearsal: home gate + VPS stand-in (gate in GATE_MODE=relay on 127.0.0.1:REHEARSAL_VPS_PORT,
// polling home through `web`) + relay + mock GATE. Proves: token issue and use, expiry-free reuse, refresh in the app, revoke cuts
// the VPS socket within 2 s, byte counts and live counts reach home (admin API), and the failure drill (VPS stopped: no token,
// app marks our relay down and shows the relay notice, public relays are the way on; recovers by itself).
// Run through deploy/rehearsal/run.sh:  flock /tmp/limitless-rehearsal.lock deploy/rehearsal/run.sh tests/stack/relay.spec.js
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const VPS_PORT = process.env.REHEARSAL_VPS_PORT || '8592';
const API = '/_lb/admin/api';
const PROJECT = process.env.REHEARSAL_PROJECT || 'limitless-browser-rehearsal';
const COMPOSE_FILE = process.env.REHEARSAL_COMPOSE_FILE || '';

const mock = async (path) => {
  const res = await fetch(`${MOCK}/__mock${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`mock ${path}: ${res.status}`);
};

async function user(browser, who) {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
  await page.waitForURL(`${MOCK}/oidc/authorize**`);
  await page.locator(`input[name=user][value=${who}]`).check();
  await page.locator('#continue').click();
  await page.waitForLoadState('load');
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  return { context, page, req: context.request };
}

const post = (req, path, body) =>
  req.post(`${API}${path}`, { data: body, headers: { origin: BASE, 'content-type': 'application/json' } });
const compose = (...args) => execFileSync('docker', ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, ...args], { stdio: 'pipe' });

/** In the page: open a socket on the VPS with the given token. Result is kept in window.__s[id]; frames can be sent with window.__send. */
const OPEN = ({ id, token, port }) => {
  window.__s = window.__s || {};
  window.__w = window.__w || {};
  const rec = (window.__s[id] = { opened: false, first: null, close: null, protocol: null, at: 0 });
  const ws = new WebSocket(`ws://127.0.0.1:${port}/wisp/`, ['lb.v1', 'lbt.' + token]);
  window.__w[id] = ws;
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { rec.opened = true; rec.protocol = ws.protocol; };
  ws.onmessage = (e) => { if (rec.first === null) rec.first = new Uint8Array(e.data)[0]; };
  ws.onclose = (e) => { rec.close = e.code; rec.at = Date.now(); };
};
const state = (page, id) => page.evaluate((i) => window.__s[i], id);

async function getToken(page) {
  return page.evaluate(async () => {
    const r = await fetch('/_lb/relay-token', { method: 'POST', credentials: 'same-origin' });
    return { status: r.status, body: r.ok ? await r.json() : null };
  });
}

test.beforeEach(async () => { await mock('/reset'); });

test.describe('token and the VPS', () => {
  test('a token opens several sockets on the VPS that reach the relay; forgery, no token and a foreign origin are refused', async ({ browser }) => {
    const alice = await user(browser, 'alice');
    // The VPS needs one poll (1 s) before home issues tokens.
    await expect.poll(async () => (await getToken(alice.page)).status, { timeout: 15000 }).toBe(200);
    const t = (await getToken(alice.page)).body;
    expect(t.url).toBe(`ws://127.0.0.1:${VPS_PORT}/wisp/`);
    expect(t.token.split('.')).toHaveLength(3);
    expect(t.ttl).toBe(300);
    // The token names the member by an opaque id, not the GLL ID sub.
    const claims = JSON.parse(Buffer.from(t.token.split('.')[1], 'base64url').toString());
    expect(claims.sub).toHaveLength(22);
    expect(claims.sub).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(claims).toMatchObject({ plan: 'ordinal', lv: 1 });

    for (const id of ['a', 'b']) await alice.page.evaluate(OPEN, { id, token: t.token, port: VPS_PORT });
    for (const id of ['a', 'b']) {
      await expect.poll(async () => (await state(alice.page, id)).opened, { timeout: 8000 }).toBe(true);
      expect((await state(alice.page, id)).protocol).toBe('lb.v1');
      await expect.poll(async () => (await state(alice.page, id)).first, { timeout: 8000 }).toBe(3);
    }

    const parts = t.token.split('.');
    parts[2] = parts[2].slice(0, -4) + (parts[2].endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await alice.page.evaluate(OPEN, { id: 'forged', token: parts.join('.'), port: VPS_PORT });
    await expect.poll(async () => (await state(alice.page, 'forged')).close, { timeout: 8000 }).not.toBeNull();
    expect((await state(alice.page, 'forged')).opened).toBe(false);

    expect((await alice.context.request.post('/_lb/relay-token', { headers: { origin: 'https://evil.example' } })).status()).toBe(403);
    await alice.context.close();
    expect((await fetch(`${BASE}/_lb/relay-token`, { method: 'POST', headers: { origin: BASE } })).status).toBe(401);
  });

  test('the sync endpoint answers only to the shared secret', async () => {
    const res = await fetch(`${BASE}/_lb/relay/sync`, { method: 'POST', headers: { authorization: 'Bearer nope', 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
    expect((await fetch(`${BASE}/_lb/relay/sync`, { method: 'POST', body: '{}' })).status).toBe(401);
  });

  test('revoke: a kill closes the member\'s VPS socket within 2 s and home then refuses new tokens', async ({ browser }) => {
    const owner = await user(browser, 'owner');
    const alice = await user(browser, 'alice');
    expect((await post(owner.req, '/step-up', { login: 'owner', password: 'owner-pass-1' })).status()).toBe(200);
    await expect.poll(async () => (await getToken(alice.page)).status, { timeout: 15000 }).toBe(200);
    const t = (await getToken(alice.page)).body;
    await alice.page.evaluate(OPEN, { id: 'live', token: t.token, port: VPS_PORT });
    await expect.poll(async () => (await state(alice.page, 'live')).first, { timeout: 8000 }).toBe(3);
    const aliceSub = (await (await owner.req.get(`${API}/users`)).json()).users.find((u) => u.loginName === 'alice').sub;
    try {
      const t0 = Date.now();
      expect((await post(owner.req, '/kill', { sub: aliceSub, on: true })).status()).toBe(200);
      await expect.poll(async () => (await state(alice.page, 'live')).close, { timeout: 8000, intervals: [100] }).toBe(4403);
      const took = (await state(alice.page, 'live')).at - t0;
      console.log(`revoke took ${took} ms`);
      expect(took).toBeLessThan(2000);
      expect((await getToken(alice.page)).status).toBe(403);
    } finally {
      await post(owner.req, '/kill', { sub: aliceSub, on: false });
    }
    await alice.context.close();
    await owner.context.close();
  });

  test('byte counts and live counts reach home (admin Usage and Health)', async ({ browser }) => {
    const owner = await user(browser, 'owner');
    const alice = await user(browser, 'alice');
    expect((await post(owner.req, '/step-up', { login: 'owner', password: 'owner-pass-1' })).status()).toBe(200);
    await expect.poll(async () => (await getToken(alice.page)).status, { timeout: 15000 }).toBe(200);
    const t = (await getToken(alice.page)).body;
    await alice.page.evaluate(OPEN, { id: 'bytes', token: t.token, port: VPS_PORT });
    await expect.poll(async () => (await state(alice.page, 'bytes')).first, { timeout: 8000 }).toBe(3);
    // CONNECT stream 1 to a TCP port, then 4000 bytes of DATA: the VPS counts what it forwards.
    await alice.page.evaluate(() => {
      const host = new TextEncoder().encode('example.com');
      const c = new Uint8Array(1 + 4 + 1 + 2 + host.length);
      const dv = new DataView(c.buffer);
      c[0] = 1; dv.setUint32(1, 1, true); c[5] = 1; dv.setUint16(6, 80, true); c.set(host, 8);
      window.__w.bytes.send(c);
      const d = new Uint8Array(5 + 4000); d[0] = 2; new DataView(d.buffer).setUint32(1, 1, true);
      window.__w.bytes.send(d);
    });
    const aliceSub = (await (await owner.req.get(`${API}/users`)).json()).users.find((u) => u.loginName === 'alice').sub;
    await expect.poll(async () => {
      const rows = (await (await owner.req.get(`${API}/usage`)).json()).rows || [];
      const r = rows.find((x) => x.sub === aliceSub);
      return r ? [r.todayBytes >= 4000, r.sockets] : null;
    }, { timeout: 10000 }).toEqual([true, 1]);
    const h = await (await owner.req.get(`${API}/health`)).json();
    expect(h.relay).toMatchObject({ ok: true, vps: true });
    expect(h.live.sockets).toBe(1);
    await alice.context.close();
    await owner.context.close();
  });
});

test.describe('app and failure drill', () => {
  test.skip(!COMPOSE_FILE, 'needs the rehearsal compose file (run through deploy/rehearsal/run.sh)');

  test('the app opens its own-relay sockets on the VPS; with the VPS stopped it marks our relay down, shows the notice and recovers', async ({ browser }) => {
    test.setTimeout(150000);
    const alice = await user(browser, 'alice');
    await expect.poll(async () => (await getToken(alice.page)).status, { timeout: 15000 }).toBe(200);
    const probe = (page, id) => page.evaluate(async (i) => {
      const ws = window.LB_openRelaySocket(`ws://${location.host}/wisp/1/`);
      ws.binaryType = 'arraybuffer';
      window.__p = window.__p || {};
      const rec = (window.__p[i] = { first: null });
      ws.addEventListener('message', (e) => { if (rec.first === null) rec.first = new Uint8Array(e.data)[0]; });
      for (let n = 0; n < 100 && rec.first === null; n++) await new Promise((r) => setTimeout(r, 100));
      rec.url = ws._inner ? ws._inner.url : null;
      ws.close();
      return rec;
    }, id);
    // The rehearsal build has ownRelay on; the page boots with it.
    expect(await alice.page.evaluate(() => window.LB_relayStatus().ownRelay)).toBe(true);
    const viaVps = await probe(alice.page, 'a');
    expect(viaVps.url).toBe(`ws://127.0.0.1:${VPS_PORT}/wisp/`);
    expect(viaVps.first).toBe(3);
    expect(await alice.page.evaluate(() => window.LB_relayStatus().ours)).toBe('ok');

    compose('stop', 'vps');
    try {
      // Home stops issuing tokens within its 15 s window; the app then falls back and says so.
      await expect.poll(async () => (await getToken(alice.page)).status, { timeout: 30000 }).toBe(503);
      await alice.page.evaluate(() => { window.LB_relayTok.cur = null; });
      await probe(alice.page, 'b');
      expect(await alice.page.evaluate(() => window.LB_relayStatus().ours)).toBe('down');
      await expect(alice.page.locator('#lbRelayNotice')).toBeVisible();
    } finally {
      compose('start', 'vps');
    }
    await expect.poll(async () => (await getToken(alice.page)).status, { timeout: 30000 }).toBe(200);
    await alice.context.close();
  });
});
