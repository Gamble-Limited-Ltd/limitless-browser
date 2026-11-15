// @ts-check
// Real-site suite (docs/1.0/TESTING.md 6a). Runs only with LB_SITES=1, chromebook project, through the rehearsal stack:
//   LB_SITES=1 flock /tmp/limitless-rehearsal.lock deploy/rehearsal/run.sh --project=chromebook tests/stack/sites.spec.js
// For each site in real-sites.json, REPS times (fresh context, signed in as the mock user): navigate through the address bar,
// then decide `loaded` = the page was shown, no error card, and the site's selector exists in the proxied frame.
// Records shown / load ms and, on failure, a category: dns, connect, tls, http, blocked, script (selector missing and page
// errors seen), csp (CSP or frame refusal in the console), render (shown, no errors, selector missing), timeout.
// Output: test-results/sites-<sha>.json. Env: LB_SITES_REPS (3), LB_SITES_ONLY=a,b, LB_SITES_SMOKE=1 (only the 12 sites flagged
// `smoke: true`), LB_SPEED_SHA. Rep 3 is skipped (counted as the same failure) when reps 1 and 2 failed with the same category.
// An error card or a missing result ends a rep at once; run with --workers=1 (npm run test:sites).
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
const SMOKE = process.env.LB_SITES_SMOKE === '1';
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

// The first rep of a site signs in through the mock GATE; later reps start from the saved session (cookies only: every other
// store is empty, so the page still loads cold) and skip the sign-in round trip.
const SIGNED = new Map();
async function signIn(page, site) {
  const saved = site && SIGNED.get(site.name);
  if (saved) await page.goto('/');
  else {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
    await page.waitForURL(`${MOCK}/oidc/authorize**`);
    await page.locator('input[name=user][value=alice]').check();
    await page.locator('#continue').click();
    await page.waitForLoadState('load');
  }
  await expect(page.locator('#url')).toBeVisible({ timeout: 90000 });
  if (site && !saved) { try { SIGNED.set(site.name, { cookies: await page.context().cookies() }); } catch (_) {} }
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

// A page that hangs the browser (busy loop under CPU throttling) must not stall the whole run: give up after 150 s.
async function tryOnce(browser, testInfo, site) {
  const r = await tryOnceOnce(browser, testInfo, site);
  // A crashed or stuck browser under load says nothing about the site: one more try before it counts.
  if (!r.loaded && (r.category === 'harness' || r.category === 'hang')) { const r2 = await tryOnceOnce(browser, testInfo, site); r2.retried = true; return r2; }
  return r;
}
async function tryOnceOnce(browser, testInfo, site) {
  let timer;
  const st = { diag: null };
  const hang = new Promise((resolve) => { timer = setTimeout(() => resolve({ loaded: false, shown: null, load: null, category: 'hang', detail: 'no result in 150 s', diag: st.diag }), 150000); });
  try { return await Promise.race([tryOnceInner(browser, testInfo, site, st), hang]); } finally { clearTimeout(timer); }
}

async function tryOnceInner(browser, testInfo, site, st) {
  const ctx = await browser.newContext({ baseURL: BASE, ...(SIGNED.get(site.name) ? { storageState: { cookies: SIGNED.get(site.name).cookies, origins: [] } } : {}) });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', (m) => { const x = m.text(); if (/Content Security Policy|Refused to|X-Frame|frame-ancestors/i.test(x)) cons.push(x.slice(0, 160)); });
  const res = { loaded: false, shown: null, load: null, category: null, detail: null };
  // at 100 s, look at what the app is doing (a stuck page makes evaluate hang, so it is raced against 5 s)
  const wd = setTimeout(async () => {
    st.diag = await Promise.race([
      page.evaluate(() => { const r = window.__lbPerf.runs; const c = r[r.length - 1]; const f = document.getElementById('frame'); return { marks: c && c.marks, frame: f && (f.src || '').slice(0, 30), status: (document.getElementById('statusText') || {}).textContent || null }; }).catch((e) => String(e).slice(0, 80)),
      new Promise((resolve) => setTimeout(() => resolve('page did not answer in 5 s'), 5000)),
    ]);
  }, 100000);
  try {
    await applyProfile(page, testInfo);
    await signIn(page, site);
    const before = await page.evaluate(() => window.__lbPerf.runs.length);
    await page.locator('#url').focus();
    await page.locator('#url').fill(site.url);
    await page.keyboard.press('Enter');
    // Enter is sometimes swallowed (an open suggestion list or a late dialog): if no navigation started within 4 s, use the Go button.
    const started = await page.waitForFunction((n) => window.__lbPerf.runs.length > n, before, { timeout: 4000 }).then(() => true).catch(() => false);
    if (!started) { await page.locator('#go').click({ timeout: 5000 }).catch(() => {}); res.enterRetried = true; }
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
    // Second proof of a real render for pages whose selector went stale: plenty of visible text and no bot-check or error wording.
    let via = found ? 'selector' : null;
    const probe = await frame.evaluate(() => ({ len: (document.body ? document.body.innerText : '').trim().length, head: (document.title + ' | ' + (document.body ? document.body.innerText : '')).replace(/\s+/g, ' ').slice(0, 200) })).catch(() => ({ len: 0, head: null }));
    const BLOCKED = /just a moment|access denied|captcha|verify you are (a )?human|unusual traffic|request blocked|attention required|are you a robot|pardon our interruption|enable javascript|forbidden/i;
    if (!found && probe.len >= 400 && !BLOCKED.test(probe.head || '')) { found = true; via = 'text'; }
    res.loaded = found; res.via = via; res.textLen = probe.len;
    if (!found) res.snippet = probe.head;
    if (!found) {
      if (cons.length) { res.category = 'csp'; res.detail = cons[0]; }
      else if (perr.length) { res.category = 'script'; res.detail = perr.slice(0, 3).join(' | ').slice(0, 200); }
      else { res.category = 'render'; res.detail = 'selector not found'; }
    }
    if (perr.length) res.pageErrors = perr.length;
    return res;
  } catch (e) {
    res.category = 'harness'; res.detail = String(e).slice(0, 160); return res;
  } finally { clearTimeout(wd); await ctx.close(); }
}

// One test per site so Playwright can run several at once (--workers=3). Each writes test-results/sites-<sha>/<name>.json;
// scripts/sites-merge.mjs joins them into test-results/sites-<sha>.json (npm run test:sites does both).
test.describe('real sites', () => {
  test.skip(process.env.LB_SITES !== '1', 'set LB_SITES=1 (and run through deploy/rehearsal/run.sh)');
  test.describe.configure({ mode: 'parallel' });

  for (const site of SITES) {
    if (ONLY && !ONLY.includes(site.name)) continue;
    if (SMOKE && !site.smoke) continue;
    test(site.name, async ({ browser }, testInfo) => {
      test.setTimeout(30 * 60 * 1000);
      const runs = [];
      for (let i = 0; i < REPS; i++) {
        const [a, b] = runs.slice(-2);
        if (i === 2 && a && b && !a.loaded && !b.loaded && a.category === b.category) { runs.push({ ...b, skipped: true }); continue; }
        runs.push(await tryOnce(browser, testInfo, site));
      }
      const ok = runs.filter((r) => r.loaded);
      const fails = runs.filter((r) => !r.loaded);
      const cats = {};
      for (const f of fails) cats[f.category] = (cats[f.category] || 0) + 1;
      const rec = {
        url: site.url, cat: site.cat, sel: site.sel, reps: REPS, loadedCount: ok.length,
        shownMedian: median(ok.map((r) => r.shown)), loadMedian: median(ok.map((r) => r.load)),
        failures: cats, detail: fails[0] ? fails[0].detail : null, snippet: fails[0] ? fails[0].snippet : null, runs,
      };
      console.log(`sites: ${site.name.padEnd(18)} ${ok.length}/${REPS} shown ${rec.shownMedian} load ${rec.loadMedian} ${JSON.stringify(cats)} ${fails[0] ? String(fails[0].detail).slice(0, 80) : ''}`);
      const dir = path.join(__dirname, '..', '..', 'test-results', `sites-${sha()}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${site.name}.json`), JSON.stringify({ name: site.name, ...rec }, null, 2));
    });
  }
});
