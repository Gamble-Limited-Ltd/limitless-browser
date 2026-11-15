/* Limitless Browser: service worker rollback stub. Shipped only by deploy.sh when the deployed commit has no sw.js
 * (a rollback to 0.2.x). Browsers that installed the 0.3.0 worker fetch /sw.js again, find these bytes, install them,
 * and this worker removes its caches and itself. No fetch handler: it never answers a request. */
'use strict';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { for (const k of await caches.keys()) if (k.startsWith('lb-shell-')) await caches.delete(k); } catch (_) {}
    await self.registration.unregister();
    // pages the old worker controlled: reload them once so they load straight from the network
    for (const c of await self.clients.matchAll({ type: 'window' })) { try { c.navigate(c.url); } catch (_) {} }
  })());
});
