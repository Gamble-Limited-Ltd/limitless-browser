/* Limitless Browser, fork of GUST by Nautilus Labs, GNU AGPLv3 (see LICENSE and NOTICE).
   libcurl.js: Copyright (C) 2024 ading2210, GNU LGPL v3, https://github.com/ading2210/libcurl.js (glue in vendor/libcurl/0.7.5/libcurl-glue.js).
   features.curlWorker (docs/1.2/SWCURL-DESIGN.md 2): libcurl runs here, off the page's main thread. app/curlproxy.js is the main-thread side.
   main -> worker: {t:'session', sid, wisp, conns}  {t:'conns', sid, n, host}  {t:'close', sid}  {t:'fetch', id, sid, url, opts}  {t:'abort', id}
   worker -> main: {t:'ready'}  {t:'head', id, status, headers:[[k,v]]}  {t:'chunk', id, buf}  {t:'end', id}  {t:'err', id, name, message}
                   {t:'drop', base}  {t:'fail', base, host}
   shortcut: only plain WebSocket relays (public relays); our relay's token sockets and the router stay on the main thread, see the design doc. */
'use strict';
const Q = new URLSearchParams(self.location.search);
self.__lbWasm = Q.get('w');
importScripts(Q.get('g'));
// After the import on purpose: Emscripten sets ENVIRONMENT_IS_WEB from `typeof window`, and the web branch calls document.*.
self.window = self;

// Same drop and failure signals as LB_makeRouter.make on the main thread: a close we asked for is quiet, any other end of the relay
// connection is a drop, a stream that never opened is a failure of that relay.
libcurl.transport = class {
  constructor(url) {
    const i = url.lastIndexOf('/'), base = url.slice(0, i + 1), host = url.slice(i + 1).replace(/:\d+$/, '');
    const ws = new libcurl.wisp.WispWebSocket(url);
    let opened = false, failed = false, noted = false;
    const fail = () => { if (!opened && !failed && !ws.__lbQuiet) { failed = true; postMessage({ t: 'fail', base, host }); } };
    ws.addEventListener('open', () => { opened = true; });
    ws.addEventListener('error', fail);
    ws.addEventListener('close', fail);
    const origClose = ws.close;
    if (typeof origClose === 'function') ws.close = function () { ws.__lbQuiet = true; return origClose.apply(this, arguments); };
    const drop = () => { if (!noted && !ws.__lbQuiet) { noted = true; postMessage({ t: 'drop', base }); } };
    const conn = ws.connection && typeof ws.connection.addEventListener === 'function' ? ws.connection : null;
    if (conn) { if (!self.__seen) self.__seen = new WeakSet(); if (!self.__seen.has(conn)) { self.__seen.add(conn); const cd = () => postMessage({ t: 'drop', base }); conn.addEventListener('error', cd); conn.addEventListener('close', cd); } }
    else { ws.addEventListener('error', drop); ws.addEventListener('close', drop); }
    return ws;
  }
};

const sessions = new Map(), jobs = new Map();
let booted = null;

async function pump(id, r) {
  const rd = r.body && r.body.getReader ? r.body.getReader() : null;
  let parts = [], size = 0, timer = 0;
  const flush = () => {
    clearTimeout(timer); timer = 0;
    if (!size) return;
    const out = new Uint8Array(size); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }   // a fresh buffer: libcurl's chunks may be views on the wasm heap, never transfer those
    parts = []; size = 0;
    postMessage({ t: 'chunk', id, buf: out.buffer }, [out.buffer]);
  };
  if (!rd) { const b = new Uint8Array(await r.arrayBuffer()); parts.push(b); size = b.length; flush(); return; }
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    parts.push(value); size += value.length;
    if (size >= 65536) flush(); else if (!timer) timer = setTimeout(flush, 20);
  }
  flush();
}

onmessage = async (e) => {
  const m = e.data;
  if (m.t === 'session') {
    try {
      booted = booted || libcurl.load_wasm();
      await booted;
      libcurl.set_websocket(m.wisp);
      const s = new libcurl.HTTPSession();
      if (m.conns) s.set_connections(m.conns, m.conns, 6);
      sessions.set(m.sid, s);
      postMessage({ t: 'ready', sid: m.sid });
    } catch (err) { postMessage({ t: 'ready', sid: m.sid, name: err.name, message: String(err && err.message || err) }); }
  } else if (m.t === 'conns') {
    const s = sessions.get(m.sid); if (s) s.set_connections(m.n, m.n, m.host);
  } else if (m.t === 'close') {
    const s = sessions.get(m.sid); sessions.delete(m.sid); if (s) try { s.close(); } catch (_) {}
  } else if (m.t === 'abort') {
    const j = jobs.get(m.id); if (j) j.abort();
  } else if (m.t === 'fetch') {
    const ac = new AbortController(); jobs.set(m.id, ac);
    try {
      const s = sessions.get(m.sid);
      if (!s) throw new Error('libcurl worker session closed');
      const r = await s.fetch(m.url, Object.assign({}, m.opts, { redirect: 'manual', signal: ac.signal }));
      postMessage({ t: 'head', id: m.id, status: r.status, headers: [...r.headers] });
      await pump(m.id, r);
      postMessage({ t: 'end', id: m.id });
    } catch (err) {
      postMessage({ t: 'err', id: m.id, name: err && err.name, message: String(err && err.message || err) });
    } finally { jobs.delete(m.id); }
  }
};
