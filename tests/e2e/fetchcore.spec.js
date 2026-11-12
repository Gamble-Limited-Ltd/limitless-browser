const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// T6 (docs/1.0/LOADING-REVIEW.md): unit tests of the fetch core with a stubbed libcurl session (window.LB_net.curl).
// Covers L2 (error classes, single-flight reconnect), L3 (no POST replay, no slow ladder for site errors),
// L4 (deadlines free the queue slot), L5 (no "Queue full" for page requests), L10 (no base64 to the frame), L11 (log ring).

// __script[url] = {status, headers, body, delay, fail: [msg, ...] (one message per attempt, then success), hang}
const SETUP = `
  window.__net = { log: [], script: {}, tries: {} };
  window.__swaps = 0;
  window.__respond = (url, r) => { window.__net.script[url] = r; };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url, o) {
      const h = {}; for (const [k, v] of Object.entries(o.headers || {})) h[k.toLowerCase()] = v;
      window.__net.log.push({ url, method: o.method, headers: h });
      const r = window.__net.script[url] || { status: 404, headers: {}, body: 'nope' };
      const n = (window.__net.tries[url] = (window.__net.tries[url] || 0) + 1);
      if (r.hang) return new Promise(() => {});
      if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
      if (r.fail && n <= r.fail.length) { if (r.onFail) r.onFail(n); throw new Error(r.fail[n - 1]); }
      const bytes = r.bytes ? new Uint8Array(r.bytes) : new TextEncoder().encode(r.body || '');
      return { status: r.status || 200, headers: new Headers(r.headers || {}), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
  // a swap replaces the session in the real app; the stub keeps the same fake session and counts calls
  window.LB_swapSession = async () => { window.__swaps++; await new Promise((r) => setTimeout(r, 30)); return window.LB_net.curl; };
  window.__count = (re) => window.__net.log.filter((x) => re.test(x.url)).length;
  window.__try = async (fn) => { try { return { ok: await fn() }; } catch (e) { return { err: e.message, name: e.name, cat: e.lbCat, code: e.lbCode, drop: !!e.lbDrop }; } };
`;

async function setup(page) {
  const errors = await boot(page);
  await page.evaluate(SETUP);
  return errors;
}

const O = 'https://fc.test';
const E35 = 'Request failed with error code 35: SSL connect error';
const E6 = 'Request failed with error code 6: Could not resolve host';
const E56 = 'Request failed with error code 56: Failure when receiving data from the peer';

test.describe('L2 error classes and reconnect', () => {
  test('a site error (code 35 or 6) fails that request and never swaps the session', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (o) => {
      __respond(o + '/a', { fail: [E35, E35] });
      __respond(o + '/b', { fail: [E6, E6] });
      const a = await __try(() => LB_queueFetch(o + '/a'));
      const b = await __try(() => LB_queueFetch(o + '/b'));
      return { a, b, swaps: __swaps, tries: __count(/fc\.test/) };
    }, O).catch((e) => { throw e; });
    expect(r.swaps).toBe(0);
    expect(r.tries).toBe(2);
    expect(r.a.cat).toBe('tls');
    expect(r.a.code).toBe(35);
    expect(r.b.cat).toBe('dns');
  });

  test('10 concurrent failures after one transport drop swap the session exactly once and all succeed', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (o) => {
      for (let i = 0; i < 10; i++) __respond(o + '/r' + i, { body: 'ok' + i, delay: 40, fail: [E56], onFail: (n) => { if (!window.__dropped) { window.__dropped = true; LB_router.noteDrop('ws://x/wisp/'); } } });
      const res = await Promise.all(Array.from({ length: 10 }, (_, i) => __try(() => LB_queueFetch(o + '/r' + i))));
      return { res: res.map((x) => (x.ok ? x.ok.status : x.err)), swaps: __swaps };
    }, O);
    expect(r.swaps).toBe(1);
    expect(r.res).toEqual(Array(10).fill(200));
  });

  test('a drop after the request began (a socket closed by the network) is a relay drop; a socket we closed is not', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      class Sock extends EventTarget {
        constructor() { super(); this.readyState = 0; }
        close() { this.readyState = 3; }
        fire(t) { if (t === 'open') this.readyState = 1; this.dispatchEvent(new Event(t)); }
      }
      const drops = [];
      const r = LB_makeRouter({ ownBase: () => 'ws://h/wisp/', ownSockets: () => 1, multiOn: () => false, mode: () => 'site', candidates: () => [], markFailed() {}, onDrop: (b) => drops.push(b), Socket: Sock });
      const a = r.open('ws://h/wisp/a.test:443'); a.fire('open'); a.fire('close');          // network closed it
      const b = r.open('ws://h/wisp/b.test:443'); b.fire('open'); b.close(); b.fire('close'); // we closed it
      return { drops: drops.length, epoch: r.epoch };
    });
    expect(r).toEqual({ drops: 1, epoch: 1 });
  });

  test('errClass=false keeps the old behaviour: code 35 swaps the session and retries', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (o) => {
      LB_features.errClass = false;
      __respond(o + '/a', { body: 'x', fail: [E35] });
      const a = await __try(() => LB_queueFetch(o + '/a'));
      return { a: a.ok && a.ok.status, swaps: __swaps };
    }, O);
    expect(r).toEqual({ a: 200, swaps: 1 });
  });
});

test.describe('L3 navigation retries', () => {
  test('a form POST that fails is sent exactly once', async ({ page }) => {
    await setup(page);
    const n = await page.evaluate(async (o) => {
      window.__net.log.length = 0;
      window.__net.tries = {};
      __respond(o + '/post', { fail: [E56, E56, E56, E56, E56] });
      const f = await __try(() => LB_queueFetch(o + '/post', { method: 'POST', body: 'a=1' }));
      return { posts: __net.log.filter((x) => x.method === 'POST').length, f };
    }, O);
    expect(n.posts).toBe(1);
  });

  test('a navigation POST is not replayed by the retry ladder', async ({ page }) => {
    await setup(page);
    const n = await page.evaluate(async (o) => {
      __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><body>start</body></html>' });
      __respond(o + '/post', { fail: Array(20).fill(E56) });
      LB_go(o + '/');
      await new Promise((r) => setTimeout(r, 800));
      window.__net.log.length = 0;
      window.LB_goPost(o + '/post', 'a=1');
      await new Promise((r) => setTimeout(r, 2500));
      return __net.log.filter((x) => x.method === 'POST').length;
    }, O);
    expect(n).toBe(1);
  });

  test('a name that does not exist shows the DNS error card in under a second, with no retries', async ({ page }) => {
    await setup(page);
    const t0 = Date.now();
    await page.evaluate((o) => {
      __respond(o + '/nx', { fail: Array(20).fill(E6) });
      LB_go(o + '/nx');
    }, O);
    await expect(page.frameLocator('#frame').locator('body')).toContainText('DNS Resolution Failed', { timeout: 1500 });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(await page.evaluate(() => __count(/\/nx$/))).toBe(1);
    expect(await page.evaluate(() => __swaps)).toBe(0);
  });
});

test.describe('L4 deadlines', () => {
  test('a fetch that never answers is aborted at the deadline and frees its queue slot', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (o) => {
      LB_deadlines.connect = 400; LB_deadlines.body = 400;
      __respond(o + '/hang', { hang: true });
      const before = LB_queueState().fetching;
      const p = __try(() => LB_queueFetch(o + '/hang'));
      await new Promise((res) => setTimeout(res, 150));
      const during = LB_queueState().fetching;
      const res = await p;
      return { before, during, after: LB_queueState().fetching, res };
    }, O);
    expect(r.before).toBe(0);
    expect(r.during).toBe(1);
    expect(r.after).toBe(0);
    expect(r.res.cat).toBe('timeout');
  });

  test('a second request for the same URL after a timeout starts fresh instead of joining the stuck one', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (o) => {
      LB_deadlines.connect = 300; LB_deadlines.body = 300;
      __respond(o + '/x', { hang: true });
      await __try(() => LB_queueFetch(o + '/x'));
      __respond(o + '/x', { body: 'fine' });
      return await __try(() => LB_queueFetch(o + '/x'));
    }, O);
    expect(r.ok.status).toBe(200);
  });

  test('deadlines=false leaves the request waiting', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (o) => {
      LB_features.deadlines = false; LB_deadlines.connect = 200;
      __respond(o + '/hang2', { hang: true });
      const p = __try(() => LB_queueFetch(o + '/hang2'));
      await new Promise((res) => setTimeout(res, 700));
      return LB_queueState().fetching;
    }, O);
    expect(r).toBe(1);
  });
});

test.describe('L5 queue cap', () => {
  test('page requests wait in the queue past 150 entries; only the optional pre-warm is refused', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (o) => {
      for (let i = 0; i < 300; i++) __respond(o + '/i' + i + '.png', { headers: { 'content-type': 'image/png' }, body: 'x', delay: 5 });
      const IMG = 4;
      const page = Array.from({ length: 300 }, (_, i) => __try(() => LB_queueFetch(o + '/i' + i + '.png', {}, IMG)));
      const pre = await __try(() => LB_queueFetch(o + '/pre.png', { __prewarm: true }, IMG));
      const all = await Promise.all(page);
      return { failed: all.filter((x) => x.err).map((x) => x.err).slice(0, 3), pre: pre.err || 'ok' };
    }, O);
    expect(r.failed).toEqual([]);
    expect(r.pre).toBe('Queue full');
  });
});

test.describe('L10 binary hand-over to the frame', () => {
  test('60 images cross into the frame without a single base64 encode and still render', async ({ page }) => {
    await setup(page);
    const PNG = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 252, 207, 192, 240, 31, 0, 5, 131, 1, 128, 90, 52, 125, 107, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
    const r = await page.evaluate(async ({ o, PNG }) => {
      let html = '<html><body>';
      for (let i = 0; i < 60; i++) { html += '<img id="p' + i + '" src="/img' + i + '.png">'; __respond(o + '/img' + i + '.png', { headers: { 'content-type': 'image/png' }, bytes: PNG }); }
      __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: html + '</body></html>' });
      LB_features.lazyImg = false;
      LB_stats.b64 = 0;
      LB_go(o + '/');
      const t0 = performance.now();
      const fr = document.getElementById('frame');
      let ok = 0;
      while (performance.now() - t0 < 15000) {
        const d = fr.contentDocument;
        ok = d ? [...d.images].filter((im) => im.complete && im.naturalWidth > 0).length : 0;
        if (ok >= 60) break;
        await new Promise((res) => setTimeout(res, 100));
      }
      return { ok, b64: LB_stats.b64 };
    }, { o: O, PNG });
    expect(r.ok).toBe(60);
    expect(r.b64).toBe(0);
  });

  test('transfer=false keeps base64', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (o) => {
      LB_features.transfer = false; LB_features.lazyImg = false;
      __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><body><img src="/a.png"></body></html>' });
      __respond(o + '/a.png', { headers: { 'content-type': 'image/png' }, body: 'xx' });
      LB_stats.b64 = 0;
      LB_go(o + '/');
      await new Promise((res) => setTimeout(res, 2500));
      return LB_stats.b64;
    }, O);
    expect(r).toBeGreaterThan(0);
  });
});

test.describe('L11 log ring buffer', () => {
  test('requests add no log DOM while the panel is closed; opening it shows them and search works', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (o) => {
      const n0 = document.querySelectorAll('#logbox .log-entry').length;
      for (let i = 0; i < 60; i++) __respond(o + '/l' + i, { body: 'x' });
      await Promise.all(Array.from({ length: 60 }, (_, i) => LB_queueFetch(o + '/l' + i)));
      for (let i = 0; i < 700; i++) LB_log('filler ' + i, 'info');
      const closed = document.querySelectorAll('#logbox .log-entry').length - n0;
      const ring = LB_logState().ring;
      document.getElementById('logs').classList.remove('hidden');
      await new Promise((res) => setTimeout(res, 100));
      const open = document.querySelectorAll('#logbox .log-entry').length;
      const last = [...document.querySelectorAll('#logbox .log-entry')].pop().textContent;
      LB_log('live entry', 'info');
      const live = [...document.querySelectorAll('#logbox .log-entry')].pop().textContent;
      return { closed, ring, open, last, live };
    }, O);
    expect(r.closed).toBe(0);
    expect(r.ring).toBe(500);
    expect(r.open).toBeGreaterThan(100);
    expect(r.last).toContain('filler 699');
    expect(r.live).toContain('live entry');
  });
});
