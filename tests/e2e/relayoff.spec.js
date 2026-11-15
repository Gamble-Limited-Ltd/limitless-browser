const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// 0.3.0: our relay is off. One switch (features.ownRelay, default false) drives it; true restores the 1.0 behaviour.
const WS_SPY = `(() => { const W = window.WebSocket; window.__ws = []; window.WebSocket = function (u, p) { window.__ws.push(String(u)); return p === undefined ? new W(u) : new W(u, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); })();`;
const noVersion = (page) => page.context().route('**/version.json*', (r) => r.fulfill({ status: 404, body: 'no' }));
const own = (page, ownRelay) => page.context().route('**/version.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 'x', sha: 'dev', features: { ownRelay } }) }));

test.describe('relay off (default)', () => {
  test('public relays on, our /wisp/ is no candidate, no probe, no notice, the old "off" setting is ignored but kept', async ({ page }) => {
    await noVersion(page);
    const errors = await boot(page, { features: null, init: `${WS_SPY}; try { localStorage.setItem('limitless:inst:v1', 'gi_t'); localStorage.setItem('gi_t:limitless:relay-fallback:v1', '0'); } catch (_) {}` });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ st: window.LB_relayStatus(), pool: window.LB_pool(), ws: window.__ws, notice: !!document.getElementById('lbRelayNotice'), saved: localStorage.getItem('gi_t:limitless:relay-fallback:v1') }));
    expect(r.st).toMatchObject({ ownRelay: false, fallbackAllowed: true });
    expect(r.pool.length).toBeGreaterThan(3);
    expect(r.pool.every((u) => !u.includes('127.0.0.1'))).toBe(true);
    expect(r.ws.filter((u) => u.includes('127.0.0.1'))).toEqual([]);
    expect(r.notice).toBe(false);
    expect(r.saved).toBe('0');
    expect(errors).toEqual([]);
  });

  test('Settings > Connection says "Public relays (until 1.0)" and the switch is disabled', async ({ page }) => {
    await noVersion(page);
    await boot(page, { features: null });
    const s = await page.evaluate(() => { const sw = document.getElementById('settingsRelayFallbackSwitch'); sw.click(); return { label: document.getElementById('settingsRelayFallbackLabel').textContent, disabled: sw.classList.contains('disabled'), on: sw.classList.contains('on') }; });
    expect(s).toEqual({ label: 'Public relays (until 1.0)', disabled: true, on: true });
  });

  test('the dead pool entries are gone and nothing is left in the pool that is not wss', async ({ page }) => {
    await noVersion(page);
    await boot(page, { features: null });
    const pool = await page.evaluate(() => window.LB_pool());
    for (const dead of ['forwardersoft', 'the-nest.at', 'nebulaproxy', 'invisiproxy']) expect(pool.join(' ')).not.toContain(dead);
    expect(pool.every((u) => u.startsWith('wss://'))).toBe(true);
  });
});

test('ownRelay true restores our relay: probe, candidate, the fallback key counts again', async ({ page }) => {
  await own(page, true);
  await boot(page, { features: null, init: `${WS_SPY}` });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ st: window.LB_relayStatus(), ws: window.__ws, label: document.getElementById('settingsRelayFallbackLabel').textContent }));
  expect(r.st).toMatchObject({ ownRelay: true, fallbackAllowed: false });
  expect(r.ws.some((u) => u.includes('127.0.0.1') && u.includes('/wisp/'))).toBe(true);
  expect(r.label).toBe('Allow third-party relays');
});
