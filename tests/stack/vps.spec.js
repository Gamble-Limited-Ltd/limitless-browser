// @ts-check
// MS-4 real-VPS lane (docs/1.3/specs/01-measuring.md). Signs in to PROD Limitless as the lbtest account and loads MS-1's official
// sites (the non-fixture rows of speed-sites.json) through the real VPS under the chromebook profile. Never runs in `npm test`.
//   npm run test:vps                                   Cardinal (lbtest), 3 reps
//   LB_VPS_TIER=ordinal LB_VPS_REPS=1 npm run test:vps Ordinal (lbtest-free, public relays), 1 rep, not metered
// Env: LB_VPS_REPS (3), LB_VPS_TIER (cardinal|ordinal), LB_VPS_ACCOUNT_FILE (default ~/.config/gll-cloud/lbtest.env; keys
// LBTEST_LOGIN/LBTEST_PASSWORD, or LBTEST_FREE_* for ordinal), LB_VPS_BASE, LB_VPS_METER (meter file path).
// Guards: only 22:00 to 06:00 Chicago; refuses to start at 45 GB this month, stops between sites at 50 GB (cardinal only);
// stops at once if the gate slows or cuts the member. Bytes per run = growth of the member's own usage (/_lb/me plan.used.todayBytes).
// Credentials are read from the file and typed into the sign-in form; never logged, never written to the results.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applyProfile } = require('../lib/profile');

const BASE = process.env.LB_VPS_BASE || 'https://limitless.taps-holdings.org';
const REPS = parseInt(process.env.LB_VPS_REPS || '3', 10);
const TIER = process.env.LB_VPS_TIER === 'ordinal' ? 'ordinal' : 'cardinal';
const METERED = TIER === 'cardinal';
const ACCOUNT_FILE = process.env.LB_VPS_ACCOUNT_FILE || path.join(os.homedir(), '.config/gll-cloud/lbtest.env');
const METER_FILE = process.env.LB_VPS_METER || path.join(os.homedir(), '.local/state/limitless-tests/vps-gb.json');
const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, 'speed-sites.json'), 'utf8')).filter((s) => !s.fixture);
const MARKS = ['firstBytes', 'dom', 'shown', 'load'];

const median = (a) => {
  const v = a.filter((x) => typeof x === 'number').sort((x, y) => x - y);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};

function readAccount() {
  const env = {};
  for (const line of fs.readFileSync(ACCOUNT_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  const pre = TIER === 'ordinal' ? 'LBTEST_FREE' : 'LBTEST';
  const login = env[`${pre}_LOGIN`], password = env[`${pre}_PASSWORD`];
  if (!login || !password) throw new Error(`${ACCOUNT_FILE} has no ${pre}_LOGIN / ${pre}_PASSWORD`);
  return { login, password };
}

const readMeter = () => { try { return JSON.parse(fs.readFileSync(METER_FILE, 'utf8')); } catch { return { months: {} }; } };
const writeMeter = (m) => { fs.mkdirSync(path.dirname(METER_FILE), { recursive: true }); fs.writeFileSync(METER_FILE, JSON.stringify(m, null, 2)); };

/** GLL ID sign-in (two steps, then maybe "Continue as"). Returns the cookies. */
async function signIn(browser, acct) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
  await page.getByLabel('Login name or email').fill(acct.login);
  await page.getByRole('button', { name: /^(Next|Sign in)$/ }).click();
  await page.getByLabel('Password').fill(acct.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const cont = page.getByRole('button', { name: 'Continue' });
  await Promise.race([cont.waitFor({ timeout: 15000 }).then(() => cont.click()).catch(() => {}), page.waitForURL(`${BASE}/**`, { timeout: 15000 }).catch(() => {})]);
  await expect(page.locator('#url')).toBeVisible({ timeout: 90000 });
  const cookies = await ctx.cookies();
  await ctx.close();
  return cookies;
}

async function me(ctx) {
  const r = await ctx.request.get('/_lb/me');
  if (r.status() !== 200) throw new Error(`/_lb/me answered ${r.status()}`);
  return r.json();
}

async function navigate(page, bytes, url) {
  const before = await page.evaluate(() => window.__lbPerf.runs.length);
  bytes.rx = 0; bytes.tx = 0;
  await page.locator('#url').focus();
  await page.locator('#url').fill(url);
  await page.keyboard.press('Enter');
  try {
    await page.waitForFunction((n) => {
      const f = document.getElementById('frame');
      if (f && f.srcdoc && /Error - Limitless/.test(f.srcdoc)) return true;
      const r = window.__lbPerf.runs; return r.length > n && r[r.length - 1].marks.load != null;
    }, before, { timeout: 60000, polling: 50 });
  } catch (_) { /* record whatever marks exist */ }
  const marks = await page.evaluate(() => ({ ...window.__lbPerf.runs[window.__lbPerf.runs.length - 1].marks }));
  const err = await page.evaluate(() => { const f = document.getElementById('frame'); return f && f.srcdoc && /Error - Limitless/.test(f.srcdoc); });
  if (err) throw new Error('error card');
  return { ...marks, rxBytes: bytes.rx, txBytes: bytes.tx };
}

/** One rep in a fresh context (cold, then warm). Returns the loads and the member's usage growth. */
async function siteRep(browser, testInfo, cookies, site) {
  const ctx = await browser.newContext({ baseURL: BASE, storageState: { cookies, origins: [] } });
  try {
    const page = await ctx.newPage();
    const cdp = (await applyProfile(page, testInfo)) || (await ctx.newCDPSession(page));
    const bytes = { rx: 0, tx: 0 };
    await cdp.send('Network.enable');
    cdp.on('Network.loadingFinished', (e) => { bytes.rx += e.encodedDataLength || 0; });
    const wsLen = (r) => (r.opcode === 1 ? Buffer.byteLength(r.payloadData || '') : Math.floor(((r.payloadData || '').length * 3) / 4));
    cdp.on('Network.webSocketFrameReceived', (e) => { bytes.rx += wsLen(e.response); });
    cdp.on('Network.webSocketFrameSent', (e) => { bytes.tx += wsLen(e.response); });
    await page.goto('/');
    await expect(page.locator('#url')).toBeVisible({ timeout: 90000 });
    const skip = page.locator('#tutorialOverlay button', { hasText: 'Skip tour' });
    try { await skip.waitFor({ state: 'visible', timeout: 4000 }); await skip.click(); } catch (_) {}
    const no = page.locator('#lbRelayNo');
    if (await no.isVisible().catch(() => false)) await no.click();
    const used0 = (await me(ctx)).plan.used.todayBytes;
    let cold, warm, failed = null;
    try { cold = await navigate(page, bytes, site.url); warm = await navigate(page, bytes, site.url); } catch (e) { failed = String(e).slice(0, 120); }
    // let the gate's usage counter catch up with the last frames; a crashed tab (seen at cb-mid) counts as a failed rep, not a dead run
    await page.waitForTimeout(1500).catch((e) => { failed = failed || String(e).slice(0, 120); });
    const after = await me(ctx);
    return { cold, warm, failed, usedDelta: after.plan.used.todayBytes - used0, me: after };
  } finally { await ctx.close(); }
}

test('real VPS, official sites', async ({ browser }, testInfo) => {
  test.setTimeout(6 * 60 * 60 * 1000);
  const { inWindow, mayStart, mustStop, addRun, usedBytes, monthKey, monthGb, throttled } = await import('../../scripts/lib/vpslane.mjs');
  if (!inWindow()) throw new Error('refused: the real-VPS lane only runs 22:00 to 06:00 America/Chicago');
  if (METERED && !mayStart(readMeter())) throw new Error(`refused: ${monthGb(readMeter()).toFixed(1)} GB used this month (limit to start 45 GB)`);

  const cookies = await signIn(browser, readAccount());
  const out = { tier: TIER, base: BASE, date: new Date().toISOString(), reps: REPS, profile: testInfo.project.name, sites: {}, stopped: null, runBytes: 0 };
  let meter = readMeter();

  outer: for (const site of SITES) {
    const runs = { cold: [], warm: [] };
    let errors = 0;
    for (let i = 0; i < REPS; i++) {
      const r = await siteRep(browser, testInfo, cookies, site);
      const bytes = usedBytes(0, r.usedDelta);
      out.runBytes += bytes;
      if (METERED) { meter = addRun(meter, bytes); writeMeter(meter); }
      if (r.failed) { errors++; console.log(`vps: ${site.name} rep ${i + 1} failed: ${r.failed}`); } else { runs.cold.push(r.cold); runs.warm.push(r.warm); }
      if (throttled(r.me)) { out.stopped = `gate throttle: plan.fallback=${r.me.plan.fallback} cap.over=${r.me.plan.cap?.over}`; break outer; }
    }
    const sum = (list) => Object.fromEntries([...MARKS, 'rxBytes'].map((k) => [k, { median: median(list.map((x) => x[k])), values: list.map((x) => x[k] ?? null) }]));
    out.sites[site.name] = { url: site.url, errors, cold: sum(runs.cold), warm: sum(runs.warm) };
    console.log(`vps[${TIER}]: ${site.name.padEnd(14)} cold shown ${out.sites[site.name].cold.shown.median} load ${out.sites[site.name].cold.load.median} ms, warm shown ${out.sites[site.name].warm.shown.median} ms`);
    if (METERED && mustStop(meter, 0)) { out.stopped = `monthly meter reached 50 GB (${monthGb(meter).toFixed(1)} GB)`; break; }
  }

  out.meter = METERED ? { month: monthKey(), gbThisMonth: Math.round(monthGb(meter) * 100) / 100, runGb: Math.round(out.runBytes / 1e7) / 100 } : 'not counted (ordinal)';
  const dir = path.join(__dirname, '..', '..', 'test-results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `vps-${TIER}-${out.date.slice(0, 10)}${testInfo.project.name === 'chromebook' ? '' : `-${testInfo.project.name}`}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`vps: wrote ${file}${out.stopped ? `  STOPPED: ${out.stopped}` : ''}`);
  expect(out.stopped, out.stopped || '').toBeNull();
});
