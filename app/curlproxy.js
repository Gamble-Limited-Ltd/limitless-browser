/* Limitless Browser, fork of GUST by Nautilus Labs, GNU AGPLv3 (see LICENSE and NOTICE).
   features.curlWorker (docs/1.2/SWCURL-DESIGN.md 2): main-thread side of app/curl-worker.js. A session made here looks like a libcurl.js
   HTTPSession to the rest of the app: fetch(url, opts) -> Promise<{status, headers, body, arrayBuffer()}>, set_connections(), close(),
   active_requests. The queue, deadlines, speed cap, cookies and cache stay in app/main.js; they only see these promises.
   window.LB_CurlWorker.hooks.drop(base) / .fail(base, host) are set by main.js (router epoch and relay cooldown). */
(function () {
  'use strict';
  let worker = null, workerFail = null, nextId = 0, nextSid = 0;
  const jobs = new Map(), waiting = new Map();   // id -> job, sid -> {ok, ko}
  const api = { hooks: {}, stats: { created: 0, fetches: 0 } };

  function rebuild(name, message) {
    const e = name === 'AbortError' ? new DOMException(message || 'Aborted', 'AbortError') : new Error(message);
    if (name && name !== 'Error' && name !== 'AbortError') { try { e.name = name; } catch (_) {} }
    return e;
  }

  function onMessage(ev) {
    const m = ev.data;
    if (m.t === 'ready') { const w = waiting.get(m.sid); waiting.delete(m.sid); if (w) (m.message ? w.ko(rebuild(m.name, m.message)) : w.ok()); return; }
    if (m.t === 'drop') { try { api.hooks.drop && api.hooks.drop(m.base); } catch (_) {} return; }
    if (m.t === 'fail') { try { api.hooks.fail && api.hooks.fail(m.base, m.host); } catch (_) {} return; }
    const j = jobs.get(m.id);
    if (!j) return;
    if (m.t === 'head') {
      j.headed = true;
      const body = new ReadableStream({ start(c) { j.ctl = c; }, cancel() { send({ t: 'abort', id: m.id }); } });
      const res = {
        status: m.status, ok: m.status >= 200 && m.status < 300, statusText: '', headers: new Headers(m.headers), body,
        arrayBuffer() { return new Response(body).arrayBuffer(); },
        text() { return new Response(body).text(); },
        json() { return new Response(body).json(); },
      };
      j.ok(res);
    } else if (m.t === 'chunk') { if (j.ctl) try { j.ctl.enqueue(new Uint8Array(m.buf)); } catch (_) {} }
    else if (m.t === 'end') { if (j.ctl) try { j.ctl.close(); } catch (_) {} j.done(); }
    else if (m.t === 'err') {
      const e = rebuild(m.name, m.message);
      if (j.headed) { if (j.ctl) try { j.ctl.error(e); } catch (_) {} } else j.ko(e);
      j.done();
    }
  }

  function send(msg) { if (worker) worker.postMessage(msg); }

  function start() {
    if (worker) return worker;
    if (workerFail) throw workerFail;
    if (typeof Worker === 'undefined') throw (workerFail = new Error('no Worker'));
    // The script URL comes from the main script's own src, so a built tree (app/<sha>/) and the source tree both resolve.
    const me = document.querySelector('script[src*="curlproxy.js"]');
    const base = me ? me.src.replace(/curlproxy\.js[^/]*$/, '') : new URL('app/', document.baseURI).href;
    const glue = new URL('vendor/libcurl/0.7.5/libcurl-glue.js', document.baseURI).href;
    const wasm = new URL('vendor/libcurl/0.7.5/libcurl.wasm', document.baseURI).href;
    try {
      worker = new Worker(base + 'curl-worker.js?g=' + encodeURIComponent(glue) + '&w=' + encodeURIComponent(wasm));
    } catch (e) { throw (workerFail = e); }
    worker.onmessage = onMessage;
    worker.onerror = (e) => {   // a dead worker fails every job and every later session: the caller falls back to the main thread
      workerFail = new Error('libcurl worker failed: ' + (e && e.message || 'error')); worker = null;
      for (const j of [...jobs.values()]) { j.ko(workerFail); j.done(); }
      for (const w of [...waiting.values()]) w.ko(workerFail);
      waiting.clear();
    };
    return worker;
  }

  class Session {
    constructor(sid) { this.sid = sid; this.n = 0; this.closed = false; }
    get active_requests() { return this.n; }
    set_connections(a, b, host) { send({ t: 'conns', sid: this.sid, n: Math.max(a, b), host }); }
    close() { if (this.closed) return; this.closed = true; send({ t: 'close', sid: this.sid }); }
    fetch(url, opts) {
      opts = opts || {};
      const signal = opts.signal;
      if (signal && signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
      const id = ++nextId;
      api.stats.fetches++;
      this.n++;
      return new Promise((ok, ko) => {
        let off = null;
        const done = () => { if (jobs.delete(id)) this.n--; if (off) off(); };
        jobs.set(id, { ok, ko, done, headed: false, ctl: null });
        if (signal) {
          const ab = () => { send({ t: 'abort', id }); const j = jobs.get(id); if (!j) return; const e = new DOMException('Aborted', 'AbortError'); if (j.headed) { if (j.ctl) try { j.ctl.error(e); } catch (_) {} } else j.ko(e); j.done(); };
          signal.addEventListener('abort', ab, { once: true }); off = () => signal.removeEventListener('abort', ab);
        }
        const o = { method: opts.method, headers: opts.headers instanceof Headers ? Object.fromEntries(opts.headers) : opts.headers, body: opts.body };
        send({ t: 'fetch', id, sid: this.sid, url, opts: o });
      });
    }
  }

  // Resolves with a session bound to `wisp`, or rejects (no Worker, worker script failed, wasm failed): the caller then uses the main thread.
  api.session = async function (wisp, conns) {
    const w = start();
    const sid = ++nextSid;
    const ready = new Promise((ok, ko) => waiting.set(sid, { ok, ko }));
    const timer = setTimeout(() => { const x = waiting.get(sid); if (x) { waiting.delete(sid); x.ko(new Error('libcurl worker start timed out')); } }, 30000);
    w.postMessage({ t: 'session', sid, wisp, conns });
    try { await ready; } finally { clearTimeout(timer); }
    api.stats.created++;
    return new Session(sid);
  };
  api.available = () => !workerFail && typeof Worker !== 'undefined';
  window.LB_CurlWorker = api;
})();
