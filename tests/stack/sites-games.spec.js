// @ts-check
// Game and school site audit (docs/1.1/audit/SITES-GAMES.md). Same harness as sites.spec.js (rehearsal stack, chromebook project, mock user),
// list in sites-games.json, plus per-load instrumentation: request log (libcurl fetch), bot-check verdicts, and in the frame canvas/WebGL,
// WebAssembly, page WebSockets, audio, pointer lock, fullscreen, gamepad, SharedArrayBuffer.
//   LB_GAMES=1 flock /tmp/limitless-rehearsal.lock deploy/rehearsal/run.sh --project=chromebook --workers=1 tests/stack/sites-games.spec.js
// Env: LB_GAMES_REPS (2), LB_GAMES_ONLY=a,b, LB_GAMES_OUT (default test-results/games-<sha>), LB_SPEED_SHA. Output: one JSON per site.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { applyProfile } = require('../lib/profile');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const REPS = parseInt(process.env.LB_GAMES_REPS || '2', 10);
const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, 'sites-games.json'), 'utf8'));
const ONLY = process.env.LB_GAMES_ONLY ? process.env.LB_GAMES_ONLY.split(',') : null;
const SHOWN_TIMEOUT = 45000;
const SEL_TIMEOUT = 12000;
const DWELL_MS = 12000;   // after shown: let the page and game settle, then read the instrumentation

const median = (a) => { const v = a.filter((x) => typeof x === 'number').sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };
const sha = () => { if (process.env.LB_SPEED_SHA) return process.env.LB_SPEED_SHA; try { return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch { return 'local'; } };

let SAVED = null;
async function signIn(page) {
  await page.goto('/');
  if (!SAVED) {
    await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
    await page.waitForURL(`${MOCK}/oidc/authorize**`);
    await page.locator('input[name=user][value=alice]').check();
    await page.locator('#continue').click();
    await page.waitForLoadState('load');
  }
  await expect(page.locator('#url')).toBeVisible({ timeout: 90000 });
  if (!SAVED) { try { SAVED = await page.context().cookies(); } catch (_) {} }
  const skip = page.locator('#tutorialOverlay button', { hasText: 'Skip tour' });
  try { await skip.waitFor({ state: 'visible', timeout: 4000 }); await skip.click(); } catch (_) {}
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
}

// Runs in every frame (parent app and the blob frame) before page scripts. The frame part records what a game needs.
function initScript() {
  const g = (window.__gm = { ctx: [], wasm: { n: 0, bytes: 0, shared: 0 }, ws: { open: [], msg: 0, bin: 0, err: 0, close: [] }, audio: [], plock: 0, plockRej: 0, fs: 0, fsRej: 0, gamepad: 0, sab: 0, workers: 0, swReg: 0 });
  g.lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) g.lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch (_) {}
  const isTop = window.top === window;
  if (isTop) {
    window.addEventListener('message', (e) => { const d = e.data; if (d && d.t === 'ws' && d.a === 'open') g.ws.open.push(String(d.url).slice(0, 80)); }, true);
    return;
  }
  window.addEventListener('message', (e) => { const d = e.data; if (!d || d.t !== 'ws') return; if (d.a === 'message') { g.ws.msg++; if (d.b64) g.ws.bin++; } else if (d.a === 'error') g.ws.err++; else if (d.a === 'close') g.ws.close.push(d.code); }, true);
  try {
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...r) { const x = gc.call(this, t, ...r); g.ctx.push(t + (x ? '' : ':null')); return x; };
    if (window.OffscreenCanvas) { const og = OffscreenCanvas.prototype.getContext; OffscreenCanvas.prototype.getContext = function (t, ...r) { const x = og.call(this, t, ...r); g.ctx.push('off-' + t + (x ? '' : ':null')); return x; }; }
  } catch (_) {}
  try {
    for (const k of ['instantiate', 'instantiateStreaming', 'compile', 'compileStreaming']) {
      const o = WebAssembly[k]; if (!o) continue;
      WebAssembly[k] = function (a, ...r) { g.wasm.n++; try { if (a && a.byteLength) g.wasm.bytes += a.byteLength; } catch (_) {} return o.call(this, a, ...r); };
    }
    const M = WebAssembly.Memory; WebAssembly.Memory = function (d) { if (d && d.shared) g.wasm.shared++; return new M(d); }; WebAssembly.Memory.prototype = M.prototype;
  } catch (_) {}
  try {
    for (const n of ['AudioContext', 'webkitAudioContext']) {
      const A = window[n]; if (!A) continue;
      window[n] = function (...a) { const c = new A(...a); g.audio.push(c); return c; }; window[n].prototype = A.prototype;
    }
    const pl = Element.prototype.requestPointerLock; Element.prototype.requestPointerLock = function (...a) { g.plock++; try { const p = pl.apply(this, a); if (p && p.catch) p.catch(() => g.plockRej++); return p; } catch (e) { g.plockRej++; throw e; } };
    const rf = Element.prototype.requestFullscreen; Element.prototype.requestFullscreen = function (...a) { g.fs++; try { const p = rf.apply(this, a); if (p && p.catch) p.catch(() => g.fsRej++); return p; } catch (e) { g.fsRej++; throw e; } };
    const gp = navigator.getGamepads; if (gp) navigator.getGamepads = function () { g.gamepad++; return gp.call(navigator); };
    if (window.SharedArrayBuffer) { const S = window.SharedArrayBuffer; window.SharedArrayBuffer = function (...a) { g.sab++; return new S(...a); }; window.SharedArrayBuffer.prototype = S.prototype; }
    const W = window.Worker; if (W) { window.Worker = function (...a) { g.workers++; return new W(...a); }; window.Worker.prototype = W.prototype; }
  } catch (_) {}
}

// Parent side, after sign-in: record every libcurl request and every bot-check verdict.
const HOOK = (fontLite) => {
  const L = window.__gm; L.req = []; L.bot = []; L.skipped = 0; L.q = { n: 0, sumQ: 0, maxQ: 0, maxF: 0 };
  setInterval(() => { try { const s = window.LB_queueState(); L.q.n++; L.q.sumQ += s.queued; if (s.queued > L.q.maxQ) L.q.maxQ = s.queued; if (s.fetching > L.q.maxF) L.q.maxF = s.fetching; } catch (_) {} }, 200);
  let owner = libcurl.HTTPSession.prototype; while (owner && !Object.prototype.hasOwnProperty.call(owner, 'fetch')) owner = Object.getPrototypeOf(owner);
  const of = owner.fetch;
  // LB_GAMES_FONTLITE=1 emulates the proposed fix at the fetch layer (no source change): legacy font formats and non-Latin subsets
  // answer an empty 200, which rewriteCssUrls treats as "keep the absolute url" (app/main.js rewriteCssUrls, byteLength > 0 check).
  const skipFont = (u) => { try { const p = new URL(u).pathname.toLowerCase(); return /\.(eot|svg|ttf|otf)$/.test(p) && /font|woff/.test(u.toLowerCase() + p) ? true : /\.woff2?$/.test(p) && /(cyrillic|vietnamese|devanagari|greek|latin-ext|arabic|hebrew|thai|korean|japanese|chinese|bengali|tamil|telugu|gujarati|gurmukhi|kannada|malayalam|khmer|lao|myanmar|sinhala|tibetan|armenian|georgian|ethiopic|oriya)/.test(p); } catch (_) { return false; } };
  owner.fetch = function (url, opts) {
    if (fontLite && skipFont(String(url)) && !(opts && opts.method && opts.method !== 'GET')) { L.skipped++; return Promise.resolve(new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'font/woff2' } })); }
    const t0 = performance.now(); const rec = { u: String(url).slice(0, 140), m: (opts && opts.method) || 'GET', t0: Math.round(t0) }; L.req.push(rec);
    const p = of.call(this, url, opts);
    return Promise.resolve(p).then((r) => {
      rec.s = r.status; rec.ms = Math.round(performance.now() - t0);
      try { rec.srv = r.headers.get('server'); rec.cf = r.headers.get('cf-mitigated') || (r.headers.get('cf-ray') ? 'cf' : ''); rec.ct = r.headers.get('content-type'); rec.wire = parseInt(r.headers.get('content-length') || '0', 10) || 0; } catch (_) {}
      try { r.clone().arrayBuffer().then((b) => { rec.b = b.byteLength; }, () => {}); } catch (_) {}
      return r;
    }, (e) => { rec.ms = Math.round(performance.now() - t0); rec.err = String((e && e.message) || e).slice(0, 120); rec.en = e && e.name; throw e; });
  };
  const ob = window.LB_botCheck;
  window.LB_botCheck = function (s, html, h) {
    const r = ob(s, html, h); const t = String(html || '').slice(0, 60000), hh = {}; try { Object.keys(h || {}).forEach((k) => { hh[k.toLowerCase()] = String(h[k]); }); } catch (_) {}
    const v = /cf-mitigated|cf-ray/.test(Object.keys(hh).join(' ')) || /cloudflare/i.test(hh.server || '') ? 'cloudflare' : /datadome/i.test(t + (hh.server || '')) ? 'datadome' : /px-captcha|perimeterx/i.test(t) ? 'perimeterx' : /Incapsula/i.test(t) ? 'imperva' : /edgesuite|akamai/i.test(t + (hh.server || '')) ? 'akamai' : /recaptcha|hcaptcha|turnstile/i.test(t) ? 'captcha-widget' : '';
    L.bot.push({ status: s, verdict: r, vendor: v, len: String(html || '').length }); return r;
  };
};
const CURL_CATS = { 6: 'dns', 7: 'connect', 18: 'partial', 28: 'timeout', 35: 'tls', 51: 'cert', 52: 'reset', 56: 'reset', 58: 'cert', 60: 'cert' };
const errClass = (e) => { const m = /error code (\d+)/i.exec(e || ''); return m ? (CURL_CATS[m[1]] || 'curl' + m[1]) : /abort|timeout/i.test(e || '') ? 'abort' : 'other'; };

async function tryOnce(browser, testInfo, site) {
  let timer; const st = {};
  const hang = new Promise((r) => { timer = setTimeout(() => r({ loaded: false, category: 'hang', detail: 'no result in 170 s', diag: st.diag }), 170000); });
  try { return await Promise.race([tryInner(browser, testInfo, site, st), hang]); } finally { clearTimeout(timer); }
}

async function tryInner(browser, testInfo, site, st) {
  const ctx = await browser.newContext({ baseURL: BASE, ...(SAVED ? { storageState: { cookies: SAVED, origins: [] } } : {}) });
  await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  const cons = [], csp = [], perrs = [];
  page.on('console', (m) => { const x = m.text(); if (/Content Security Policy|Refused to|X-Frame|frame-ancestors/i.test(x)) csp.push(x.slice(0, 140)); else if (m.type() === 'error') cons.push(x.slice(0, 140)); });
  page.on('pageerror', (e) => perrs.push(String(e).slice(0, 140)));
  const res = { loaded: false };
  // at 120 s look at what the app is doing; evaluate raced against 5 s (a frozen main thread never answers: that is the finding)
  const wd = setTimeout(async () => { st.diag = await Promise.race([page.evaluate(() => { const r = window.__lbPerf.runs, c = r[r.length - 1]; return { marks: c && c.marks, status: (document.getElementById('statusText') || {}).textContent, q: window.LB_queueState && window.LB_queueState(), reqs: (window.__gm.req || []).length, lt: (window.__gm.lt || []).slice(-5) }; }).catch((e) => String(e).slice(0, 80)), new Promise((r) => setTimeout(() => r('main thread did not answer in 5 s'), 5000))]); }, 120000);
  try {
    await applyProfile(page, testInfo);
    await signIn(page);
    await page.evaluate(HOOK, process.env.LB_GAMES_FONTLITE === '1');
    const before = await page.evaluate(() => window.__lbPerf.runs.length);
    await page.locator('#url').focus(); await page.locator('#url').fill(site.url); await page.keyboard.press('Enter');
    const started = await page.waitForFunction((n) => window.__lbPerf.runs.length > n, before, { timeout: 4000 }).then(() => true).catch(() => false);
    if (!started) await page.locator('#go').click({ timeout: 5000 }).catch(() => {});
    const outcome = await page.waitForFunction((n) => {
      const f = document.getElementById('frame');
      if (f && f.srcdoc && /Error - Limitless/.test(f.srcdoc)) return { err: f.srcdoc.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300) };
      const r = window.__lbPerf.runs; if (r.length > n && r[r.length - 1].marks.shown != null) return { ok: true };
      return false;
    }, before, { timeout: SHOWN_TIMEOUT, polling: 100 }).then((h) => h.jsonValue()).catch(() => null);
    const collectParent = () => page.evaluate(() => { const L = window.__gm; return { req: L.req || [], bot: L.bot || [], wsOpen: L.ws.open, skipped: L.skipped || 0, lt: L.lt || [], q: L.q || null, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; }).catch(() => ({ req: [], bot: [], wsOpen: [] }));
    if (!outcome || outcome.err) {
      const p = await collectParent();
      Object.assign(res, summarizeReq(p), { botCheck: p.bot, category: !outcome ? 'timeout' : /Human Check|bot-check/i.test(outcome.err) ? 'botcheck' : 'error-card', detail: !outcome ? 'not shown in 45 s' : outcome.err.slice(0, 200) });
      res.consoleErrors = cons.slice(0, 4); res.pageErrors = perrs.slice(0, 4); res.csp = csp.slice(0, 3);
      return res;
    }
    const fh = await page.locator('#frame').elementHandle(); const frame = await fh.contentFrame();
    let found = false; try { await frame.waitForSelector(site.sel, { timeout: SEL_TIMEOUT, state: 'attached' }); found = true; } catch (_) {}
    try { await page.waitForFunction(() => { const r = window.__lbPerf.runs; return r[r.length - 1].marks.load != null; }, null, { timeout: 20000 }); } catch (_) {}
    if (site.act) {
      try { await frame.locator(site.act.fill).first().fill(site.act.text, { timeout: 4000 }); if (site.act.press) await frame.locator(site.act.fill).first().press(site.act.press); res.actDone = true; } catch (e) { res.actDone = false; }
    }
    // dwell: settle; for games click the frame (a user gesture) so audio, pointer lock and fullscreen requests can happen
    await page.waitForTimeout(DWELL_MS / 2);
    if (site.game) {
      try { const b = await fh.boundingBox(); if (b) { await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.keyboard.press('Space'); } } catch (_) {}
    }
    await page.waitForTimeout(DWELL_MS / 2);
    const marks = await page.evaluate(() => ({ ...window.__lbPerf.runs[window.__lbPerf.runs.length - 1].marks }));
    const fr = await frame.evaluate(() => {
      const g = window.__gm || {}; const b = document.body;
      const txt = (b ? b.innerText : '').trim();
      return {
        ctx: (g.ctx || []).reduce((a, k) => { a[k] = (a[k] || 0) + 1; return a; }, {}), wasm: g.wasm, ws: g.ws, plock: [g.plock, g.plockRej], fs: [g.fs, g.fsRej], gamepad: g.gamepad, sabNew: g.sab, workers: g.workers,
        audio: (g.audio || []).map((c) => c.state), sabAvail: typeof SharedArrayBuffer !== 'undefined', coi: window.crossOriginIsolated,
        canvases: document.querySelectorAll('canvas').length, iframes: document.querySelectorAll('iframe').length, perr: (window.__perr || []).slice(0, 4),
        textLen: txt.length, lt: g.lt || [], heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, head: (document.title + ' | ' + txt).replace(/\s+/g, ' ').slice(0, 160),
      };
    }).catch((e) => ({ evalErr: String(e).slice(0, 80) }));
    // nested frames (portal game iframes are data: documents): same probes in every child frame, aggregated
    res.nested = [];
    for (const f of page.frames()) {
      if (f === frame || f === page.mainFrame()) continue;
      const x = await Promise.race([f.evaluate(() => { const g = window.__gm || {}; return { canvases: document.querySelectorAll('canvas').length, ctx: (g.ctx || []).reduce((a, k) => { a[k] = (a[k] || 0) + 1; return a; }, {}), wasm: g.wasm && g.wasm.n, wasmBytes: g.wasm && g.wasm.bytes, sharedMem: g.wasm && g.wasm.shared, ws: g.ws && { open: g.ws.open.length, msg: g.ws.msg, err: g.ws.err }, audio: (g.audio || []).map((c) => c.state), plock: g.plock, fs: g.fs, gamepad: g.gamepad, workers: g.workers, sab: g.sab, sabAvail: typeof SharedArrayBuffer !== 'undefined', coi: window.crossOriginIsolated, lt: (g.lt || []).reduce((a, b) => a + b, 0), href: location.href.slice(0, 40) }; }).catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))]);
      if (x) res.nested.push(x);
    }
    const p = await collectParent();
    const BLOCKED = /just a moment|access denied|captcha|verify you are (a )?human|unusual traffic|request blocked|attention required|are you a robot|pardon our interruption|enable javascript|forbidden/i;
    let via = found ? 'selector' : null;
    if (!found && (fr.textLen || 0) >= 400 && !BLOCKED.test(fr.head || '')) { found = true; via = 'text'; }
    res.ltFrame = ltSum(fr.lt); res.heapFrame = fr.heap;
    Object.assign(res, summarizeReq(p), { loaded: found, via, shown: marks.shown ?? null, load: marks.load ?? null, fr, botCheck: p.bot, wsOpen: p.wsOpen.slice(0, 6) });
    res.consoleErrors = cons.slice(0, 4); res.consoleErrorCount = cons.length; res.pageErrors = perrs.slice(0, 4); res.pageErrorCount = perrs.length; res.csp = csp.slice(0, 3); res.cspCount = csp.length;
    if (!found) { res.category = csp.length ? 'csp' : perrs.length || (fr.perr || []).length ? 'script' : BLOCKED.test(fr.head || '') ? 'botcheck-in-page' : 'render'; res.detail = fr.head; }
    return res;
  } catch (e) { res.category = 'harness'; res.detail = String(e).slice(0, 160); return res; } finally { clearTimeout(wd); await ctx.close(); }
}

const ltSum = (a) => ({ n: (a || []).length, total: (a || []).reduce((x, y) => x + y, 0), max: Math.max(0, ...(a || [])), over5s: (a || []).filter((x) => x > 5000).length });
function summarizeReq(p) {
  const req = p.req || []; const fails = {}; const first = [];
  for (const r of req) if (r.err) { const c = errClass(r.err); fails[c] = (fails[c] || 0) + 1; if (first.length < 4) first.push(`${c}: ${r.u.slice(0, 70)}`); }
  const st = {}; for (const r of req) if (r.s) { const k = Math.floor(r.s / 100) + 'xx'; st[k] = (st[k] || 0) + 1; }
  const hosts = new Set(req.map((r) => { try { return new URL(r.u).host; } catch (_) { return ''; } }));
  const d = req[0] || {};
  return { reqCount: req.length, reqBytes: req.reduce((a, r) => a + (r.b || 0), 0), wireBytes: req.reduce((a, r) => a + (r.wire || 0), 0), hosts: hosts.size, ltParent: ltSum(p.lt), heapParent: p.heap, queue: p.q ? { peakQueued: p.q.maxQ, meanQueued: p.q.n ? +(p.q.sumQ / p.q.n).toFixed(1) : 0, peakFetching: p.q.maxF } : null, fontSkipped: p.skipped || 0, fontBytes: req.filter((r) => /\.(woff2?|ttf|otf|eot)(\?|#|$)|fa-.*\.svg/i.test(r.u)).reduce((a, r) => a + (r.b || 0), 0), fontReqs: req.filter((r) => /\.(woff2?|ttf|otf|eot)(\?|#|$)|fa-.*\.svg/i.test(r.u)).length, status: st, failClass: fails, failEx: first,
    doc: { s: d.s, ms: d.ms, srv: d.srv, cf: d.cf, err: d.err }, slowest: req.filter((r) => r.ms).sort((a, b) => b.ms - a.ms).slice(0, 3).map((r) => `${r.ms}ms ${r.u.slice(0, 80)}`),
    big: req.filter((r) => r.b).sort((a, b) => b.b - a.b).slice(0, 3).map((r) => `${r.b} ${r.u.slice(0, 80)}`) };
}

test.describe('games and school sites', () => {
  test.skip(process.env.LB_GAMES !== '1', 'set LB_GAMES=1 (and run through deploy/rehearsal/run.sh)');
  for (const site of SITES) {
    if (ONLY && !ONLY.includes(site.name)) continue;
    test(site.name, async ({ browser }, testInfo) => {
      test.setTimeout(20 * 60 * 1000);
      const runs = [];
      for (let i = 0; i < REPS; i++) runs.push(await tryOnce(browser, testInfo, site));
      const ok = runs.filter((r) => r.loaded);
      const rec = { name: site.name, url: site.url, cat: site.cat, reps: REPS, loadedCount: ok.length, shownMedian: median(ok.map((r) => r.shown)), loadMedian: median(ok.map((r) => r.load)), load1: runs.map((r) => r.load ?? null), runs };
      console.log(`games: ${site.name.padEnd(18)} ${ok.length}/${REPS} shown ${rec.shownMedian} load ${rec.loadMedian} req ${runs[0].reqCount} ${JSON.stringify(runs[0].failClass || {})} ${runs[0].category || ''}`);
      const dir = process.env.LB_GAMES_OUT || path.join(__dirname, '..', '..', 'test-results', `games-${sha()}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${site.name}.json`), JSON.stringify(rec, null, 2));
    });
  }
});
