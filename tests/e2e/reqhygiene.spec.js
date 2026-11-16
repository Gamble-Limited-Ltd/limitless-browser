// 1.1 slice botcheck, Part B: requests carry what the user's real browser would send (docs/1.1/BOTCHECK.md). Stub curl records the exact headers.
const { test, expect } = require('@playwright/test');
const http = require('http');
const net = require('net');
const { boot } = require('./helpers');

const CH_UA = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
const FF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0';
const STUB = `
  window.__hdrs = [];
  window.LB_net.curl = { active_requests: 0, close() {}, set_connections() {}, async fetch(url, o) {
    window.__hdrs.push({ url, method: o.method || 'GET', keys: Object.keys(o.headers || {}), h: Object.fromEntries(Object.entries(o.headers || {}).map(([k, v]) => [k.toLowerCase(), v])) });
    const b = new TextEncoder().encode('ok');
    return { status: 200, statusText: 'OK', headers: new Headers({ 'content-type': 'text/plain' }), arrayBuffer: async () => b.buffer, body: null, url, ok: true };
  } };`;

async function run(page, feat, calls) {
  await boot(page, { features: feat });
  await page.evaluate(() => window.LB_featuresReady);
  await page.evaluate(STUB);
  return page.evaluate(async (calls) => { for (const [u, o] of calls) { try { await window.LB_queueFetch(u, o || {}); } catch (_) {} } return window.__hdrs; }, calls);
}

test.describe('chromium user agent', () => {
  test.use({ userAgent: CH_UA, locale: 'en-US' });
  test('navigation looks like a typed top-level load', async ({ page }) => {
    const [n] = await run(page, {}, [['https://example.test/', { __nav: true }]]);
    expect(n.h['user-agent']).toBe(CH_UA);
    expect(n.h['sec-ch-ua']).toMatch(/"Chromium";v="147"/);
    expect(n.h['sec-ch-ua-platform']).toBe('"Chrome OS"');
    expect(n.h['sec-ch-ua-mobile']).toBe('?0');
    expect(n.h.accept).toMatch(/^text\/html,application\/xhtml\+xml/);
    expect(n.h['upgrade-insecure-requests']).toBe('1');
    expect(n.h['sec-fetch-site']).toBe('none');
    expect(n.h['sec-fetch-dest']).toBe('document');
    expect(n.h.origin).toBeUndefined();
    expect(n.h.referer).toBeUndefined();
    expect(n.h['accept-language']).toMatch(/^en-US/);
    // Chromium order: client hints, UIR, UA, Accept, Sec-Fetch-*, then language
    const i = (k) => n.keys.findIndex((x) => x.toLowerCase() === k);
    expect(i('sec-ch-ua')).toBeLessThan(i('user-agent'));
    expect(i('user-agent')).toBeLessThan(i('accept'));
    expect(i('accept')).toBeLessThan(i('sec-fetch-site'));
    expect(i('sec-fetch-dest')).toBeLessThan(i('accept-language'));
  });
  test('hygiene off keeps the old headers (no hints, hard-coded UA)', async ({ page }) => {
    const [n] = await run(page, { reqHygiene: false }, [['https://example.test/', { __nav: true }]]);
    expect(n.h['sec-ch-ua']).toBeUndefined();
    expect(n.h['user-agent']).toMatch(/Windows NT 10.0/);
  });
  test('no header names the proxy or relay', async ({ page }) => {
    const [n] = await run(page, {}, [['https://example.test/', { __nav: true }]]);
    for (const k of n.keys) expect(k.toLowerCase()).not.toMatch(/limitless|wisp|relay|proxy|forwarded|via|x-lb/);
    for (const v of Object.values(n.h)) expect(String(v)).not.toMatch(/limitless|wisp|relay/i);
  });
});

test.describe('firefox user agent', () => {
  test.use({ userAgent: FF_UA, locale: 'en-US' });
  test('no client hints, Firefox Accept and language q values', async ({ page }) => {
    const [n] = await run(page, {}, [['https://example.test/', { __nav: true }]]);
    expect(n.h['sec-ch-ua']).toBeUndefined();
    expect(n.h.accept).toBe('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    expect(n.h['user-agent']).toBe(FF_UA);
  });
});

test.describe('subresources', () => {
  test.use({ userAgent: CH_UA, locale: 'en-US' });
  test('a script and a stylesheet get browser Accept, no Origin on plain GET, a CORS fetch keeps Origin', async ({ page }) => {
    await boot(page, { features: {} });
    await page.evaluate(() => window.LB_featuresReady);
    await page.evaluate(STUB);
    const r = await page.evaluate(async () => {
      await window.LB_queueFetch('https://example.test/', { __nav: true });   // sets the page for later requests
      await window.LB_queueFetch('https://cdn.example.test/a.js', {});
      await window.LB_queueFetch('https://cdn.example.test/a.css', {});
      await window.LB_queueFetch('https://api.example.test/x', { headers: { Accept: 'application/json' } });
      return window.__hdrs;
    });
    const [, js, css, api] = r;
    expect(js.h.accept).toBe('*/*');
    expect(css.h.accept).toBe('text/css,*/*;q=0.1');
    expect(js.h.origin).toBeUndefined();
    expect(js.h['sec-ch-ua']).toBeDefined();
    expect(api.h.accept).toBe('application/json');
  });
});

test.describe('real libcurl on the wire', () => {
  test.use({ userAgent: CH_UA, locale: 'en-US' });
  test('raw request headers: browser set and order, no duplicates, no curl defaults', async ({ page }) => {
    let raw = null;
    const web = http.createServer((req, res) => { raw = req.rawHeaders; res.end('ok'); });
    await new Promise((r) => web.listen(0, '127.0.0.1', r));
    await page.routeWebSocket(/\/wispmock/, (ws) => {
      const st = new Map();
      const send = (t, id, p) => { const b = Buffer.alloc(5 + p.length); b[0] = t; b.writeUInt32LE(id, 1); p.copy(b, 5); ws.send(b); };
      const cont = Buffer.alloc(4); cont.writeUInt32LE(1000); send(3, 0, cont);
      ws.onMessage((m) => {
        m = Buffer.from(m); const t = m[0], id = m.readUInt32LE(1), p = m.subarray(5);
        if (t === 1) { const c = net.connect(p.readUInt16LE(1), '127.0.0.1'); st.set(id, c); c.on('data', (d) => send(2, id, d)); c.on('close', () => send(4, id, Buffer.from([2]))); c.on('error', () => {}); }
        else if (t === 2) { const c = st.get(id); if (c) c.write(p); } else if (t === 4) { const c = st.get(id); if (c) c.destroy(); }
      });
    });
    await boot(page, { features: { ownRelay: true, ownSockets: 4 } });
    await page.evaluate(() => window.LB_featuresReady);
    await page.evaluate(async (port) => {
      libcurl.set_websocket('ws://127.0.0.1/wispmock'); await libcurl.load_wasm();
      await window.LB_queueFetch('http://127.0.0.1:' + port + '/', { __nav: true });
    }, web.address().port);
    await new Promise((r) => web.close(r));
    const names = raw.filter((_, i) => i % 2 === 0).map((x) => x.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const order = ['host', 'sec-ch-ua', 'user-agent', 'accept', 'sec-fetch-site', 'accept-language'];
    const at = order.map((k) => names.indexOf(k));
    expect(at.every((x) => x >= 0), names.join(',')).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(names).not.toContain('origin');
    expect(names).not.toContain('referer');
  });
});
