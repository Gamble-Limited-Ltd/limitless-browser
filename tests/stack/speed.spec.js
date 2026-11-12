// @ts-check
// Speed harness. Runs only with LB_SPEED=1, against the rehearsal stack:
//   LB_SPEED=1 deploy/rehearsal/run.sh tests/stack/speed.spec.js        (npm run test:speed)
// run.sh then also starts the fixture sites container (tests/fixtures/sites) and gives the relay the test-only config.
// Runs once per Playwright project: `chromium` (unthrottled) and `chromebook` (1366x768, 4x CPU, 10/5 Mbit/s, 40 ms RTT,
// tests/lib/profile.js). For each site in speed-sites.json, REPS times: a fresh browser context (empty caches, new
// session), sign in as the mock user alice, load the site cold, then load the same URL again warm.
// Per navigation: marks from window.__lbPerf (index.html go()): firstBytes, dom, shown, load in ms since the navigation
// started; rxBytes/txBytes (CDP: HTTP encoded bytes plus WebSocket frames, i.e. what crossed the browser's network);
// longTaskCount/longTaskMs while the page is scrolled. All measured from outside, so the same harness runs against
// older builds (the 0.2.3 baseline). Boot timings (navigation start to splash hidden, to start page interactive) are
// taken on the sign-in landing (cold) and on a reload (repeat). The fixture news page also gets an in-page DOMParser
// and script-rewrite timing (the app's own LB_rewrite.sync on the fixture scripts).
// Output: test-results/speed-<sha>-<project>.json (medians). Gate only on `fixture: true` sites (public sites are
// reported). Compare two runs with scripts/speed-compare.mjs.
// Env: LB_SPEED_REPS (7), LB_SPEED_PUBLIC_REPS (3), LB_SPEED_PUBLIC=0 (fixtures only), LB_SPEED_ONLY=a,b, LB_SPEED_SHA.
// Quick tier (npm run test:speed:quick): chromebook only, 3 reps, fixtures only. Release gate: npm run test:speed.
// The mock sign-in runs once per project; later contexts start from the saved cookies only (every other store is empty).
// A navigation that ends in the error card is recorded as an error and not waited out (T3).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { applyProfile } = require('../lib/profile');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const REPS = parseInt(process.env.LB_SPEED_REPS || '7', 10);
const PUBLIC_REPS = parseInt(process.env.LB_SPEED_PUBLIC_REPS || '3', 10);
const MARKS = ['firstBytes', 'dom', 'shown', 'load'];
const EXTRA = ['rxBytes', 'txBytes', 'longTaskCount', 'longTaskMs'];
const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, 'speed-sites.json'), 'utf8'));
const NO_PUBLIC = process.env.LB_SPEED_PUBLIC === '0';
const ONLY = process.env.LB_SPEED_ONLY ? process.env.LB_SPEED_ONLY.split(',') : null;
const FIXTURE_ORIGIN = 'http://10.89.85.10:8080';

const median = (a) => {
  const v = a.filter((x) => typeof x === 'number').sort((x, y) => x - y);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};

function sha() {
  if (process.env.LB_SPEED_SHA) return process.env.LB_SPEED_SHA;
  try { return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch { return 'local'; }
}

// Runs in every frame before any page script. Top frame owns window.__lbm; boot = splash hidden / start page interactive.
function initScript() {
  /* eslint-disable */
  let T = null;
  try { T = window.top === window ? (window.__lbm = { boot: {}, lt: [] }) : window.top.__lbm; } catch (e) { return; }
  if (window.top !== window || !T) return;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) T.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
  } catch (e) {}
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

let SAVED = null; // cookies of the first sign-in (per worker process, so per project run)
async function signIn(page) {
  await page.goto('/');
  if (!SAVED) {
    await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
    await page.waitForURL(`${MOCK}/oidc/authorize**`);
    await page.locator('input[name=user][value=alice]').check();
    await page.locator('#continue').click();
  }
  await page.waitForLoadState('load');
  await expect(page.locator('#url')).toBeVisible({ timeout: 90000 });
  // First-run overlays would not block navigation, but dismiss them so they cannot add noise.
  const skip = page.locator('#tutorialOverlay button', { hasText: 'Skip tour' });
  try { await skip.waitFor({ state: 'visible', timeout: 4000 }); await skip.click(); } catch (_) {}
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
  if (!SAVED) { try { SAVED = await page.context().cookies(); } catch (_) {} }
}

/** New context + page with the project profile, byte counters and the init script. */
async function openPage(browser, testInfo) {
  const ctx = await browser.newContext({ baseURL: BASE, ...(SAVED ? { storageState: { cookies: SAVED, origins: [] } } : {}) });
  await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  const cdp = (await applyProfile(page, testInfo)) || (await ctx.newCDPSession(page));
  const bytes = { rx: 0, tx: 0 };
  await cdp.send('Network.enable');
  cdp.on('Network.loadingFinished', (e) => { bytes.rx += e.encodedDataLength || 0; });
  const wsLen = (r) => (r.opcode === 1 ? Buffer.byteLength(r.payloadData || '') : Math.floor(((r.payloadData || '').length * 3) / 4));
  cdp.on('Network.webSocketFrameReceived', (e) => { bytes.rx += wsLen(e.response); });
  cdp.on('Network.webSocketFrameSent', (e) => { bytes.tx += wsLen(e.response); });
  return { ctx, page, bytes };
}

/** Wait for the boot timings (splash hidden, start page interactive) and return them. */
async function readBoot(page) {
  try { await page.waitForFunction(() => window.__lbm && window.__lbm.boot.interactive != null, null, { timeout: 60000, polling: 50 }); } catch (_) {}
  return page.evaluate(() => ({ ...window.__lbm.boot }));
}

/** Scroll the proxied page for ~1.5 s and return the long tasks that started meanwhile. */
async function scrollLongTasks(page) {
  const box = await page.locator('#frame').boundingBox();
  if (!box) return { longTaskCount: null, longTaskMs: null };
  const t0 = await page.evaluate(() => Math.round(performance.now()));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 250); await page.waitForTimeout(100); }
  await page.waitForTimeout(200);
  return page.evaluate((t) => {
    const l = window.__lbm.lt.filter(([s]) => s >= t);
    return { longTaskCount: l.length, longTaskMs: l.reduce((a, [, d]) => a + d, 0) };
  }, t0);
}

/** Navigate through the address bar; returns marks, bytes and scroll long tasks (null marks when it never finished). */
async function navigate(page, bytes, url) {
  const before = await page.evaluate(() => window.__lbPerf.runs.length);
  bytes.rx = 0; bytes.tx = 0;
  await page.locator('#url').focus();
  await page.locator('#url').fill(url);
  await page.keyboard.press('Enter');
  try {
    await page.waitForFunction(
      (n) => {
        const f = document.getElementById('frame');
        if (f && f.srcdoc && /Error - Limitless/.test(f.srcdoc)) return true;
        const r = window.__lbPerf.runs; return r.length > n && r[r.length - 1].marks.load != null;
      },
      before,
      { timeout: 60000, polling: 50 },
    );
  } catch (_) { /* record whatever marks exist */ }
  const marks = await page.evaluate(() => ({ ...window.__lbPerf.runs[window.__lbPerf.runs.length - 1].marks }));
  const errText = await page.evaluate(() => { const f = document.getElementById('frame'); return f && f.srcdoc && /Error - Limitless/.test(f.srcdoc) ? f.srcdoc.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160) : null; });
  if (errText) throw new Error('error card: ' + errText);
  const rxBytes = bytes.rx, txBytes = bytes.tx; // loading only; scrolling can fetch lazy content but is measured separately
  return { ...marks, rxBytes, txBytes, ...(await scrollLongTasks(page)) };
}

/** DOMParser and script-rewrite time on the fixture news page, using the app's own functions (see header). */
async function microBench(page) {
  return page.evaluate(async (origin) => {
    const text = async (p) => (await libcurl.fetch(origin + p)).text();
    const html = await text('/news');
    const js = []; for (let i = 1; i <= 12; i++) js.push(await text(`/news/js/${i}.js`));
    const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const parse = [], rw = [];
    for (let k = 0; k < 5; k++) {
      let t = performance.now(); new DOMParser().parseFromString(html, 'text/html'); parse.push(performance.now() - t);
      t = performance.now(); for (const s of js) window.LB_rewrite.sync(s); rw.push(performance.now() - t);
    }
    return { domParserMs: Math.round(med(parse)), rewriteMs: Math.round(med(rw)), htmlBytes: html.length, scriptBytes: js.reduce((a, s) => a + s.length, 0) };
  }, FIXTURE_ORIGIN);
}

const summarize = (list, keys) => {
  const o = { runs: list.length };
  for (const m of keys) o[m] = { median: median(list.map((r) => r[m])), values: list.map((r) => r[m] ?? null) };
  return o;
};

test.describe('speed', () => {
  test.skip(process.env.LB_SPEED !== '1', 'set LB_SPEED=1 (and run through deploy/rehearsal/run.sh)');

  test('boot, cold and warm page loads', async ({ browser }, testInfo) => {
    test.setTimeout(6 * 60 * 60 * 1000);
    const project = testInfo.project.name;
    const out = { sha: sha(), project, date: new Date().toISOString(), reps: REPS, publicReps: PUBLIC_REPS, base: BASE, boot: {}, sites: {} };

    // Boot: cold = sign-in landing in a fresh context, repeat = reload.
    if (!ONLY) {
      const cold = [], repeat = [];
      for (let i = 0; i < REPS; i++) {
        const { ctx, page } = await openPage(browser, testInfo);
        try {
          await signIn(page);
          cold.push(await readBoot(page));
          await page.reload();
          await page.waitForFunction(() => window.__lbm !== undefined);
          repeat.push(await readBoot(page));
        } catch (e) { console.log(`speed[${project}]: boot rep ${i + 1} failed: ${String(e).slice(0, 120)}`); }
        await ctx.close();
      }
      out.boot = { cold: summarize(cold, ['splash', 'interactive']), repeat: summarize(repeat, ['splash', 'interactive']) };
      console.log(`speed[${project}]: boot cold splash ${out.boot.cold.splash.median} ms, interactive ${out.boot.cold.interactive.median} ms; repeat splash ${out.boot.repeat.splash.median} ms, interactive ${out.boot.repeat.interactive.median} ms`);
    }

    for (const site of SITES) {
      if (ONLY && !ONLY.includes(site.name)) continue;
      if (NO_PUBLIC && !site.fixture) continue;
      const reps = site.fixture ? REPS : PUBLIC_REPS;
      const runs = { cold: [], warm: [] };
      let micro = null;
      for (let i = 0; i < reps; i++) {
        const { ctx, page, bytes } = await openPage(browser, testInfo);
        try {
          await signIn(page);
          runs.cold.push(await navigate(page, bytes, site.url));
          runs.warm.push(await navigate(page, bytes, site.url));
          if (site.micro && i === reps - 1) micro = await microBench(page);
        } catch (e) {
          console.log(`speed[${project}]: ${site.name} rep ${i + 1} failed: ${String(e).slice(0, 120)}`);
        }
        await ctx.close();
      }
      const keys = [...MARKS, ...EXTRA];
      out.sites[site.name] = { url: site.url, fixture: !!site.fixture, reps, cold: summarize(runs.cold, keys), warm: summarize(runs.warm, keys), ...(micro ? { micro } : {}) };
      console.log(`speed[${project}]: ${site.name.padEnd(14)} cold shown ${out.sites[site.name].cold.shown.median} load ${out.sites[site.name].cold.load.median} ms (${Math.round((out.sites[site.name].cold.rxBytes.median || 0) / 1024)} KB), warm shown ${out.sites[site.name].warm.shown.median} load ${out.sites[site.name].warm.load.median} ms`);
    }
    const dir = path.join(__dirname, '..', '..', 'test-results');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `speed-${out.sha}-${project}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`speed: wrote ${file}`);
    expect(Object.keys(out.sites).length).toBeGreaterThan(0);
  });
});
