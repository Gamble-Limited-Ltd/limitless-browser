# Service worker document lane and libcurl in a Worker (design, 2026-11-17)

Branch `slice/1.2-swcurl` (base `release/1.1.0` 9bbe004). Plan: `docs/1.1/SPEED-AUDIT.md` (on `audit/speed-2026-11-16`) section 0a item 4, table rows 2e and 5, section 2 C1;
prototype notes `docs/1.1/audit/WORKER-PROTO.md` (branch `proto/libcurl-worker`). Boss approved the start on 2026-11-17. Both pieces are behind switches that
default to **false**; with both off nothing changes. Nothing here is measured on a real Chromebook: no speed number is claimed.

## 1. Goal

Today the frame document is a `blob:` URL. A `blob:` frame is not controlled by a service worker, so anything the browser fetches itself (cross-origin
`<img>` made by page JS, inline `<style>` `url()`, `import()` chunks, runtime preload links) goes straight to the network: the member's IP is exposed and a
school filter breaks the page (direct-load counter: Coolmath 23 to 30, Reddit 10 to 15, Steam 2 after the compat fixes). The audit proved that a frame whose
document is served by the service worker from a same-origin path (`/~lb/doc/<id>`) IS controlled and the worker sees every request, cross-origin ones included.
Second goal: libcurl (TLS records, HTTP/2 frames, gzip/brotli in WASM) leaves the main thread, so the UI and the page stay responsive while images stream
(proto: main-thread busy 1783 ms to 94 ms on 70 requests at 4x CPU; the worker is not throttled by CDP, so wall time on a device is unmeasured).

## 2. Decisions

### 2.1 Controlled-frame requests: bounce to the page, not libcurl inside the service worker
The worker answers a request of a lane frame by sending `{type:'lbfetch', url, method, headers, body, dest}` over a MessageChannel to the app page that owns the
document; the page runs `LB_queueFetch` (the normal path) and replies `{status, headers, body}`. Reasons:
1. One implementation of everything that already exists and is tested: the queue and its deadlines, the cookie jar (`getCookieHeader`, `captureSetCookies`), the response cache,
   the blocklist (`shouldSkip`), `LB_speedCap`, request hygiene, error classes and the relay token. Libcurl inside the worker would need all of that mirrored there.
2. A service worker is killed after about 30 s idle and has no `Worker` of its own for the relay router state; the page lives as long as the tab does.
3. It composes with `features.curlWorker`: the page's libcurl may itself be in a dedicated Worker, and the bounce does not care.
Cost: one extra postMessage hop per request and the page's main thread handles the reply (an `ArrayBuffer` in the transfer list, no copy besides the one `doFetch` already makes).
A later step can move the whole fetch path into a shared worker; not needed for the goal.

### 2.2 libcurl in a dedicated Worker, router stays on the main thread for now
`app/curl-worker.js` runs the vendored glue (`vendor/libcurl/0.7.5/libcurl-glue.js`, generated from `index.html` by `scripts/extract-libcurl-glue.mjs`, one edit: the wasm URL
comes from `self.__lbWasm`). `app/curlproxy.js` gives the rest of the app an `HTTPSession`-shaped object (`fetch`, `set_connections`, `close`, `active_requests`), so `doFetch`, `runQueue`,
`LB_speedCap`, `lbApplyConnections` and the Downloads panel read the same shape and the stubbed-curl tests keep working. Bodies stream as chunks (a fresh copy per chunk,
transferred; libcurl's chunks can be views on the wasm heap and must never be transferred). Errors cross as `{name, message}` and are rebuilt, so `lbClassify` still reads "error code N"
and `lbCat`/`lbCode` are set on the main thread; `AbortError` stays an `AbortError`. `runQueue` (per-job AbortController, deadlines) and `LB_speedCap` stay on the main thread.
Plan slice order (WORKER-PROTO.md): 1 worker plus proxy, 2 relay opener and token, 3 router, 4 streaming for downloads and video, 5 WebSocket bridge, pool probe, speed run.
**Built here: slice 1, for plain WebSocket relays only** (public relays, the free tier). A session on our own relay (`LB_OUR_WISP`, relay token as WebSocket subprotocol, shards, `dl/` and `v/`
sockets) or with multi-relay on is made on the main thread exactly as before; `lbWorkerSession` returns `null` for those. The router (slice 3, the riskiest) is not moved;
the worker has a small transport that reports `drop` and `fail` to `LB_router.noteDrop` and `markWispFailed`, which is what keeps the reconnect logic (`lbDrop`, `lbSessionGen`) working.
Fallbacks: no `Worker`, the worker script fails or the wasm does not start in 30 s: the main-thread `HTTPSession` is used and a warning is logged.
Open gate (plan): measure on a real school Chromebook before the router slice ships; CDP cannot throttle workers, so the wall-time effect is unknown.

### 2.3 Document lane
- The page puts the final frame HTML in the Cache API (`lb-docs`, key `/~lb/doc/<appKey>.<docId>`, both random, `appKey` is per page load) and sets `frame.src` to that absolute URL
  instead of a `blob:` URL (`go()`, one hunk). `LB_swDoc.put()` returns `null` when the lane is not ready and `go()` then makes the blob exactly as before.
- `sw.js` serves `/~lb/doc/...` only to a request with `destination === 'iframe'` (never to a top-level navigation or `fetch()`; a missing document is a 404 from the worker, a real navigation
  gets nothing special from the worker and then nginx's 404).
- Every non-navigation request of a client whose URL is a lane document and whose origin is not ours is bounced (2.1). The owner is found by `appKey`: the worker asks the top-level window
  clients `lbwho` and the one that owns the key answers; the result is cached and rebuilt after a worker restart, so no state is needed in the worker.
  If no app page answers, or the page errors, the request becomes a network error (`Response.error()`): the lane never falls back to a direct load.
  Cross-origin requests of any other client pass through with `fetch(req)` unchanged. Same-origin requests of a lane frame are left to the old path (nginx, gated).
- Response rewriting in the worker: `content-encoding`, `content-length`, `transfer-encoding` (libcurl already decoded the body), `set-cookie`, CORP/COEP/COOP, CSP and `x-frame-options` are dropped; 204, 205 and 304 get a null body.
  The real site's `access-control-*` headers are kept, so CORS behaves as it would natively.
- Scripts the browser now loads itself (`import()` chunks, `dest === 'script'`) skip `go()`'s rewrite stage, so the page side runs `LB_rewrite.async` on them before replying.
- Same origin as the app, so the frame runtime, `window.top.LB_blocklist` and `lbPostTo` messaging work as with `blob:`. `document.URL` of the frame differs; nothing in the runtime reads it (BASE is embedded).
- Lifetime: documents are removed by `lbRevoke` (also when Instant Back evicts), and each page start sweeps documents older than 24 h. The Cache API outlives worker restarts and page reloads.

### 2.4 The first page before the worker controls
A lane document needs an active `/sw.js` that answers the capability probe `lane?` (an older worker never answers, so the lane stays off and blobs are used). `LB_swDoc.start()` runs
right after `version.json` is read (register if needed, wait for active, probe). `put()` waits at most 800 ms for it; after that the page uses a `blob:` document. So the very first page of a
first-ever visit, or the first page after a release that ships a new worker (the old one stays active until the banner's Reload), is not covered and may still load parts directly.
The worker does not `skipWaiting` by itself (unchanged rule), and the lane needs no `clients.claim()`: an iframe navigation to a path inside the scope is controlled by URL.

### 2.5 WebSockets
A service worker never sees WebSocket traffic. The runtime hook (`handleWsOpen`, `new libcurl.WebSocket`) stays the only way a page WebSocket leaves; it still runs on the main-thread libcurl
(`libcurl.set_websocket(url)` is still called by `LB_swapSession`). Moving it into the worker is slice 5.

### 2.6 Access and gate safety
- nginx `auth_request` still gates everything: the worker serves no gated file. It never handles `/`, `/index.html` (still network first), `version.json`, `/_lb/`, `/auth/`, `/wisp/`, `CHANGELOG.md`
  or `/sw.js` (rules unchanged, same-origin only). A signed-out or revoked user is stopped at boot by `version.json` (the boot check is unchanged and never goes through the lane).
- A lane document is bytes the signed-in page already fetched through the proxy, under a random key, served only to an iframe. It does not widen what a member can reach, and the bounce
  asks the page, which goes through the same relay token and the same access decisions as any other request (a revoked member's relay token is refused at the VPS; `/wisp/` and the token endpoint stay gated).
- A revoked state is not hidden: nothing is cached for `/`, `version.json` or any gate response, and the lane adds no response to the app shell.

### 2.7 Switches, rollback
- `features.curlWorker` (build `LB_FEATURE_CURLWORKER`) and `features.swDoc` (build `LB_FEATURE_SWDOC`), both default false in the app and in `scripts/build-static.sh`.
  Turn on for a test build: `LB_FEATURE_CURLWORKER=true LB_FEATURE_SWDOC=true ./deploy.sh` (Boss runs deploys).
- Off at any time: rebuild without the switch. Page loads stop making `/~lb/doc/` URLs at once; cached documents expire by the sweep. `features.sw = false` also turns the lane off and deletes `lb-docs` with the shell caches.
  Rolling back to a release without this code: its page never asks for a lane document and its older worker has no lane handler, so nothing remains in use. `curl-worker.js` is only loaded by the new page.
- `curlWorker` has no persistent state. A broken worker falls back by itself (2.2).

## 3. What was built and what is left
Built and tested (`tests/e2e/curlworker.spec.js`, `swdoc.spec.js`, helper `wispserver.js`): switches and build wiring; worker, proxy, session swap, connection limits, abort by deadline, error classes,
streaming body, drop and fail signals; fallback paths; the document lane, bounce, capability probe, top-level refusal, rewrite of bounced scripts, kill switch.
Left:
1. libcurl slices 2 to 5: relay token and our own relay in the worker, the router (with multi-relay), streaming with backpressure and the Downloads second session in the worker, page WebSocket bridge,
   pool probe, skipping the main-thread WASM load when the worker is on (today both load it; the main one serves WebSockets and the benchmark).
2. Lane gaps: cross-origin iframe navigations and dedicated workers created by a page have no lane client (a worker's requests pass through); viewer pages (`loadViewerPage`) and the page-cache
   path (`pcUrl`) were not changed and keep `blob:` documents.
3. Measurements: direct-load counter on the named sites with the stack harness (`tests/stack/profile.spec.js`, shared rehearsal lock, not run here); a real Chromebook run before the router slice; first-page coverage numbers.
4. Release: the lane needs a built `sw.js` (the stamped sha path); do not ship with the switches on before the counter reads 0 on the named sites and Boss's go.

Last verified: 2026-11-17
