/* Limitless Browser, fork of GUST by Nautilus Labs, GNU AGPLv3 (see LICENSE and NOTICE).
   features.swDoc (docs/1.2/SWCURL-DESIGN.md 3): page side of the service worker document lane. The frame document is stored in the Cache API
   under /~lb/doc/<appKey>.<docId> and served by /sw.js; every cross-origin request of that frame comes back here as a 'lbfetch' message and
   is fetched through the normal proxy path (LB_queueFetch: queue, cookies, cache, blocklist, relay, curl worker). Loaded after app/main.js. */
(function () {
  'use strict';
  const rnd = () => { const a = new Uint8Array(10); crypto.getRandomValues(a); return Array.from(a, (b) => (b % 36).toString(36)).join(''); };
  const KEY = rnd();
  const api = { key: KEY, state: 'idle', stats: { docs: 0, bounced: 0, errors: 0 } };
  let starting = null;
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;

  async function probe(reg) {
    const w = reg.active; if (!w) return false;
    return new Promise((ok) => { const ch = new MessageChannel(); const t = setTimeout(() => ok(false), 1500); ch.port1.onmessage = (e) => { clearTimeout(t); ok(!!(e.data && e.data.lane)); }; w.postMessage({ type: 'lane?' }, [ch.port2]); });
  }
  async function start() {
    const f = window.LB_features || {};
    if (f.swDoc !== true || f.sw === false || !sw || !window.caches || !/^https?:$/.test(location.protocol)) return (api.state = 'off', false);
    try {
      let reg = await sw.getRegistration();
      if (!reg) reg = await sw.register(new URL('sw.js', location.href).href, { scope: new URL('./', location.href).pathname });
      await Promise.race([sw.ready, new Promise((_, ko) => setTimeout(() => ko(new Error('sw not active')), 4000))]);
      reg = (await sw.getRegistration()) || reg;
      api.state = (await probe(reg)) ? 'ready' : 'off';
      if (api.state === 'ready') sweep();
    } catch (_) { api.state = 'off'; }
    return api.state === 'ready';
  }
  api.start = () => starting || (starting = start());

  async function sweep() {   // documents older than a day belong to tabs that are long gone
    try {
      const c = await caches.open('lb-docs');
      for (const r of await c.keys()) { const hit = await c.match(r); if (Date.now() - Number(hit.headers.get('x-lb-t') || 0) > 864e5) await c.delete(r); }
    } catch (_) {}
  }

  // The frame document for `html`: an absolute /~lb/doc/ URL, or null (not ready: the caller uses a blob: URL as before).
  api.put = async function (html) {
    if (api.state === 'idle' || starting) { await Promise.race([api.start(), new Promise((r) => setTimeout(r, 800))]); }
    if (api.state !== 'ready') return null;
    try {
      const path = '/~lb/doc/' + KEY + '.' + rnd();
      await (await caches.open('lb-docs')).put(path, new Response(html, { headers: { 'content-type': 'text/html;charset=utf-8', 'x-lb-t': String(Date.now()) } }));
      api.stats.docs++;
      return location.origin + path;
    } catch (_) { return null; }
  };
  api.isDoc = (u) => typeof u === 'string' && u.indexOf('/~lb/doc/') >= 0;
  api.drop = function (u) {
    if (!api.isDoc(u) || !window.caches) return;
    try { const p = new URL(u, location.href).pathname; caches.open('lb-docs').then((c) => c.delete(p)).catch(() => {}); } catch (_) {}
  };

  async function bounce(d, port) {
    try {
      const o = { method: d.method, headers: Object.fromEntries(d.headers || []) };
      if (d.body && d.body.byteLength) o.body = d.body;
      const r = await window.LB_queueFetch(d.url, o);
      api.stats.bounced++;
      if (r.skipped) { port.postMessage({ status: 200, headers: [['content-type', 'text/plain']], body: new ArrayBuffer(0) }); return; }
      let buf = r.buf.slice(0);
      const mime = String(r.mime || '');
      // A script the browser loads itself skips go()'s rewrite stage: run the same location rewrite here (module and classic alike).
      if ((d.dest === 'script' || /javascript|ecmascript/i.test(mime)) && r.status === 200 && window.LB_rewrite && buf.byteLength) {
        try { buf = new TextEncoder().encode(await window.LB_rewrite.async(new TextDecoder().decode(buf))).buffer; } catch (_) {}
      }
      port.postMessage({ status: r.status, headers: Object.entries(r.headers || {}), body: buf }, [buf]);
    } catch (e) {
      api.stats.errors++;
      port.postMessage({ err: { name: e && e.name, message: String(e && e.message || e) } });
    }
  }
  if (sw) sw.addEventListener('message', (ev) => {
    const d = ev.data, port = ev.ports && ev.ports[0];
    if (!d || !port) return;
    if (d.type === 'lbwho') port.postMessage({ mine: d.key === KEY });
    else if (d.type === 'lbfetch') bounce(d, port);
  });

  window.LB_swDoc = api;
  if (window.LB_featuresReady) window.LB_featuresReady.then(() => { if ((window.LB_features || {}).swDoc === true) api.start(); });
})();
