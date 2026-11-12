# Limitless 1.0: speed plan (client side)

Priority order from Boss (2026-11-10): page loading first, then startup, then smoothness once a page is open. Server
and relay work is in `RELAY.md`. Measurement and targets are in `TESTING.md`. Line numbers below are from `index.html`
at `c88ce5e` (0.2.3) and will drift; search by the names given.

## 1. Findings (measured or read from the code, 2026-11-10)
| # | Finding | Where | Cost |
|---|---|---|---|
| F-a | A page is shown only after **nine stages run one after another**: external CSS (`rewriteCssUrls`, batches), inline `<style>`, preload specs, inline module scripts, inline classic scripts, external module scripts, external classic scripts, iframes, then up to 300 images (`limitless:render:imglimit`, default 300) with a **12 s** timeout. Each stage `await`s `Promise.all` before the next starts. | `go()` (~17858), stages ~18496 to ~18969 | The slowest single resource of every stage adds up. One slow image delays the page by up to 12 s. |
| F-b | Images are pre-fetched only to warm the cache, then neutralised (`data-lb-src`) and promoted again by the injected runtime (`processEl`, ~15627) after the document is live. The pre-warm wait gives the user nothing they could not get after showing the page. | ~18940 to ~18995 | Pure waiting time. |
| F-c | A blur overlay (`showOverlay("Loading...")`) covers the previous page during every load. | `showOverlay` ~13609 | The old page is unusable while loading; feels slow even when it is not. |
| F-d | `index.html` is 3,720,397 chars. The libcurl.js script block is 2,062,952 chars, of which **1,875,489 chars are one base64 WASM data URI**. The main app script is 1,075,390 chars, skins CSS (`#skinStyles`) 136,195, acorn 119,939, base CSS 108,576, admin script 25,265. | measured 2026-11-10 | `index.html` is `no-cache`: every cold visit downloads ~978 KB (brotli, measured at stage 5) and parses 3.7 MB; base64 compresses badly and the WASM is decoded and compiled on every load with no code cache. |
| F-e | No service worker for the app itself (the `serviceWorker` hits in the file are the proxied-page shim, ~16604 and ~16698). | | Every open needs the network for the full shell. |
| F-f | The ad-block list is a fixed array of **132 entries** (`SKIP_DOMAINS`, ~11700) matched with `host.includes(d) || full.includes(d)` for every request. Blocking is already on by default (`limitless:block:v1`, default true). | `shouldSkip` ~11813 | Old list misses current trackers; substring matching over the full URL is slow and over-blocks. |
| F-g | Warm tabs: `MAX_WARM_TABS = 8` blob documents kept; no per-history-entry cache, so Back is a full reload. | ~10788 | Back is as slow as a new load. |
| F-h | Script rewriting is memoised per session only (`rewriteJsAsync`, 200 entries / 24 M chars). | ~17832 | Repeat visits rewrite the same scripts again. |
| F-i | No in-flight de-duplication was found in `queueFetch` (~13792). To verify in S1: two stages asking for the same URL may fetch it twice. | | Possible duplicate fetches. |
| F-j | The vendored libcurl.js build shows no HTTP/2 support in a text search (no `nghttp2`/`http2` strings outside the WASM). To confirm with the 0.7.5 review. **Wrong (2026-11-12):** the WASM has nghttp2 and a live probe negotiated `http/2` with TLS 1.3, and `Accept-Encoding: deflate, gzip, br` is sent; see `LOADING-REVIEW.md` section 3. | | Every origin connection is HTTP/1.1 with 6 per host (not true, see the correction). |

## 2. S1: page pipeline (wave 1)
Goal: the page appears as soon as its CSS and scripts are ready; images and late resources stream in after.

2.1 **Start every fetch at once.** After the document is parsed, collect every subresource URL (CSS, preloads, module
and classic scripts, iframes, images up to the limit) and call `queueFetch` for all of them immediately. The queue
already orders by `PRIORITY` (html 0, css 1, js 2, image later) and limits concurrency (`MAX_CONCURRENT`, default 24), so
starting everything does not flood the relay. The rewrite steps then `await` their own promise only.
- Keep the DOM edits in the same order as today (the rewrite is in place, so script order in the document is unchanged).
- CSS `@import` chains (`rewriteCss` depth) still resolve recursively, but in parallel with everything else.
- Add in-flight de-duplication in `queueFetch` (one promise per URL + method + body while in flight) if F-i is confirmed.
- Kill switch `features.pipeline` (false = today's serial path, kept for one release).

2.2 **Show before images.** Remove the 12 s image wait. The image pre-warm still starts (it fills the cache), but
`frame.src = newBlobUrl` happens as soon as CSS, scripts and iframes are done. The runtime promotes images from the cache
or the queue as before. `__lbPerf.mark('shown')` moves earlier; `load` still fires when the frame's own load event does.

2.3 **Lazy offscreen images** (feature `lazyImg`). In the injected runtime, `processEl` promotes `data-lb-src` only for
elements within 1.5 viewport heights (one `IntersectionObserver`, `rootMargin: "150% 0px"`); the rest wait until they
approach. The pre-warm in 2.2 is limited to the first 24 images in document order (above the fold in practice) instead of
300. `<img loading="eager">` and `fetchpriority="high"` set by the site are honoured.

2.4 **Progress bar replaces the overlay.** A 2 px bar under the address bar (accent gradient, design in `UI.md` 3.4)
driven by real progress: `(finished requests for this navigation) / (started)`, plus a minimum creep so it never looks
stuck. The previous page stays visible and usable until the new one is ready; Stop works as today. `showOverlay` stays
for error states and first load in an empty tab only.

2.5 **Data saver mode** (Settings > Connection, `limitless:datasaver:v1`, default ON for everyone from 2026-11-11 (Boss); only Prime and Owner can turn it off). When on: send `Save-Data: on`
on every request, pre-warm 0 images, lazy margin 50 %, `preload="none"` on media, no autoplay (strip `autoplay`), image
limit 100. The bandwidth meter in the menu shows "Data saver on".

2.6 **Verification:** new e2e `tests/e2e/pipeline.spec.js` with routed fixture pages (slow image, slow script, CSS import
chain, module graph) checking order, that `shown` happens before a 5 s image finishes, and that script execution order is
unchanged. Speed harness before/after on the fixture set (`TESTING.md`).

**S1 status (built on `slice/1.0-s1`, 2026-11-10).** Done: 2.1 (kick-off of all fetches, `qf` shared promises, CSS stage in parallel; F-i was a non-issue, `queueFetch` already shares in-flight GETs), 2.2, 2.3 (24 image pre-warm, runtime rect-based lazy promotion), 2.4 (determinate bar, no overlay or frame blanking when a page is showing), 2.5 (Save-Data header, no pre-warm, margin 50 %, preload none, no autoplay, limit 100), 2.6 (`tests/e2e/pipeline.spec.js`). Kill switches `pipeline`, `lazyImg`. Not built: the "Data saver on" label in the bandwidth meter (no meter exists yet); CSS `@import` chains still resolve one after another inside a stylesheet.
Speed, medians of 7 vs the regenerated 0.2.3 baseline (`docs/1.0/baseline/`), Chromebook profile: fx-news warm shown 689 to 599 ms (-13 %, target -40 % NOT met; warm shown is dominated by script rewriting, S3 4.3/4.5), fx-news cold shown 3656 to 2720 ms, fx-news warm load 4426 to 1535 ms; fx-slow cold shown 8354 to 3343 ms (page no longer waits for the 5 s image; the 2 s script still gates it). Gate: chromium passes; on chromebook fx-frames warm shown read 554 to 686 ms once, a re-run side by side gave 618 (0.2.3) vs 607 ms (S1), so noise.


## 3. S2: startup (wave 1)
Goal: a repeat open on a Chromebook reaches a usable start page in well under a second; a cold open downloads about half
of today's bytes.

3.1 **WASM to its own file.** Ship libcurl.js as its split build (`libcurl.mjs` + `libcurl.wasm`) in
`vendor/libcurl/<version>/`, loaded with `WebAssembly.compileStreaming(fetch(url))` through `Module.locateFile` /
`instantiateWasm`. nginx serves `vendor/` as `immutable` for a year already, and Chromium keeps compiled code for large
streamed WASM modules in its code cache, so repeat opens skip compile. Expected: `index.html` loses ~1.9 MB of text;
the WASM binary (~1.4 MB) compresses far better as binary than as base64. Measure both in T0 and after.
- If 0.7.5 is taken (`RELAY.md` 8), do it in this slice; otherwise extract the binary from the 0.7.4 data URI.
- Keep the LGPL notice and `copyright_notice` text intact; add the license file next to the vendored files.

3.2 **acorn and acorn-walk to `vendor/acorn/8.14.0/`.** The Worker rewriter builds its Blob from the acorn script text
(today the first `<script>` of `<head>`); it will fetch the vendored file once instead. The synchronous main-thread
rewriter loads the same file with a normal `<script src>` (it is needed early, so keep it render-blocking but cached).

3.3 **Skins CSS loaded only when a skin is active.** Move `#skinStyles` (136 KB) to `theme/skins.css`, loaded when
`data-skin` is set (skins stay, Boss 2026-11-10).

3.4 **Lazy subsystems.** The element inspector, the extension system (curated list, see `UI.md` 7.6), the log panel and
the PDF viewer load on first use. Each becomes a separate file under `app/` (static, versioned by the build sha in the
path, e.g. `app/<sha>/inspector.js`, served `immutable`). This is the "staged hybrid" step 2 from the original plan.

3.5 **Service worker app shell** (feature `sw`, file `/sw.js`, scope `/`).
- Caches `index.html`, `app/<sha>/*`, `vendor/*`, `fonts/*`, `theme/*` on install. Serves `index.html`
  stale-while-revalidate; versioned files cache-first.
- Never touches `/wisp/`, `/auth/`, `/_lb/`, `/legal/`, `/verify/`, `version.json` or `CHANGELOG.md` (network only).
- **Access stays server-side:** a cached shell can open for a revoked member, but `/wisp/` and all APIs still go through
  `auth_request`. On boot the app already fetches `version.json` (gated); a 401/403 there now sends the page to
  `/auth/signin` or the invite page instead of showing a broken shell.
- The existing update banner keeps working: a new sha in `version.json` shows the banner; Reload activates the waiting
  worker (`skipWaiting` only on Reload, never by itself, matching "never reloads by itself").
- `features.sw = false` makes the next load unregister the worker and clear its caches.
- nginx: `/sw.js` served `no-cache`, gated like the app (location added in S2).

3.6 **Boot work.** Splash hides on the first frame where the start page is interactive, not after the relay probe;
the relay probe and `initCache` (already non-blocking since 0.2.1) run in parallel. Fonts: preload the two body faces;
`font-display: swap` is already set.

3.7 **Patcher.** `patcher.html` matches identifiers and storage keys in `index.html`: re-check every patch definition after
the split and update the ones that pointed into moved code.

3.8 **Verification:** `tests/e2e/boot.spec.js` (service worker install, offline shell reload shows the sign-in redirect
when `version.json` answers 401, `features.sw=false` unregisters), smoke and all existing specs, transfer size and
boot timing in the harness (`TESTING.md` 6).

**S2 notes (built 2026-11-10, branch `slice/1.0-s2`):**
- 3.1 done with the single-file build kept: only the WASM binary moved (to `vendor/libcurl/0.7.4/libcurl.wasm`), the libcurl.js glue (190 KB) stays inline, so `libcurl.mjs` was not split out. The binary starts loading when the inline
  script runs and is instantiated with `instantiateStreaming`.
- 3.2 done as one file `vendor/acorn/8.14.0/acorn.min.js` (acorn and acorn-walk were already one minified block). The Worker rewriter fetches it once.
- 3.3 done in two parts: the unscoped skin defaults had to stay inline (77 KB, they style the Settings skin tiles and hide skin-only toolbar buttons; without them the toolbar overflows at 760 px), the 54 KB of
  `html[data-skin=...]` rules moved to `theme/skins.css`. That is less than the 136 KB the plan counted.
- 3.4 not done (closure-coupled code; see CLAUDE.md "Startup"). PDF.js was already external.
- 3.5 changed on purpose: **page loads are network first, not stale-while-revalidate.** A cached shell served first would show the app to a signed-out or revoked user for a moment before the version.json check
  redirects; network first lets nginx decide on every open at the cost of one revalidation round trip. Versioned files are cache first. The boot check on 401/403 stays as a second line.
- 3.6 and 3.7: patcher definitions checked, none point into moved code. Boot work (3.6) was not changed.
- Numbers: see `docs/1.0/BASELINE.md` section "S2 candidate".

## 4. S3: client speed extras (wave 2)
4.1 **Tab sleeping** (feature `tabSleep`). A background tab hidden for 10 minutes has its iframe replaced by a
placeholder; the blob URL and scroll position are kept (`stashBackgroundLoad` style), so waking is a blob reload with no
network. Never sleeps a tab playing audio or video, or one with a form that has typed input. Setting: Settings > General
"Put unused tabs to sleep after" (off, 10, 30, 60 min).

4.2 **Instant Back and Forward** (feature `instantBack`). Keep the serialised blob document of the last 3 history entries
per tab, within a 64 MB total budget across tabs (LRU), next to the existing warm-tab cap (`MAX_WARM_TABS = 8`). Back
shows the stored blob at once and restores scroll; pages that sent `Cache-Control: no-store` for their document are
never kept.

4.3 **Rewrite cache across visits** (feature `rewriteCache`). Rewritten script text stored in a **new** IndexedDB
database `LimitlessRewrite` (not a `ProxyCache` version bump), key = SHA-256 of the source + rewriter version, 50 MB LRU.
A rewriter change bumps the version string, which invalidates everything at once.

4.4 **Cached rewritten pages** (feature `pageCache`). For documents that `lbCacheEvaluate` already allows to be cached
(explicit freshness, no cookie, no `no-store`), store the final rewritten HTML keyed by URL + rewriter version. A repeat
visit shows it at once, revalidates in the background, and if the new version differs: swap silently when the member has
not interacted yet within 2 s, otherwise show a small "Updated, reload" chip. Respects the Resource Cache switch.

4.5 **Off-thread rewrite work.** `DOMParser` is not available in Workers, so HTML parsing stays on the main thread. What
moves: CSS rewriting (`rewriteCssUrls`, `rewriteCss`), `srcset` and URL scanning, and the existing JS rewrite (already in
Workers for 16 KB+). Only if T0 shows `DOMParser` time over ~100 ms on fixture pages under the Chromebook profile, add an
HTML parser in the Worker (parse5, MIT, new dependency, Boss to approve) for pages over 200 KB.

4.6 **Warm favourite sites** (feature `warm`). When the app has been idle 3 s after boot, and again on network
reconnect, open relay + TCP + TLS to the hosts of the start-page shortcuts (max 6) and the last 3 visited sites, using a
`HEAD /` request that is discarded (no page data is stored). Skipped when Data saver is on or the bandwidth meter is
above 80 %. Uses the existing connection cache (`set_connections(n, n, 6)` keeps idle connections).

4.7 **Ad and tracker list.** Replace the 132-entry substring list with a host-suffix matcher over a maintained list
(a domains-only build of a permissive list, with its license file in `vendor/`; candidate lists are checked for license
before choosing). Matching: exact host or parent-domain suffix in a `Set`, O(labels) per request instead of
O(entries x URL length). The list ships as `vendor/blocklist/<date>/hosts.txt` (immutable) and updates with releases.
Custom filters and the per-site allowlist (`limitless:adblock:allowlist:v1`) keep working.

4.8 **Verification:** e2e for sleep and wake, Back from memory, rewrite cache hit on second visit (`LB_rewrite.stats()`),
page cache swap and chip, blocklist matching unit cases (subdomain, look-alike domain not blocked), harness repeat-visit
numbers.

**S3 notes (built 2026-11-10, branch `slice/1.0-s3`):**
- 4.1 tab sleeping: built with kill switch `tabSleep` and Settings > Tab Caching "Put unused tabs to sleep after" (Never, 10 default, 30, 60). Changed on purpose: the app has one iframe, so a background tab holds only its blob (no live iframe to replace); sleeping frees that blob and the stored Back entries and wake goes through `go()` (page cache and response cache, scroll restored).
- 4.2 instant Back and Forward: built (`instantBack`), 3 entries per tab, 64 MB, no-store never kept.
- 4.3 rewrite cache: built (`rewriteCache`), database `LimitlessRewrite`, 50 MB, SHA-256 key plus a hash of the rewriter function text as the version.
- 4.4 cached rewritten pages: built (`pageCache`), database `LimitlessPages`, 64 MB; background revalidation is the normal load running behind the shown copy, the unchanged-document case stops early, a changed one swaps silently or shows the "Updated, reload" chip after a touch.
- 4.5 off-thread work: not a Worker. The CSS url() step now uses the browser's `FileReader` for base64 and a one-pass replace (output identical); parse5 and an HTML parser in a Worker were not added (no T0 evidence that `DOMParser` is over 100 ms, 4 ms measured on fx-news).
- 4.6 warm favourites: built (`warm`); the "bandwidth meter above 80 %" skip is not built (no meter).
- 4.7 blocklist matcher: not in S3 (not in the S3 task list).
- Application script moved to `app/main.js` (`app/<sha>/main.js` in the build); numbers in `docs/1.0/BASELINE.md`.

## 5. Smoothness after load (jank)
Covered by: lazy images (2.3), off-thread CSS work (4.5), tab sleeping (4.1). Plus, measured in T0 and fixed where it shows:
- The media load limiter polls with `setTimeout(50)` while 24 loads are pending (`MAX_CONCURRENT_MEDIA`, ~15264): replace
  with a promise queue (no polling).
- Long tasks: the harness records `longtask` entries during scroll on fixture pages; anything over 50 ms gets a ticket.

## 6. S8: downloads panel (wave 5)
**Boss, 2026-11-11:** file saves are blocked for Ordinal, small files only (about 10 MB) for Cardinal, full for Prime and Owner. The panel is shown to Prime and Owner (Cardinal sees only the small-file list). The block must also be enforced in the gate, not only client code (`/_lb/me` carries the rank); streaming and normal loads are not downloads.
Panel in the menu: queue, progress (bytes, rate), pause and resume with HTTP Range when the server sends
`Accept-Ranges`, retry with backoff, cancel. Downloads count against the member's caps (the gate already counts bytes).
Files are saved through the browser's own download (blob + `<a download>`) when complete. Large files over 2 GB are
refused with a clear message (memory). Test: e2e with a routed range-capable fixture.

## 7. Not doing (and why)
- Link-hover prefetch: Boss preferred other options (fetches pages the member did not ask for).
- Moving all app code to `src/` + esbuild (step 3 of the original plan): not needed for these gains, and it makes manual
  upstream cherry-picks harder. Revisit only if editing pain grows.

Last verified: 2026-11-10
