// @ts-check
// S2 boot timings and cold/repeat transfer size (docs/1.0/TESTING.md section 6). Runs only with LB_BOOT=1:
//   LB_BOOT=1 flock /tmp/limitless-rehearsal.lock deploy/rehearsal/run.sh tests/stack/boot-size.spec.js
// Same measurement for any build (LB_SPEED_SHA names the output), so c88ce5e and a candidate compare directly.
// Per rep: fresh context, sign in as the mock user, then:
//   cold    = the load that follows "Continue" at the mock GATE (nothing cached): bytes on the wire, splash hidden, start page interactive
//   repeat  = page.reload() right after the cold load (HTTP cache only; a service worker is not installed yet)
//   warm    = reload after the service worker (if the build has one, registered 8 s after load) finished installing
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { applyProfile } = require('../lib/profile');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const REPS = parseInt(process.env.LB_SPEED_REPS || '7', 10);

function initScript() {
  let T = null;
  try { T = window.top === window ? (window.__lbm = { boot: {} }) : window.top.__lbm; } catch (e) { return; }
  if (window.top !== window || !T) return;
  const check = () => {
    const o = document.getElementById('overlay');
    if (!o) return;
    const now = Math.round(performance.now());
    if (T.boot.splash == null && (o.classList.contains('hidden') || !o.classList.contains('splash'))) T.boot.splash = now;
    if (T.boot.splash != null && T.boot.interactive == null) {
      const s = document.getElementById('ntSearch');
      if (s && s.offsetParent !== null) T.boot.interactive = now;
    }
    if (T.boot.interactive != null) clearInterval(iv);
  };
  const iv = setInterval(check, 20);
}

const median = (a) => { const v = a.filter((x) => typeof x === 'number').sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };

test('boot timings and transfer, cold / repeat / warm worker', async ({ browser }, testInfo) => {
  test.skip(process.env.LB_BOOT !== '1', 'set LB_BOOT=1 (and run through deploy/rehearsal/run.sh)');
  test.setTimeout(900000);
  const project = testInfo.project.name;
  const rows = { cold: [], repeat: [], warm: [] };
  for (let i = 0; i < REPS; i++) {
    const ctx = await browser.newContext({ baseURL: BASE });
    await ctx.addInitScript(initScript);
    const page = await ctx.newPage();
    const cdp = (await applyProfile(page, testInfo)) || (await ctx.newCDPSession(page));
    const bytes = { rx: 0 };
    await cdp.send('Network.enable');
    cdp.on('Network.loadingFinished', (e) => { bytes.rx += e.encodedDataLength || 0; });
    const read = async () => {
      await page.waitForFunction(() => window.__lbm && window.__lbm.boot.interactive != null, null, { timeout: 90000, polling: 50 });
      return page.evaluate(() => ({ ...window.__lbm.boot }));
    };
    try {
      await page.goto('/');
      await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
      await page.waitForURL(`${MOCK}/oidc/authorize**`);
      await page.locator('input[name=user][value=alice]').check();
      bytes.rx = 0;
      await page.locator('#continue').click();
      await expect(page.locator('#url')).toBeVisible({ timeout: 90000 });
      const cold = await read();
      rows.cold.push({ ...cold, kb: Math.round(bytes.rx / 1024) });
      bytes.rx = 0;
      await page.reload();
      await page.waitForFunction(() => window.__lbm !== undefined);
      const rep = await read();
      rows.repeat.push({ ...rep, kb: Math.round(bytes.rx / 1024) });
      // let a service worker (if any) install and fill its cache, then reload once more
      const hasSw = await page.evaluate(async () => {
        if (!window.LB_swSync || !('serviceWorker' in navigator)) return false;   // build without a worker (c88ce5e)
        await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 30000))]);
        const reg = await navigator.serviceWorker.getRegistration();
        return !!(reg && reg.active);
      });
      await page.waitForTimeout(1500);
      bytes.rx = 0;
      await page.reload();
      await page.waitForFunction(() => window.__lbm !== undefined);
      const warm = await read();
      rows.warm.push({ ...warm, kb: Math.round(bytes.rx / 1024), sw: hasSw });
    } catch (e) { console.log(`boot[${project}] rep ${i + 1} failed: ${String(e).slice(0, 160)}`); }
    await ctx.close();
  }
  const sum = (arr) => ({ n: arr.length, splash: median(arr.map((r) => r.splash)), interactive: median(arr.map((r) => r.interactive)), kb: median(arr.map((r) => r.kb)) });
  const out = { sha: process.env.LB_SPEED_SHA || 'local', project, date: new Date().toISOString(), reps: REPS, cold: sum(rows.cold), repeat: sum(rows.repeat), warm: sum(rows.warm), swInstalled: rows.warm.filter((r) => r.sw).length, rows };
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(path.join('test-results', `boot-${out.sha}-${project}.json`), JSON.stringify(out, null, 2));
  console.log(`boot[${project}] ${out.sha}: cold ${JSON.stringify(out.cold)} | repeat ${JSON.stringify(out.repeat)} | warm ${JSON.stringify(out.warm)} (sw ${out.swInstalled}/${REPS})`);
});
