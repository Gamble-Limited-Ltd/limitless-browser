const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// F4: the on-device response cache. The network is a stub on the libcurl session (window.LB_net.curl), so these
// run without a relay: every request the app makes goes through queueFetch -> doFetch -> curl.fetch(stub).

const SETUP = `
  window.__net = { log: [], script: {} };
  // script[url] = array of responders {status, headers, body}; the last one repeats.
  window.__respond = (url, list) => { window.__net.script[url] = Array.isArray(list) ? list : [list]; };
  window.LB_net.curl = {
    active_requests: 0,
    close() {},
    set_connections() {},
    async fetch(url, o) {
      const log = window.__net.log;
      const h = {}; for (const [k, v] of Object.entries(o.headers || {})) h[k.toLowerCase()] = v;
      log.push({ url, headers: h, method: o.method });
      const list = window.__net.script[url] || [{ status: 404, headers: {}, body: 'nope' }];
      const n = log.filter((x) => x.url === url).length - 1;
      const r = typeof list[Math.min(n, list.length - 1)] === 'function' ? list[Math.min(n, list.length - 1)](h) : list[Math.min(n, list.length - 1)];
      // not a Response: its guard would drop Set-Cookie, which libcurl.js's own response keeps
      const bytes = new TextEncoder().encode(r.status === 304 ? '' : r.body);
      return { status: r.status, headers: new Headers(r.headers), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
  window.__count = (url) => window.__net.log.filter((x) => x.url === url).length;
  window.__get = async (url, opts) => { const r = await window.LB_queueFetch(url, opts || {}); return { status: r.status, text: new TextDecoder().decode(r.buf), fromCache: !!r.fromCache, revalidated: !!r.revalidated, mime: r.mime }; };
  window.__clock = 0;
  window.LB_cache.now = () => Date.now() + window.__clock;
`;

async function setup(page, init) {
  const errors = await boot(page, init ? { init } : {});
  await page.evaluate(SETUP);
  await page.evaluate(() => window.LB_cache.clearAll());
  return errors;
}

const CSS = { 'content-type': 'text/css' };
const U = 'https://cache.test/';

test.describe('freshness', () => {
  test('max-age: the second request is served from the cache, also after the memory layer is dropped', async ({ page }) => {
    const errors = await setup(page);
    const r = await page.evaluate(async (u) => {
      __respond(u + 'a.css', { status: 200, headers: { 'content-type': 'text/css', 'cache-control': 'max-age=3600' }, body: 'body{}' });
      const a = await __get(u + 'a.css');
      const b = await __get(u + 'a.css');
      LB_cache.dropMemory();
      const c = await __get(u + 'a.css');
      return { a, b, c, n: __count(u + 'a.css') };
    }, U);
    expect(r.a.fromCache).toBe(false);
    expect(r.b.fromCache).toBe(true);
    expect(r.c.fromCache).toBe(true);
    expect(r.c.text).toBe('body{}');
    expect(r.n).toBe(1);
    expect(errors).toEqual([]);
  });

  test('never stored: no-store, private, Set-Cookie, Vary other than Accept-Encoding', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      const base = { 'content-type': 'text/css', 'cache-control': 'max-age=3600' };
      const cases = {
        nostore: { ...base, 'cache-control': 'no-store' },
        priv: { ...base, 'cache-control': 'private, max-age=3600' },
        cookie: { ...base, 'set-cookie': 'a=b' },
        varyc: { ...base, vary: 'Cookie' },
        varystar: { ...base, vary: '*' },
        varyok: { ...base, vary: 'Accept-Encoding' },
      };
      const out = {};
      for (const [k, h] of Object.entries(cases)) {
        __respond(u + k + '.css', { status: 200, headers: h, body: 'x' });
        await __get(u + k + '.css'); await __get(u + k + '.css');
        out[k] = __count(u + k + '.css');
      }
      return out;
    }, U);
    expect(r).toEqual({ nostore: 2, priv: 2, cookie: 2, varyc: 2, varystar: 2, varyok: 1 });
  });

  test('HTML is stored only with explicit freshness; no-cache HTML needs a validator', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      const html = { 'content-type': 'text/html' };
      __respond(u + 'plain.html', { status: 200, headers: { ...html, 'last-modified': new Date(Date.now() - 864e5 * 30).toUTCString() }, body: '<p>1</p>' });
      __respond(u + 'fresh.html', { status: 200, headers: { ...html, 'cache-control': 'max-age=60' }, body: '<p>2</p>' });
      __respond(u + 'nocache.html', { status: 200, headers: { ...html, 'cache-control': 'no-cache' }, body: '<p>3</p>' });
      for (const f of ['plain', 'fresh', 'nocache']) { await __get(u + f + '.html'); await __get(u + f + '.html'); }
      return { plain: __count(u + 'plain.html'), fresh: __count(u + 'fresh.html'), nocache: __count(u + 'nocache.html') };
    }, U);
    expect(r).toEqual({ plain: 2, fresh: 1, nocache: 2 });
  });

  test('heuristics: static assets get 24 h, others need Last-Modified (10 %, at most 24 h)', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      __respond(u + 'bare.css', { status: 200, headers: CSSH(), body: 'c' });
      function CSSH() { return { 'content-type': 'text/css' }; }
      __respond(u + 'bare.json', { status: 200, headers: { 'content-type': 'application/json' }, body: '{}' });
      __respond(u + 'old.json', { status: 200, headers: { 'content-type': 'application/json', 'last-modified': new Date(Date.now() - 864e5 * 10).toUTCString() }, body: '{}' });
      for (const f of ['bare.css', 'bare.json', 'old.json']) { await __get(u + f); await __get(u + f); }
      const counts = { css: __count(u + 'bare.css'), json: __count(u + 'bare.json'), old: __count(u + 'old.json') };
      // 10 days old -> 10 % = 1 day (the cap): fresh at +23 h, stale at +25 h
      __clock = 23 * 3600e3; await __get(u + 'old.json'); const at23 = __count(u + 'old.json');
      __clock = 25 * 3600e3; await __get(u + 'old.json'); const at25 = __count(u + 'old.json');
      return { counts, at23, at25 };
    }, U);
    expect(r.counts).toEqual({ css: 1, json: 2, old: 1 });
    expect(r.at23).toBe(1);
    expect(r.at25).toBe(2);
  });

  test('Expires is used when there is no max-age, and max-age wins over Expires', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      const inAnHour = new Date(Date.now() + 3600e3).toUTCString();
      __respond(u + 'exp.css', { status: 200, headers: { 'content-type': 'text/css', expires: inAnHour }, body: 'a' });
      __respond(u + 'both.css', { status: 200, headers: { 'content-type': 'text/css', expires: inAnHour, 'cache-control': 'max-age=0' }, body: 'b' });
      await __get(u + 'exp.css'); await __get(u + 'exp.css');
      await __get(u + 'both.css'); await __get(u + 'both.css');
      return { exp: __count(u + 'exp.css'), both: __count(u + 'both.css') };
    }, U);
    expect(r).toEqual({ exp: 1, both: 2 });
  });
});

test.describe('revalidation', () => {
  test('stale with an ETag: conditional request, 304 serves the stored body', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      const url = u + 'etag.css';
      __respond(url, [
        { status: 200, headers: { 'content-type': 'text/css', 'cache-control': 'max-age=1', etag: '"v1"' }, body: 'one' },
        { status: 304, headers: { 'cache-control': 'max-age=1', etag: '"v1"' } },
      ]);
      const a = await __get(url);
      __clock = 5000;
      const b = await __get(url);
      const second = __net.log[1].headers;
      return { a, b, second: { inm: second['if-none-match'], ims: second['if-modified-since'] }, n: __count(url) };
    }, U);
    expect(r.a.text).toBe('one');
    expect(r.b.status).toBe(200);
    expect(r.b.text).toBe('one');
    expect(r.b.revalidated).toBe(true);
    expect(r.second.inm).toBe('"v1"');
    expect(r.n).toBe(2);
  });

  test('a 304 refreshes freshness: the next request inside the new lifetime is a hit', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      const url = u + 'refresh.css';
      __respond(url, [
        { status: 200, headers: { 'content-type': 'text/css', 'cache-control': 'max-age=10', etag: '"v1"' }, body: 'one' },
        { status: 304, headers: { 'cache-control': 'max-age=1000', etag: '"v1"' } },
      ]);
      await __get(url);
      __clock = 20000; await __get(url); // revalidated, new lifetime 1000 s
      __clock = 60000; await __get(url); // still fresh
      return __count(url);
    }, U);
    expect(r).toBe(2);
  });

  test('stale and changed: the 200 replaces the stored copy', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      const url = u + 'changed.css';
      __respond(url, [
        { status: 200, headers: { 'content-type': 'text/css', 'cache-control': 'max-age=1', etag: '"v1"' }, body: 'one' },
        { status: 200, headers: { 'content-type': 'text/css', 'cache-control': 'max-age=1000', etag: '"v2"' }, body: 'two' },
      ]);
      await __get(url);
      __clock = 5000;
      const b = await __get(url);
      const c = await __get(url);
      return { b, c, n: __count(url) };
    }, U);
    expect(r.b.text).toBe('two');
    expect(r.b.revalidated).toBe(false);
    expect(r.c.text).toBe('two');
    expect(r.c.fromCache).toBe(true);
    expect(r.n).toBe(2);
  });

  test('Last-Modified only: If-Modified-Since is sent', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      const url = u + 'lm.css';
      const lm = new Date(Date.now() - 864e5).toUTCString();
      __respond(url, [
        { status: 200, headers: { 'content-type': 'text/css', 'cache-control': 'max-age=1', 'last-modified': lm }, body: 'lm' },
        { status: 304, headers: {} },
      ]);
      await __get(url);
      __clock = 5000;
      const b = await __get(url);
      return { lm, ims: __net.log[1].headers['if-modified-since'], b };
    }, U);
    expect(r.ims).toBe(r.lm);
    expect(r.b.text).toBe('lm');
  });

  test('no-cache HTML with an ETag is revalidated every time', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      const url = u + 'nc.html';
      __respond(url, [
        { status: 200, headers: { 'content-type': 'text/html', 'cache-control': 'no-cache', etag: '"h"' }, body: '<p>doc</p>' },
        { status: 304, headers: { 'cache-control': 'no-cache', etag: '"h"' } },
      ]);
      const a = await __get(url); const b = await __get(url); const c = await __get(url);
      return { a, b, c, n: __count(url), inm: __net.log[2].headers['if-none-match'] };
    }, U);
    expect(r.b.text).toBe('<p>doc</p>');
    expect(r.c.text).toBe('<p>doc</p>');
    expect(r.n).toBe(3);
    expect(r.inm).toBe('"h"');
  });

  test('requests that carry their own Range or conditional headers bypass the cache', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      const url = u + 'range.css';
      __respond(url, { status: 200, headers: { 'content-type': 'text/css', 'cache-control': 'max-age=3600' }, body: 'r' });
      await __get(url);
      await __get(url, { headers: { Range: 'bytes=0-0' } });
      await __get(url, { headers: { 'If-None-Match': '"x"' } });
      return __count(url);
    }, U);
    expect(r).toBe(3);
  });
});

test.describe('switches', () => {
  test('the Privacy switch turns reading and writing off, and the kill switch does the same', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      const key = window._sessionInstId + ':limitless:cache:resp:v1';
      __respond(u + 'sw.css', { status: 200, headers: { 'content-type': 'text/css', 'cache-control': 'max-age=3600' }, body: 's' });
      await __get(u + 'sw.css'); // stored
      document.getElementById('settingsCacheSwitch').click(); // off
      const stored = localStorage.getItem(key);
      await __get(u + 'sw.css'); await __get(u + 'sw.css'); // bypass read
      const offCount = __count(u + 'sw.css');
      const entries = await LB_cache.count();
      document.getElementById('settingsCacheSwitch').click(); // on again
      await __get(u + 'sw.css'); // old entry is still valid
      const onCount = __count(u + 'sw.css');
      LB_features.respCache = false; // kill switch
      await __get(u + 'sw.css');
      return { stored, offCount, entries, onCount, killCount: __count(u + 'sw.css') };
    }, U);
    expect(r.stored).toBe('0');
    expect(r.offCount).toBe(3); // 1 + two bypassed
    expect(r.entries).toBe(1); // nothing was written while off, the old entry stays
    expect(r.onCount).toBe(3); // served from cache
    expect(r.killCount).toBe(4);
  });

  test('the switch defaults to on and Clear Cache empties both layers', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async (u) => {
      const on = document.getElementById('settingsCacheSwitch').classList.contains('on');
      __respond(u + 'clr.css', { status: 200, headers: { 'content-type': 'text/css', 'cache-control': 'max-age=3600' }, body: 'c' });
      await __get(u + 'clr.css');
      const before = await LB_cache.count();
      document.getElementById('settingsClearCache').click();
      for (let i = 0; i < 40 && (await LB_cache.count()) > 0; i++) await new Promise((r) => setTimeout(r, 50));
      await __get(u + 'clr.css');
      return { on, before, after: __count(u + 'clr.css') };
    }, U);
    expect(r.on).toBe(true);
    expect(r.before).toBe(1);
    expect(r.after).toBe(2);
  });
});

test.describe('size and eviction', () => {
  test('the cap is 200 MB', async ({ page }) => {
    await setup(page);
    expect(await page.evaluate(() => LB_cache.max())).toBe(200 * 1024 * 1024);
  });

  test('evicts the least recently used entries first (by last access, not by URL)', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async () => {
      const T = 1e12;
      LB_cache.setMax(450);
      const put = async (name, t) => { LB_cache.now = () => T + t; await LB_cache.put('https://e.test/' + name, new Uint8Array(100).buffer, { mime: 'text/css', headers: {}, freshMs: 1e9 }); };
      await put('a', 0); await put('b', 60e3); await put('c', 120e3);
      // touch a well after it was stored: it becomes the most recently used
      LB_cache.now = () => T + 3600e3; await LB_cache.get('https://e.test/a');
      await put('d', 3700e3); // 400 B: fits
      await put('e', 3800e3); // 500 B > 450: evicts the least recently used (b) until it fits under 90 % of the cap
      const left = [];
      for (const n of ['a', 'b', 'c', 'd', 'e']) if (await LB_cache.has('https://e.test/' + n)) left.push(n);
      return { left, size: LB_cache.size() };
    });
    expect(r.left).toEqual(['a', 'c', 'd', 'e']); // b was the least recently used; a was touched, so it survives
    expect(r.size).toBeLessThanOrEqual(450);
  });
});
