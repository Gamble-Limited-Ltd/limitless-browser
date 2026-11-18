const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// SPEED 4.7: host-suffix blocklist matcher (Set, O(labels)), allowlist and custom filters still work.

test.describe('blocklist', () => {
  test.beforeEach(async ({ page }) => { await boot(page); });

  test('subdomain blocked, look-alike and path mention not blocked', async ({ page }) => {
    const r = await page.evaluate(() => {
      LB_blocklist.setList(['doubleclick.net', 'ads.example.org']);
      const s = LB_shouldSkip;
      return {
        loaded: LB_blocklist.loaded(),
        exact: s('https://doubleclick.net/x.js'),
        sub: s('https://stats.g.doubleclick.net/collect'),
        lookalike: s('https://notdoubleclick.net/x.js'),
        lookalike2: s('https://doubleclick.net.evil.example/x.js'),
        path: s('https://example.com/redirect?u=doubleclick.net/a'),
        path2: s('https://example.com/doubleclick.net/a.js'),
        sibling: s('https://example.org/a.js'),
        deep: s('https://x.y.ads.example.org/a.js'),
      };
    });
    expect(r).toEqual({ loaded: true, exact: true, sub: true, lookalike: false, lookalike2: false, path: false, path2: false, sibling: false, deep: true });
  });

  test('switch off or allowlisted site: nothing is blocked', async ({ page }) => {
    const r = await page.evaluate(() => {
      LB_blocklist.setList(['doubleclick.net']);
      const on = LB_shouldSkip('https://doubleclick.net/a');
      const scriptOn = LB_makeProxyScript('https://example.com/', true).includes('const BLOCK_ENABLED = true');
      const scriptAllow = LB_makeProxyScript('https://example.com/', false).includes('const BLOCK_ENABLED = false');
      LB_setBlock(false);
      const off = LB_shouldSkip('https://doubleclick.net/a');
      LB_setBlock(true);
      return { on, scriptOn, scriptAllow, off };
    });
    expect(r).toEqual({ on: true, scriptOn: true, scriptAllow: true, off: false });
  });

  test('shipped list loads without blocking boot and falls back before then', async ({ page }) => {
    const r = await page.evaluate(async () => {
      LB_blocklist.reset();
      const before = { loaded: LB_blocklist.loaded(), legacy: LB_shouldSkip('https://ssl.google-analytics.com/ga.js') };
      await LB_blocklist.load();
      return { before, after: LB_blocklist.loaded(), size: LB_blocklist.size(), ga: LB_shouldSkip('https://ssl.google-analytics.com/ga.js'), ok: LB_shouldSkip('https://example.com/') };
    });
    expect(r.before).toEqual({ loaded: false, legacy: true });
    expect(r.after).toBe(true);
    expect(r.size).toBeGreaterThan(50000);
    expect(r.ga).toBe(true);
    expect(r.ok).toBe(false);
  });

  test('before the list loads, the fallback matches host labels, not words in the URL (Twitch chunk, uploads hosts)', async ({ page }) => {
    const r = await page.evaluate(() => {
      LB_blocklist.reset();
      const s = LB_shouldSkip;
      return [s('https://static.twitchcdn.net/assets/ads.0f1e2d.js'), s('https://uploads.example.com/a.png'), s('https://www.threads.net/'),
        s('https://example.com/tracking.js'), s('https://ads.example.com/a.js'), s('https://www.google-analytics.com/a.js'),
        s('https://connect.facebook.net/sdk.js'), s('https://adservice.google.com/x'), s('https://pagead2.googlesyndication.com/p')];
    });
    expect(r).toEqual([false, false, false, false, true, true, true, true, true]);
  });

  test('the shipped list is HaGeZi Normal: a Normal-only domain is blocked', async ({ page }) => {
    const r = await page.evaluate(async () => {
      LB_blocklist.reset();
      const t0 = performance.now();
      await LB_blocklist.load();
      return { ms: Math.round(performance.now() - t0), size: LB_blocklist.size(), only: LB_shouldSkip('https://cdn.7zip.io/a.js'), ok: LB_shouldSkip('https://example.com/') };
    });
    expect(r.size).toBeGreaterThan(200000);
    expect(r.only).toBe(true);
    expect(r.ok).toBe(false);
    console.log('blocklist load ms (local server, parse included): ' + r.ms);
  });

  // 0.3.0 speed gate: the 570 KB list must not compete with the first page, so it waits for a finished page and an idle fetch queue.
  test('list download waits for a finished page and an idle fetch queue', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const real = window.LB_queueState;
      const wait = (ms) => new Promise(res => setTimeout(res, ms));
      let busy = true;
      window.LB_queueState = () => ({ fetching: busy ? 3 : 0, queued: 0 });
      window.__lbPerf.runs = [];
      LB_blocklist.reset();
      LB_blocklist.loadWhenIdle(200, 50);
      await wait(600);
      const whileBusy = LB_blocklist.loaded();
      busy = false;
      await wait(600);
      const idleNoPage = LB_blocklist.loaded();
      window.__lbPerf.runs.push({ marks: { load: 10 } });
      for (let i = 0; i < 40 && !LB_blocklist.loaded(); i++) await wait(100);
      window.LB_queueState = real;
      return { whileBusy, idleNoPage, after: LB_blocklist.loaded() };
    });
    expect(r).toEqual({ whileBusy: false, idleNoPage: false, after: true });
  });
  test('the 224k list is built in slices that yield to the page (features.blocklistYield), the old one-task build stays behind the switch', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const run = async (on) => {
        LB_features.compactBlocklist = false; LB_features.blocklistYield = on;
        LB_blocklist.reset();
        let yields = 0; const st = window.setTimeout;   // slices end with setTimeout(0): count them (timing based checks flake on a busy VM)
        window.setTimeout = (fn, ms, ...a) => { if (ms === 0) yields++; return st(fn, ms, ...a); };
        const p = LB_blocklist.load();
        await new Promise(r => st(r, 0));
        const early = LB_blocklist.loaded();   // the Set must not be visible before it is complete
        await p; window.setTimeout = st;
        return { yields, size: LB_blocklist.size(), ga: LB_shouldSkip('https://ssl.google-analytics.com/ga.js'), early };
      };
      const sync = await run(false), yielded = await run(true);
      LB_features.blocklistYield = true; LB_features.compactBlocklist = true;
      return { sync, yielded };
    });
    expect(r.yielded.size).toBeGreaterThan(50000);
    expect(r.yielded.size).toBe(r.sync.size);
    expect(r.yielded.ga).toBe(true);
    expect(r.yielded.early).toBe(false);
    expect(r.yielded.yields).toBeGreaterThan(3);
  });
  // 1.2 N1: prebuilt compact list (sorted 64-bit hashes in vendor/blocklist/<date>/hosts.bin): no 224k Set at runtime.
  test('compact list: no Set is built, lookups match the text list, bin file in step with hosts.txt', async ({ page }) => {
    const r = await page.evaluate(async () => {
      LB_features.compactBlocklist = true; LB_blocklist.reset();
      const RealSet = window.Set; let adds = 0;
      window.Set = class extends RealSet { add(v) { adds++; return super.add(v); } };
      await LB_blocklist.load();
      window.Set = RealSet;
      const lines = (await (await fetch('vendor/blocklist/2026-11-15/hosts.txt')).text()).split('\n').filter(l => l && l.charCodeAt(0) !== 35);
      let miss = 0; for (let i = 0; i < lines.length; i += 37) if (!LB_blocklist.hostBlocked(lines[i])) miss++;
      const sub = lines[5];
      return { adds, size: LB_blocklist.size(), lines: lines.length, miss, sub: LB_blocklist.hostBlocked('a.b.' + sub), parent: LB_blocklist.hostBlocked('example.com'),
        ga: LB_shouldSkip('https://ssl.google-analytics.com/ga.js'), ok: LB_shouldSkip('https://example.com/') };
    });
    expect(r.adds).toBeLessThan(1000);
    expect(r.size).toBeGreaterThan(200000); expect(r.size).toBeLessThanOrEqual(r.lines);
    expect(r.miss).toBe(0);
    expect(r.sub).toBe(true);
    expect(r.parent).toBe(false);
    expect(r.ga).toBe(true);
    expect(r.ok).toBe(false);
  });

  test('compact list: a listed host blocks its subdomains, not its parent; custom filters and allowlist unchanged; missing bin or switch off falls back to the Set', async ({ page }) => {
    await page.route('**/hosts.bin', route => route.fulfill({ status: 404, body: '' }));
    const r = await page.evaluate(async () => {
      LB_features.compactBlocklist = true; LB_blocklist.reset();
      await LB_blocklist.load();
      const missing = { loaded: LB_blocklist.loaded(), size: LB_blocklist.size() };
      LB_features.compactBlocklist = false; LB_blocklist.reset();
      await LB_blocklist.load();
      return { missing, off: { loaded: LB_blocklist.loaded(), size: LB_blocklist.size(), ga: LB_shouldSkip('https://ssl.google-analytics.com/ga.js') } };
    });
    expect(r.missing.loaded).toBe(true);
    expect(r.missing.size).toBeGreaterThan(200000);
    expect(r.off.size).toBeGreaterThan(200000);
    expect(r.off.ga).toBe(true);
  });
});
