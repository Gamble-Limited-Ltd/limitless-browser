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
});
