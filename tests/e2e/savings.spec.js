const { test, expect } = require('@playwright/test');
const http = require('http');
const net = require('net');
const zlib = require('zlib');
const { boot } = require('./helpers');

// 1.0 savings (PLAN 0.2d): compressed responses, image Accept, no pre-fetch of unseen images, prefetch hints, split downloads.
// Part 1 uses the REAL libcurl.js against a local wisp mock (page.routeWebSocket) and a local web server.

const BODY = Buffer.from('<html>' + 'hello world lorem ipsum '.repeat(2000) + '</html>');

function wispMock(page) {
  return page.routeWebSocket(/\/wispmock/, (ws) => {
    const st = new Map();
    const send = (t, id, p) => { const b = Buffer.alloc(5 + p.length); b[0] = t; b.writeUInt32LE(id, 1); p.copy(b, 5); ws.send(b); };
    const cont = Buffer.alloc(4); cont.writeUInt32LE(1000); send(3, 0, cont);
    ws.onMessage((m) => {
      m = Buffer.from(m); const t = m[0], id = m.readUInt32LE(1), p = m.subarray(5);
      if (t === 1) {
        const s = net.connect(p.readUInt16LE(1), '127.0.0.1'); st.set(id, s);
        s.on('data', (d) => send(2, id, d)); s.on('close', () => { send(4, id, Buffer.from([2])); st.delete(id); }); s.on('error', () => {});
      } else if (t === 2) { const s = st.get(id); if (s) s.write(p); }
      else if (t === 4) { const s = st.get(id); if (s) s.destroy(); }
    });
  });
}

test.describe('compressed responses', () => {
  let web, seen;
  test.beforeEach(async () => {
    seen = [];
    web = http.createServer((req, res) => {
      seen.push({ ae: req.headers['accept-encoding'] || '', accept: req.headers.accept || '' });
      const ae = String(req.headers['accept-encoding'] || '');
      let b = BODY, enc = null;
      if (/\bbr\b/.test(ae)) { b = zlib.brotliCompressSync(BODY); enc = 'br'; } else if (/\bgzip\b/.test(ae)) { b = zlib.gzipSync(BODY); enc = 'gzip'; }
      const h = { 'content-type': 'text/html', 'content-length': b.length, ...(enc ? { 'content-encoding': enc } : {}) };
      res.writeHead(200, h); res.end(b);
    });
    await new Promise((r) => web.listen(0, '127.0.0.1', r));
  });
  test.afterEach(() => new Promise((r) => web.close(r)));

  async function viaRealCurl(page, feat) {
    await wispMock(page);
    await boot(page, { features: { ownRelay: true, ownSockets: 4, pageCache: true, warm: true, ...feat } });
    await page.evaluate(() => window.LB_featuresReady);
    return page.evaluate(async (port) => {
      libcurl.set_websocket('ws://127.0.0.1/wispmock');
      await libcurl.load_wasm();
      const r = await window.LB_queueFetch('http://127.0.0.1:' + port + '/');
      return { status: r.status, len: r.buf.byteLength, ce: r.headers && (r.headers.get ? r.headers.get('content-encoding') : null) };
    }, web.address().port);
  }

  test('libcurl asks for deflate, gzip and br and the app gets the decoded body', async ({ page }) => {
    const r = await viaRealCurl(page, {});
    expect(r.status).toBe(200);
    expect(r.len).toBe(BODY.length);
    expect(seen[0].ae).toMatch(/gzip/);
    expect(seen[0].ae).toMatch(/\bbr\b/);
  });

  test('features.compress off sends identity and still works', async ({ page }) => {
    const r = await viaRealCurl(page, { compress: false });
    expect(r.len).toBe(BODY.length);
    expect(seen[0].ae).toBe('identity');
  });
});

const STUB = `
  window.__net = { log: [], script: {} };
  window.__respond = (url, r) => { window.__net.script[url] = r; };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url, o) {
      const h = {}; for (const [k, v] of Object.entries(o.headers || {})) h[k.toLowerCase()] = v;
      window.__net.log.push({ url, headers: h });
      const r = window.__net.script[url] || { status: 404, headers: {}, body: 'nope' };
      const bytes = new TextEncoder().encode(r.body);
      return { status: r.status || 200, headers: new Headers(r.headers || {}), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
  window.__reqs = (re) => window.__net.log.filter((x) => re.test(x.url));
  window.__go = async (u) => { window.LB_go(u); };
  window.__waitMark = (name, ms) => new Promise((res) => {
    const t0 = performance.now();
    const iv = setInterval(() => { const c = window.__lbPerf.cur; const m = c ? c.marks : {}; if (m[name] != null || performance.now() - t0 > ms) { clearInterval(iv); res(m); } }, 20);
  });
`;
const O = 'https://sav.test';
const IMG_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';

async function stubbed(page, feat) {
  await boot(page);
  await page.evaluate(STUB);
  if (feat) await page.evaluate((f) => Object.assign(window.LB_features, f), feat);
}

async function pageWith(page, html, extra = {}) {
  return page.evaluate(async ([o, h, ex]) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: h });
    for (const [p, r] of Object.entries(ex)) __respond(o + p, r);
    await __go(o + '/');
    await __waitMark('shown', 8000);
    await new Promise((r) => setTimeout(r, 400));
    return window.__net.log.map((x) => ({ url: x.url.replace(o, ''), accept: x.headers.accept || null }));
  }, [O, html, extra]);
}

test.describe('image Accept', () => {
  test('img, CSS background images and the pre-warm send the AVIF/WebP Accept; other requests do not', async ({ page }) => {
    await stubbed(page);
    const log = await pageWith(page, '<html><head><title>t</title><link rel="stylesheet" href="/a.css"></head><body><img src="/p.png"><picture><source srcset="/s.webp"><img src="/q.jpg"></picture></body></html>', {
      '/a.css': { headers: { 'content-type': 'text/css' }, body: 'body{background:url(/bg.png)}' },
      '/p.png': { headers: { 'content-type': 'image/png' }, body: 'x' }, '/q.jpg': { headers: { 'content-type': 'image/jpeg' }, body: 'x' }, '/bg.png': { headers: { 'content-type': 'image/png' }, body: 'x' },
    });
    for (const u of ['/p.png', '/q.jpg', '/bg.png']) expect(log.find((x) => x.url === u).accept).toBe(IMG_ACCEPT);
    expect(log.find((x) => x.url === '/a.css').accept).not.toBe(IMG_ACCEPT);
  });

  test('features.imgAccept=false leaves the Accept alone', async ({ page }) => {
    await stubbed(page, { imgAccept: false });
    const log = await pageWith(page, '<html><head><title>t</title></head><body><img src="/p.png"></body></html>', { '/p.png': { headers: { 'content-type': 'image/png' }, body: 'x' } });
    expect(log.find((x) => x.url === '/p.png').accept).not.toBe(IMG_ACCEPT);
  });
});

const MANY = Array.from({ length: 20 }, (_, i) => `<img src="/i${i}.png" style="display:block;width:50px;height:1500px">`).join('') + '<img src="/hero.png" fetchpriority="high"><img src="/eager.png" loading="eager">';
const imgBodies = Object.fromEntries([...Array.from({ length: 20 }, (_, i) => `/i${i}.png`), '/hero.png', '/eager.png'].map((u) => [u, { headers: { 'content-type': 'image/png' }, body: 'x' }]));

test.describe('no pre-fetch of unseen images', () => {
  test('only the first 6 plus eager and high priority images are pre-warmed', async ({ page }) => {
    await stubbed(page);
    const log = await pageWith(page, `<html><head><title>t</title></head><body>${MANY}</body></html>`, imgBodies);
    const imgs = log.filter((x) => /\.png$/.test(x.url)).map((x) => x.url);
    expect(imgs.length).toBeLessThan(12);
    for (const u of ['/i0.png', '/i5.png', '/hero.png', '/eager.png']) expect(imgs).toContain(u);
    expect(imgs).not.toContain('/i12.png');
  });

  test('features.lazyPrefetch=false pre-warms the first 24 as before', async ({ page }) => {
    await stubbed(page, { lazyPrefetch: false });
    const log = await pageWith(page, `<html><head><title>t</title></head><body>${MANY}</body></html>`, imgBodies);
    expect(log.filter((x) => /\.png$/.test(x.url)).length).toBe(22);
  });
});

test.describe('prefetch hints', () => {
  const HEAD = '<link rel="prefetch" href="/next.html"><link rel="prerender" href="/n2.html"><link rel="preload" as="document" href="/n3.html"><link rel="preload" as="style" href="/a.css"><link rel="stylesheet" href="/a.css"><script type="speculationrules">{"prefetch":[{"source":"list","urls":["/n4.html"]}]}</script>';
  async function hints(page, feat) {
    await stubbed(page, feat);
    await pageWith(page, `<html><head><title>t</title>${HEAD}</head><body>x</body></html>`, { '/a.css': { headers: { 'content-type': 'text/css' }, body: 'x{}' } });
    return page.evaluate(() => {
      const f = [...document.querySelectorAll('iframe')].map((x) => { try { return x.contentDocument.documentElement.outerHTML; } catch (e) { return ''; } }).join('');
      return { prefetch: /rel="prefetch"/.test(f), prerender: /rel="prerender"/.test(f), doc: /as="document"/.test(f), spec: /speculationrules/.test(f), style: /as="style"/.test(f) };
    });
  }
  test('prefetch, prerender, document preload and speculation rules are removed; style preload stays', async ({ page }) => {
    const h = await hints(page);
    expect(h).toMatchObject({ prefetch: false, prerender: false, doc: false, spec: false, style: true });
  });
  test('features.noPrefetch=false keeps document preload and speculation rules', async ({ page }) => {
    const h = await hints(page, { noPrefetch: false });
    expect(h.doc).toBe(true);
    expect(h.spec).toBe(true);
  });
});
