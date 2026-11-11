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
const SWR = /^\/theme\//;                                // changes with releases: serve cached, refresh behind

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
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'skip') self.skipWaiting(); });

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
  const hit = await c.match(key);
  const refresh = () => fetch(req).then((res) => { if (storable(res, false)) c.put(key, res.clone()); return res; });
  if (hit) {
    if (!FIRST.test(url.pathname)) e.waitUntil(refresh().catch(() => {}));
    return hit;
  }
  return refresh();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || NEVER.test(url.pathname)) return;
  if (req.mode === 'navigate') {
    if (url.pathname === '/' || url.pathname === '/index.html') e.respondWith(navigate(req));
    return;
  }
  if (FIRST.test(url.pathname) || SWR.test(url.pathname)) e.respondWith(shell(e, req, url));
});
