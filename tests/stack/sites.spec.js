// @ts-check
// Real-site suite (docs/1.0/TESTING.md 6a). Runs only with LB_SITES=1, chromebook project, through the rehearsal stack:
//   LB_SITES=1 flock /tmp/limitless-rehearsal.lock deploy/rehearsal/run.sh --project=chromebook tests/stack/sites.spec.js
// For each site in real-sites.json, REPS times (fresh context, signed in as the mock user): navigate through the address bar,
// then decide `loaded` = the page was shown, no error card, and the site's selector exists in the proxied frame.
// Records shown / load ms and, on failure, a category: dns, connect, tls, http, blocked, script (selector missing and page
// errors seen), csp (CSP or frame refusal in the console), render (shown, no errors, selector missing), timeout.
// Output: test-results/sites-<sha>.json. Env: LB_SITES_REPS (3), LB_SITES_ONLY=a,b, LB_SPEED_SHA.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { applyProfile } = require('../lib/profile');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const REPS = parseInt(process.env.LB_SITES_REPS || '3', 10);
const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, 'real-sites.json'), 'utf8'));
const ONLY = process.env.LB_SITES_ONLY ? process.env.LB_SITES_ONLY.split(',') : null;
const SHOWN_TIMEOUT = 45000;
const SEL_TIMEOUT = 12000;

const median = (a) => {
  const v = a.filter((x) => typeof x === 'number').sort((x, y) => x - y);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};
const sha = () => {
  if (process.env.LB_SPEED_SHA) return process.env.LB_SPEED_SHA;
  try { return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch { return 'local'; }
};

async function signIn(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
  await page.waitForURL(`${MOCK}/oidc/authorize**`);
  await page.locator('input[name=user][value=alice]').check();
  await page.locator('#continue').click();
  await page.waitForLoadState('load');
  await expect(page.locator('#url')).toBeVisible({ timeout: 90000 });
  const skip = page.locator('#tutorialOverlay button', { hasText: 'Skip tour' });
  try { await skip.waitFor({ state: 'visible', timeout: 4000 }); await skip.click(); } catch (_) {}
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
}

function classifyError(text) {
  const t = text || '';
  if (/ERR_NAME_NOT_RESOLVED|dns/i.test(t)) return 'dns';
  if (/ERR_SSL|tls|certificate/i.test(t)) return 'tls';
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_CONNECTION_ABORTED|connect/i.test(t)) return 'connect';
  if (/HTTP \d{3}/i.test(t)) return 'http';
  if (/ERR_BLOCKED_BY_CLIENT/i.test(t)) return 'blocked';
  return 'error-other';
}

async function tryOnce(browser, testInfo, site) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', (m) => { const x = m.text(); if (/Content Security Policy|Refused to|X-Frame|frame-ancestors/i.test(x)) cons.push(x.slice(0, 160)); });
  const res = { loaded: false, shown: null, load: null, category: null, detail: null };
  try {
    await applyProfile(page, testInfo);
    await signIn(page);
    const before = await page.evaluate(() => window.__lbPerf.runs.length);
    await page.locator('#url').focus();
    await page.locator('#url').fill(site.url);
    await page.keyboard.press('Enter');
    // Wait for either the shown mark or an error card (frame srcdoc is set by renderErrorPage).
    const outcome = await page.waitForFunction((n) => {
      const f = document.getElementById('frame');
      if (f && f.srcdoc && /Error - Limitless/.test(f.srcdoc)) return { err: f.srcdoc.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300) };
      const r = window.__lbPerf.runs;
      if (r.length > n && r[r.length - 1].marks.shown != null) return { ok: true };
      return false;
    }, before, { timeout: SHOWN_TIMEOUT, polling: 100 }).then((h) => h.jsonValue()).catch(() => null);
    if (!outcome) { res.category = 'timeout'; res.detail = 'not shown in 45 s'; return res; }
    if (outcome.err) { res.category = classifyError(outcome.err); res.detail = outcome.err.slice(0, 160); return res; }
    const fh = await page.locator('#frame').elementHandle();
    const frame = await fh.contentFrame();
    let found = false;
    try { await frame.waitForSelector(site.sel, { timeout: SEL_TIMEOUT, state: 'attached' }); found = true; } catch (_) {}
    // wait a little for load mark (not required)
    try { await page.waitForFunction(() => { const r = window.__lbPerf.runs; return r[r.length - 1].marks.load != null; }, null, { timeout: 15000 }); } catch (_) {}
    const marks = await page.evaluate(() => ({ ...window.__lbPerf.runs[window.__lbPerf.runs.length - 1].marks }));
    res.shown = marks.shown ?? null; res.load = marks.load ?? null;
    const perr = await frame.evaluate(() => (window.__perr || []).slice(0, 6)).catch(() => []);
    res.loaded = found;
    if (!found) {
      if (cons.length) { res.category = 'csp'; res.detail = cons[0]; }
      else if (perr.length) { res.category = 'script'; res.detail = perr.slice(0, 3).join(' | ').slice(0, 200); }
      else { res.category = 'render'; res.detail = 'selector not found'; }
    }
    if (perr.length) res.pageErrors = perr.length;
    return res;
  } catch (e) {
    res.category = 'harness'; res.detail = String(e).slice(0, 160); return res;
  } finally { await ctx.close(); }
}

// One test per site so Playwright can run several at once (--workers=3). Each writes test-results/sites-<sha>/<name>.json;
// scripts/sites-merge.mjs joins them into test-results/sites-<sha>.json (npm run test:sites does both).
test.describe('real sites', () => {
  test.skip(process.env.LB_SITES !== '1', 'set LB_SITES=1 (and run through deploy/rehearsal/run.sh)');
  test.describe.configure({ mode: 'parallel' });

  for (const site of SITES) {
    if (ONLY && !ONLY.includes(site.name)) continue;
    test(site.name, async ({ browser }, testInfo) => {
      test.setTimeout(30 * 60 * 1000);
      const runs = [];
      for (let i = 0; i < REPS; i++) runs.push(await tryOnce(browser, testInfo, site));
      const ok = runs.filter((r) => r.loaded);
      const fails = runs.filter((r) => !r.loaded);
      const cats = {};
      for (const f of fails) cats[f.category] = (cats[f.category] || 0) + 1;
      const rec = {
        url: site.url, cat: site.cat, sel: site.sel, reps: REPS, loadedCount: ok.length,
        shownMedian: median(ok.map((r) => r.shown)), loadMedian: median(ok.map((r) => r.load)),
        failures: cats, detail: fails[0] ? fails[0].detail : null, runs,
      };
      console.log(`sites: ${site.name.padEnd(18)} ${ok.length}/${REPS} shown ${rec.shownMedian} load ${rec.loadMedian} ${JSON.stringify(cats)} ${fails[0] ? String(fails[0].detail).slice(0, 80) : ''}`);
      const dir = path.join(__dirname, '..', '..', 'test-results', `sites-${sha()}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${site.name}.json`), JSON.stringify({ name: site.name, ...rec }, null, 2));
    });
  }
});
