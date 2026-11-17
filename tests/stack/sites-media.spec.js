// @ts-check
// Social / media / shopping / app site audit (docs/1.1/audit/SITES-MEDIA.md). Runs only with LB_MEDIA=1, chromebook profile, through the rehearsal stack:
//   LB_MEDIA=1 flock /tmp/limitless-rehearsal.lock deploy/rehearsal/run.sh -c playwright.stack.media.config.js --project=chromebook --workers=1 tests/stack/sites-media.spec.js
// Env: LB_MEDIA_REPS (2), LB_MEDIA_ONLY=a,b, LB_MEDIA_SHA. List: sites-media.json (not real-sites.json). Per site and rep it records: shown / load ms,
// every libcurl request (url, status, content type, time to headers, error class) by wrapping LB_net.curl, bytes by wrapping LB_siteBytes,
// console / page errors, CSP refusals, bot-check card or interstitial markers, service worker / Trusted Types messages, JS heap before and after
// scrolling, and for `video` sites: MediaSource use, first-frame time, quality, stalls, segment sizes. Output: test-results/sites-media-<sha>/<name>.json.
const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { applyProfile } = require('../lib/profile');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const REPS = parseInt(process.env.LB_MEDIA_REPS || '2', 10);
const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, 'sites-media.json'), 'utf8'));
const ONLY = process.env.LB_MEDIA_ONLY ? process.env.LB_MEDIA_ONLY.split(',') : null;
const SHOWN_TIMEOUT = parseInt(process.env.LB_MEDIA_SHOWN || '45000', 10);
const sha = () => process.env.LB_MEDIA_SHA || (() => { try { return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch { return 'local'; } })();

// Runs in every frame of the context (the page is a blob: iframe): MediaSource / SourceBuffer use and media element events with wall-clock times.
function frameHooks() {
  if (window.top === window) return;
  try { const lt = (window.__lt = { n: 0, ms: 0, max: 0 }); new PerformanceObserver((l) => { for (const e of l.getEntries()) { lt.n++; lt.ms += e.duration; lt.max = Math.max(lt.max, e.duration); } }).observe({ type: 'longtask', buffered: true }); } catch (_) {}
  const vm = (window.__vm = { mse: 0, sb: 0, appends: 0, appendBytes: 0, ev: [] });
  const EVS = ['loadstart', 'loadeddata', 'canplay', 'playing', 'waiting', 'stalled', 'error', 'pause', 'ended'];
  const rec = (ev) => {
    const v = ev.target;
    if (!v || !v.tagName || !/^(VIDEO|AUDIO)$/.test(v.tagName)) return;
    vm.ev.push({ e: ev.type, t: Date.now(), ct: v.currentTime, h: v.videoHeight || 0, err: v.error ? v.error.code + ':' + (v.error.message || '').slice(0, 60) : null, src: (v.currentSrc || '').slice(0, 30), tag: v.tagName });
    if (vm.ev.length > 300) vm.ev.shift();
  };
  try {
    const MS = window.MediaSource;
    if (MS) {
      const asb = MS.prototype.addSourceBuffer;
      MS.prototype.addSourceBuffer = function () { vm.mse++; return asb.apply(this, arguments); };
      const ab = window.SourceBuffer && window.SourceBuffer.prototype.appendBuffer;
      if (ab) window.SourceBuffer.prototype.appendBuffer = function (b) { vm.appends++; vm.appendBytes += (b && b.byteLength) || 0; return ab.apply(this, arguments); };
    }
  } catch (_) {}
  // detached media (new Audio()) never reaches document listeners: hook play() and listen on the element itself
  try {
    const pl = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.__vmh) { this.__vmh = 1; vm.plays = (vm.plays || 0) + 1; if (!this.isConnected) for (const e of EVS) this.addEventListener(e, rec, true); }
      const p = pl.apply(this, arguments);
      if (p && p.catch) p.catch((er) => { vm.playErr = String(er && er.name).slice(0, 40) + ':' + String(er && er.message).slice(0, 60); });
      return p;
    };
  } catch (_) {}
  for (const e of EVS) document.addEventListener(e, rec, true);
}

// Page side, after sign-in and before navigation: record every libcurl fetch and every body size.
function pageHooks() {
  const L = (window.__lbm = { req: [], bytes: [], swaps: 0, qmax: 0, qsum: 0, qn: 0, fmax: 0 });
  try { const lt = (window.__ltTop = { n: 0, ms: 0, max: 0 }); new PerformanceObserver((l) => { for (const e of l.getEntries()) { lt.n++; lt.ms += e.duration; lt.max = Math.max(lt.max, e.duration); } }).observe({ type: 'longtask', buffered: true }); } catch (_) {}
  setInterval(() => { try { const q = window.LB_queueState(); L.qmax = Math.max(L.qmax, q.queued); L.fmax = Math.max(L.fmax, q.fetching); L.qsum += q.queued; L.qn++; } catch (_) {} }, 250);
  const wrap = (c) => new Proxy(c, {
    get(t, k) {
      if (k === '__w') return true;
      if (k === 'fetch') {
        return (u, o) => {
          const h = (o && o.headers) || {};
          const rec = { u: String(u).slice(0, 220), m: (o && o.method) || 'GET', range: !!(h.Range || h.range), at: Date.now(), hk: Object.keys(h).slice(0, 24).join(',') };
          L.req.push(rec);
          return Promise.resolve(t.fetch(u, o)).then((r) => {
            rec.dt = Date.now() - rec.at; rec.st = r.status;
            try { rec.ct = r.headers.get('content-type'); rec.cl = r.headers.get('content-length'); rec.ce = r.headers.get('content-encoding'); } catch (_) {}
            return r;
          }, (e) => { rec.dt = Date.now() - rec.at; rec.err = String((e && e.message) || e).slice(0, 160); rec.cat = e && e.lbCat; throw e; });
        };
      }
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  setInterval(() => {
    try { const c = window.LB_net && window.LB_net.curl; if (c && !c.__w) { if (L.wrapped) L.swaps++; window.LB_net.curl = wrap(c); L.wrapped = 1; } } catch (_) {}
  }, 100);
  const tick = () => {
    const o = window.LB_siteBytes;
    if (o && !o.__w) { const f = function (u, n) { L.bytes.push({ u: String(u).slice(0, 220), n, at: Date.now() }); return o.apply(this, arguments); }; f.__w = 1; window.LB_siteBytes = f; }
  };
  setInterval(tick, 100);
}

const classify = (r) => {
  const ct = (r.ct || '').toLowerCase(), u = r.u.toLowerCase();
  if (/videoplayback|\.m4s(\?|$)|\.m3u8|\.mpd|\.ts(\?|$)|\.webm|\.mp4/.test(u) || /^(video|audio)\//.test(ct)) return 'media';
  if (ct.startsWith('image/') || /\.(png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/.test(u)) return 'image';
  if (/javascript|ecmascript/.test(ct) || /\.m?js(\?|$)/.test(u)) return 'script';
  if (ct.includes('css') || /\.css(\?|$)/.test(u)) return 'css';
  if (ct.includes('html')) return 'html';
  if (ct.includes('font') || /\.(woff2?|ttf|otf)(\?|$)/.test(u)) return 'font';
  if (ct.includes('json') || ct.includes('protobuf') || ct.includes('text/plain')) return 'data';
  return 'other';
};
const errClass = (r) => {
  if (r.cat) return r.cat;
  const m = /error code (\d+)/i.exec(r.err || '');
  if (m) { const n = +m[1]; return { 6: 'dns', 7: 'connect', 18: 'partial', 28: 'timeout', 35: 'tls', 51: 'cert', 58: 'cert', 60: 'cert', 52: 'reset', 56: 'reset' }[n] || 'curl' + n; }
  if (/abort/i.test(r.err || '')) return 'abort';
  return r.err ? 'other' : null;
};
const VENDORS = [
  ['cloudflare', /challenges\.cloudflare\.com|cf-chl|cf_chl|challenge-platform|just a moment|turnstile/i],
  ['datadome', /datadome|captcha-delivery\.com|geo\.captcha/i],
  ['perimeterx', /perimeterx|px-captcha|px-cloud|_pxhd|press (&amp;|and) hold/i],
  ['akamai', /akamai|_abck|ak_bmsc|reference #\d/i],
  ['imperva', /incapsula|_incap_|imperva/i],
  ['kasada', /kasada|ips\.js|x-kpsdk/i],
  ['recaptcha', /recaptcha/i],
  ['hcaptcha', /hcaptcha/i],
  ['arkose', /arkoselabs|funcaptcha/i],
  ['aws-waf', /awswaf|aws-waf|token\.awswaf/i],
];
const BOTWORDS = /just a moment|access denied|captcha|verify you are (a )?human|unusual traffic|request blocked|attention required|are you a robot|pardon our interruption|checking your browser|confirm you are human|not a robot|press (&|and) hold/i;

const SIGNED = new Map();
async function signIn(page, site) {
  const saved = SIGNED.get(site.name);
  await page.goto('/');
  if (!saved) {
    await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
    await page.waitForURL(`${MOCK}/oidc/authorize**`);
    await page.locator('input[name=user][value=alice]').check();
    await page.locator('#continue').click();
    await page.waitForLoadState('load');
  }
  await expect(page.locator('#url')).toBeVisible({ timeout: 90000 });
  if (!saved) { try { SIGNED.set(site.name, await page.context().cookies()); } catch (_) {} }
  try { await page.locator('#tutorialOverlay button', { hasText: 'Skip tour' }).waitFor({ state: 'visible', timeout: 4000 }); await page.locator('#tutorialOverlay button', { hasText: 'Skip tour' }).click(); } catch (_) {}
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
}

async function oneRep(browser, testInfo, site, res, st) {
  const ctx = (st.ctx = await browser.newContext({ baseURL: BASE, ...(SIGNED.get(site.name) ? { storageState: { cookies: SIGNED.get(site.name), origins: [] } } : {}) }));
  await ctx.addInitScript(frameHooks);
  const page = await ctx.newPage();
  const cons = { csp: [], err: [], sw: [], pageerr: [] };
  page.on('console', (m) => {
    const x = m.text();
    if (/Content Security Policy|Refused to|X-Frame|frame-ancestors/i.test(x)) cons.csp.push(x.slice(0, 200));
    else if (/Trusted ?Types|service ?worker|serviceWorker/i.test(x)) cons.sw.push(x.slice(0, 200));
    if (m.type() === 'error') cons.err.push(x.slice(0, 200));
  });
  page.on('pageerror', (e) => cons.pageerr.push(String(e).slice(0, 200)));
  try {
    await applyProfile(page, testInfo);
    st.page = page; st.cons = cons;
    await signIn(page, site);
    await page.evaluate(pageHooks);
    const before = await page.evaluate(() => window.__lbPerf.runs.length);
    const t0 = await page.evaluate(() => Date.now());
    await page.locator('#url').focus();
    await page.locator('#url').fill(site.url);
    await page.keyboard.press('Enter');
    const started = await page.waitForFunction((n) => window.__lbPerf.runs.length > n, before, { timeout: 4000 }).then(() => true).catch(() => false);
    if (!started) await page.locator('#go').click({ timeout: 5000 }).catch(() => {});
    const outcome = await page.waitForFunction((n) => {
      const f = document.getElementById('frame');
      if (f && f.srcdoc && /Error - Limitless/.test(f.srcdoc)) return { err: f.srcdoc.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300) };
      const r = window.__lbPerf.runs;
      if (r.length > n && r[r.length - 1].marks.shown != null) return { ok: true };
      return false;
    }, before, { timeout: site.video || site.slow ? Math.max(SHOWN_TIMEOUT, 100000) : SHOWN_TIMEOUT, polling: 100 }).then((h) => h.jsonValue()).catch(() => null);
    if (!outcome) {
      res.category = 'timeout'; res.detail = 'not shown in time';
      res.stuck = await Promise.race([page.evaluate(() => { const r = window.__lbPerf.runs; const c = r[r.length - 1]; return { marks: c && c.marks, q: window.LB_queueState && window.LB_queueState(), rw: window.LB_rewrite && window.LB_rewrite.stats && window.LB_rewrite.stats(), status: (document.getElementById('statusText') || {}).textContent }; }).catch((e) => String(e).slice(0, 80)), new Promise((x) => setTimeout(() => x('page did not answer in 5 s'), 5000))]);
    }
    else if (outcome.err) {
      res.detail = outcome.err.slice(0, 200);
      res.botCard = /Human Check|bot-check/i.test(outcome.err);
      res.category = res.botCard ? 'botcheck' : /ERR_NAME_NOT_RESOLVED|dns/i.test(outcome.err) ? 'dns' : /tls|certificate|ERR_SSL/i.test(outcome.err) ? 'tls' : /connect/i.test(outcome.err) ? 'connect' : /HTTP \d{3}/i.test(outcome.err) ? 'http' : 'error-other';
    }
    let frame = null;
    if (outcome && outcome.ok) {
      const fh = await page.locator('#frame').elementHandle();
      frame = await fh.contentFrame(); st.frame = frame;
      let found = false;
      try { await frame.waitForSelector(site.sel, { timeout: 10000, state: 'attached' }); found = true; } catch (_) {}
      try { await page.waitForFunction(() => { const r = window.__lbPerf.runs; return r[r.length - 1].marks.load != null; }, null, { timeout: 15000 }); } catch (_) {}
      const marks = await page.evaluate(() => ({ ...window.__lbPerf.runs[window.__lbPerf.runs.length - 1].marks }));
      res.shown = marks.shown ?? null; res.load = marks.load ?? null; res.firstBytes = marks.firstBytes ?? null;
      const probe = await frame.evaluate(() => ({ len: (document.body ? document.body.innerText : '').trim().length, title: document.title.slice(0, 80), head: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 160), imgs: document.images.length, vids: document.querySelectorAll('video').length, perr: (window.__perr || []).slice(0, 5) })).catch(() => ({ len: 0, perr: [] }));
      res.text = probe;
      if (!found && probe.len >= 400 && !BOTWORDS.test(probe.head || '')) { found = true; res.via = 'text'; } else if (found) res.via = 'selector';
      res.loaded = found;
      res.interstitial = BOTWORDS.test((probe.title || '') + ' ' + (probe.head || ''));
      if (res.interstitial) res.loaded = false;
      if (!res.loaded) res.category = res.interstitial ? 'interstitial' : cons.csp.length ? 'csp' : probe.perr && probe.perr.length ? 'script' : 'render';
      // memory: JS heap of the page and the frame, before and after three screens of scrolling (feeds, infinite scroll)
      const heap = async () => ({ top: await page.evaluate(() => performance.memory && performance.memory.usedJSHeapSize).catch(() => null), frame: await frame.evaluate(() => performance.memory && performance.memory.usedJSHeapSize).catch(() => null) });
      res.heap0 = await heap();
      const n0 = await page.evaluate(() => window.__lbm.req.length);
      for (let i = 0; i < 3; i++) { await frame.evaluate(() => { window.scrollBy(0, innerHeight * 2); document.scrollingElement && document.scrollingElement.scrollBy(0, innerHeight * 2); }).catch(() => {}); await page.waitForTimeout(1500); }
      res.heap1 = await heap();
      res.scrollReq = (await page.evaluate(() => window.__lbm.req.length)) - n0;
      if (site.video && frame) {
        const vm = () => frame.evaluate(() => { const v = document.querySelector('video'); const q = v && v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null; return { has: !!v, rs: v && v.readyState, ct: v && v.currentTime, paused: v && v.paused, h: v && v.videoHeight, w: v && v.videoWidth, dur: v && v.duration, blob: !!(v && (v.currentSrc || '').startsWith('blob:')), err: v && v.error ? v.error.code + ':' + v.error.message : null, drop: q && q.droppedVideoFrames, tot: q && q.totalVideoFrames, mse: window.__vm && window.__vm.mse, plays: window.__vm && window.__vm.plays, playErr: window.__vm && window.__vm.playErr, sb: window.__vm && window.__vm.appends, sbBytes: window.__vm && window.__vm.appendBytes, ev: window.__vm ? window.__vm.ev : [] }; }).catch(() => ({}));
        const playing = (s) => (s.ev || []).find((x) => x.e === 'playing');
        let s = await vm();
        const until = Date.now() + 6000;
        while (Date.now() < until && !playing(s)) { await page.waitForTimeout(500); s = await vm(); }
        if (!playing(s) && (s.has || site.name === 'soundcloud')) {
          res.clicked = true; res.clickAt = Date.now() - t0;
          await frame.locator('video, .ytp-large-play-button, button[aria-label*=Play i], .sc-button-play, .playButton').first().click({ timeout: 3000, force: true }).catch(() => {});
          const u2 = Date.now() + 20000;
          while (Date.now() < u2 && !playing(s)) { await page.waitForTimeout(500); s = await vm(); }
        }
        const first = playing(s);
        const c0 = s.ct, w0 = Date.now();
        await page.waitForTimeout(15000);
        s = await vm();
        const after = (s.ev || []).filter((x) => first && x.t > first.t);
        res.video = { has: s.has, plays: s.plays, playErr: s.playErr, mse: s.mse, appends: s.sb, appendBytes: s.sbBytes, blobSrc: s.blob, firstFrameMs: first ? first.t - t0 : null, clicked: !!res.clicked, height: s.h, width: s.w, stalls: after.filter((x) => x.e === 'waiting').length, stalledEv: after.filter((x) => x.e === 'stalled').length, playedSec: s.ct != null && c0 != null ? +(s.ct - c0).toFixed(1) : null, wallSec: +((Date.now() - w0) / 1000).toFixed(1), dropped: s.drop, total: s.tot, error: s.err, readyState: s.rs, evs: (s.ev || []).slice(0, 14).map((x) => `${x.e}@${x.t - t0}${x.err ? '[' + x.err + ']' : ''}`) };
      }
    }
    st.collect = async () => {
      try { res.longtasks = { top: await page.evaluate(() => window.__ltTop), frame: st.frame ? await st.frame.evaluate(() => window.__lt).catch(() => null) : null }; res.queue = await page.evaluate(() => ({ maxQueued: window.__lbm.qmax, avgQueued: window.__lbm.qn ? +(window.__lbm.qsum / window.__lbm.qn).toFixed(1) : 0, maxFetching: window.__lbm.fmax })); } catch (_) {}
      // request and byte accounting from the libcurl wrapper
      const L = await page.evaluate(() => ({ req: window.__lbm.req, bytes: window.__lbm.bytes, swaps: window.__lbm.swaps })).catch(() => ({ req: [], bytes: [], swaps: 0 }));
      const bytesBy = new Map();
      for (const b of L.bytes) bytesBy.set(b.u, (bytesBy.get(b.u) || 0) + (b.n || 0));
      const by = {};
      const fails = {};
      let http4 = 0, http5 = 0;
      const segs = [];
      const urlsAll = [];
      for (const r of L.req) {
        const k = classify(r);
        const n = bytesBy.get(r.u) || 0;
        const o = (by[k] ||= { n: 0, bytes: 0 });
        o.n++; o.bytes += n;
        urlsAll.push(r.u);
        const ec = errClass(r);
        if (ec) fails[ec] = (fails[ec] || 0) + 1;
        if (r.st >= 500) http5++; else if (r.st >= 400) http4++;
        if (k === 'media' && r.st < 400) segs.push({ b: n, dt: r.dt, st: r.st, range: r.range });
      }
      res.req = { total: L.req.length, bytes: [...bytesBy.values()].reduce((a, b) => a + b, 0), by, fails, http4xx: http4, http5xx: http5, swaps: L.swaps };
      res.failedSample = L.req.filter((r) => errClass(r)).slice(0, 5).map((r) => ({ u: r.u.slice(0, 110), e: r.err }));
      res.status4xxSample = L.req.filter((r) => r.st >= 400).slice(0, 5).map((r) => ({ u: r.u.slice(0, 110), st: r.st, hk: r.hk, ct: r.ct }));
      if (segs.length) res.segs = { n: segs.length, medBytes: segs.map((x) => x.b).sort((a, b) => a - b)[Math.floor(segs.length / 2)], maxBytes: Math.max(...segs.map((x) => x.b)), medMs: segs.map((x) => x.dt || 0).sort((a, b) => a - b)[Math.floor(segs.length / 2)], ranged: segs.filter((x) => x.range).length };
      // vendor hints: request URLs and the frame HTML
      let html = '';
      if (st.frame) html = await st.frame.evaluate(() => document.documentElement.outerHTML.slice(0, 400000)).catch(() => '');
      const hay = urlsAll.join('\n') + '\n' + html + '\n' + (res.detail || '');
      res.vendors = VENDORS.filter(([, re]) => re.test(hay)).map(([v]) => v);
      res.console = { csp: cons.csp.slice(0, 3), cspN: cons.csp.length, err: cons.err.slice(0, 4), errN: cons.err.length, sw: cons.sw.slice(0, 3), swN: cons.sw.length, pageerr: cons.pageerr.slice(0, 3), pageerrN: cons.pageerr.length };

    };
    await st.collect();
    return res;
  } catch (e) {
    res.category = res.category || 'harness'; res.detail = res.detail || String(e).slice(0, 200);
    return res;
  } finally { await ctx.close().catch(() => {}); }
}

test.describe('media sites', () => {
  test.skip(process.env.LB_MEDIA !== '1', 'set LB_MEDIA=1 (and run through deploy/rehearsal/run.sh)');
  for (const site of SITES) {
    if (ONLY && !ONLY.includes(site.name)) continue;
    test(site.name, async ({}, testInfo) => {
      test.setTimeout(25 * 60 * 1000);
      const runs = [];
      for (let i = 0; i < REPS; i++) {
        const t = Date.now();
        // own browser per rep: a page that wedges the renderer under 4x CPU throttling must not take the worker down
        const b = await chromium.launch();
        const res = { loaded: false, category: null }, st = {};
        const cap = site.video || site.slow ? 300000 : 150000;
        let timer;
        const hang = new Promise((resolve) => { timer = setTimeout(() => { res.category = res.category || 'hang'; res.detail = `no result in ${cap / 1000} s`; resolve(res); }, cap); });
        let r = await Promise.race([oneRep(b, testInfo, site, res, st), hang]);
        if (r.category === 'hang' && st.collect) await Promise.race([st.collect().catch(() => {}), new Promise((x) => setTimeout(x, 6000))]);
        clearTimeout(timer);
        r.wallMs = Date.now() - t; r.load1 = require('os').loadavg()[0];
        runs.push(r);
        try { if (st.ctx) await Promise.race([st.ctx.close(), new Promise((x) => setTimeout(x, 5000))]); } catch (_) {}
        try { await Promise.race([b.close(), new Promise((x) => setTimeout(x, 8000))]); } catch (_) {}
        try { const pr = b.process && b.process(); if (pr) pr.kill('SIGKILL'); } catch (_) {}
      }
      const dir = path.join(__dirname, '..', '..', 'test-results', `sites-media-${sha()}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${site.name}.json`), JSON.stringify({ name: site.name, ...site, runs }, null, 2));
      console.log(`media: ${site.name.padEnd(12)} ${runs.map((r) => (r.loaded ? 'OK ' + r.shown + '/' + r.load : r.category)).join(' | ')}`);
    });
  }
});
