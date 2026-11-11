// @ts-check
// The `chromebook` project (tests/lib/profile.js): viewport, CPU and network throttling are really applied.
const { test, expect } = require('@playwright/test');
const { applyProfile } = require('../lib/profile');

test('chromebook profile: 1366x768, 4x CPU, throttled network', async ({ page }, testInfo) => {
  expect(page.viewportSize()).toEqual({ width: 1366, height: 768 });
  await page.goto('/tests/e2e/helpers.js');
  const cdp = await applyProfile(page, testInfo);
  expect(cdp).not.toBeNull();
  const spin = () => page.evaluate(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 2e7; i++) x += i % 7; return performance.now() - t + x * 0; });
  await spin(); // warm up
  const slow = await spin();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const fast = await spin();
  expect(slow / fast).toBeGreaterThan(2);
  // Over 10 Mbit/s index.html takes at least size*8/10e6 s; expect half of that so S2/S3 size cuts do not break it
  // (unthrottled loopback takes about 10 ms; route mocks would bypass the throttle).
  const { ms, bytes } = await page.evaluate(async () => { const t = performance.now(); const b = await (await fetch('/index.html?probe=' + Date.now(), { cache: 'no-store' })).arrayBuffer(); return { ms: performance.now() - t, bytes: b.byteLength }; });
  expect(ms).toBeGreaterThan((bytes * 8 / 10e6) * 1000 * 0.5);
});
