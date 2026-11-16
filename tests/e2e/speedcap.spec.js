const { test, expect } = require('@playwright/test');
const { LEGACY_FEATURES } = require('./helpers');
const { me, bootMember } = require('./helpers-ui');

// 1.1 Ordinal speed throttle (docs/1.1/PLANS-AUDIT.md rule 10): Ordinal bytes ride public relays, so the app itself paces response
// bodies to plan.limits.speedMbps (or catalog.ordinal.speedMbps). Paid tiers (the relay enforces) and a missing /_lb/me are not paced.
const STUB = `
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url) { const b = new Uint8Array(1024 * 1024); return { status: 200, headers: new Headers({ 'content-type': 'application/octet-stream' }), arrayBuffer: async () => b.buffer.slice(0) }; },
  };
  window.__time = async () => { const t = performance.now(); await LB_queueFetch('https://cap.test/1mb'); return performance.now() - t; };
`;
const ordinal = (speedMbps) => me({ tier: 'ordinal' }, { tier: 'ordinal', limits: { speedMbps } });

async function setup(page, answer, features) {
  await bootMember(page, answer, features ? { features } : {});
  await page.evaluate(STUB);
}

test.describe('Ordinal speed throttle', () => {
  test('1 MB at 8 Mbit/s takes about a second for Ordinal', async ({ page }) => {
    await setup(page, ordinal(8));
    expect(await page.evaluate(() => __time())).toBeGreaterThan(600);
  });

  test('the speed can come from the plans catalog when limits carry none', async ({ page }) => {
    const a = ordinal(0); a.plan.catalog = { ordinal: { speedMbps: 8 } };
    await setup(page, a);
    expect(await page.evaluate(() => __time())).toBeGreaterThan(600);
  });

  test('a paid tier is not paced by the app', async ({ page }) => {
    await setup(page, me({ tier: 'cardinal' }, { tier: 'cardinal', limits: { speedMbps: 8 } }));
    expect(await page.evaluate(() => __time())).toBeLessThan(400);
  });

  test('no membership data means no throttle', async ({ page }) => {
    await setup(page, ordinal(8));
    await page.evaluate(() => { window.LB_member = null; });
    expect(await page.evaluate(() => __time())).toBeLessThan(400);
  });

  test('features.speedCap false turns it off', async ({ page }) => {
    await setup(page, ordinal(8), { ...LEGACY_FEATURES, speedCap: false });
    expect(await page.evaluate(() => __time())).toBeLessThan(400);
  });
});
