/* Limitless Browser app-shell service worker (docs/1.0/SPEED.md 3.5).
 *
 * Access stays server-side. This worker never decides who may use the app:
 *   - page loads (navigations) of / and /index.html always go to the network first, so nginx auth_request answers every
 *     open; a signed-out or revoked user gets the sign-in / invite / maintenance page exactly as without a worker;
 *   - only HTTP 200 same-origin, non-redirected, non-no-store responses are ever stored, so a 401/403/5xx or a gate page
 *     is never kept or replayed;
 *   - /wisp/, /auth/, /_lb/, /_gate/, /legal/, /verify/, version.json, CHANGELOG.md and /sw.js are not handled at all.
 * Cached files are served only to sub-resource requests of an already loaded page (scripts, styles, fonts, the WASM),
 * never to a top-level navigation to them. The cached index.html is used only when the network itself is unreachable.
 * Kill switch: features.sw = false in version.json (the app then unregisters this worker and deletes its caches).
 */
'use strict';
const SHA = 'dev'; // @LB_BUILD_SHA@
const CACHE = 'lb-shell-' + SHA;
const PRECACHE = []; // @LB_PRECACHE@
const NEVER = /^\/(wisp|auth|_lb|_gate|legal|verify)(\/|$)|^\/(version\.json|CHANGELOG\.md|sw\.js)$/;
const FIRST = /^\/(app|vendor|fonts|theme\/fonts)\//;   // versioned or immutable: cache first
const SWR = /^\/theme\//;                                // not versioned by URL: network first, cache only when offline

function storable(res, allowHtml) {
  if (!res || res.status !== 200 || res.redirected || res.type !== 'basic') return false;
  const cc = res.headers.get('cache-control') || '';
  if (/no-store/i.test(cc)) return false;
  if (!allowHtml && /text\/html/i.test(res.headers.get('content-type') || '')) return false;
  if (allowHtml && !res.headers.get('etag')) return false;   // the app shell is a static file with an ETag; a gate page (proxied) has none
  return true;
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // all-or-nothing: if any file is refused (for example the user signed out meanwhile) the install fails and is retried later
    await Promise.all(PRECACHE.map(async (u) => {
      const r = await fetch(u, { credentials: 'same-origin', cache: 'reload' });
      if (!storable(r, u === '/index.html')) throw new Error('precache refused ' + u + ' ' + r.status);
      await c.put(u, r);
    }));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('lb-shell-') && k !== CACHE) await caches.delete(k);
  })());
});

// "Reload" in the update banner asks the waiting worker to take over; it never skips waiting by itself.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'skip') self.skipWaiting();
  // capability probe for the document lane: an old worker never answers, so the app keeps using blob: documents
  if (e.data && e.data.type === 'lane?' && e.ports[0]) e.ports[0].postMessage({ lane: 1 });
});

async function navigate(req) {
  try {
    const res = await fetch(req);
    if (storable(res, true)) { const c = await caches.open(CACHE); c.put('/index.html', res.clone()).catch(() => {}); }
    return res;
  } catch (err) {
    const hit = await (await caches.open(CACHE)).match('/index.html');
    if (hit) return hit;
    throw err;
  }
}

async function shell(e, req, url) {
  const c = await caches.open(CACHE);
  const key = url.origin + url.pathname;   // query strings are not part of the identity of a versioned file
  const refresh = () => fetch(req).then((res) => { if (storable(res, false)) c.put(key, res.clone()); return res; });
  // Theme CSS changes under the same URL; serving the cached copy first painted a new release with the last release's styles.
  if (!FIRST.test(url.pathname)) return refresh().catch(async (err) => (await c.match(key)) || Promise.reject(err));
  return (await c.match(key)) || refresh();
}

// ---- Document lane (features.swDoc, docs/1.2/SWCURL-DESIGN.md 3) ----
// The app stores the frame document in the Cache API under /~lb/doc/<appKey>.<docId> and points the frame at that path. This worker serves
// it to an iframe navigation only (never a top-level page), and answers every cross-origin request of such a frame by asking the app page
// (the one that owns <appKey>) to fetch it through the proxy. No request of a lane frame goes to the network from here: an app page that
// is gone or an error is a network error for that request. Access stays at nginx: nothing here serves index.html, version.json or any
// gated path, and a document is only data the signed-in page already holds.
const DOCS = 'lb-docs';
const DOC = /^\/~lb\/doc\/([a-z0-9]{8,40})\.([a-z0-9]{8,40})$/;
const appCache = new Map();   // appKey -> window client id (rebuilt by asking every window when this worker restarted)
const DROP_RES = /^(content-encoding|content-length|transfer-encoding|set-cookie|set-cookie2|cross-origin-resource-policy|cross-origin-embedder-policy|cross-origin-opener-policy|content-security-policy|content-security-policy-report-only|x-frame-options|strict-transport-security)$/i;
const DROP_REQ = /^(host|cookie|origin|referer|user-agent|connection|content-length|accept-encoding|sec-.*|upgrade-insecure-requests)$/i;
const NULL_BODY = new Set([101, 204, 205, 304]);

function ask(client, msg, ms) {
  return new Promise((ok) => {
    const ch = new MessageChannel(); const t = setTimeout(() => ok(null), ms);
    ch.port1.onmessage = (ev) => { clearTimeout(t); ok(ev.data); };
    try { client.postMessage(msg, [ch.port2]); } catch (_) { clearTimeout(t); ok(null); }
  });
}
async function findApp(key) {
  const known = appCache.get(key);
  if (known) { const c = await self.clients.get(known); if (c) return c; appCache.delete(key); }
  const all = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter((c) => c.frameType === 'top-level');
  const hit = await Promise.all(all.map(async (c) => { const r = await ask(c, { type: 'lbwho', key }, 800); return r && r.mine ? c : null; }));
  const c = hit.find(Boolean);
  if (c) appCache.set(key, c.id);
  return c || null;
}
async function serveDoc(path) {
  const hit = await (await caches.open(DOCS)).match(path);
  return hit || new Response('document expired', { status: 404 });
}
async function lane(e, req, key) {
  const app = await findApp(key);
  if (!app) return Response.error();
  const body = req.method === 'GET' || req.method === 'HEAD' ? null : await req.arrayBuffer();
  const headers = []; req.headers.forEach((v, k) => { if (!DROP_REQ.test(k)) headers.push([k, v]); });
  const r = await ask(app, { type: 'lbfetch', url: req.url, method: req.method, headers, body, dest: req.destination }, 130000);
  if (!r || r.err) return Response.error();
  const h = new Headers(); for (const [k, v] of r.headers) { if (!DROP_RES.test(k)) try { h.append(k, v); } catch (_) {} }
  const st = r.status >= 200 && r.status <= 599 ? r.status : 502;
  return new Response(NULL_BODY.has(st) || req.method === 'HEAD' ? null : r.body, { status: st, headers: h });
}
async function laneOrPass(e, req) {
  const c = await self.clients.get(e.clientId);
  const m = c && c.url ? DOC.exec(new URL(c.url).pathname) : null;
  if (!m || new URL(c.url).origin !== self.location.origin) return fetch(req);
  return lane(e, req, m[1]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const m = DOC.exec(url.pathname);
    if (m && req.method === 'GET') { if (req.destination === 'iframe') e.respondWith(serveDoc(url.pathname)); return; }
  } else if (e.clientId && req.mode !== 'navigate' && url.protocol.startsWith('http')) {
    e.respondWith(laneOrPass(e, req));
    return;
  }
  if (req.method !== 'GET' || req.headers.has('range')) return;
  if (url.origin !== self.location.origin || NEVER.test(url.pathname)) return;
  if (req.mode === 'navigate') {
    if (url.pathname === '/' || url.pathname === '/index.html') e.respondWith(navigate(req));
    return;
  }
  if (FIRST.test(url.pathname) || SWR.test(url.pathname)) e.respondWith(shell(e, req, url));
});
