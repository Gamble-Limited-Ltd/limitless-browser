# Limitless 1.0: why pages load slowly or fail, and how to make the tests faster

Review for the agents that implement 1.0 speed work. Written 2026-11-12 by Claude (Opus 5.5) at Boss's request
("one time detailed thinking session"). Boss approved the findings and the priority order on 2026-11-12. **Nothing here is
built yet**: fixing is a separate session. This file is the work list.

- Code base reviewed: `release/1.0.0` at `1530551` (app code in `app/main.js`, 18,247 lines). Line numbers below are from that
  commit and will drift: search by the quoted names. The same code exists in 0.2.3 (`index.html` on `main`) and on
  `slice/1.0-s3`.
- Read with: `PLAN.md` (order, gates, kill switch rules), `SPEED.md` (S1 to S3, client), `RELAY.md` (server path, relay box),
  `TESTING.md` (layers, 6a real-site suite), `BASELINE.md` (numbers). This file does not repeat their content.
- Rules that apply to every item: every fix starts with a failing test; new behaviour gets a `features.*` kill switch
  stamped by `scripts/build-static.sh` like the existing ones; docs in the same commit; no em dashes; commit only when Boss
  asks; at most 2 feature slices in flight for this project; never ship an ungated deploy; no evasion features.

## 1. The problem in one table
From `BASELINE.md` "Real-site suite" (on `slice/1.0-s3`): 42 popular sites, Chromebook profile, 3 reps each.

| Build | Success rate | Median shown (loaded reps) | Median load |
|---|---|---|---|
| 0.2.3 | 67 % | 12.2 s | 23.1 s |
| release/1.0.0 before S3 | 66 % | 10.0 s | 20.2 s |
| S3 head | 66 % | 9.1 s | 19.9 s |

S1 to S3 made working pages faster. **None of them changed the success rate**: one rep in three does not load. The code
that fetches, retries, times out and hands bytes to the page (`queueFetch`, `runQueue`, `doFetch`, `doFetchWithPoolRetry`,
the `go()` retry ladder, the frame message handler) was not changed by any slice. Most findings below live there.

## 2. What was checked, and how (2026-11-12)
| Check | How | Result |
|---|---|---|
| Code read | `app/main.js` on `release/1.0.0`, `index.html` on `main`, `~/limitless-gate/src/{wisp,config}.ts`, `deploy/web/nginx.conf`, `deploy/relay/config.toml`, the test harness | Findings L1 to L12 below |
| HTTP/2 to sites | Throwaway rehearsal stack built from `release/1.0.0`, signed in as the mock user, `LB_net.curl.fetch('https://www.cloudflare.com/cdn-cgi/trace')` | `http=http/2 tls=TLSv1.3`: **HTTP/2 is negotiated** |
| Compression from sites | Same stack, `https://httpbin.org/headers` through `LB_net.curl.fetch` and through `LB_queueFetch` | Both send `Accept-Encoding: deflate, gzip, br` |
| Bytes on the wire | Same stack, a 275 KB Wikipedia page, WebSocket bytes counted over CDP | `content-encoding: gzip`, about 56 KB crossed the WebSocket for 275 KB of text: **compression works end to end** |
| Error text of ordinary site failures | Same stack: `https://does-not-exist.invalid/`, `https://expired.badssl.com/`, `https://example.com:81/` | `Request failed with error code 35: SSL connect error` (after 54 ms, for a name that does not exist), `... error code 60: SSL peer certificate or SSH remote key was not OK`, closed port: **no answer within 20 s** |
| e2e suite timing | `npm test` on `main` with the JSON reporter | 93 tests, 86 s wall, 4 workers, 314 s summed test time; 1 failure (see T8) |
| Prod health | `docker ps`, `docker logs --since 168h` (counts only, no IPs) | No `overloaded` closes; the gate is recreated every day at 06:01 by the rotation (L12) |

The stack was torn down afterwards (no rehearsal containers or networks left). Section 9 shows how to repeat the probes.

## 3. Corrections to the existing plan
- **SPEED.md F-j is wrong.** The libcurl.js 0.7.4 WASM contains nghttp2 and ALPN `h2`, and the live probe negotiated
  HTTP/2. Every origin is not "HTTP/1.1 with 6 per host". Consequences: (a) `LB_HOST_CONN = 6` (`app/main.js` 2718) only
  matters for HTTP/1.1 origins; (b) one HTTP/2 connection carries all streams to a host, so **throwing a session away
  (L2) costs more than it looks**: every host loses its multiplexed connection and pays DNS + TCP + TLS again through the relay.
- **BASELINE.md "nothing is compressed on the way to the browser" is a fixture artifact.** `tests/fixtures/sites/server.js`
  never compresses (no gzip or br, whatever the request asks). Real sites do compress through the relay (probe above).
  The "cold transfer 40 % smaller" target was measured against a server that cannot compress, so it measures the wrong
  thing. Fix the fixture server first (T5), then re-baseline.
- **SPEED.md F-i** was already settled in S1: `queueFetch` shares in-flight GETs (`inFlight` map). It is keyed by URL only
  (not method + body), which is fine because POSTs skip it.

## 4. Why pages fail (work items, highest value first)
Each item: problem, where, evidence, fix, failing test to write first, kill switch, done when.

### L1. Script timeout falls back to a direct load outside the relay
- **Where:** `go()`, external classic scripts, `app/main.js` 10219 to 10246 ("12s per-script timeout falls back to a direct
  external load"); same pattern for modules (10092) and iframes (10299). On timeout or error the code runs
  `scr.setAttribute('src', jsUrl)`: the blob document then loads the real `https://` URL **directly from the member's
  network**, not through the relay.
- **Why it fails pages:** on a filtered school network that direct load is blocked, so the script never runs and the page
  stays half-built ("render" and "timeout" categories: YouTube, Discord, Kahoot, Google Docs). The 12 s starts when the
  request is **queued**, not when it is sent (`Promise.race` around `qf(...)`), so on a slow line with many scripts, later
  scripts time out just from waiting in the 24-slot queue and fall into this path.
- **Also a privacy problem:** the member's real IP goes to the site, which the iframe code elsewhere explicitly avoids
  ("never a direct load" in `proxyIframe`, ~6440). Treat as P1.
- **Fix:** never set the original URL. On timeout keep waiting for the proxied fetch in the background and inject the
  script when it arrives (preserving order for classic scripts: a script that misses the render deadline holds back the
  ones after it, as the runtime `orderedScriptSwap` already does). Start the 12 s clock when the request is dispatched
  (`runQueue` picks the job), not when it is queued. If a script truly fails, leave `src` empty and log it.
- **Test first:** `tests/e2e/pipeline.spec.js` (or a new `fetchcore.spec.js`) with a routed script that answers after 15 s:
  assert no request to the real origin leaves the page (Playwright `page.on('request')` sees only same-origin, blob and data
  URLs) and the script runs once it arrives, in order.
- **Kill switch:** `features.noDirect` (default on; false = today's fallback).
- **Done when:** no direct third-party request in any e2e or stack spec; real-site suite "timeout" and "render" rows shrink.
- **Status (slice/1.0-compat, 2026-11-12): built, tests green** (`tests/e2e/compat.spec.js`). Classic scripts that miss the deadline, fail or come back empty never get their real URL (also module entries and the frame runtime's dynamic scripts: on failure the element gets an `error` event). A timed-out script keeps downloading, the page is built without it (`data-lb-late`), and the frame runtime loads it through the proxy as soon as the document is ready, reusing the in-flight download. Open: the 12 s clock still starts when the request is queued, not when `runQueue` dispatches it (that is the queue, owned by `slice/1.0-fetchcore` L4); a late script runs after the scripts that follow it in the document, not before. `setAttribute('src', ...)` on a script created at runtime is still a direct load (only the `.src` setter is proxied); not part of L1, needs its own item. Test knob: `LB_features.scriptTimeoutMs`.
- **Found while testing L1:** commit f66a713 (S3) wrapped the frame's `window.postMessage`, so every parent-to-frame reply arrived with the frame itself as `event.source` and the runtime's `e.source !== parent` check dropped it (fetch, XHR, stream, WebSocket and dynamic-script replies, cookie sync). Fixed here: the parent posts through its own `window.postMessage` (`lbPostTo`). Stub-network e2e tests never exercise this path; a stack spec should.

### L2. Ordinary site errors are treated as a relay drop and reset the whole session
- **Where:** `doFetch` catch block, `const isWispDrop` (`app/main.js` 5224). The test is a substring match on the error
  message for `error`, `failed`, `connection`, `tls`, `ssl`, `socket`, `reset`, `closed`, `network`, `eof`, `operation`,
  `aborted`, `interrupted`, `wisp`. libcurl.js messages always start with "Request failed with error code N", so **every**
  failed request matches.
- **What it does:** waits 300 ms (then 800 ms, 2 s), calls `LB_swapSession(WISP)` (719), which builds a new `HTTPSession`
  for the whole app and retires the old one, then retries the request once. Concurrent failures each start their own swap
  (no single-flight). Every swap drops the HTTP/2 and keep-alive connections to every host.
- **Evidence:** the probe shows a name that does not exist fails as `error code 35: SSL connect error` and a bad
  certificate as `error code 60`: both are site problems, both trigger the swap. One dead ad or tracker host on a page can
  reset the session several times during one load. `BASELINE.md` also lists error 7 (connect) on Amazon, GitHub, Quizlet
  and 35 on a Reddit tracker host.
- **Fix:**
  1. Classify by **libcurl error code**, not message text. Codes that describe the site (6 resolve, 7 connect, 28 timeout,
     35 TLS handshake, 51/58/60 certificate, 52 empty reply, 56 receive, HTTP status) fail that one request and do not
     touch the session. Note that the relay reports "name not found" as 35 (probe), so 35 alone is not a relay sign.
  2. Decide "relay dropped" from the transport, not the request: the WISP WebSocket for that shard closed or errored
     (`WispConnection` close/error events, `_wisp_connections`, `app/main.js` near the inline libcurl glue in `index.html`;
     `LB_router.sockets` tracks live sockets per shard). Only then reconnect.
  3. Single-flight the reconnect: one promise shared by every request that saw the same drop; no new `HTTPSession` when
     the session itself is healthy (libcurl reopens a closed WISP socket for the same base URL by itself; check this in the
     test before relying on it).
  4. Read the WISP CLOSE reason (0x41 invalid, 0x42 unreachable, 0x43 timeout, 0x44 refused, 0x47 timeout, 0x48 blocked,
     0x49 throttled) where the transport sees it, and pass it on as the error category. That gives real DNS / connect /
     blocked categories to the error card and the real-site suite.
- **Test first:** e2e with a stub `curl` through the `LB_net.curl` hook: a fetch rejecting with "error code 35" must not call
  `LB_swapSession`; a simulated WISP socket close must call it exactly once for 10 concurrent failures.
- **Kill switch:** `features.errClass`.
- **Done when:** a fixture page with one dead host (T5 fault fixtures) loads with zero session swaps; real-site suite
  success rate goes up.

### L3. Navigation retry ladder: slow error cards and repeated POSTs
- **Where:** `go()` catch, "Fallback retry logic" (`app/main.js` ~10495 to 10600): `limitless:main:retries` (default 3),
  `limitless:fallback:delay` (default 3 s, applied before retries 2 and 3), then the pool phase when third-party relays are on.
- **Problems:**
  - Any error that is not DNS, timeout or 5xx by message text counts as "generic, always eligible". Because of L2's message
    shape, almost everything is generic. A typo or dead site runs the whole page pipeline 4 times and waits 6 s before
    the error card.
  - The retry calls `go(url, false, method, body, true)`: **a form POST is sent up to 4 times** (double orders, double
    posts, double sign-in attempts).
- **Fix:** retry the navigation only when L2's classifier says the relay dropped, at most once, after the reconnect
  settles, and never for non-idempotent methods (POST, PUT, PATCH, DELETE). Site errors go straight to the error card
  with the category (DNS, connect, TLS, certificate, HTTP status). Keep the Settings counters but cap them at 1 for
  site errors.
- **Test first:** routed POST that fails once: assert exactly one POST reached the route; a "name not found" page shows the
  error card in under 1 s.
- **Kill switch:** part of `features.errClass`.

### L4. Timeouts do not cancel, and requests have no deadline of their own
- **Where:** every `Promise.race([qf(...), setTimeout(reject)])` in `go()` (10092, 10225, 10299) and the image wait (10374).
  `doFetch` (5087) passes only the tab's abort signal to `curl.fetch`.
- **Problems:** the losing fetch keeps running. It holds one of the `MAX_CONCURRENT` (24) slots in `runQueue` and its
  `inFlight` entry, so a later request for the same URL joins the stuck one. The probe's closed port gave no answer within
  20 s; nothing in our code ends it. A few such requests on one page shrink the queue for everything else.
- **Fix:** one per-request `AbortController` in `runQueue` with two deadlines: connect/first byte (10 s) and idle body
  (15 s with no new bytes; reset on progress if libcurl.js exposes it, otherwise a total cap of 30 s for non-media). When a
  stage stops waiting, abort that request (only if no other watcher is on the `inFlight` entry; the watcher count already
  exists). Free the slot on abort.
- **Test first:** stub `curl.fetch` that never settles: after the deadline the queue slot is free (`fetching` back to 0
  through a test hook) and the promise rejects with a timeout category.
- **Kill switch:** `features.deadlines`.

### L5. Heavy pages lose images when the queue passes 150
- **Where:** `queueFetch`, `if (fetchQueue.length > 150 && priority >= PRIORITY.image)` (`app/main.js` 5012): rejects with
  `Queue full` at once.
- **Problem:** runtime image requests from the page (lazy promotion in S1) hit the same cap, so on long pages images fail
  and show the broken-image icon instead of waiting.
- **Fix:** apply the cap to the pre-warm only (it is optional work). Page-initiated requests wait; if memory is the worry,
  cap by total queued bytes or drop the oldest pre-warm jobs first. Also replace the O(n) `splice` insert with per-priority
  arrays (small win on 150+ entries).
- **Test first:** fixture with 300 images: every visible image eventually loads, none reports `Queue full`.

### L6. Scripts that look for themselves break (data: URL swap)
- **Where:** classic scripts become `data:text/javascript;charset=utf-8;base64,...` (10239, 10051, 8022, runtime 6489
  `orderedScriptSwap`).
- **Evidence:** `BASELINE.md`: OneTrust cookie banners on Duolingo and NPR throw `hasAttribute` of null because they search
  `document.scripts` for their own `src`. Data URLs also cost a base64 copy of every script (large bundles are MBs).
- **Fix:** use `blob:` URLs (`URL.createObjectURL(new Blob([text], {type: 'text/javascript'}))`) and keep the original URL in
  `data-original-src`; in the injected runtime, patch `HTMLScriptElement.prototype.src` getter (already done for runtime
  scripts) **and** make `document.currentScript.src` / `getAttribute('src')` answer the original for parsed scripts. Revoke
  blob URLs on navigation. Check the blob document's CSP allows `blob:` scripts (it allows data: today).
- **Test first:** fixture script that does `document.querySelector('script[src*="banner.js"]')` and
  `document.currentScript.src`: both must find the original URL.
- **Kill switch:** `features.blobScripts`.
- **Status (slice/1.0-compat, 2026-11-12): partial, tests green.** Parsed classic scripts now run from `blob:` URLs (made right before the page is serialised, revoked with the page blob through `lbScriptBlobs`); the page cache stores `data:` URLs instead (`lbBlobsToData`), since a stored page outlives the blobs. The runtime keeps the original URL visible: `currentScript.src` (already), `getAttribute('src')` and `querySelector(All)('script[src...')` answer from `data-original-src`. Not done: module entries and the dynamic `qjs` scripts still use `data:` (the `qjs` reply is the L10 binary-transfer work in `slice/1.0-fetchcore`); selectors other than `script[src` (for example a bare `[src*=x]`) are not rewritten; `hasAttribute('src')` and `.attributes` still show the blob URL.

### L7. The gate allows 8 sockets per user; one app tab opens 4
- **Where:** `~/limitless-gate/src/config.ts` 83 `maxSocketsPerUser: 8` (`maxStreamsPerUser: 64`); app default
  `ownSockets` 4 (`features.ownSockets`, Settings "Sockets to our relay"). The latency probe (`probeWispLatency`) opens one
  more WebSocket briefly.
- **Problem:** two Limitless browser tabs use all 8; a third tab's sockets are refused and that tab cannot load anything.
  Not reproduced: verify in the rehearsal before changing anything.
- **Fix options (pick after the test):** raise the default to 16 (fair share and per-user byte caps already bound abuse);
  or have instances coordinate over `BroadcastChannel` and drop to 2 shards when more than one tab is open; and show a clear
  "too many Limitless tabs" notice instead of a failed load when the gate refuses with the socket-cap reason.
- **Test first:** stack spec opening three app tabs for one user: all three load a fixture page.
- **Cross-repo:** a gate change is in `~/limitless-gate` (read its CLAUDE.md, gate tests with `npm run check`).

### L8. Video and large files are loaded whole
- **Where:** runtime `fetchBlob` (`app/main.js` 6162) buffers the whole response, base64-decodes it, builds a Blob, then sets
  `src`. `doFetch` (5287 to 5315): when a server ignores `Range`, the full file is downloaded and sliced in memory.
- **Problem:** a video plays only after the whole file is downloaded and copied several times; seeking re-downloads.
  YouTube is 0/3 in every column (it also has other problems: separate investigation).
- **Fix (design spike, not a quick change):** stream media in Range chunks (for example 1 to 2 MB) into `MediaSource`
  where the type is supported, or serve media through an app-origin service worker URL that streams from the parent over a
  `MessageChannel`. Never fetch a whole file over a size limit (for example 32 MB) as a Blob. Out of scope for the first
  fix slice; write `docs/1.0/MEDIA-SPIKE.md` with the measured options first.

### L9. Daily rotation drops every relay socket
- Prod evidence: `limitless-browser-lbgate-1` is recreated at 06:01 Chicago every day by `gll-planning/rotation` (GATE issuer
  hostname changes). Every open WISP socket closes. With L2 fixed, this becomes one clean reconnect. No change to the
  rotation; just make sure the L2 test covers "all shards close at once".

## 5. Why pages are slow (CPU and bytes)
### L10. Every page subresource crosses into the frame as base64 (biggest CPU cost)
- **Where:** frame message handler `d.t === "q"` (`app/main.js` ~7960 to 8000): `const b64 = toB64(r.buf)`, then
  `postMessage({..., d: b64})`. `const transferBuf = r.buf.slice(0)` (7984) copies the whole body and is **never used**. The
  frame side (`fetchBlob` 6162, the fetch/XHR shims) runs `Base64.decode(r.d)`.
- **Cost:** per image or fetch: 1 wasted copy, base64 encode (+33 % size) on the parent's main thread, a string clone across
  frames, base64 decode in the frame. On the Chromebook profile, warm fx-news (17 KB on the network) took 4.2 s to load on
  0.2.3 and 1.6 s on S3: that time is CPU, not network.
- **Fix:** send the bytes as an `ArrayBuffer` with a transfer list: `postMessage({t:'r', i, s, h, m, d: buf}, '*', [buf])`.
  Transfer a copy only when the cache still holds the original (`r.fromCache` or the response was stored); otherwise transfer
  the original. The frame builds the Blob straight from the ArrayBuffer. Keep base64 only as a fallback if a message without
  `ArrayBuffer` arrives (older injected runtime in a stashed tab). Same change for `qjs` (8022) once L6 lands.
- **Test first:** e2e counting calls to `Base64.encode`/`toB64` during a fixture load with 60 images: must be 0; images
  still render.
- **Kill switch:** `features.transfer`.

### L11. Logging and debug output on every request
- `log()` (`app/main.js` 4594) creates two elements, parses the message with `innerHTML`, and formats a time with
  `toLocaleTimeString` for **every** request, cached hit and block, even when the log panel is closed.
- Three `console.log('[REQDIAG-...]')` lines are left in the frame runtime (5934, 6090, 6187), one per request.
- **Fix:** keep log entries as plain objects in a ring buffer (for example 500) and build DOM only while the panel is open;
  delete the REQDIAG lines. No kill switch needed. Test: the existing log panel behaviour still works (open panel, entries
  shown, search works).

### L12. Images can be downloaded twice; media limiter polls
- The image pre-warm fetches the first 24 images (S1) to fill the cache. If the response is not storable (`no-store`, cookie,
  cache switched off) the bytes are thrown away and the frame fetches the same image again. Fix: keep pre-warm responses
  in a per-navigation memory map that the frame's first request for that URL consumes, whatever the cache decides.
  **Status (slice/1.0-compat, 2026-11-12): built.** `lbPrewarm` (cleared at each navigation, entries expire after 30 s) is consumed by the frame's plain GET for the same URL (no Range or conditional headers).
- `loadMedia` polls `setTimeout(50)` while 24 loads are pending (`app/main.js` 6362). Already in `SPEED.md` section 5, not
  built: replace with a promise queue. **Built** (`acquireMedia`/`releaseMedia`: a finished load hands its slot to the next waiter).

### HTTP/2 follow-ups (after L2 and L4)
- With HTTP/2 confirmed, measure whether `set_connections(n, n, 6)` and `MAX_CONCURRENT` 24 are still right: HTTP/2 hosts
  multiplex, so the queue limit (not connections) is what throttles. Try 32 and 48 queued requests on the fixture and
  real-site suites; keep what is faster on the Chromebook profile.
- libcurl.js 0.7.5 review (`RELAY.md` 8) can now drop the "check for HTTP/2" part.

## 6. Making the tests faster
Measured: e2e 86 s wall (4 workers, `fullyParallel` off, so a file is the unit: `admin.spec.js` alone is 82 s of test time
on one worker). Speed harness: about 35 to 40 min per Playwright project plus image builds (0.2.3 baseline: chromium
15:43 to about 16:20, chromebook about 16:20 to 17:00). Real-site suite: 42 sites x 3 reps, up to 45 s per shown wait plus
12 s per selector; with 3 workers the shared VM went past load 30 and the gate timed out, and the results were thrown
away (`BASELINE.md`), so more workers is not the answer on this VM.

| # | Change | Where | Expected gain |
|---|---|---|---|
| T1 | **Tiered speed runs.** `npm run test:speed:quick` = fixtures only, `chromebook` project only, 3 reps (`LB_SPEED_ONLY`, `LB_SPEED_REPS` exist; add a fixture-only switch, for example `LB_SPEED_PUBLIC=0`). Full 7 reps, both projects and public sites only for the release gate. | `package.json`, `tests/stack/speed.spec.js` | about 1.5 h to about 8 min for slice work |
| T2 | **Sign in once per project** and reuse the session cookies in each fresh context (the real-site suite already does this per site, commit `eb26d27` on `slice/1.0-s3`). Caches stay empty because only cookies are reused. | `speed.spec.js` `openPage`/`signIn` | the mock OIDC round trip and an app boot per rep (about 100 reps per project) |
| T3 | **Fail fast.** When the error card shows, record the failure and move on instead of waiting out the 60 s `waitForFunction`. Same for the real-site suite. | `speed.spec.js` `navigate`, `sites.spec.js` | up to 60 s per failed rep |
| T4 | **Real-site smoke list.** 12 sites (2 per group, include the known failures) for slices; the full 42 only at the release gate. Skip rep 3 when reps 1 and 2 failed with the same category. Keep 1 worker on this VM; run the full list at a quiet hour. | `tests/stack/real-sites.json` (add a `smoke: true` flag), `sites.spec.js` | about 2/3 less time per slice run |
| T5 | **Fault fixtures** (fast, deterministic tests of failure handling instead of finding it on 42 live sites): dead host (no listener), slow connect (black-holed port), TLS error, reset mid-body, 404 storm, script that answers after 15 s, page with one dead third-party host, a Range-ignoring video. Also make the fixture server **compress** when the request allows it (gzip and br from `node:zlib`) and add `/echo-headers`. Fault routes need the fixture relay config only (already test-only). | `tests/fixtures/sites/server.js`, new `tests/stack/failures.spec.js` | L1 to L5 checked in minutes; transfer-size target becomes real |
| T6 | **Unit tests of the fetch core** with a stubbed `curl` (`LB_net.curl` setter) and the existing hooks (`LB_queueFetch`, `LB_router`): error classifier, single-flight reconnect, POST never retried, deadlines free slots. Same pattern as `tests/e2e/router.spec.js`. | new `tests/e2e/fetchcore.spec.js` | catches L2 to L5 regressions in `npm test` (seconds) |
| T7 | **e2e speed-ups:** `fullyParallel: true` (tests already use their own pages; check `admin.spec.js` and `cache.spec.js` for shared state first); `page.clock` instead of real waits in `update.spec.js` (its slowest test is 17 s, another 8 s; uses `waitForTimeout(4500)`); remove `waitForTimeout(1000)` in `smoke.spec.js` in favour of a condition. | `playwright.config.js`, `tests/e2e/update.spec.js`, `smoke.spec.js` | 86 s to roughly 45 s (estimate, measure) |
| T8 | **Housekeeping:** `startpage.spec.js` "adding a shortcut shows a tile" failed once on `main` (tile title `example.org`, expected `Example`) and passes on `release/1.0.0` (5/5): watch for flakiness. `deploy/rehearsal/run.sh` prints a `KEEP=1` teardown command without `REHEARSAL_OWNER_SUB`, so the printed command fails; add it (any value works for `down`). | | |
| T9 | **Reuse a running stack** (optional): `REUSE=1` in `run.sh` skips build and `up` when the rehearsal project is healthy and the static tree sha matches. Image builds were cached and fast in this review (46 s to ready), so this is low priority. | `deploy/rehearsal/run.sh` | under 1 min per run |

**Status 2026-11-12 (`slice/1.0-testspeed`):** T1 done (`test:speed:quick`, `LB_SPEED_PUBLIC=0`), T2 done (speed harness signs in once per run, cookies only), T3 done (speed harness and real-site suite end a rep on the error card), T4 done (12 `smoke: true` sites, `test:sites:smoke`, `test:sites` now 1 worker, rep 3 skipped on a repeated category), T7 done (`fullyParallel`, `page.clock` in update.spec.js, no fixed wait in smoke.spec.js; admin and cache specs have no shared state), T8 done (teardown line), T9 not built (images are cached; the saving is under a minute). T5 and T6 belong to `slice/1.0-fetchcore`. Measurements: `docs/1.0/BASELINE.md` section "Test speed-up". Unattended gate run: `scripts/speed-nightly.sh`.
**Resume here:** smoke list run not finished; full gate set (`scripts/speed-nightly.sh`, run it under no other load, about 2 h) never run and not scheduled; the slice branch is not merged into `release/1.0.0`; T9 not started; T5 and T6 not started by this slice.

Not recommended: running the `chromium` and `chromebook` speed projects in parallel or on more workers (they share the
VM's CPU and the throttled profile would be skewed); offloading the speed harness to buildpc (needs the gate repo and
Docker, the PC is often off, and numbers must come from one machine). The e2e suite could go to buildpc after adding an
`.nvmrc`, but at 86 s it is not worth it.

Always take the shared lock for anything that starts the rehearsal: `flock /tmp/limitless-rehearsal.lock ...` (one compose
project name, `limitless-browser-rehearsal`, for every checkout).

## 7. Suggested slices and order (respect "2 in flight")
1. **`slice/1.0-fetchcore`** (first): T6 and T5 first (failing tests), then L2, L3, L4, L5, L10, L11. All in the fetch core
   and the frame message path. Kill switches `errClass`, `deadlines`, `transfer`.
2. **`slice/1.0-compat`** (can run beside 1): L1, L6, L12. Page-building code in `go()` and the frame runtime. Kill switches
   `noDirect`, `blobScripts`. L1 first: it is also a privacy fix.
3. **Gate and tabs:** L7 after a stack test proves it (gate repo, small).
4. **Media spike:** L8 as a written design with measurements before any code.
5. **Tests:** T1 to T4 and T7 can be done by whichever slice touches the file first; T8 any time.

Model choice for the implementing sessions: Sonnet 5.5 at medium effort for the slices; Opus 5.5 for the media spike
design and for the release sign-off.

## 8. How to measure that it worked
- Per slice: `npm test` green (with the new specs), the quick speed run (T1) against the 0.2.3 fixture baseline
  (`scripts/speed-compare.mjs`), the fault suite (T5), and the real-site smoke list (T4).
- Release gate: full real-site suite (success rate must beat 66 %, and every failure keeps a category), full speed harness
  after the fixture server compresses (re-baseline 0.2.3 with the compressing fixtures so the transfer target is fair).
- Watch in the real-site output: the share of failures in `timeout`, `render` and `connect`, and the median shown time.

## 9. Repeating the probes in section 2
1. `git archive release/1.0.0 | tar -x -C <scratch>/rel`, symlink `node_modules` from `~/Browser`.
2. `cd <scratch>/rel && KEEP=1 flock -n /tmp/limitless-rehearsal.lock deploy/rehearsal/run.sh -g ZZZ_NO_MATCH --pass-with-no-tests`
   (builds and starts the stack, runs no tests, leaves it up).
3. A small Playwright script: sign in as `alice` on the mock GATE (same steps as `signIn` in `tests/stack/speed.spec.js`), wait
   for `window.LB_net.curl`, then in the page `await LB_net.curl.fetch(url)` (session path) or `await LB_queueFetch(url, {})`
   (app path). Count bytes with CDP `Network.webSocketFrameReceived`. Print only the `http=`, `tls=` and `sni=` lines of the
   Cloudflare trace, never `ip=`.
4. Tear down with the command `run.sh` prints, adding `REHEARSAL_OWNER_SUB=x` (T8), then check no
   `limitless-browser-rehearsal` containers or networks remain.

## 10. Not checked
- The full speed harness and the full real-site suite were not run (multi-hour; Boss approves those).
- L7 (socket cap) and the exact libcurl.js connect timeout were read from code and one probe, not reproduced end to end.
- Whether libcurl.js reopens a closed WISP socket without a new `HTTPSession` (L2 step 3): check in the first test.
- The relay box path on `slice/1.0-edge` (`features.edgeWisp`) was not reviewed; L2's "relay dropped" detection must cover
  both our `/wisp/` shards and the box.
- The gate's per-frame CPU cost (load is tiny today: gate 0.4 % CPU).

Last verified: 2026-11-12
