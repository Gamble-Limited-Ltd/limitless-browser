# 02: Client speed on the Chromebook (spec, 2026-11-19)

Area code **CL**. Work that runs on the member's device, so every tier gets it (Ordinal included). Old ids merged here: SPEED-NEXT N2,
N3, N4, N8, N9, N10, C1, H3, H4, H5, H6, H7, G8; NATIVE-SPEED-PLAN Phase 2 (2.1 to 2.3, 2.5, 2.6) and Phase 3. Research:
`docs/1.3/research/speed-2026-11-19.md`.

## 0. Where the time goes (1.2.0, chromebook profile, TIER-NUMBERS and SPEED-NEXT N2)
- First-visit rewrite of multi-MB bundles: Steam `store/main.js` 1.9 MB about 2.4 s at 4x CPU, Kahoot controller 5.5 MB about 4.6 s
  (acorn). meriyah cuts that by 1.1x to 1.5x; the walk and the edit join are the rest.
- Discord shown at about 55 s, Kahoot about 24 s, Steam front about 14 s, Steam app page about 32 s; Coolmath has a 7.9 s long task in
  one rep.
- TLS records, HTTP/2 frames and brotli in WASM on the page thread (libcurl.js); the Worker prototype cut page-thread busy time from
  1783 ms to 94 ms while 70 images streamed (not measured on a device).
- Research (2026-11-19, inference marked there): `blob:` script URLs are most likely never put in Chrome's on-disk code cache (it is keyed
  by http(s) URL), so every visit compiles big scripts again. Same-origin scripts served from Cache Storage are eligible.

## 1. Status of built items
| id | item | old ids | switch | status |
|---|---|---|---|---|
| CL-1 | meriyah first, acorn fallback, in the rewrite Worker | N2, N4, 2.2 | `meriyah` (default true) | built on `speed/1.3-quick`, not released, not measured in the gate |
| CL-2 | 6 sockets to our relay for paid tiers (4 otherwise) | N8, 2.5, R2 | `ownSockets` 6 | built on `speed/1.3-quick`, not released |
| CL-3 | Cheap skip of scripts with no `location` and no `import(` | N3 | none | exists since 1.0 (`rewriteLocationRefs` first line); a finer token scan skipped nothing more on 38 bundles. Closed |
| CL-4 | Compact blocklist (no Set build) | N1 | `compactBlocklist` | shipped 1.2.0 |
| CL-5 | Ad and tracker blocking on by default | H4 | blocklist (HaGeZi Multi NORMAL, GPL-3.0) | shipped 1.0; per-site off switch exists (allowlist). Closed |

CL-1 and CL-2 ship as their own small releases (one item per release, Boss 2026-11-18), each after the item gate (spec 08).
**Gate so far (2026-11-18/19 overnight, one run each against 1.2.0, chromebook, fixtures only):** N8, N8+N7 and N8+N7+N4 all failed. N8's
rows looked like noise (gone in run 2); N4 added nothing measurable over N7. Both must be rerun alone on a quiet machine (TS-2) before any
release record; CL-1 ships only if it is not slower (its expected gain is first-visit rewrite time, which the warm fixture rows barely show).

---

## CL-6 Stable script URLs: reuse per session, then code cache across visits (was 2.1, new from research)
- **Status:** step A built 2026-11-25, item gate pass; step B planned. **Likely time:** step A 2 h, step B 4 to 6 h (needs the SW lane, spec 05 TL-3). **Tiers:** all.
- **Why:** the 1.2.0 gate flagged +100 to 130 ms on `fx-app` warm from ES module `blob:` URLs, and big scripts are compiled on every visit.
- **Step A (`features.blobReuse`):** one `blob:` URL per content hash per app session (`Map sha -> url`), revoked only when no tab
  document uses it (reference count) or at 64 MB of live script blobs (LRU). Modules and classic scripts both.
- **Step B (`features.jsLane`, needs `swDoc`):** rewritten scripts of 16 KB or more are put in Cache Storage `lb-js` under
  `/~lb/js/<sha256 of rewritten text>.js` and the document references that same-origin URL instead of a `blob:`. `sw.js` serves
  `/~lb/js/*` only from `lb-js` (cache match), never from the network, only to `script` destinations of lane frames.
  Same-origin URL + Cache Storage = eligible for V8's code cache (research section 3). Eviction: LRU at 150 MB, sweep at page start.
- **Measure first (step B gate):** a trace on the chromebook profile (and MS-2 on the device) of Steam front warm: compile time of
  `store/main.js` with step A against step B, 5 reps each. Build step B only if compile time drops by 30 percent or more.
- **Edge cases:** the same script text under two page URLs (one entry, fine: output is URL-independent after `lbImu`); `import.meta.url`
  patterns are applied after the rewrite, so the stored text must be the final text; a revoked member: `lb-js` holds only rewritten public
  script text, but it is still cleared with the other caches on sign-out (`features.sw=false` path).
- **Tests:** e2e: two tabs with the same script share one blob URL (step A); the lane serves `/~lb/js/` only to a lane frame's script
  request and 404s a top-level navigation (step B).
- **Rollback:** the switches.

## CL-7 Rewrite Worker pool from the device (was 2.3)
- **Status:** built 2026-11-25, on hold: item gate failed sites twice (heavy apps time out). **Likely time:** 1 h. **Tiers:** all.
- **Rules:** pool size = `clamp(navigator.hardwareConcurrency - 1, 1, 4)` (today a fixed 2); one Worker more only when a page has 4 or
  more scripts of 256 KB or more waiting; idle Workers above 2 close after 60 s.
- **Measure:** `fx-app` cold and the Steam profile row, 2 vs pool, chromebook. Note CDP cannot throttle Workers, so the device run (MS-2)
  decides; ship only if the device run is not slower.
- **Tests:** `worker.spec.js`: pool size from a stubbed `hardwareConcurrency`; extra Worker only under the queue rule.

## CL-8 libcurl in a Worker, slices 2 to 5, then on (was C1, H5, Phase 3)
- **Status:** slice 1 shipped in 1.2.0 OFF (public relays only). **Likely time:** about 18 h over 4 releases. **Tiers:** all; slice 2
  makes it reach paid members. **Design:** `docs/1.2/SWCURL-DESIGN.md` 2.2.
- **Slices (each its own release, switch `curlWorker` stays the one switch):**
  - 2 (2.5 h): relay token and our own relay in the Worker (`lbt.<token>` subprotocol, renewal message from the page, shards opened from the Worker).
  - 3 (5 h, highest risk): the router (`LB_makeRouter` is a plain object; instantiate it in the Worker, page keeps a proxy for Settings and
    tests; multi-relay included). **Gate before it ships:** a school-Chromebook run (MS-2) with slice 2 on and off.
  - 4 (4 h): streamed bodies with backpressure (`ReadableStream` with a high-water mark, transfer per chunk), the Downloads second session.
  - 5 (4 h): page WebSockets bridged into the Worker, the pool probe, and one WASM load (the page stops loading libcurl when the Worker
    is up).
  - on (2 h): `curlWorker` default true after the stack suite in both membership modes and the item gate.
- **Exit:** page-thread busy time while 70 images stream under 10 percent of wall time (profile harness), no speed-gate regression,
  device run not slower.
- **Edge cases (design doc):** a dying Worker falls back to the page thread for new sessions and says so in the log; errors keep
  `lbCat`/`lbCode`; abort by deadline works across the boundary.
- **Rollback:** `LB_FEATURE_CURLWORKER=false`.

## CL-9 HTML parse off the page thread (was N9, 3.6)
- **Status:** measure first. **Likely time:** 1.5 h measure, 5 h build if it passes.
- **Gate to build:** Steam front's `DOMParser` + DOM rewrite step over 300 ms on the chromebook profile (trace). Else close the item.
- **Build (if it passes):** htmlparser2 (MIT) in a Worker produces the rewritten HTML text; the page keeps `DOMParser` only for the small
  set of steps that need a DOM. Superseded by LD-3 if streaming documents land first; decide after LD-3a.

## CL-10 Chunk the remaining long tasks (was H6, 2.6 Coolmath)
- **Status:** planned. **Likely time:** 3 to 5 h.
- **Rules:** a trace of the official sites (profile harness, `tests/lib/cpuprofile.js`) lists every long task over 200 ms caused by our
  code (app or injected runtime, by function); each one either moves to a Worker, gets split with `scheduler.yield()` (fallback
  `setTimeout(0)`), or gets a written reason. Coolmath's 7.9 s task and Kahoot's 5.1 to 5.7 s tasks first.
- **Exit:** master plan target: longest task caused by us under 200 ms (Ordinal, Cardinal), under 100 ms (Prime, Executive) on the
  official sites.

## CL-11 Named-site fixes (was 2.6)
- **Status:** planned. **Likely time:** 3 to 5 h each, one release each.
- **List:** Steam app page renders with blank text (font or CSS path); Discord shown at about 55 s (profile first: rewrite, module graph or
  WebSocket wait); Kahoot about 24 s (controller bundle 5.5 MB: CL-6 and spec 04 SV-4 help most); Khan Academy and Tumblr page script
  errors (sites suite). Each starts with a fixture or a saved real bundle that reproduces it and a failing test.

## CL-12 Device cache that survives (was G8)
- **Status:** planned. **Likely time:** 3 h.
- **Rules:** `ProxyCache` cap from storage estimate: `min(400 MB, 10 percent of navigator.storage.estimate().quota)`, at least today's
  200 MB; request `navigator.storage.persist()` once (no prompt in Chrome; result logged); eviction keeps site shells longest: scripts,
  CSS and fonts get a weight of 3 against images 1 in the LRU order.
- **Tests:** `s3.spec.js` style: eviction order with weights; cap from a stubbed estimate.
- **Measure:** next-day warm visits (MS-2: run the bench, close the browser, run it the next day).

## CL-13 Lighter app shell (was H7)
- **Status:** planned, low rank. **Likely time:** 6 to 10 h (needs an API refactor of closure state, see CLAUDE.md "Not done").
- **What:** inspector, extensions, log panel and PDF viewer move to `app/<sha>/*.js` loaded on first use. Measure the boot first: if
  `app/main.js` parse and compile on the device is under 150 ms warm (code cache), close the item.

## CL-14 Transport bench (was N10, H3, research section 4)
- **Status:** research. **Likely time:** 3 h.
- **What:** on one WISP server and the chromebook profile, compare libcurl.js 0.7.5 with epoxy-tls for: 50 small GETs, one 10 MB GET, TLS
  handshakes per second; check whether either sends data right after CONNECT (WISP v1 allows it, saves a round trip per stream). Licences
  must fit AGPL. Output: a table in this file. Nothing changes in the app from this item.

## CL-15 Token-level rewriter with AST fallback (new, brainstorm A1)
- **Status:** built 2026-11-24 on `item/cl15-tokrw` (switch off; rc gate with it on 2026-11-24 22:00 Central). **Likely time:** 8 to 12 h prototype, 6 h build. **Tiers:** all.
- **Why:** the rewriter builds a full AST to find a handful of `location` and `import(` uses; parse is most of the 3 to 4.6 s first-visit
  cost of a 5 MB bundle at 4x CPU. A scanner needs positions and a little context, not a tree.
- **Rules:**
  1. One pass over the source with a JS tokenizer that handles strings, template literals (with nesting), comments, regex literals vs
     division (decided by the previous significant token), and hashbangs.
  2. Edits, all using the guards the runtime already has (`__lbSafe`, the `location` member guard, `__lbImport`): a `location` identifier
     token after `.` or `?.` in an expression; a bare `location` identifier not after `.`, not a property key (`location:` in an object
     literal or a class body), not a declaration name; `location =` / `location +=` assignments; `import(`. The guards pass through any
     value that is not the real `Location`, so a local variable named `location` needs no scope analysis.
  3. Bail out to today's AST path for the whole script on: `with`, a tokenizer error, a `location` token whose role is not one of rule 2's
     cases, or any script that `rewriteLocationRefs` today rewrites differently on the corpus (rule 4). Count bail-outs in
     `LB_rewrite.stats().tokFallback`.
  4. Parity before shipping: on the golden corpus (the 38 real bundles of 16 KB or more from N2/N3 plus the repo's own scripts), every edit
     position the AST rewriter makes must also be made by the scanner; extra edits are allowed only where the guard is a no-op. A fuzz test
     (fast-check style generator of small programs using `location` in every role) compares the runtime result of both outputs.
  5. `rwVer` (SV-4) includes the scanner's version, so cached rewrites from the AST path are not mixed silently.
- **Switch:** `features.tokRewrite` (default false until the parity and speed gates pass).
- **Measure:** rewrite ms per bundle at 4x CPU on the page thread and 1x in the Worker, the N2 table format; ship only if the median over
  the 5 big bundles is at least 3x faster with zero parity failures.
- **Tests:** `tests/unit/tokrw.test.mjs` (corpus parity from `~/.cache/limitless-fixtures/bundles/`, skipped when absent), fuzz test,
  e2e `worker.spec.js` and `meriyah.spec.js` keep passing with the switch on.
- **Rollback:** `LB_FEATURE_TOKREWRITE=false`.

## CL-16 Adaptive defaults per device (new, brainstorm G3)
- **Status:** planned after MS-8 has two weeks of data. **Likely time:** 2 h. **Tiers:** all.
- **Rules:** a table in `app/main.js` keyed by device class (`lbPerfDevice()`): rewrite Worker pool size, image pre-warm count
  (`LB_PREWARM_TOP`), and whether the Settings page suggests Data saver ("This device is slow on heavy pages"). Only defaults: a value the
  member set is never changed. The table's numbers come from MS-8 and are written down here with their date.
- **Tests:** e2e with a stubbed device class: defaults applied, saved settings untouched.

## CL-17 WASM compile on the device (new, brainstorm G4)
- **Status:** measure first. **Likely time:** 1.5 h.
- **What:** on the school Chromebook (MS-2 bench extended with a boot row) and the profile harness, read the `libcurl.wasm` compile time
  on a warm boot (Performance trace or `performance.measure` around `load_wasm`). If it is over 150 ms warm, make sure the module is
  fetched with `instantiateStreaming` from a same-origin http(s) response that Chrome can code-cache (the service worker serves it from
  Cache Storage today; check that the cached response keeps `Content-Type: application/wasm`). Else close the item.

## Order
CL-1, CL-2 (built, small releases), CL-7, CL-6 step A, CL-10, CL-8 slices 2 to 5, CL-12, CL-11 by site, CL-6 step B after TL-3, CL-9 and
CL-13 measure-first, CL-14 any free evening. New (brainstorm 2026-11-19): the CL-15 prototype early, because it decides how much SV-4 is
worth; CL-16 after two weeks of MS-8 data; CL-17 any evening. Total about 75 to 95 agent hours.

Last verified: 2026-11-19
