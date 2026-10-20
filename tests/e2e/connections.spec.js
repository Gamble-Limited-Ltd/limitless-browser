const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// F1: 24 parallel requests (6 per host) by default, re-applied live when the stepper is saved.

const click = (page, id, n = 1) => page.evaluate(([i, k]) => { for (let j = 0; j < k; j++) document.getElementById(i).click(); }, [id, n]);
const text = (page, id) => page.evaluate((i) => document.getElementById(i).textContent, id);

async function recordSetConnections(page) {
  await page.evaluate(async () => {
    await libcurl.load_wasm();
    window.__sc = [];
    const proto = libcurl.HTTPSession.prototype;
    const orig = proto.set_connections;
    proto.set_connections = function (...a) { window.__sc.push(a); return orig.apply(this, a); };
  });
}

test('defaults are 24 for idle and active requests', async ({ page }) => {
  const errors = await boot(page);
  expect(await text(page, 'settingsIdleVal')).toBe('24');
  expect(await text(page, 'settingsActiveVal')).toBe('24');
  expect(errors).toEqual([]);
});

test('the stepper tops out at 32 and saving re-applies set_connections(n, n, 6) to the live session', async ({ page }) => {
  await boot(page);
  await recordSetConnections(page);
  await click(page, 'settingsActivePlus', 20);
  expect(await text(page, 'settingsActiveVal')).toBe('32');
  await click(page, 'settingsActiveMinus', 12); // 20
  await click(page, 'settingsIdleMinus', 4); // 20
  await click(page, 'settingsThreadsSave');
  const calls = await page.evaluate(() => window.__sc);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls[calls.length - 1]).toEqual([20, 20, 6]);
  expect(await page.evaluate(() => localStorage.getItem(window._sessionInstId + ':limitless:activethreads:v1'))).toBe('20');
});

test('reset returns to 24 and re-applies', async ({ page }) => {
  await boot(page);
  await recordSetConnections(page);
  await click(page, 'settingsActiveMinus', 10);
  await click(page, 'settingsThreadsSave');
  await click(page, 'settingsThreadsReset');
  expect(await text(page, 'settingsActiveVal')).toBe('24');
  expect(await text(page, 'settingsIdleVal')).toBe('24');
  const calls = await page.evaluate(() => window.__sc);
  expect(calls[calls.length - 1]).toEqual([24, 24, 6]);
});

test('a saved value from an earlier version is kept', async ({ page }) => {
  await boot(page, { init: () => { try { localStorage.setItem('limitless:inst:v1', 'gi_t'); localStorage.setItem('gi_t:limitless:activethreads:v1', '8'); localStorage.setItem('gi_t:limitless:idlethreads:v1', '4'); } catch (_) {} } });
  expect(await text(page, 'settingsActiveVal')).toBe('8');
  expect(await text(page, 'settingsIdleVal')).toBe('4');
});
