# Limitless Browser client profile (speed audit, 2026-11-16/17)

Branch `audit/speed-2026-11-16` (base release/1.1.0 `7f23ee5`), no app code changed. Spec: `tests/stack/profile.spec.js` (helper `tests/lib/cpuprofile.js`, `profile` added to the chromebook `testMatch` in `playwright.stack.config.js`). Raw data: `test-results/profile-2026-11-17/` (one JSON per URL with both reps, plus a gzipped V8 `.cpuprofile` per rep; open the `.cpuprofile.gz` in Chrome DevTools after gunzip). The directory is dated 2026-11-17 because the harness uses the UTC date.

## Method

- Rehearsal stack (`deploy/rehearsal/run.sh --project=chromebook --workers=1`, under `flock /tmp/limitless-rehearsal.lock`), real nginx + gate + relay, mock GATE sign-in, relay egress from the home line. Chromebook profile: 1366x768, CPU 4x, 10/5 Mbit, 40 ms RTT. Chromium 1248 headless, Playwright trace off (with trace on, Playwright's own DOM snapshots show up as 2.7 s of `captureSnapshot` in the profile).
- Per URL, 2 reps, fresh context (cookies only), navigation through the address bar. Rep ends 10 s after `shown`, or at 90 s hard cap. Not a warm cache: IndexedDB and caches empty each rep (so the blocklist and rewrite cache are cold, as for a first visit).
- Recorded: CDP `Profiler` (1 ms sampling, whole rep, main thread of the page including the same-origin frame; the rewriter Workers are not in it), `Performance.getMetrics` once a second (heap, nodes, task/script/layout time), the page's `longtask` observer (relative to the navigation start), a 3 s liveness probe (`page.evaluate`) once a second, and these in-page probes: `LB_queueState()` every 50 ms, `LB_net.curl.fetch` wrapped in place (per request: dispatch time, headers time, body end, bytes, content type), the frame's `<img>` completion every 50 ms, `LB_rewrite.stats()` at the end. `LB_logState()` only returns the ring size, so it is not informative. There is no per-request hook in the app: queue wait is computed as the integral of the queued count (Little's law), not measured per request.
- Buckets are by function name and script URL (`tests/lib/cpuprofile.js`). "program/native" is the browser's own work with no JS on the stack: HTML/CSS parse, style, layout, paint, image decode setup, IPC, structured clone. Profile milliseconds are sample-weighted and can exceed wall time because Profiler.stop and the final data call are queued behind a busy main thread (the profile of a frozen page keeps running until the thread frees). Use them as proportions.
- Freeze handling: after 2 failed liveness probes the harness sends `Debugger.pause`. For every freeze below JS never paused, so the main thread was inside native code.

## Machine load

`uptime` at start 18:45 (local): load 5.47 / 3.97 / 3.54 on 8 CPUs. After the full run (19:08): 4.59 / 6.91 / 6.95. Other sessions ran tests in the same window (the stack lock was held by their runs before and after mine), so absolute numbers are a pessimistic bound; ratios and the all-native freezes are repeatable (4 of 4 Steam reps, 2 of 2 Kahoot reps).

## Headline numbers

- Steam (home and app/730): `shown` at 16.6 to 16.8 s (home) and 39.8 to 44.0 s (app/730). Then, in 4 of 4 reps, one main-thread task of 22.5 to 26.0 s that starts 4.5 to 8.1 s after `shown` and is 99.4 % native (`(program)`), 0.2 % JS. That is the freeze and the "Page unresponsive" dialog (Chrome shows it after about 5 s). Starts and lengths (ms): home r1 22163+26030, home r2 21311+22626, app/730 r1 50715+25605, app/730 r2 47858+22500.
- Kahoot: never shown in 90 s (2 of 2). Rewriter worker timed out at 3 s once (`fallback:1, disabled:true`), then `rewriteLocationRefs` ran synchronously on the main thread: 13.3 to 17.0 s self time plus acorn about 3 s, one task of 24 to 29 s, JS heap peak 623 to 652 MB, 346 requests started, queue depth up to 1373 (cap is 150), 12 scripts 9.1 MB (largest 5.5 MB and 2.0 MB).
- Discord: shown at 117.8 s in rep 2 (after my 90 s cap, so a reading of "never within 45 s" holds), not shown in rep 1. Rep 2: 59.9 s single task, 37.4 s self time in one function (inline `<style>` url() loop, `app/main.js:10781`), JS heap 1.28 GB, 48 MB fetched, queue 361 deep.
- Image trickle: Steam app/730 fetched 16.4 MB of images in 258 requests through the one 24-slot queue; in-flight pinned at 24 for 25 to 35 s with 140 to 213 requests queued. Reddit r/pics: queue never above 3, yet median dispatch to done is 5.8 s (p90 8.0 s) per image; 30 of 79 images complete 11.5 s after `shown`. Wikipedia control: 1.5 to 2.4 s per small image.
- RAM: Steam peaks at 72 to 80 MB JS heap (but 18 000 DOM nodes in the frame), Kahoot 650 MB, Discord 1.28 GB. Reddit r/pics rep 2 ended with `Target crashed` at 18 s (renderer crash, cause not established).

# Tables (generated from the raw JSON; r1 / r2)

Column notes: main-thread task s is `Performance.TaskDuration` over the rep (inflated by the 4x throttle, compare pages not absolutes). Long tasks are from the page's `longtask` observer: count over 50 ms / count over 1 s / max ms, before `shown` ; after `shown` (for pages never shown: whole rep). Queue wait avg is the integral of the queued count divided by requests started. DOM nodes: frame document, then whole top document in brackets.

### Summary table (per rep: r1 / r2)

| URL | shown ms | load ms | main-thread task s (wall s) | long>50 / >1s / max ms (load, after shown) | heap MB shown / end / peak | DOM nodes (frame) | req started/done | KB | max in-flight / max queued | queue wait avg ms | shown to last img ms (imgs done/total) | rewriter stats | freeze |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| steam-home | 16628 / 16815 | n/a / n/a | 19.69 (27.1) / 18.95 (28.2) | 40/2/1416 ; 13/2/26030 / 40/2/1653 ; 14/3/22626 | 76.1 / 19.1 / 76.1 / 16.6 / 17.8 / 80.2 | 192 (doc 18064) / 192 (doc 18050) | 186/185 / 186/185 | 8470 / 8470 | 24 / 138 / 24 / 139 | 4053 / 3564 | 5337 (4/4) / 4347 (4/4) | worker:9,sync:3,memoHits:0,fallback:0,persistHits:0,disabled:false / worker:9,sync:3,memoHits:0,fallback:0,persistHits:0,disabled:false | no / no |
| steam-app730 | 43997 / 39762 | n/a / n/a | 43.43 (55.7) / 42.67 (53.5) | 65/3/3052 ; 18/3/25605 / 52/3/3139 ; 19/3/22500 | 17.6 / 20 / 80.2 / 15 / 17.1 / 72.7 | 209 (doc 8583) / 247 (doc 9022) | 306/304 / 306/304 | 21934 / 22881 | 24 / 213 / 24 / 174 | 6653 / 6784 | 6577 (4/4) / 33821 (4/7) | worker:12,sync:2,memoHits:0,fallback:0,persistHits:0,disabled:false / worker:12,sync:2,memoHits:0,fallback:0,persistHits:0,disabled:false | no / no |
| reddit-pics | 3230 / 4598 | 11751 / n/a | 14.68 (15.4) / n/a | 12/0/597 ; 36/1/2021 / n/a | 10.5 / 17.6 / 18.4 / n/a | 1552 (doc 21293) / n/a | 50/33 / n/a | 1679 / n/a | 24 / 3 / n/a | 38 / n/a | 11490 (30/79) / n/a | worker:0,sync:3,memoHits:0,fallback:0,persistHits:0,disabled:false / n/a | no / yes x2 |
| old-reddit | 2878 / 3021 | 6142 / 5851 | 11.74 (14.2) / 11.54 (14.1) | 14/0/423 ; 18/1/3962 / 9/0/551 ; 19/1/3958 | 6.8 / 66.6 / 66.6 / 6.9 / 57.5 / 57.5 | 197 (doc 6776) / 196 (doc 6785) | 29/25 / 31/27 | 1313 / 1314 | 6 / 0 / 8 / 0 | 0 / 0 | 2518 (1/1) / 2137 (1/1) | worker:0,sync:1,memoHits:0,fallback:0,persistHits:0,disabled:false / worker:0,sync:1,memoHits:0,fallback:0,persistHits:0,disabled:false | no / no |
| wikipedia | 6605 / 3958 | 11780 / 6121 | 13.44 (17.3) / 8.1 (15.1) | 25/0/625 ; 12/1/1177 / 15/0/442 ; 6/1/1466 | 8.6 / 22.7 / 22.7 / 7.8 / 24.9 / 24.9 | 1204 (doc 14035) / 1204 (doc 13063) | 13/12 / 13/12 | 326 / 326 | 9 / 0 / 9 / 0 | 0 / 0 | 5506 (7/7) / 2262 (7/7) | worker:1,sync:0,memoHits:0,fallback:0,persistHits:0,disabled:false / worker:1,sync:0,memoHits:0,fallback:0,persistHits:0,disabled:false | no / no |
| kahoot | n/a / n/a | n/a / n/a | 66.39 (90.7) / 53.56 (90.8) | 76/3/28971 / 53/2/24261 | null / 38.8 / 652.3 / null / 38.6 / 622.9 | 3 (doc 5931) / 3 (doc 6043) | 346/321 / 343/318 | 12404 / 12300 | 24 / 1369 / 24 / 1373 | 290544 / 288982 | null (0/0) / null (0/0) | worker:5,sync:0,memoHits:0,fallback:1,persistHits:0,disabled:true / worker:5,sync:0,memoHits:0,fallback:1,persistHits:0,disabled:true | yes x7 / yes x5 |
| discord | n/a / n/a | n/a / n/a | 53.04 (90.5) / 88.29 (93.2) | 112/0/983 / 54/2/59886 ; 1/0/188 | null / 8.9 / 15.5 / null / 1282 / 1282 | 3 (doc 9716) / 19 (doc 9219) | 245/220 / 436/435 | 13522 / 46952 | 24 / 384 / 24 / 382 | 94016 / 19973 | null (0/0) / null (0/0) | worker:8,sync:7,memoHits:0,fallback:0,persistHits:0,disabled:false / worker:8,sync:7,memoHits:0,fallback:0,persistHits:0,disabled:false | no / yes x8 |
| coolmath | 5447 / 5161 | n/a / 8858 | 16.73 (17.3) / 14.96 (15.6) | 18/0/598 ; 20/2/4278 / 18/0/571 ; 22/2/4185 | 12.3 / 37.4 / 37.4 / 11.8 / 31.6 / 31.6 | 4480 (doc 26173) / 4480 (doc 22767) | 82/57 / 73/58 | 1841 / 1842 | 24 / 22 / 24 / 22 | 289 / 324 | 11636 (0/125) / 13254 (0/125) | worker:7,sync:2,memoHits:0,fallback:0,persistHits:0,disabled:false / worker:7,sync:2,memoHits:0,fallback:0,persistHits:0,disabled:false | no / no |

### CPU buckets, ms self time in the profile window (r1 / r2; idle excluded; "program/native" = browser-internal layout, style, parse, paint, IPC)

| URL | program/native | libcurl wasm | libcurl glue (index.html) | rewriter (acorn/rewriteLocationRefs) | rewriteCssUrls | DOMParser/serialise | base64/transfer | frame runtime | app (main.js/ui.js) | page own JS / other | gc |
|---|---|---|---|---|---|---|---|---|---|---|---|
| steam-home | 34603 / 30523 | 3337 / 3152 | 0 / 0 | 732 / 656 | 48 / 43 | 0 / 0 | 782 / 741 | 26 / 28 | 3944 / 4138 | 4026 / 3710 | 270 / 284 |
| steam-app730 | 44680 / 40947 | 5647 / 5095 | 0 / 0 | 531 / 562 | 126 / 129 | 0 / 0 | 806 / 674 | 19 / 42 | 7873 / 7713 | 10919 / 10288 | 688 / 713 |
| reddit-pics | 5405 / 11519 | 2656 / 2141 | 0 / 0 | 342 / 628 | 2 / 7 | 0 / 0 | 45 / 24 | 64 / 113 | 1010 / 1699 | 6056 / 10156 | 128 / 331 |
| old-reddit | 2658 / 2542 | 2021 / 2051 | 0 / 0 | 3596 / 3612 | 0 / 7 | 0 / 0 | 245 / 227 | 15 / 18 | 795 / 880 | 3136 / 2908 | 253 / 241 |
| wikipedia | 6848 / 3725 | 2659 / 2123 | 0 / 0 | 67 / 27 | 0 / 1 | 0 / 0 | 14 / 8 | 47 / 19 | 2067 / 1781 | 2595 / 1072 | 264 / 191 |
| kahoot | 16496 / 11498 | 4648 / 3935 | 0 / 0 | 24014 / 20630 | 80 / 86 | 0 / 0 | 2300 / 2060 | 13 / 5 | 7699 / 6563 | 9085 / 6943 | 3063 / 2259 |
| discord | 28733 / 17781 | 4549 / 8691 | 0 / 0 | 1656 / 1406 | 59 / 936 | 0 / 0 | 383 / 499 | 6 / 7 | 7275 / 54851 | 10650 / 28809 | 679 / 1566 |
| coolmath | 7886 / 7160 | 1557 / 1524 | 0 / 0 | 364 / 332 | 9 / 6 | 0 / 0 | 78 / 66 | 153 / 159 | 1335 / 1343 | 9264 / 9348 | 228 / 252 |

### Top 15 self-time functions per URL (rep 1)

### steam-home

| ms | bucket | function file:line |
|---|---|---|
| 34603 | program/native | (program) (native):0 |
| 1296 | app (main.js/ui.js) | go /app/rehearsal-7f23ee5/main.js:9913 |
| 663 | app (main.js/ui.js) | dataUri /app/rehearsal-7f23ee5/main.js:10714 |
| 609 | base64/transfer | encode /app/rehearsal-7f23ee5/main.js:29 |
| 595 | page own JS / other | replaceWith (native):0 |
| 514 | libcurl wasm | wasm-function[1125] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 444 | libcurl wasm | wasm-function[1078] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 311 | app (main.js/ui.js) | _toDataModule /app/rehearsal-7f23ee5/main.js:10845 |
| 303 | rewriter (acorn/rewriteLocationRefs) | lbRwKey /app/rehearsal-7f23ee5/main.js:9762 |
| 270 | gc | (garbage collector) (native):0 |
| 207 | app (main.js/ui.js) | doFetch /app/rehearsal-7f23ee5/main.js:5758 |
| 188 | page own JS / other | (anon) blob:5ee3867b:1282 |
| 187 | libcurl wasm | wasm-function[1490] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 176 | page own JS / other | getBoundingClientRect (native):0 |
| 165 | page own JS / other | send (native):0 |

### steam-app730

| ms | bucket | function file:line |
|---|---|---|
| 44680 | program/native | (program) (native):0 |
| 2296 | page own JS / other | replaceWith (native):0 |
| 2095 | app (main.js/ui.js) | go /app/rehearsal-7f23ee5/main.js:9913 |
| 1458 | app (main.js/ui.js) | dataUri /app/rehearsal-7f23ee5/main.js:10714 |
| 1053 | page own JS / other | recvmsg /:6812 |
| 712 | libcurl wasm | wasm-function[1125] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 688 | gc | (garbage collector) (native):0 |
| 617 | page own JS / other | put (native):0 |
| 591 | app (main.js/ui.js) | (anon) /app/rehearsal-7f23ee5/main.js:10781 |
| 582 | base64/transfer | encode /app/rehearsal-7f23ee5/main.js:29 |
| 576 | libcurl wasm | wasm-function[1078] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 476 | page own JS / other | on_ws_msg /:6989 |
| 475 | app (main.js/ui.js) | (anon) /app/rehearsal-7f23ee5/main.js:379 |
| 428 | libcurl wasm | wasm-function[1139] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 370 | page own JS / other | send (native):0 |

### reddit-pics

| ms | bucket | function file:line |
|---|---|---|
| 5405 | program/native | (program) (native):0 |
| 863 | page own JS / other | _evaluateModule blob:ef857e7c:2420 |
| 483 | libcurl wasm | wasm-function[1078] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 483 | page own JS / other | getBoundingClientRect (native):0 |
| 401 | app (main.js/ui.js) | go /app/rehearsal-7f23ee5/main.js:9913 |
| 251 | libcurl wasm | wasm-function[1125] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 186 | page own JS / other | t.define blob:ef857e7c:2415 |
| 175 | libcurl wasm | wasm-function[1490] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 158 | page own JS / other | getPropertyValue (native):0 |
| 155 | libcurl wasm | wasm-function[1111] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 132 | libcurl wasm | wasm-function[1107] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 130 | page own JS / other | get styleSheet /js/concat:100 |
| 128 | gc | (garbage collector) (native):0 |
| 128 | page own JS / other | send (native):0 |
| 101 | page own JS / other | (anon) blob:ef857e7c:1282 |

### old-reddit

| ms | bucket | function file:line |
|---|---|---|
| 2658 | program/native | (program) (native):0 |
| 578 | rewriter (acorn/rewriteLocationRefs) | e /vendor/acorn/8.14.0/acorn.min.js:14 |
| 571 | page own JS / other | _evaluateModule blob:c172efc0:2416 |
| 342 | page own JS / other | (anon) blob:c172efc0:938 |
| 335 | rewriter (acorn/rewriteLocationRefs) | rewriteLocationRefs /app/rehearsal-7f23ee5/main.js:9604 |
| 310 | libcurl wasm | wasm-function[1078] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 253 | gc | (garbage collector) (native):0 |
| 209 | app (main.js/ui.js) | go /app/rehearsal-7f23ee5/main.js:9913 |
| 207 | libcurl wasm | wasm-function[1125] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 190 | base64/transfer | encode /app/rehearsal-7f23ee5/main.js:29 |
| 141 | libcurl wasm | wasm-function[1490] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 133 | rewriter (acorn/rewriteLocationRefs) | Wt.readNumber /vendor/acorn/8.14.0/acorn.min.js:7 |
| 130 | rewriter (acorn/rewriteLocationRefs) | Wt.getTokenFromCode /vendor/acorn/8.14.0/acorn.min.js:7 |
| 119 | libcurl wasm | wasm-function[1111] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 110 | app (main.js/ui.js) | (anon) /app/rehearsal-7f23ee5/main.js:8648 |

### wikipedia

| ms | bucket | function file:line |
|---|---|---|
| 6848 | program/native | (program) (native):0 |
| 807 | app (main.js/ui.js) | setList /app/rehearsal-7f23ee5/main.js:2968 |
| 489 | page own JS / other | (anon) blob:a12539ea:1 |
| 329 | libcurl wasm | wasm-function[1111] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 295 | libcurl wasm | wasm-function[1125] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 264 | gc | (garbage collector) (native):0 |
| 214 | libcurl wasm | wasm-function[1078] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 206 | app (main.js/ui.js) | go /app/rehearsal-7f23ee5/main.js:9913 |
| 143 | app (main.js/ui.js) | (anon) /app/rehearsal-7f23ee5/main.js:2972 |
| 137 | page own JS / other | send (native):0 |
| 114 | libcurl wasm | wasm-function[1107] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 110 | page own JS / other | (anon) (native):17 |
| 109 | page own JS / other | (anon) blob:24a39b32:1282 |
| 97 | libcurl wasm | wasm-function[1490] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 92 | app (main.js/ui.js) | doFetch /app/rehearsal-7f23ee5/main.js:5758 |

### kahoot

| ms | bucket | function file:line |
|---|---|---|
| 16948 | rewriter (acorn/rewriteLocationRefs) | rewriteLocationRefs /app/rehearsal-7f23ee5/main.js:9604 |
| 16496 | program/native | (program) (native):0 |
| 3063 | gc | (garbage collector) (native):0 |
| 2033 | base64/transfer | encode /app/rehearsal-7f23ee5/main.js:29 |
| 1049 | app (main.js/ui.js) | dataUri /app/rehearsal-7f23ee5/main.js:10714 |
| 951 | app (main.js/ui.js) | _toDataModule /app/rehearsal-7f23ee5/main.js:10845 |
| 890 | rewriter (acorn/rewriteLocationRefs) | e /vendor/acorn/8.14.0/acorn.min.js:14 |
| 855 | page own JS / other | transaction (native):0 |
| 759 | app (main.js/ui.js) | runQueue /app/rehearsal-7f23ee5/main.js:5612 |
| 712 | page own JS / other | (anon) (native):17 |
| 677 | page own JS / other | get (native):0 |
| 602 | rewriter (acorn/rewriteLocationRefs) | lbRwKey /app/rehearsal-7f23ee5/main.js:9762 |
| 579 | libcurl wasm | wasm-function[1318] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 527 | app (main.js/ui.js) | go /app/rehearsal-7f23ee5/main.js:9913 |
| 483 | page own JS / other | put (native):0 |

### discord

| ms | bucket | function file:line |
|---|---|---|
| 28733 | program/native | (program) (native):0 |
| 1759 | page own JS / other | (anon) (native):17 |
| 905 | page own JS / other | create_options /:7765 |
| 679 | gc | (garbage collector) (native):0 |
| 654 | app (main.js/ui.js) | (anon) /app/rehearsal-7f23ee5/main.js:11025 |
| 608 | app (main.js/ui.js) | doFetch /app/rehearsal-7f23ee5/main.js:5758 |
| 576 | rewriter (acorn/rewriteLocationRefs) | lbRwKey /app/rehearsal-7f23ee5/main.js:9762 |
| 529 | app (main.js/ui.js) | (anon) /app/rehearsal-7f23ee5/main.js:379 |
| 510 | app (main.js/ui.js) | runQueue /app/rehearsal-7f23ee5/main.js:5612 |
| 486 | app (main.js/ui.js) | tick /app/rehearsal-7f23ee5/main.js:4962 |
| 452 | page own JS / other | replaceWith (native):0 |
| 378 | rewriter (acorn/rewriteLocationRefs) | lbRwHash /app/rehearsal-7f23ee5/main.js:9810 |
| 363 | libcurl wasm | wasm-function[1111] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 362 | base64/transfer | decode (native):0 |
| 351 | libcurl wasm | wasm-function[1078] /vendor/libcurl/0.7.5/libcurl.wasm:1 |

### coolmath

| ms | bucket | function file:line |
|---|---|---|
| 7886 | program/native | (program) (native):0 |
| 1177 | page own JS / other | measure blob:e663c801:1 |
| 598 | page own JS / other | (anon) blob:f6232f2c:1 |
| 436 | app (main.js/ui.js) | go /app/rehearsal-7f23ee5/main.js:9913 |
| 336 | page own JS / other | (anon) blob:c757244f:1 |
| 288 | page own JS / other | r blob:84cf4707:1 |
| 249 | page own JS / other | af blob:c757244f:1 |
| 228 | gc | (garbage collector) (native):0 |
| 228 | page own JS / other | (anon) blob:15170ef4:1 |
| 171 | page own JS / other | setAttribute (native):0 |
| 170 | page own JS / other | (anon) blob:410fe37d:1282 |
| 146 | page own JS / other | s blob:c757244f:1 |
| 143 | libcurl wasm | wasm-function[1078] /vendor/libcurl/0.7.5/libcurl.wasm:1 |
| 139 | frame runtime | processEl blob:410fe37d:1182 |
| 128 | page own JS / other | getBoundingClientRect (native):0 |

### Freezes and errors

- reddit-pics r2: error=Error: page.evaluate: Target crashed ; frozen=[{"atMs":18046,"stack":["(anon) :52"]}]
- kahoot r1: error=none; frozen=[{"atMs":27010,"stack":"no JS pause within 3 s (stuck in native code: layout, parse, GC or wasm)"},{"recoveredAfterMs":51052}]
- kahoot r2: error=none; frozen=[{"atMs":28677,"stack":"no JS pause within 3 s (stuck in native code: layout, parse, GC or wasm)"},{"recoveredAfterMs":46799}]
- discord r2: error=none; frozen=[{"atMs":66033,"stack":"no JS pause within 3 s (stuck in native code: layout, parse, GC or wasm)"}]
## Root causes, ranked, with evidence

All line numbers are `app/main.js` at `7f23ee5` (the profile stack names match: `/app/rehearsal-7f23ee5/main.js`).

1. **Steam freeze: one native-only main-thread task of 22 to 26 s, starting 4.5 to 8 s after `shown`.** Evidence: 4 of 4 Steam reps (see "Headline numbers"); the profile window of that task is 25 940 of 26 100 ms `(program)`, JS under 100 ms; `Debugger.pause` never lands on JS; the JS heap falls from 65 to 80 MB to 17 to 19 MB at the same moment. The frame document at that point has 18 064 DOM nodes (home) and Steam sends 1.0 to 1.2 MB of HTML, 0.66 to 0.95 MB of CSS and 3.3 to 3.8 MB of scripts. At 4x CPU, 26 s is about 6.5 s of real Chromebook-class work with no yield, so Chrome's hang dialog (about 5 s) appears. The mark `shown` (`main.js:10252`, `11288`, set when `frame.src` is assigned) comes before this work, so the speed numbers call the page "shown" while the tab is already about to freeze. What exactly the browser is doing (style recalc and layout of the proxied document, CSS parse with inlined data: URIs, or decode) is NOT proven by this run: a Chrome trace of Steam (`LB_PROFILE_TRACE=1`, spec supports it, output `test-results/profile-2026-11-17-trace/`) was queued behind other sessions' rehearsal runs and is not in this report (see Open items).
2. **One shared fetch queue is saturated before the page can finish (shown late, images starve).** 24 slots (`MAX_CONCURRENT` `main.js:2817`, `LB_CONN_DEFAULT` `2816`), the 150 cap only refuses image pre-warm (`5575`), so page requests pile up: Steam app/730 306 requests / 21.9 MB (16.4 MB images, 3.8 MB scripts) with in-flight at 24 and 140 to 213 queued, average queue wait 6.7 s, `shown` at 40 to 44 s; Steam home 186 requests, queue 138, wait 3.6 to 4.1 s. Discord: queue 361 deep, average wait 20 to 94 s. Kahoot: queue 1373 deep (9x the cap), average wait 289 s, fonts still waiting at 90 s.
3. **Eager inlining of every `url()` in CSS as base64, plus a quadratic loop for inline `<style>`.** `rewriteCssUrls` (`10686`) fetches every url() including every unicode-range font subset and every CSS background image, then `FileReader.readAsDataURL` (`10714`): Kahoot 301 font requests (mostly woff2 subsets), Discord rep 2 313 images / 25.5 MB plus 101 other. These go through the same queue (cause 2), delay `shown`, and bloat the document. For inline `<style>` blocks the old path is still there (`10773` to `10806`): `result.split(m[0]).join(...)` once per distinct url on the whole CSS string and `String.fromCharCode` chunking for fonts; Discord rep 2 spent 37.4 s self time in that callback (`10781`) and 6.1 s in its parent (`10774`), heap 1.28 GB. The note in CLAUDE.md that the quadratic pass is fixed applies to external CSS only.
4. **Image trickle is latency-bound per request, not queue-bound, on Reddit.** r/pics: queue never above 3, 24 in flight max, still median 5.8 s and p90 8.0 s from dispatch to body end per image, 30 of 79 `<img>` complete 11.5 s after `shown`, last at 14.7 s. Wikipedia control (7 images, 13 to 27 KB each) shows the same floor: 1.5 to 2.4 s per image, so each new connection costs roughly 1.5 to 2 s here (TLS in libcurl wasm over WISP, 40 ms RTT, 4x CPU: libcurl wasm is 1.5 to 5.6 s of main thread per page). Per-host connections are capped at 6 (`LB_HOST_CONN`, `main.js:2816`, applied `2823` via `set_connections(n, n, 6)`), which serialises a CDN host into waves of 6. Not measured here (no per-host counter in the app): the wave effect itself.
5. **Kahoot and Discord (heavy apps): the rewriter falls back to the main thread.** Kahoot: `LB_rewrite.stats()` = `{worker:5, sync:0, fallback:1, disabled:true}` in both reps. One worker task exceeded 3 s (`timeoutMs: 3000`, `9808`, timer `9872`), `lbRwDisable()` then turned all workers off for the session (`9897`), and the 5.5 MB bundle was parsed with acorn on the main thread: `rewriteLocationRefs` (`9604`) 13.3 to 17.0 s self, acorn `e` 0.9 s, task 24 to 29 s, GC 2.3 to 3.1 s, then `_toDataModule` (`10845`) and Base64 `encode` (`29`) 1.8 to 2.0 s. A 3 s worker timeout on a 4x slower CPU is a threshold that large bundles always miss on a Chromebook. Steam is NOT this: Steam rewriter 0.5 to 0.7 s, `fallback:0`.

Other measured facts that matter for the next step: the frame runtime itself is cheap (`frame runtime` bucket 5 to 160 ms on every page, but see `_lazyCheck` `7459` calling `getBoundingClientRect` 250 to 480 ms on Reddit and Coolmath); `rewriteCssUrls` bucket is under 130 ms on Steam (the cost is waiting for the fetches, not CPU); DOMParser/serialisation does not show as a separate cost (0 ms in the profile, it is inside `(program)` and `go()`); no page hit the 16 KB sync threshold as a problem (sync rewrites: 0 to 7 small scripts, under 0.1 s).

## What was NOT measured, and open items

- The native attribution of the Steam freeze (cause 1). Queued: `flock /tmp/limitless-rehearsal.lock env LB_PROFILE=1 LB_PROFILE_TRACE=1 LB_PROFILE_SUFFIX=-trace LB_PROFILE_ONLY=steam-home,kahoot LB_PROFILE_REPS=1 deploy/rehearsal/run.sh --project=chromebook --workers=1 tests/stack/profile.spec.js`. It records Chrome trace events (Layout, UpdateLayoutTree, ParseHTML, ImageDecode, v8.compile) for the renderer main thread and lists every event over 500 ms.
- The 3 s liveness probe did not catch the Steam freeze in the harness (the 90 s loop ended at shown + 10 s, 4 to 8 s after the freeze began, so only one probe failed); the freeze is evidenced by the long task and the profile, not by `Debugger.pause`. Kahoot and Discord were caught (Kahoot at 27 s and 29 s, Discord r2 at 66 s).
- Images in Coolmath: 125 `<img>` elements in the frame, none `complete` with width after 11.6 to 13 s while 27 of 50 image requests had finished: lazy or `loading=lazy` below-the-fold images are not distinguished here, so this number is not evidence of a trickle.
- Steam image count: only 4 to 7 `<img>` elements in the frame at the time (the 156 to 258 image requests are mostly CSS and srcset), so "last image" for Steam is the last `<img>`.
- Heap numbers are JS heap used; no renderer RSS. The Reddit r2 crash is one sample with no cause.
- 4x CPU throttle applies to the whole renderer, including the rewrite Workers (they are not in the profile, so rewriter time on Workers is invisible except through `LB_rewrite.stats()` counts and the 3 s timeout).
- No warm-cache runs, no Data saver, one machine, 2 reps per URL.
