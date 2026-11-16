const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { boot } = require('./helpers');

// 1.0 savings (PLAN 0.2d): split downloads by plan, download socket class, pages first, big files over public relays.
// A stub libcurl session (window.LB_net.curl / LB_net.dlCurl) serves files and honours Range with an end byte.

const MB = 1024 * 1024;
const STUB = `
  window.__log = []; window.__files = {}; window.__used = [];
  const byteAt = (i) => (i * 31 + 7) & 255;
  window.__expected = (size) => { const b = new Uint8Array(size); for (let i = 0; i < size; i++) b[i] = byteAt(i); return b; };
  const mk = (name) => ({
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url, o) {
      const f = window.__files[url];
      const h = {}; for (const [k, v] of Object.entries(o.headers || {})) h[k.toLowerCase()] = v;
      window.__log.push({ url, range: h.range || null, ae: h['accept-encoding'] || null, via: name, marked: JSON.stringify([...LB_router.dl.entries()]) });
      if (o.signal && o.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (f && f.throwDl && name === 'dl') throw new TypeError('Request failed with error code 56: Failure when receiving data from the peer');
      if (!f) return { status: 404, headers: new Headers(), body: null };
      let start = 0, end = f.size - 1, status = 200; const headers = { 'content-type': 'application/octet-stream', 'accept-ranges': 'bytes' };
      const m = /bytes=(\\d+)-(\\d*)/.exec(h.range || '');
      if (m && !f.noRange) { start = +m[1]; if (m[2]) end = Math.min(+m[2], f.size - 1); status = 206; headers['content-range'] = 'bytes ' + start + '-' + end + '/' + f.size; }
      if (f.noRange) delete headers['accept-ranges'];
      headers['content-length'] = String(end - start + 1);
      let pos = start;
      const body = new ReadableStream({
        async pull(c) {
          if (o.signal && o.signal.aborted) return c.error(new DOMException('Aborted', 'AbortError'));
          if (f.delay) await new Promise((r) => setTimeout(r, f.delay));
          if (o.signal && o.signal.aborted) return c.error(new DOMException('Aborted', 'AbortError'));
          if (pos > end) return c.close();
          const e = Math.min(pos + 262144, end + 1);
          const b = new Uint8Array(e - pos); for (let i = 0; i < b.length; i++) b[i] = byteAt(pos + i);
          pos = e; c.enqueue(b);
        },
      });
      return { status, headers: new Headers(headers), body, arrayBuffer: async () => new ArrayBuffer(0) };
    },
  });
  window.LB_net.curl = mk('page');
  window.__mkDl = () => { window.LB_net.dlCurl = mk('dl'); };
  window.__member = (parts, lim) => { window.LB_member = { membership: 'on', plan: { tier: 'x', limits: Object.assign({ downloadMbPerFile: 0, downloadsPerDay: 0, downloadParts: parts }, lim), plansOpen: true } }; };
  window.__wait = async (id, st, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 20000)) { const it = LB_downloads.items().find((x) => x.id === id); if (it && (Array.isArray(st) ? st : [st]).includes(it.status)) return it; await new Promise((r) => setTimeout(r, 25)); } return LB_downloads.items().find((x) => x.id === id); };
`;
const O = 'https://dl.test';
const SIZE = 24 * MB;
const expected = (size) => { const b = Buffer.alloc(size); for (let i = 0; i < size; i++) b[i] = (i * 31 + 7) & 255; return b; };

async function setup(page, feat) {
  await boot(page);
  await page.evaluate(STUB);
  await page.evaluate((f) => { Object.assign(window.LB_features, f || {}); LB_downloads.cfg.backoff = [20, 20, 20]; LB_downloads.ls.removeItem('limitless:dlcount:v1'); LB_downloads.ls.removeItem('limitless:datasaver:v1'); LB_downloads.ls.removeItem('limitless:dlpublic:v1'); }, feat);
}
const file = (page, name, spec) => page.evaluate(([u, s]) => { window.__files[u] = s; }, [O + name, spec]);
const logOf = (page, name) => page.evaluate((n) => __log.filter((x) => x.url.endsWith(n)), name);

test.describe('split downloads', () => {
  test('4 parts: ranges as agreed, bytes in order, identity encoding', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => __member(4));
    await file(page, '/big.bin', { size: SIZE });
    const dl = page.waitForEvent('download');
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/big.bin');
    const d = await dl;
    expect(Buffer.compare(fs.readFileSync(await d.path()), expected(SIZE))).toBe(0);
    const it = await page.evaluate((i) => __wait(i, 'done'), id);
    expect(it.status).toBe('done');
    const log = await logOf(page, '/big.bin');
    expect(log.map((x) => x.range)).toEqual([null, 'bytes=6291456-12582911', 'bytes=12582912-18874367', 'bytes=18874368-25165823'].map((r) => r && r.replace('25165823', String(SIZE - 1))));
    expect(log.every((x) => x.ae === 'identity')).toBe(true);
  });

  test('plan limit 1 or unknown, membership off, or features.dlSplit=false: one request', async ({ page }) => {
    for (const mode of ['one', 'none', 'off']) {
      await setup(page, mode === 'off' ? { dlSplit: false } : {});
      await page.evaluate((m) => { if (m === 'one') __member(1); else if (m === 'off') __member(8); else delete window.LB_member; }, mode);
      await file(page, '/b.bin', { size: SIZE });
      const dl = page.waitForEvent('download');
      await page.evaluate((u) => LB_downloads.add(u), O + '/b.bin');
      const d = await dl;
      expect(fs.statSync(await d.path()).size).toBe(SIZE);
      expect((await logOf(page, '/b.bin')).length).toBe(1);
    }
  });

  test('a file under 20 MB is never split', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => __member(8));
    await file(page, '/s.bin', { size: 10 * MB });
    const dl = page.waitForEvent('download');
    await page.evaluate((u) => LB_downloads.add(u), O + '/s.bin');
    await dl;
    expect((await logOf(page, '/s.bin')).length).toBe(1);
  });

  test('a server that refuses Range falls back to one part and the file is complete', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => __member(4));
    // answers 206 to the first request only by claiming Accept-Ranges, then 200 to every Range request
    await page.evaluate((u) => {
      const real = LB_net.curl.fetch.bind(LB_net.curl);
      LB_net.curl.fetch = async (url, o) => { const r = await real(url, o); const h = {}; for (const [k, v] of Object.entries(o.headers || {})) h[k.toLowerCase()] = v; if (h.range && /refuse/.test(url)) { const full = await real(url, { ...o, headers: {} }); return full; } return r; };
    }, O);
    await file(page, '/refuse.bin', { size: SIZE });
    const dl = page.waitForEvent('download');
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/refuse.bin');
    const d = await dl;
    expect(Buffer.compare(fs.readFileSync(await d.path()), expected(SIZE))).toBe(0);
    const it = await page.evaluate((i) => __wait(i, 'done'), id);
    expect(it.status).toBe('done');
    const log = await logOf(page, '/refuse.bin');
    expect(log.length).toBeGreaterThan(2);
    expect(log[log.length - 1].range).toBeNull();
  });

  test('pause and resume keep the bytes of every part intact', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => __member(4));
    await file(page, '/pr.bin', { size: SIZE, delay: 8 });
    const dl = page.waitForEvent('download');
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/pr.bin');
    await page.waitForFunction((i) => (LB_downloads.items().find((x) => x.id === i) || {}).got > 2 * MB, id, { timeout: 20000 }).catch(() => {});
    await page.evaluate((i) => LB_downloads.pause(i), id);
    const mid = await page.evaluate((i) => __wait(i, 'paused'), id);
    expect(mid.status).toBe('paused');
    await page.evaluate((i) => LB_downloads.resume(i), id);
    const d = await dl;
    expect(Buffer.compare(fs.readFileSync(await d.path()), expected(SIZE))).toBe(0);
  });

  test('the plan size limit still stops a big file before any part is started', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => __member(8, { downloadMbPerFile: 10 }));
    await file(page, '/lim.bin', { size: SIZE });
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/lim.bin');
    const it = await page.evaluate((i) => __wait(i, 'refused'), id);
    expect(it.status).toBe('refused');
    expect((await logOf(page, '/lim.bin')).length).toBe(1);
  });
});

test.describe('pages first', () => {
  test('a download starts no request while a page loads, and goes on right after shown', async ({ page }) => {
    await setup(page);
    await file(page, '/pf.bin', { size: 300000 });
    await page.evaluate(() => { __lbPerf.start('https://x.test/'); });
    const dl = page.waitForEvent('download');
    await page.evaluate((u) => LB_downloads.add(u), O + '/pf.bin');
    await page.waitForTimeout(700);
    expect((await logOf(page, '/pf.bin')).length).toBe(0);
    await page.evaluate(() => __lbPerf.mark('shown'));
    await dl;
    expect((await logOf(page, '/pf.bin')).length).toBe(1);
  });

  test('the hold is 10 s at most, and features.pagesFirst=false never holds', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => { __lbPerf.start('https://x.test/'); const a = LB_pagesFirst.until - Date.now(); LB_pagesFirst.end(); LB_features.pagesFirst = false; __lbPerf.start('https://y.test/'); return { a, off: LB_pagesFirst.holding() }; });
    expect(r.a).toBeGreaterThan(9000);
    expect(r.a).toBeLessThanOrEqual(10000);
    expect(r.off).toBe(false);
  });
});

test.describe('download socket class', () => {
  test('with a download session the panel uses it and marks the host for the dl socket, then unmarks', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => __mkDl());
    await file(page, '/c.bin', { size: 600000, delay: 3 });
    const dl = page.waitForEvent('download');
    await page.evaluate((u) => LB_downloads.add(u), O + '/c.bin');
    await dl;
    const log = await logOf(page, '/c.bin');
    expect(log[0].via).toBe('dl');
    expect(log[0].marked).toContain('dl.test:443');
    expect(log[0].marked).toContain('own');
    expect(await page.evaluate(() => LB_router.dl.size)).toBe(0);
  });

  test('a 429 from the relay shows the allowance message', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => __mkDl());
    await file(page, '/q.bin', { size: 1000, throwDl: true });
    const id = await page.evaluate((u) => { window.LB_dlRefusedAt = Date.now(); return LB_downloads.add(u); }, O + '/q.bin');
    const it = await page.evaluate((i) => __wait(i, ['refused', 'error']), id);
    expect(it.status).toBe('refused');
    expect(it.note).toBe('Your download allowance for this month is used up.');
  });

  test('router: a marked host goes to <own>dl/, others stay on the shards; public goes to the best public relay', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const mk = (over = {}) => LB_makeRouter({ ownBase: () => 'wss://app.example/wisp/', ownSockets: () => 4, multiOn: () => false, mode: () => 'site', candidates: () => [], markFailed() {}, publicRoots: () => ['wss://pub.example/wisp/'], Socket: class extends EventTarget { constructor(u) { super(); this.url = u; } close() {} send() {} }, ...over });
      const R = mk();
      const before = R.route('wss://app.example/wisp/files.example:443').url;
      R.dlMark('files.example:443', 'own');
      const own = R.route('wss://app.example/wisp/files.example:443').url, other = R.route('wss://app.example/wisp/other.example:443').url;
      R.dlUnmark('files.example:443');
      const after = R.route('wss://app.example/wisp/files.example:443').url;
      R.dlMark('files.example:443', 'public');
      const pub = R.route('wss://app.example/wisp/files.example:443').url;
      const R2 = mk({ ownBase: () => '' });
      R2.dlMark('files.example:443', 'own');
      const publicRelay = R2.route('wss://pub.example/wisp/files.example:443').url;
      return { before, own, other, after, pub, publicRelay };
    });
    expect(r.before).toMatch(/^wss:\/\/app\.example\/wisp\/[1-4]\/files\.example:443$/);
    expect(r.own).toBe('wss://app.example/wisp/dl/files.example:443');
    expect(r.other).toMatch(/wisp\/[1-4]\/other\.example:443$/);
    expect(r.after).toMatch(/wisp\/[1-4]\/files\.example:443$/);
    expect(r.pub).toBe('wss://pub.example/wisp/files.example:443');
    expect(r.publicRelay).toBe('wss://pub.example/wisp/files.example:443');
  });

  test('relay socket: the dl socket sends the lbk.dl subprotocol, normal sockets do not; a refused dl socket does not fall back', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const made = [];
      class WS extends EventTarget {
        constructor(url, p) { super(); this.url = url; this.protocols = p; this.readyState = 0; made.push(this); }
        send() {} close() { this.readyState = 3; }
        fire(type) { const e = new Event(type); if (type === 'open') this.readyState = 1; if (type === 'close') this.readyState = 3; this.dispatchEvent(e); }
      }
      const st = { refused: 0, up: true };
      const open = LB_makeRelayOpener({ on: () => true, isOwn: (u) => u.startsWith('wss://app.example/wisp/'), isDl: (u) => u.startsWith('wss://app.example/wisp/dl/'), up: () => st.up, onDlRefused: () => st.refused++, now: () => 1, cooldownMs: 1000, WebSocket: WS, token: async () => ({ url: 'wss://relay.example/wisp/', token: 'T' }), markUp() {}, onDown() {} });
      const tick = () => new Promise((r) => setTimeout(r, 0));
      open('wss://app.example/wisp/1/a.test:443'); await tick();
      const dlSock = open('wss://app.example/wisp/dl/a.test:443'); await tick();
      const protos = made.map((m) => m.protocols);
      let errs = 0; dlSock.addEventListener('error', () => errs++);
      made[1].fire('error'); await tick();
      return { protos, urls: made.map((m) => m.url), refused: st.refused, errs, state: dlSock.readyState };
    });
    expect(r.protos).toEqual([['lb.v1', 'lbt.T'], ['lb.v1', 'lbt.T', 'lbk.dl']]);
    expect(r.urls).toEqual(['wss://relay.example/wisp/', 'wss://relay.example/wisp/']);
    expect(r.refused).toBe(1);
    expect(r.errs).toBe(1);
    expect(r.state).toBe(3);
  });
});

test.describe('big files over public relays', () => {
  test('off by default; on, a file over 200 MB restarts on a public-relay session, a smaller one does not', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => { __mkDl(); __member(1); });
    await file(page, '/huge.bin', { size: 250 * MB, delay: 5 });
    await file(page, '/mid.bin', { size: 150 * MB, delay: 5 });
    const off = await page.evaluate((u) => LB_downloads.add(u), O + '/huge.bin');
    await page.waitForFunction(() => __log.length >= 1);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __log.map((x) => x.marked).join('|'))).not.toContain('public');
    await page.evaluate((i) => LB_downloads.cancel(i), off);
    await page.evaluate(() => { __log.length = 0; LB_downloads.ls.setItem('limitless:dlpublic:v1', '1'); });
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/huge.bin');
    await page.waitForFunction(() => __log.some((x) => x.marked.includes('public')));
    await page.evaluate((i) => LB_downloads.cancel(i), id);
    const log = await logOf(page, '/huge.bin');
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log[0].marked).toContain('own');
    expect(log[log.length - 1].marked).toContain('public');
    await page.evaluate(() => { __log.length = 0; });
    const mid = await page.evaluate((u) => LB_downloads.add(u), O + '/mid.bin');
    await page.waitForFunction(() => __log.length >= 1);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __log.map((x) => x.marked).join('|'))).not.toContain('public');
    await page.evaluate((i) => LB_downloads.cancel(i), mid);
  });
});

test('the Settings switch for big downloads is off by default, stores limitless:dlpublic:v1 and shows the privacy note', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const sw = document.getElementById('settingsDlPublicSwitch');
    const card = document.getElementById('settingsDlPublicCard');
    const get = () => LB_downloads.ls.getItem('limitless:dlpublic:v1');
    const before = { stored: get(), on: sw.classList.contains('on') };
    sw.click();
    const after = { stored: get(), on: sw.classList.contains('on') };
    sw.click();
    return { before, after, off: get(), note: card.textContent.replace(/\s+/g, ' ') };
  });
  expect(r.before).toEqual({ stored: null, on: false });
  expect(r.after).toEqual({ stored: '1', on: true });
  expect(r.off).toBe('0');
  expect(r.note).toContain('Send downloads over 200 MB through public relays to save my allowance');
  expect(r.note).toContain('Public relays are run by other people and can see which sites you connect to.');
});
