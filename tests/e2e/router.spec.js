const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// F2 + F3: transport router (own relay shards, multi-relay modes) and LB_swapSession.
// The router is a pure object built by window.LB_makeRouter(deps); the tests drive it with a stub Socket.

const PORT = process.env.LB_E2E_PORT || '8599';
const OWN = `ws://127.0.0.1:${PORT}/wisp/`;
const A = 'wss://relay-a.example/wisp/';
const B = 'wss://relay-b.example/wisp/';
const C = 'wss://relay-c.example/wisp/';

// Runs in the page: a stub socket class and a router factory with overridable deps.
const SETUP = `
  window.__mk = (over = {}) => {
    const made = [];
    class Sock extends EventTarget {
      constructor(url, p) { super(); this.url = url; this.sent = []; this.closed = false; this.readyState = 0; this.binaryType = 'blob'; made.push(this); }
      send(d) { this.sent.push(d); }
      close() { this.closed = true; this.readyState = 3; }
      fire(type, init) { const e = type === 'message' ? new MessageEvent('message', { data: init }) : new Event(type); if (type === 'open') this.readyState = 1; if (type === 'close') this.readyState = 3; this.dispatchEvent(e); }
    }
    const st = { ownSockets: 4, multi: false, mode: 'site', cands: [], failed: [] };
    const deps = {
      ownBase: () => 'ws://' + location.host + '/wisp/',
      ownSockets: () => st.ownSockets,
      multiOn: () => st.multi,
      mode: () => st.mode,
      candidates: () => st.cands,
      markFailed: (b, h) => st.failed.push([b, h]),
      Socket: Sock,
      ...over,
    };
    const r = window.LB_makeRouter(deps);
    return { r, st, made };
  };
`;

async function setup(page, init, opts = {}) {
  const errors = await boot(page, { ...(init ? { init } : {}), ...opts });
  await page.evaluate(SETUP);
  return errors;
}

test.describe('own relay shards', () => {
  test('the real router sends default connections to /wisp/1/ to /wisp/4/ and nothing else', async ({ page }) => {
    const errors = await setup(page);
    const urls = await page.evaluate(() => {
      const out = [];
      for (let i = 0; i < 40; i++) { const o = window.LB_router.route('ws://' + location.host + '/wisp/example.com:443'); out.push(o.url); }
      return out;
    });
    for (const u of urls) expect(u).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/wisp\/[1-4]\/example\.com:443$/);
    expect(errors).toEqual([]);
  });

  test('open streams spread evenly and the least busy shard wins', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      const { r, made } = window.__mk();
      for (let i = 0; i < 8; i++) r.open('ws://' + location.host + '/wisp/h' + i + '.test:443');
      const count = {};
      for (const s of made) { const n = /wisp\/(\d)\//.exec(s.url)[1]; count[n] = (count[n] || 0) + 1; }
      // free every stream of shard 3, then the next open must land there
      for (const s of made.filter((s) => s.url.includes('/wisp/3/'))) s.fire('close');
      r.open('ws://' + location.host + '/wisp/next.test:443');
      return { count, next: made[made.length - 1].url };
    });
    expect(r.count).toEqual({ 1: 2, 2: 2, 3: 2, 4: 2 });
    expect(r.next).toContain('/wisp/3/next.test:443');
  });

  test('the sockets setting limits the shards; 1 keeps the plain /wisp/ path', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      const out = {};
      for (const n of [1, 2, 3]) {
        const { r, st } = window.__mk(); st.ownSockets = n;
        const set = new Set();
        for (let i = 0; i < 12; i++) set.add(r.route('ws://' + location.host + '/wisp/a.test:443').url);
        out[n] = [...set].sort();
      }
      return out;
    });
    expect(r[1]).toEqual([`ws://127.0.0.1:${PORT}/wisp/a.test:443`]);
    expect(r[2].length).toBe(2);
    expect(r[2].every((u) => /\/wisp\/[12]\//.test(u))).toBe(true);
    expect(r[3].every((u) => /\/wisp\/[123]\//.test(u))).toBe(true);
  });

  test('the Connection setting stores 1 to 4 and drives the real router', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => { for (let i = 0; i < 6; i++) document.getElementById('settingsSocketsMinus').click(); });
    expect(await page.evaluate(() => document.getElementById('settingsSocketsVal').textContent)).toBe('1');
    expect(await page.evaluate(() => window.LB_router.route('ws://' + location.host + '/wisp/a.test:443').url)).toBe(`ws://127.0.0.1:${PORT}/wisp/a.test:443`);
    await page.evaluate(() => { for (let i = 0; i < 9; i++) document.getElementById('settingsSocketsPlus').click(); });
    expect(await page.evaluate(() => document.getElementById('settingsSocketsVal').textContent)).toBe('4');
    expect(await page.evaluate(() => localStorage.getItem(window._sessionInstId + ':limitless:ownsockets:v1'))).toBe('4');
  });

  test('the ownSockets kill switch from version.json turns sharding off', async ({ page }) => {
    await page.route('**/version.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: '0.2.0', sha: 'zzzzzzz', features: { ownSockets: 0, worker: false, respCache: false } }) }));
    await setup(page);
    await page.evaluate(() => window.LB_featuresReady);
    const f = await page.evaluate(() => ({ ...window.LB_features }));
    expect(f).toEqual({ ownSockets: 1, worker: false, respCache: false });
    expect(await page.evaluate(() => window.LB_router.route('ws://' + location.host + '/wisp/a.test:443').url)).toBe(`ws://127.0.0.1:${PORT}/wisp/a.test:443`);
  });

  test('a missing version.json keeps the defaults', async ({ page }) => {
    await page.route('**/version.json*', (r) => r.fulfill({ status: 404, body: 'no' }));
    await setup(page);
    await page.evaluate(() => window.LB_featuresReady);
    expect(await page.evaluate(() => ({ ...window.LB_features }))).toEqual({ ownSockets: 4, worker: true, respCache: true });
  });
});

test.describe('multi-relay', () => {
  test('off: a third-party base passes through untouched', async ({ page }) => {
    await setup(page);
    const url = await page.evaluate(([a]) => { const { r } = window.__mk(); return r.route(a + 'x.test:443').url; }, [A]);
    expect(url).toBe(A + 'x.test:443');
  });

  test('per site: a host keeps its relay, a failure moves it on', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(([a, b, c]) => {
      const { r, st, made } = window.__mk();
      st.multi = true; st.mode = 'site'; st.cands = [a, b, c];
      const u = (h) => r.route('ws://' + location.host + '/wisp/' + h + ':443').url;
      const first = [u('one.test'), u('one.test'), u('one.test')];
      const other = u('two.test');
      st.cands = [b, c]; // a became unhealthy
      r.markFailed(a, 'one.test');
      const after = u('one.test');
      return { first, other, after, failed: st.failed };
    }, [A, B, C]);
    expect(r.first).toEqual([A + 'one.test:443', A + 'one.test:443', A + 'one.test:443']);
    expect(r.other).toBe(A + 'two.test:443');
    expect(r.after).toBe(B + 'one.test:443');
    expect(r.failed).toEqual([[A, 'one.test']]);
  });

  test('spread: round robin over the healthy relays', async ({ page }) => {
    await setup(page);
    const urls = await page.evaluate(([a, b]) => {
      const { r, st } = window.__mk();
      st.multi = true; st.mode = 'spread'; st.cands = [a, b];
      return [0, 1, 2, 3, 4].map(() => r.route('ws://' + location.host + '/wisp/s.test:443').url);
    }, [A, B]);
    expect(urls).toEqual([A, B, A, B, A].map((x) => x + 's.test:443'));
  });

  test('spread over our own relay still uses the shards', async ({ page }) => {
    await setup(page);
    const urls = await page.evaluate(([own, a]) => {
      const { r, st } = window.__mk();
      st.multi = true; st.mode = 'spread'; st.cands = [own, a];
      return [0, 1, 2, 3].map(() => r.route('ws://' + location.host + '/wisp/s.test:443').url);
    }, [OWN, A]);
    expect(urls[0]).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/wisp\/[1-4]\/s\.test:443$/);
    expect(urls[1]).toBe(A + 's.test:443');
  });

  test('race: opens on the top two, duplicates sends until the first data, commits and remembers', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(([a, b]) => {
      const { r, st, made } = window.__mk();
      st.multi = true; st.mode = 'race'; st.cands = [a, b, 'wss://third.example/wisp/'];
      const events = [];
      const ws = r.open('ws://' + location.host + '/wisp/race.test:443');
      ws.onopen = () => events.push('open');
      ws.onmessage = (e) => events.push('msg:' + e.data);
      const urls = made.map((s) => s.url);
      made[1].fire('open'); // B answers the handshake first
      ws.send('hello');
      made[0].fire('open'); // A opens later: gets the buffered bytes replayed
      const aGot = made[0].sent.slice();
      made[1].fire('message', 'first-from-B'); // commit to B
      made[0].fire('message', 'late-from-A');
      ws.send('after');
      const out = {
        urls, events, aGot, bSent: made[1].sent.slice(), aSent: made[0].sent.slice(), aClosed: made[0].closed, bClosed: made[1].closed,
      };
      // remembered: same host now opens one plain socket on B
      const before = made.length;
      r.open('ws://' + location.host + '/wisp/race.test:443');
      out.reopen = made.slice(before).map((s) => s.url);
      return out;
    }, [A, B]);
    expect(r.urls).toEqual([A + 'race.test:443', B + 'race.test:443']);
    expect(r.events).toEqual(['open', 'msg:first-from-B']);
    expect(r.aGot).toEqual(['hello']);
    expect(r.bSent).toEqual(['hello', 'after']);
    expect(r.aSent).toEqual(['hello']);
    expect(r.aClosed).toBe(true);
    expect(r.bClosed).toBe(false);
    expect(r.reopen).toEqual([B + 'race.test:443']);
  });

  test('race: not used for plain (non-443) ports, and a failed racer falls back to the other', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(([a, b]) => {
      const { r, st, made } = window.__mk();
      st.multi = true; st.mode = 'race'; st.cands = [a, b];
      r.open('ws://' + location.host + '/wisp/plain.test:80');
      const plain = made.length;
      const ws = r.open('ws://' + location.host + '/wisp/fail.test:443');
      const ev = [];
      ws.onopen = () => ev.push('open'); ws.onclose = () => ev.push('close'); ws.onerror = () => ev.push('error');
      made[plain].fire('error'); // A fails before opening
      made[plain].fire('close');
      made[plain + 1].fire('open');
      return { plain, ev, failed: st.failed, rs: ws.readyState };
    }, [A, B]);
    expect(r.plain).toBe(1);
    expect(r.ev).toEqual(['open']);
    expect(r.failed).toEqual([[A, 'fail.test']]);
    expect(r.rs).toBe(1);
  });
});

test.describe('multi-relay setting', () => {
  test('is locked while "Allow third-party relays" is off', async ({ page }) => {
    await setup(page);
    const s = await page.evaluate(() => {
      const sw = document.getElementById('settingsMultiRelaySwitch');
      const mode = document.getElementById('settingsMultiRelayMode');
      sw.click();
      return {
        locked: sw.classList.contains('disabled') || sw.getAttribute('aria-disabled') === 'true',
        modeDisabled: mode.disabled,
        stored: localStorage.getItem(window._sessionInstId + ':limitless:multirelay:v1'),
        router: window.LB_router.multiActive(),
        note: document.getElementById('settingsMultiRelayNote').textContent,
      };
    });
    expect(s.locked).toBe(true);
    expect(s.modeDisabled).toBe(true);
    expect(s.stored).toBeNull();
    expect(s.router).toBe(false);
    expect(s.note).toMatch(/Allow third-party relays/);
  });

  test('unlocked once third-party relays are allowed; the switch and mode are stored', async ({ page }) => {
    test.setTimeout(90000);
    // Third-party relays on: boot first benchmarks the real relay pool (capped at 25 s), so the tour shows late.
    await setup(page, () => { try { localStorage.setItem('limitless:inst:v1', 'gi_t'); localStorage.setItem('gi_t:limitless:relay-fallback:v1', '1'); } catch (_) {} }, { tourTimeout: 35000 });
    const s = await page.evaluate(() => {
      const sw = document.getElementById('settingsMultiRelaySwitch');
      const mode = document.getElementById('settingsMultiRelayMode');
      const wasLocked = sw.classList.contains('disabled');
      sw.click();
      mode.value = 'spread'; mode.dispatchEvent(new Event('change'));
      const k = (n) => localStorage.getItem('gi_t:limitless:' + n);
      return { wasLocked, on: k('multirelay:v1'), mode: k('multirelay-mode:v1'), active: window.LB_router.multiActive(), copy: document.getElementById('settingsMultiRelayNote').textContent };
    });
    expect(s.wasLocked).toBe(false);
    expect(s.on).toBe('1');
    expect(s.mode).toBe('spread');
    expect(s.active).toBe(true);
    expect(s.copy).toMatch(/other operators/i);
    expect(s.copy).toMatch(/see which sites you visit/i);
    expect(s.copy).toMatch(/sign you out|bot check/i);
  });
});

test.describe('session swap', () => {
  test('LB_swapSession installs a new session and closes the old one once it is idle', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async () => {
      await libcurl.load_wasm();
      const closed = [];
      const proto = libcurl.HTTPSession.prototype;
      const orig = proto.close;
      proto.close = function () { closed.push(this); return orig.apply(this, arguments); };
      const old = window.LB_net.curl;
      const next = await window.LB_swapSession('ws://' + location.host + '/wisp/');
      const swapped = window.LB_net.curl === next && next !== old;
      for (let i = 0; i < 40 && !closed.length; i++) await new Promise((r) => setTimeout(r, 50));
      return { swapped, oldClosed: closed.includes(old), newClosed: closed.includes(next), n: closed.length };
    });
    expect(r.swapped).toBe(true);
    expect(r.oldClosed).toBe(true);
    expect(r.newClosed).toBe(false);
  });
});
