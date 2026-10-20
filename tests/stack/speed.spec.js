// @ts-check
// Speed harness. Runs only with LB_SPEED=1, against the rehearsal stack (needs outbound internet):
//   LB_SPEED=1 deploy/rehearsal/run.sh tests/stack/speed.spec.js        (npm run test:speed)
// For each site in speed-sites.json, REPS times: a fresh browser context (empty caches, new session), sign in as the
// mock user alice, load the site cold, then load the same URL again warm. Marks come from window.__lbPerf (index.html,
// go()): firstBytes, dom, shown, load, in ms since the navigation started. Output: test-results/speed-<sha>.json,
// medians per site and phase. Compare two runs with scripts/speed-compare.mjs.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const REPS = parseInt(process.env.LB_SPEED_REPS || '3', 10);
const MARKS = ['firstBytes', 'dom', 'shown', 'load'];
const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, 'speed-sites.json'), 'utf8'));
const ONLY = process.env.LB_SPEED_ONLY ? process.env.LB_SPEED_ONLY.split(',') : null;

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

async function signIn(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
  await page.waitForURL(`${MOCK}/oidc/authorize**`);
  await page.locator('input[name=user][value=alice]').check();
  await page.locator('#continue').click();
  await page.waitForLoadState('load');
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  // First-run overlays would not block navigation, but dismiss them so they cannot add noise.
  const skip = page.locator('#tutorialOverlay button', { hasText: 'Skip tour' });
  try { await skip.waitFor({ state: 'visible', timeout: 4000 }); await skip.click(); } catch (_) {}
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
}

/** Navigate through the address bar and return the marks of that navigation (null marks when it never finished). */
async function navigate(page, url) {
  const before = await page.evaluate(() => window.__lbPerf.runs.length);
  await page.locator('#url').focus();
  await page.locator('#url').fill(url);
  await page.keyboard.press('Enter');
  try {
    await page.waitForFunction(
      (n) => { const r = window.__lbPerf.runs; return r.length > n && r[r.length - 1].marks.load != null; },
      before,
      { timeout: 60000, polling: 50 },
    );
  } catch (_) { /* record whatever marks exist */ }
  return page.evaluate(() => ({ ...window.__lbPerf.runs[window.__lbPerf.runs.length - 1].marks }));
}

test.describe('speed', () => {
  test.skip(process.env.LB_SPEED !== '1', 'set LB_SPEED=1 (and run through deploy/rehearsal/run.sh)');

  test('cold and warm page loads', async ({ browser }) => {
    test.setTimeout(45 * 60 * 1000);
    const out = { sha: sha(), date: new Date().toISOString(), reps: REPS, base: BASE, sites: {} };
    for (const site of SITES) {
      if (ONLY && !ONLY.includes(site.name)) continue;
      const runs = { cold: [], warm: [] };
      for (let i = 0; i < REPS; i++) {
        const ctx = await browser.newContext({ baseURL: BASE });
        const page = await ctx.newPage();
        try {
          await signIn(page);
          runs.cold.push(await navigate(page, site.url));
          runs.warm.push(await navigate(page, site.url));
        } catch (e) {
          console.log(`speed: ${site.name} rep ${i + 1} failed: ${String(e).slice(0, 120)}`);
        }
        await ctx.close();
      }
      const summarize = (list) => {
        const o = { runs: list.length };
        for (const m of MARKS) o[m] = { median: median(list.map((r) => r[m])), values: list.map((r) => r[m] ?? null) };
        return o;
      };
      out.sites[site.name] = { url: site.url, cold: summarize(runs.cold), warm: summarize(runs.warm) };
      console.log(`speed: ${site.name.padEnd(12)} cold load ${out.sites[site.name].cold.load.median} ms, warm load ${out.sites[site.name].warm.load.median} ms`);
    }
    const dir = path.join(__dirname, '..', '..', 'test-results');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `speed-${out.sha}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`speed: wrote ${file}`);
    expect(Object.keys(out.sites).length).toBeGreaterThan(0);
  });
});
