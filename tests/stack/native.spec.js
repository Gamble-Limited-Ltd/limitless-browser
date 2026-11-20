// @ts-check
// MS-1 native column (docs/1.3/specs/01-measuring.md): the official sites (non-fixture rows of speed-sites.json) loaded straight in
// plain Chromium, no proxy and no app, under the same chromebook profile (tests/lib/profile.js). Needs no stack. Never in `npm test`.
//   npm run test:native            3 reps, all sites
//   LB_NATIVE_REPS=1 LB_NATIVE_ONLY=example,wikipedia npm run test:native
// Env: LB_NATIVE_REPS (3), LB_NATIVE_ONLY (comma list of site names).
// Per rep a fresh context: cold load, then the same URL again (warm, HTTP cache). Marks in ms since navigation start: firstBytes =
// responseStart, dom = DOMContentLoaded, shown = first contentful paint, load = load event end. Output test-results/native-<date>-chromebook.json
// in the shape of vps-<tier>-<date>.json; feed both to scripts/x-native.mjs. A site that answers 4xx/5xx or shows a bot wall is `blocked`.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { applyProfile } = require('../lib/profile');

const REPS = parseInt(process.env.LB_NATIVE_REPS || '3', 10);
const ONLY = process.env.LB_NATIVE_ONLY ? process.env.LB_NATIVE_ONLY.split(',') : null;
const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, 'speed-sites.json'), 'utf8')).filter((s) => !s.fixture && (!ONLY || ONLY.includes(s.name)));
const MARKS = ['firstBytes', 'dom', 'shown', 'load'];

const median = (a) => {
  const v = a.filter((x) => typeof x === 'number').sort((x, y) => x - y);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};

async function load(page, bytes, url) {
  bytes.rx = 0;
  const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, null, { timeout: 15000 }).catch(() => {});
  const m = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const r = (x) => (typeof x === 'number' && x > 0 ? Math.round(x) : null);
    return { firstBytes: r(n.responseStart), dom: r(n.domContentLoadedEventEnd), shown: fcp ? r(fcp.startTime) : null, load: r(n.loadEventEnd) };
  });
  return { ...m, rxBytes: bytes.rx, status: resp ? resp.status() : 0, title: await page.title().catch(() => '') };
}

test('native, official sites', async ({ browser }, testInfo) => {
  test.setTimeout(60 * 60 * 1000);
  const { looksBlocked } = await import('../../scripts/lib/xnative.mjs');
  const out = { tier: 'native', date: new Date().toISOString(), reps: REPS, profile: 'chromebook', sites: {} };
  for (const site of SITES) {
    const runs = { cold: [], warm: [] };
    let errors = 0, blocked = false;
    for (let i = 0; i < REPS; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      try {
        const page = await ctx.newPage();
        const cdp = await applyProfile(page, testInfo);
        const bytes = { rx: 0 };
        cdp.on('Network.loadingFinished', (e) => { bytes.rx += e.encodedDataLength || 0; });
        const cold = await load(page, bytes, site.url);
        if (looksBlocked(cold.status, cold.title)) { blocked = true; break; }
        const warm = await load(page, bytes, site.url);
        runs.cold.push(cold); runs.warm.push(warm);
      } catch (e) { errors++; console.log(`native: ${site.name} rep ${i + 1} failed: ${String(e).slice(0, 120)}`); } finally { await ctx.close(); }
    }
    const sum = (list) => Object.fromEntries([...MARKS, 'rxBytes'].map((k) => [k, { median: median(list.map((x) => x[k])), values: list.map((x) => x[k] ?? null) }]));
    out.sites[site.name] = { url: site.url, errors, blocked, cold: sum(runs.cold), warm: sum(runs.warm) };
    console.log(`native: ${site.name.padEnd(14)}${blocked ? ' BLOCKED' : ` cold shown ${out.sites[site.name].cold.shown.median} load ${out.sites[site.name].cold.load.median} ms, warm shown ${out.sites[site.name].warm.shown.median} ms`}`);
  }
  const dir = path.join(__dirname, '..', '..', 'test-results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `native-${out.date.slice(0, 10)}-chromebook.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`native: wrote ${file}`);
  expect(Object.keys(out.sites).length).toBeGreaterThan(0);
});
