const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// VPS relay (1.0 S4, docs/1.0/RELAY.md 3.7): window.LB_makeRelayOpener(deps) with a stub WebSocket and token function,
// and window.LB_relayTok (token cache and refresh) against a mocked /_lb/relay-token.
// Off = a plain WebSocket; on = token, then the VPS with the token as a subprotocol; any failure = the same-origin /wisp/.

const OWN = 'wss://app.example/wisp/1/';
const VPS = 'wss://relay.example/wisp/';

const SETUP = `
  window.__mk = (over = {}) => {
    const made = [];
    class WS extends EventTarget {
      constructor(url, p) { super(); this.url = url; this.protocols = p; this.sent = []; this.readyState = 0; this.binaryType = 'blob'; made.push(this); }
      send(d) { this.sent.push(d); }
      close() { this.readyState = 3; }
      fire(type, init) { const e = type === 'message' ? new MessageEvent('message', { data: init }) : new Event(type); if (type === 'open') this.readyState = 1; if (type === 'close') this.readyState = 3; this.dispatchEvent(e); }
    }
    const st = { on: true, tok: { url: 'wss://relay.example/wisp/', token: 'T.T.T' }, tokens: 0, t: 1000, down: 0, up: 0 };
    const deps = {
      on: () => st.on,
      isOwn: (u) => u.startsWith('wss://app.example/wisp/'),
      now: () => st.t,
      cooldownMs: 20000,
      WebSocket: WS,
      token: async () => { st.tokens++; if (st.tok instanceof Error) throw st.tok; return st.tok; },
      markUp: () => { st.up++; },
      onDown: () => { st.down++; },
      ...over,
    };
    return { open: window.LB_makeRelayOpener(deps), st, made };
  };
  window.__tick = () => new Promise((r) => setTimeout(r, 0));
`;

async function setup(page, opts) {
  const errors = await boot(page, opts);
  await page.evaluate(SETUP);
  return errors;
}

test('ownRelay off (the 0.3.0 default): the page opens a plain WebSocket and asks for no token', async ({ page }) => {
  const errors = await setup(page, { features: null });
  expect(await page.evaluate(() => window.LB_features.ownRelay)).toBe(false);
  const r = await page.evaluate(async () => {
    const { open, st, made } = window.__mk({ on: () => window.LB_relayStatus().ownRelay });
    const ws = open('wss://app.example/wisp/1/');
    await window.__tick();
    return { urls: made.map((m) => m.url), tokens: st.tokens, plain: ws.constructor.name !== 'LBRelaySocket' };
  });
  expect(r).toEqual({ urls: ['wss://app.example/wisp/1/'], tokens: 0, plain: true });
  expect(errors).toEqual([]);
});

test('on: asks for a token, connects to the VPS with it as a subprotocol, and passes traffic', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const { open, st, made } = window.__mk();
    const ws = open('wss://app.example/wisp/1/');
    ws.binaryType = 'arraybuffer';
    const events = [];
    ws.addEventListener('open', () => events.push('open'));
    ws.addEventListener('message', (e) => events.push('msg:' + e.data));
    await window.__tick();
    const inner = made[0];
    const out = { url: inner.url, protocols: inner.protocols, bt: inner.binaryType };
    ws.send('early'); // before the VPS opens: queued
    inner.fire('open');
    ws.send('late');
    inner.fire('message', 'hi');
    return { ...out, events, sent: inner.sent, tokens: st.tokens, up: st.up, state: ws.readyState };
  });
  expect(r).toEqual({ url: VPS, protocols: ['lb.v1', 'lbt.T.T.T'], bt: 'arraybuffer', events: ['open', 'msg:hi'], sent: ['early', 'late'], tokens: 1, up: 1, state: 1 });
});

test('VPS down (no token, or a token failure): same-origin socket, relay marked down, and a pause before the next try', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const out = {};
    for (const [name, tok] of [['null', null], ['throw', new Error('x')]]) {
      const { open, st, made } = window.__mk();
      st.tok = tok;
      const ws = open('wss://app.example/wisp/1/');
      await window.__tick(); await window.__tick();
      made[0].fire('open');
      const second = open('wss://app.example/wisp/2/'); // cooling down: no token request at all
      out[name] = { urls: made.map((m) => m.url), opened: ws.readyState, tokens: st.tokens, down: st.down, secondPlain: second.constructor.name !== 'LBRelaySocket' };
      st.t += 21000; // cooldown over
      open('wss://app.example/wisp/3/');
      await window.__tick();
      out[name].afterCooldown = st.tokens;
    }
    return out;
  });
  for (const k of ['null', 'throw']) {
    expect(r[k]).toEqual({ urls: ['wss://app.example/wisp/1/', 'wss://app.example/wisp/2/'], opened: 1, tokens: 1, down: 1, secondPlain: true, afterCooldown: 2 });
  }
});

test('the VPS refusing the socket (error before open) falls back and the caller sees one open', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const { open, made, st } = window.__mk();
    const ws = open('wss://app.example/wisp/1/');
    const events = [];
    for (const t of ['open', 'error', 'close']) ws.addEventListener(t, () => events.push(t));
    await window.__tick();
    made[0].fire('error'); made[0].fire('close');
    const urls = made.map((m) => m.url);
    made[1].fire('open');
    return { urls, events, protocols: made[1].protocols ?? null, down: st.down };
  });
  expect(r).toEqual({ urls: [VPS, OWN], events: ['open'], protocols: null, down: 1 });
});

test('after the VPS socket opened, its close (for example a revoke, 4403) reaches the caller and does not fall back', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const { open, made } = window.__mk();
    const ws = open('wss://app.example/wisp/1/');
    const events = [];
    ws.onclose = (e) => events.push('close:' + e.code);
    await window.__tick();
    made[0].fire('open');
    made[0].dispatchEvent(new CloseEvent('close', { code: 4403 }));
    return { n: made.length, events, state: ws.readyState };
  });
  expect(r).toEqual({ n: 1, events: ['close:4403'], state: 3 });
});

test('relays that are not ours never get a token', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const { open, st, made } = window.__mk();
    open('wss://other.example/wisp/');
    await window.__tick();
    return { urls: made.map((m) => m.url), tokens: st.tokens };
  });
  expect(r).toEqual({ urls: ['wss://other.example/wisp/'], tokens: 0 });
});

test('token cache: reused while more than 60 s are left, renewed before it ends, cleared on a refusal', async ({ page }) => {
  let n = 0;
  let status = 200;
  await page.route('**/_lb/relay-token', (route) => {
    n++;
    if (status !== 200) return route.fulfill({ status });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: 'wss://relay.example/wisp/', token: 'tok' + n, exp: 9999999999, ttl: 300 }) });
  });
  await setup(page);
  const r = await page.evaluate(async () => {
    const T = window.LB_relayTok;
    const a = await T.get();
    const b = await T.get();                       // cached
    T.cur.at -= 250000;                            // 50 s left: under the 60 s margin
    const c = await T.get();                       // renewed
    T.cur.at -= 210000;                            // 90 s left: keepFresh renews (under 100 s)
    T.keepFresh(); await T.pending;
    const d = T.cur.token;
    return { a: a.token, same: a === b, c: c.token, d };
  });
  expect(r).toEqual({ a: 'tok1', same: true, c: 'tok2', d: 'tok3' });
  status = 503;
  expect(await page.evaluate(async () => { const t = await window.LB_relayTok.get(true); return { t, cur: window.LB_relayTok.cur }; })).toEqual({ t: null, cur: null });
  expect(n).toBe(4);
});

test('a token answer without a ws(s) url or a token string is ignored', async ({ page }) => {
  await page.route('**/_lb/relay-token', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: 'https://x', token: 1 }) }));
  await setup(page);
  expect(await page.evaluate(() => window.LB_relayTok.get(true))).toBeNull();
});

test('version.json ownRelay true turns it on, anything else leaves it off', async ({ page }) => {
  await page.route('**/version.json', (r) => r.fulfill({ contentType: 'application/json', body: '{"version":"x","sha":"abc","features":{"ownRelay":true}}' }));
  await page.route('**/_lb/relay-token', (r) => r.fulfill({ status: 503 }));
  await setup(page);
  await page.evaluate(() => window.LB_featuresReady);
  expect(await page.evaluate(() => window.LB_features.ownRelay)).toBe(true);
  const p2 = await page.context().newPage();
  await p2.route('**/version.json', (r) => r.fulfill({ contentType: 'application/json', body: '{"version":"x","sha":"abc","features":{"ownRelay":"yes"}}' }));
  await setup(p2);
  await p2.evaluate(() => window.LB_featuresReady);
  expect(await p2.evaluate(() => window.LB_features.ownRelay)).toBe(false);
});
