# 03: Loading times, what the member sees (spec, 2026-11-19)

Area code **LD**. How soon a page shows and feels ready, separate from raw work (spec 02). Old ids merged here: SPEED-NEXT N7, G1, H1,
H2; NATIVE-SPEED-PLAN 2.4 and 4.3; CLAUDE.md `pageCache` and `warm` (off since 0.3.0). Research: `docs/1.3/research/speed-2026-11-19.md`
section 2.

## 0. Facts
- `go()` builds the whole frame document before anything shows (pipeline: parse, then CSS, scripts and iframes in parallel, then
  `frame.src`). An in-page `blob:` document cannot stream: it must be complete first (research 2).
- Chrome's streaming HTML parser and preload scanner only help when the document arrives as a stream (a navigation response from a
  service worker, or `document.open()/write()` chunks: the second is not verified for the preload scanner).
- `pageCache` (cached rewritten pages shown before the fetch) and `warm` (HEAD to favourite hosts) are built and default false since 0.3.0.

## 1. Status of built items
| id | item | old ids | switch | status |
|---|---|---|---|---|
| LD-1 | Visible-first images: in-view first, below the fold later, placeholder at once | G1 | `visibleFirst` (default false) | in 1.2.2, off; not measured on a real site |
| LD-2 | Hover prefetch of the next same-site document (100 ms hover) | N7, 2.4 | `hoverPrefetch` (default true on the branch) | built on `speed/1.3-quick`, not released; **gate FAILED** 2026-11-18/19 overnight: fx-app and fx-frames +15 to +29 percent (one run) |

## LD-1 Turn on visible-first images
- **Likely time:** 1.5 h (measure) + switch release.
- **Measure:** Reddit, Pinterest-like fixture, Steam grid; chromebook; switch on vs off, A/B (spec 08 TS-4): time until all images in the
  first viewport are decoded (`__lbPerf` mark `vpImages`, added for this) at 1 s and 3 s; no layout shift added (CLS from
  `PerformanceObserver`); `lazyImg` still fills the page on scroll.
- **On when:** `vpImages` improves by 20 percent or more on 2 of 3 sites and nothing regresses past the gate threshold.

## LD-2 Fix the hover prefetch regression, then release and measure hit rate
- **Likely time:** 3 h (find the cause) + 1 h.
- **First:** rerun alone on a quiet machine; if fx-app and fx-frames still regress, profile why (the fixtures do not hover, so the cost is
  likely the click-router listener or the queue path, not the prefetch itself), fix with a failing test, and set the build default to
  **false** until the item gate passes.
- **Rules:** release once the gate passes; add counters `pfHit`, `pfMiss`, `pfBytes` to `lbRw.stats`-style local stats and the MS-7 sample (totals only).
- **Keep when:** hit rate over 25 percent in a week of member samples, else turn off (data cost without gain).

## LD-3 Streamed documents (was 4.3, H2): the page shows while it is still arriving
- **Status:** experiment first. **Likely time:** LD-3a 4 h, LD-3b 10 to 14 h. **Tiers:** all. **Biggest single step toward native
  "shown" times** (NATIVE-SPEED-PLAN 4.3).
- **LD-3a experiment (no product change, branch `proto/streamdoc`):** on `fx-news`, `fx-app` and a saved Steam front page, compare:
  1. today (complete `blob:`);
  2. `iframe.contentDocument.open()` then `write()` of rewritten chunks, then `close()`;
  3. SW lane document whose response is a `ReadableStream` fed by the page.
  Measure first paint, `shown`, and whether the preload scanner starts subresource fetches before the body ends (network log order).
  Output: a table in this file and a pick between 2 and 3.
- **LD-3b build (`features.streamDoc`, default false):**
  1. The document text is tokenized as it arrives (streaming tokenizer: htmlparser2 in the rewrite Worker, or lol-html WASM; licence must
     fit AGPL; pick in LD-3a). A tag split across chunks is never emitted half-rewritten.
  2. Charset: from `Content-Type`; else buffer up to the first 1024 bytes and sniff `<meta charset>`; then stream.
  3. Head first: the first flush holds `<head>` with our runtime script and rewritten `<link>`/`<script src>` tags as real tags, so the
     preload scanner sees them.
  4. Inline scripts are rewritten before they are emitted (small ones synchronously, large ones wait for the Worker; order is kept).
  5. `document.write` from page scripts goes through the runtime hook as today.
  6. The pipeline's parallel fetches start from tags as they stream by, not after the full parse.
  7. Any error mid-stream: the frame falls back to today's complete-document path for that navigation, once.
- **Edge cases:** pages that rely on the whole DOM at first script run (rare; covered by the fallback switch per navigation when the
  runtime sees a parse error); `pageCache` stores the final text after the stream ends; Instant Back stores the final blob as today.
- **Tests:** e2e with a fixture server that sends the body in 5 delayed chunks: first paint before the last chunk; script order kept; a
  tag split across chunks is rewritten correctly; charset sniff on a late `<meta charset>`; mid-stream error falls back once.
- **Exit:** `shown` on `fx-news` and `fx-slow` cold at least 30 percent earlier, no fixture row slower past the gate, official sites no
  loss (no-break rule).
- **Rollback:** `LB_FEATURE_STREAMDOC=false`.

## LD-4 Warm connections (was H1)
- **Status:** planned. **Likely time:** 2 h. **Tiers:** all (skipped with Data saver and under the Ordinal cap).
- **Rules:** per site the app remembers the 3 hosts that served the most bytes on the last visit (`limitless:sitehosts:v1`, host names only,
  local, 200 sites, 30 days). When a navigation to that site starts (or on a 100 ms hover, with LD-2), it opens the WISP stream and TLS to
  those hosts at lowest priority (libcurl keeps the connection for reuse). Never more than 3 at once; nothing for sites visited once.
- **Tests:** stub curl: a second visit opens the remembered hosts before the document arrives; none with Data saver.
- **Measure:** `firstBytes` of the first image request on a repeat visit, on vs off.

## LD-5 Bring back instant repeat visits (`pageCache`, `warm`)
- **Status:** built, off since 0.3.0. **Likely time:** 2 h measure + switch release.
- **Rules:** run the official sites and the 42-site list with `pageCache` on (and `warm` on) against off; keep the "Updated, reload" chip
  behaviour. Turn on only under the no-break rule and when warm `shown` on 3 or more official sites improves by 30 percent or more.
- **Edge cases:** signed-in pages (the cache already refuses HTML sent with a cookie); a member who switched plan mid-session (the
  signature includes the build sha and settings, not the plan; plan does not change page text).

## Order
LD-2 (built), LD-1, LD-5, LD-4, then LD-3a and LD-3b (after spec 05 TL-3 if LD-3a picks the lane path). Total about 23 to 28 agent hours.

Last verified: 2026-11-19
