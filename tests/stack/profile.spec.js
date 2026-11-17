// @ts-check
// Client-side bottleneck profile (docs/1.1/audit/PROFILE-RESULTS.md). Chromebook project, through the rehearsal stack:
//   flock /tmp/limitless-rehearsal.lock deploy/rehearsal/run.sh --project=chromebook --workers=1 tests/stack/profile.spec.js
// Needs LB_PROFILE=1. Env: LB_PROFILE_REPS (2), LB_PROFILE_ONLY=a,b. Per URL and rep (fresh context, address bar navigation):
// CDP Profiler (self time by function and bucket), Performance metrics every second (heap, nodes, task time), longtask observer,
// app hooks (LB_queueState polled every 50 ms, curl.fetch wrapped for per-request timing, LB_rewrite.stats, frame images).
// A main thread that stops answering for 5 s is a result: Debugger.pause records where it was stuck.
// Output: test-results/profile-<date>/<name>.json (+ .cpuprofile.gz).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { applyProfile } = require('../lib/profile');
const { summarise } = require('../lib/cpuprofile');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const REPS = parseInt(process.env.LB_PROFILE_REPS || '2', 10);
const ONLY = process.env.LB_PROFILE_ONLY ? process.env.LB_PROFILE_ONLY.split(',') : null;
const HARD_MS = parseInt(process.env.LB_PROFILE_HARD || '90000', 10), AFTER_SHOWN_MS = 10000;
const DATE = new Date().toISOString().slice(0, 10);
const OUT = path.join(__dirname, '..', '..', 'test-results', `profile-${DATE}${process.env.LB_PROFILE_SUFFIX || ''}`);
const URLS = [
  ['steam-home', 'https://store.steampowered.com/'],
  ['steam-app730', 'https://store.steampowered.com/app/730/'],
  ['twitch', 'https://www.twitch.tv/monstercat'],
  ['spotify', 'https://open.spotify.com/'],
  ['yt-home', 'https://www.youtube.com/'],
  ['reddit-pics', 'https://www.reddit.com/r/pics/'],
  ['old-reddit', 'https://old.reddit.com/'],
  ['wikipedia', 'https://www.wikipedia.org/'],
  ['kahoot', 'https://kahoot.it/'],
  ['discord', 'https://discord.com/'],
  ['coolmath', 'https://www.coolmathgames.com/'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const race = (p, ms, dflt = null) => Promise.race([p, sleep(ms).then(() => dflt)]);

// Runs in every top document before app code. Never throws.
function initHooks() {
  if (window.top !== window) return;
  window.__lt = []; window.__lbQ = []; window.__lbReq = []; window.__lbImg = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (_) {}
  let lastImg = '';
  setInterval(() => {
    try {
      const now = Math.round(performance.now());
      if (window.LB_queueState) { const q = window.LB_queueState(); window.__lbQ.push([now, q.fetching, q.queued]); }
      const c = window.LB_net && window.LB_net.curl;
      if (c && !c.__w && typeof c.fetch === 'function') {
        c.__w = 1;
        const orig = c.fetch.bind(c);
        c.fetch = function (url, o) {
          const rec = { u: String(url).slice(0, 140), m: (o && o.method) || 'GET', t0: Math.round(performance.now()) };
          if (window.__lbReq.length < 4000) window.__lbReq.push(rec);
          const p = orig(url, o);
          Promise.resolve(p).then((r) => {
            rec.th = Math.round(performance.now()); rec.st = r.status;
            try { rec.ct = r.headers.get('content-type'); rec.cl = r.headers.get('content-length'); } catch (_) {}
            const ab = r.arrayBuffer && r.arrayBuffer.bind(r);
            if (ab) r.arrayBuffer = async function () { try { const b = await ab(); rec.te = Math.round(performance.now()); rec.n = b.byteLength; return b; } catch (e) { rec.te = Math.round(performance.now()); rec.err = String(e).slice(0, 60); throw e; } };
          }, (e) => { rec.te = Math.round(performance.now()); rec.err = String(e).slice(0, 60); });
          return p;
        };
      }
      const f = document.getElementById('frame');
      const d = f && f.contentDocument;
      if (d && d.images) {
        let tot = 0, ok = 0, vis = 0;
        for (const im of d.images) { tot++; if (im.complete && im.naturalWidth > 0) ok++; }
        const k = tot + ':' + ok;
        if (k !== lastImg) { lastImg = k; window.__lbImg.push([now, tot, ok]); }
      }
    } catch (_) {}
  }, 50);
}

const SIGNED = { cookies: null };
async function signIn(page) {
  await page.goto('/');
  if (!SIGNED.cookies) {
    await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
    await page.waitForURL(`${MOCK}/oidc/authorize**`);
    await page.locator('input[name=user][value=alice]').check();
    await page.locator('#continue').click();
    await page.waitForLoadState('load');
  }
  await expect(page.locator('#url')).toBeVisible({ timeout: 90000 });
  if (!SIGNED.cookies) SIGNED.cookies = await page.context().cookies();
  const skip = page.locator('#tutorialOverlay button', { hasText: 'Skip tour' });
  try { await skip.waitFor({ state: 'visible', timeout: 4000 }); await skip.click(); } catch (_) {}
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
}

async function oneRep(browser, testInfo, name, url, rep) {
  const ctx = await browser.newContext({ baseURL: BASE, ...(SIGNED.cookies ? { storageState: { cookies: SIGNED.cookies, origins: [] } } : {}) });
  await ctx.addInitScript(initHooks);
  const page = await ctx.newPage();
  const res = { name, url, rep, shownMs: null, loadMs: null, frozen: [], metrics: [], hbFails: 0, error: null };
  // direct loads: requests from the browser to anything but the local stack bypass the relay (member's IP, school filter)
  const direct = { n: 0, byType: {}, hosts: {} };
  page.on('request', (rq) => { const u = rq.url(); if (!/^https?:/.test(u) || /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return; direct.n++; const t = rq.resourceType(); if (!direct.urls) direct.urls = []; if (direct.urls.length < 40) { let fu = ''; try { fu = rq.frame().url().slice(0, 40); } catch (_) {} direct.urls.push({ t, u: u.slice(0, 160), frame: fu, nav: rq.isNavigationRequest() }); } direct.byType[t] = (direct.byType[t] || 0) + 1; try { const h = new URL(u).host; direct.hosts[h] = (direct.hosts[h] || 0) + 1; } catch (_) {} });
  res.direct = direct;
  // React hydration failures (prod builds log "Minified React error #418/#423/#425..."): the root is then re-rendered on the client in one task
  const hyd = { n: 0, samples: [] };
  page.on('console', (m) => { const t = m.text(); if (/Minified React error #(418|419|421|422|423|425)|hydrat/i.test(t)) { hyd.n++; if (hyd.samples.length < 5) hyd.samples.push(t.slice(0, 160)); } });
  res.hydration = hyd;
  try {
    const cdp = await applyProfile(page, testInfo);
    await cdp.send('Performance.enable');
    await signIn(page);
    await page.waitForTimeout(1500);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    const before = await page.evaluate(() => window.__lbPerf.runs.length);
    const wallStart = Date.now();
    await page.locator('#url').focus();
    await page.locator('#url').fill(url);
    await cdp.send('Profiler.start');
    // LB_PROFILE_TRACE=1: also a Chrome trace; keeps per-thread sums by event name and every event over 500 ms (what a long native task is).
    const tr = { sums: {}, long: [], names: {} };
    if (process.env.LB_PROFILE_TRACE === '1') {
      cdp.on('Tracing.dataCollected', (e) => {
        for (const ev of e.value) {
          if (ev.ph === 'M' && ev.name === 'thread_name') tr.names[ev.pid + ':' + ev.tid] = ev.args.name;
          if (ev.ph !== 'X' || !ev.dur) continue;
          const k = ev.pid + ':' + ev.tid + ':' + ev.name; tr.sums[k] = (tr.sums[k] || 0) + ev.dur;
          if (ev.dur >= 500000) tr.long.push({ k: ev.pid + ':' + ev.tid, name: ev.name, tsMs: Math.round(ev.ts / 1000), durMs: Math.round(ev.dur / 1000), args: JSON.stringify(ev.args && (ev.args.data || ev.args)).slice(0, 300) });
        }
      });
      // v8 and blink fill the default buffer in about 10 s (first run missed Steam's freeze at 23 s); timeline categories only, keep as much as possible.
      await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'loading', 'disabled-by-default-v8.gc'] } });
    }
    await page.keyboard.press('Enter');
    let pausedInfo = null;
    cdp.on('Debugger.paused', (e) => { pausedInfo = e.callFrames.slice(0, 12).map((f) => `${f.functionName || '(anon)'} ${(f.url || '').replace(/^https?:\/\/[^/]+/, '').slice(-50)}:${f.location.lineNumber + 1}`); });
    let shownAt = null, consecutive = 0, pausedOnce = false;
    const t0wall = Date.now();
    // heartbeat loop: 1 s metrics + liveness; ends at shown + 10 s or 90 s
    while (Date.now() - t0wall < HARD_MS) {
      const tick = Date.now();
      const hb = await race(page.evaluate((n) => { const r = window.__lbPerf.runs; const c = r.length > n ? r[r.length - 1] : null; return { now: Math.round(performance.now()), t0: c ? Math.round(c.t0) : null, marks: c ? { ...c.marks } : null }; }, before), 3000);
      if (!hb) {
        consecutive++; res.hbFails++;
        if (consecutive >= 2 && !pausedOnce && process.env.LB_PROFILE_NOPAUSE !== '1') {
          pausedOnce = true;
          const at = Date.now() - t0wall;
          try { await race(cdp.send('Debugger.enable'), 4000); cdp.send('Debugger.pause').catch(() => {}); await sleep(3000); } catch (_) {}
          res.frozen.push({ atMs: at, stack: pausedInfo || 'no JS pause within 3 s (stuck in native code: layout, parse, GC or wasm)' });
          // a pause that has not landed yet would fire when JS runs again and leave the page paused: drop it
          if (pausedInfo) cdp.send('Debugger.resume').catch(() => {}); else cdp.send('Debugger.disable').catch(() => {});
        }
      } else {
        if (consecutive >= 2) res.frozen.push({ recoveredAfterMs: Date.now() - t0wall });
        consecutive = 0;
        if (hb.marks && hb.marks.shown != null && shownAt == null) shownAt = Date.now();
        if (hb.marks) { res.shownMs = hb.marks.shown ?? res.shownMs; res.loadMs = hb.marks.load ?? res.loadMs; }
      }
      const m = await race(cdp.send('Performance.getMetrics'), 2000);
      if (m) { const o = {}; for (const x of m.metrics) o[x.name] = x.value; res.metrics.push({ tMs: Date.now() - t0wall, shown: shownAt != null, heap: o.JSHeapUsedSize, heapTotal: o.JSHeapTotalSize, nodes: o.Nodes, docs: o.Documents, listeners: o.JSEventListeners, task: o.TaskDuration, script: o.ScriptDuration, layout: o.LayoutDuration, style: o.RecalcStyleDuration }); }
      if (shownAt && Date.now() - shownAt >= AFTER_SHOWN_MS && consecutive === 0) break;
      const rest = 1000 - (Date.now() - tick); if (rest > 0) await sleep(rest);
    }
    res.wallMs = Date.now() - t0wall;
    res.shownWall = shownAt ? shownAt - t0wall : null;
    if (process.env.LB_PROFILE_TRACE === '1') {
      const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
      cdp.send('Tracing.end').catch(() => {});
      await race(done, 120000);
      const main = Object.keys(tr.names).filter((k) => /CrRendererMain/.test(tr.names[k]));
      const agg = {};
      for (const [k, v] of Object.entries(tr.sums)) { const [pid, tid, ...n] = k.split(':'); if (main.includes(pid + ':' + tid)) agg[n.join(':')] = (agg[n.join(':')] || 0) + Math.round(v / 1000); }
      res.trace = { mainThreads: main.map((k) => tr.names[k] + '@' + k), sumsMs: Object.fromEntries(Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 40)), long: tr.long.filter((x) => main.includes(x.k)).sort((a, b) => b.durMs - a.durMs).slice(0, 25) };
    }
    // LB_PROFILE_DUMPHTML=1: save the frame's final blob document (what the browser parses) to find a pathological line
    if (process.env.LB_PROFILE_DUMPHTML === '1') {
      const html = await race(page.evaluate(async () => { try { return await (await fetch(document.getElementById('frame').src)).text(); } catch (e) { return 'ERR ' + e; } }), 90000);
      fs.mkdirSync(OUT, { recursive: true });
      if (html) fs.writeFileSync(path.join(OUT, `${name}-r${rep}.final.html`), html);
    }
    // profile
    const prof = await race(cdp.send('Profiler.stop'), 60000);
    if (prof) {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, `${name}-r${rep}.cpuprofile.gz`), zlib.gzipSync(JSON.stringify(prof.profile)));
      res.cpu = summarise(prof.profile, 15);
    } else res.cpu = null, res.error = 'Profiler.stop did not answer in 60 s (main thread stuck)';
    // app data
    const data = await race(page.evaluate(() => {
      const f = document.getElementById('frame'); let fd = null, text = 0, imgs = null;
      try { fd = f.contentDocument; text = (fd.body ? fd.body.innerText : '').trim().length; } catch (_) {}
      const r = window.__lbPerf.runs[window.__lbPerf.runs.length - 1];
      return { t0: Math.round(r.t0), marks: r.marks, lt: window.__lt, q: window.__lbQ, req: window.__lbReq, img: window.__lbImg,
        rewrite: window.LB_rewrite ? window.LB_rewrite.stats() : null, log: window.LB_logState ? window.LB_logState() : null,
        maxConc: (() => { try { return localStorage.getItem('limitless:idlethreads:v1'); } catch (_) { return null; } })(),
        textLen: text, domNodes: fd ? fd.getElementsByTagName('*').length : null,
        statusText: (document.getElementById('statusText') || {}).textContent || null,
        errCard: !!(f && f.srcdoc && /Error - Limitless/.test(f.srcdoc)) };
    }), 25000);
    if (data) {
      const t0 = data.t0, shown = data.marks && data.marks.shown != null ? data.marks.shown : null;
      const lt = data.lt.map(([s, d]) => [s - t0, d]).filter(([s]) => s >= 0);
      const stat = (arr) => ({ count: arr.length, gt50: arr.filter(([, d]) => d > 50).length, gt1000: arr.filter(([, d]) => d > 1000).length, maxMs: arr.reduce((m, [, d]) => Math.max(m, d), 0), totalMs: arr.reduce((a, [, d]) => a + d, 0) });
      res.longtasks = { all: stat(lt), beforeShown: shown != null ? stat(lt.filter(([s]) => s < shown)) : null, afterShown: shown != null ? stat(lt.filter(([s]) => s >= shown)) : null, top: [...lt].sort((a, b) => b[1] - a[1]).slice(0, 8) };
      const req = data.req.map((r) => ({ ...r, t0: r.t0 - t0, th: r.th != null ? r.th - t0 : null, te: r.te != null ? r.te - t0 : null })).filter((r) => r.t0 >= -50);
      const done = req.filter((r) => r.te != null);
      const bytes = done.reduce((a, r) => a + (r.n || 0), 0);
      const kind = (r) => /image|webp|avif|png|jpe?g|gif/i.test(r.ct || '') || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(r.u) ? 'img' : /javascript/i.test(r.ct || '') || /\.js(\?|$)/.test(r.u) ? 'js' : /css/i.test(r.ct || '') ? 'css' : /html/i.test(r.ct || '') ? 'html' : 'other';
      const byKind = {}; for (const r of req) { const k = kind(r); const e = byKind[k] || (byKind[k] = { n: 0, bytes: 0, done: 0 }); e.n++; e.bytes += r.n || 0; if (r.te != null) e.done++; }
      const q = data.q.map(([t, f, qd]) => [t - t0, f, qd]).filter(([t]) => t >= 0);
      let qInt = 0; for (let i = 1; i < q.length; i++) qInt += q[i - 1][2] * (q[i][0] - q[i - 1][0]);   // queued jobs x ms = total queue wait
      const img = data.img.map(([t, tot, ok]) => [t - t0, tot, ok]).filter(([t]) => t >= 0);
      const lastImg = img.length ? img[img.length - 1] : null;
      const netMs = done.filter((r) => r.th != null).map((r) => r.te - r.t0).sort((a, b) => a - b);
      const jsReq = req.filter((r) => kind(r) === 'js' && r.n);
      res.requests = {
        started: req.length, finished: done.length, errors: req.filter((r) => r.err).length, bytes, byKind,
        maxFetching: q.reduce((m, x) => Math.max(m, x[1]), 0), maxQueued: q.reduce((m, x) => Math.max(m, x[2]), 0),
        queueWaitTotalMs: Math.round(qInt), queueWaitAvgMs: req.length ? Math.round(qInt / req.length) : null,
        dispatchToDoneMedianMs: netMs.length ? netMs[Math.floor(netMs.length / 2)] : null, dispatchToDoneP90Ms: netMs.length ? netMs[Math.floor(netMs.length * 0.9)] : null,
        imagesTotalInFrame: lastImg ? lastImg[1] : 0, imagesDoneInFrame: lastImg ? lastImg[2] : 0,
        lastImageAtMs: lastImg ? lastImg[0] : null, shownMs: shown,
        shownToLastImageMs: lastImg && shown != null ? Math.round(lastImg[0] - shown) : null,
        imgTimeline: img.filter((_, i) => i % 5 === 0 || i === img.length - 1).slice(0, 80),
        jsSizes: jsReq.map((r) => r.n).sort((a, b) => b - a).slice(0, 25), jsTotalBytes: jsReq.reduce((a, r) => a + r.n, 0), jsOver16k: jsReq.filter((r) => r.n >= 16384).length,
        topSlowest: [...done].sort((a, b) => (b.te - b.t0) - (a.te - a.t0)).slice(0, 8).map((r) => ({ u: r.u, ms: r.te - r.t0, n: r.n, st: r.st })),
        unfinished: req.filter((r) => r.te == null).slice(0, 8).map((r) => ({ u: r.u, t0: r.t0, th: r.th })),
      };
      res.queueSeries = q.filter((_, i) => i % 10 === 0).slice(0, 400);
      res.marks = data.marks; res.rewrite = data.rewrite; res.logRing = data.log; res.textLen = data.textLen; res.frameNodes = data.domNodes; res.statusText = data.statusText; res.errCard = data.errCard;
    } else if (!res.error) res.error = 'page did not answer for final data (frozen at end)';
    const hs = res.metrics.map((m) => m.heap).filter(Boolean);
    const atShown = res.metrics.find((m) => m.shown), last = res.metrics[res.metrics.length - 1];
    res.heap = { peakMB: hs.length ? +(Math.max(...hs) / 1e6).toFixed(1) : null, atShownMB: atShown ? +(atShown.heap / 1e6).toFixed(1) : null, endMB: last ? +(last.heap / 1e6).toFixed(1) : null, nodesEnd: last ? last.nodes : null };
    const m0 = res.metrics[0], m1 = last;
    if (m0 && m1) res.mainThread = { taskSec: +(m1.task - m0.task).toFixed(2), scriptSec: +(m1.script - m0.script).toFixed(2), layoutSec: +(m1.layout - m0.layout).toFixed(2), styleSec: +(m1.style - m0.style).toFixed(2), wallSec: +(res.wallMs / 1000).toFixed(1) };
  } catch (e) { res.error = String(e).slice(0, 300); }
  finally { await race(ctx.close(), 20000); }
  return res;
}

// Playwright's trace snapshots (captureSnapshot) walk the DOM after every action and show up in the CPU profile: keep them off.
test.use({ trace: 'off' });
test.describe('client profile', () => {
  test.skip(process.env.LB_PROFILE !== '1', 'set LB_PROFILE=1 (and run through deploy/rehearsal/run.sh)');
  for (const [name, url] of URLS) {
    if (ONLY && !ONLY.includes(name)) continue;
    test(name, async ({ browser }, testInfo) => {
      test.setTimeout(20 * 60 * 1000);
      const runs = [];
      for (let i = 1; i <= REPS; i++) {
        const r = await oneRep(browser, testInfo, name, url, i);
        runs.push(r);
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ name, url, load: require('os').loadavg(), runs }, null, 1));
        console.log(`profile: ${name} r${i} shown ${r.shownMs} frozen ${r.frozen.length} busy ${r.cpu && r.cpu.busyMs} heapPeak ${r.heap && r.heap.peakMB} err ${r.error || ''}`);
      }
    });
  }
});
