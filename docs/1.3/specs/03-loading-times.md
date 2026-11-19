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

## LD-6 Connect to the search engine at boot (new, brainstorm B1)
- **Status:** planned. **Likely time:** 1 h. **Tiers:** all; skipped with Data saver and under the Ordinal cap.
- **Rules:** after the boot access check is `ok` and the libcurl session exists, open a connection (WISP stream + TLS handshake, no HTTP
  request) to the host of the selected start-page search engine. Use the same "connect only" helper as LD-4 and LD-7
  (`lbPreconnect(host)`: opens and keeps the connection in libcurl's pool, closes after 60 s unused). Never more than one boot preconnect.
- **Tests:** stub curl records a connect to the engine host and no request; none with Data saver.
- **Measure:** `firstBytes` of the first search from the start page, on vs off (A/B, spec 08).

## LD-7 Connect while typing (new, brainstorm B2)
- **Status:** planned. **Likely time:** 2 h. **Tiers:** all; same skips as LD-6.
- **Rules:** when the address bar text resolves to a host (a typed domain, or the top suggestion from history or favourites) and typing
  pauses for 150 ms, call `lbPreconnect(host)`. At most one pending preconnect; a new host cancels the old one if it has not connected.
  Never a request, never for IP literals or `limitless://` pages.
- **Tests:** typing `example.org` then pausing opens one connect; typing on cancels; nothing with Data saver.

## LD-8 Lite view (reader mode, new, brainstorm C1)
- **Status:** planned. **Likely time:** 5 to 6 h. **Tiers:** all (helps Ordinal most).
- **Rules:**
  1. Vendor Mozilla Readability (`vendor/readability/<version>/`, Apache-2.0, licence file kept; AGPL-compatible) loaded only on first use.
  2. Toolbar button "Lite view" (menu item too) on any http(s) page; it parses the already-fetched document HTML (the same text `go()`
     received; no new request), and shows `limitless://lite?u=<url>`: title, byline, text, images (through the normal or lane path),
     links that open in the normal view. No site script runs.
  3. Offer: when a navigation has not reached `shown` after 6 s and Readability's `isProbablyReaderable` says yes on the fetched HTML, the
     progress bar shows "Taking long. Open Lite view?" once per navigation.
  4. "Back to full page" returns to the normal view (from Instant Back if it finished in the meantime).
  5. Theme tokens only; text width and size follow the theme's type scale; works in every theme and at 390 px wide.
- **Edge cases:** pages that are not articles (Readability returns null: the button says "Lite view is not available for this page");
  paywall or script-built pages (nothing to extract: same message); the page was fetched with cookies (Lite view uses the same text, so the
  member sees what the site sent them, nothing more).
- **Tests:** e2e on an article fixture (text shown, no script ran, images loaded through the proxy), a non-article fixture (message), the
  6 s offer with a slow fixture, every theme snapshot at 1366 and 390.
- **Measure:** time to readable text on 5 news and reference sites, Lite view vs full page (it should beat native Chrome's full load).
- **Rollback:** `LB_FEATURE_LITEVIEW=false`.

## LD-9 Fast restore after ChromeOS discards the tab (new, brainstorm C2)
- **Status:** planned. **Likely time:** 3 h. **Tiers:** all.
- **Rules:** on boot with `document.wasDiscarded === true`: no splash animation, restore the tab list from the saved session, show the
  active tab from the page cache or its last Instant Back entry within the first paint, mark it "Refreshing" and reload it in the
  background through the normal `go()` path (the "Updated, reload" chip rules apply). Background tabs restore as sleeping tabs.
- **Tests:** e2e: set `wasDiscarded` with an init script, the active tab shows the cached page before any network request completes.

## LD-10 Prerender on strong intent (later, brainstorm B4)
Only for Executive on devices with 8 GB or more, and only if LD-12 shows a hit rate over 40 percent. Not specified further until then.

## LD-11 Fast search option (Boss decides, D9)
If Boss says yes: add "DuckDuckGo Lite (fastest)" to the start page engine list, pointing at its HTML endpoint; the default engine does
not change unless Boss says so. 1 h, e2e for the engine list.

## LD-12 Idle prefetch of likely next pages (later, brainstorm B3)
- **Starts after:** LD-2 is fixed, released and has a measured hit rate.
- **Rules:** Prime and Executive; after `shown` plus 3 s of an idle queue, prefetch up to 2 same-site documents linked in the visible
  part of the page (largest link boxes first) with LD-2's safety rules; counts against the member's cap; never with Data saver.

## LD-13 Text before fonts arrive (new, brainstorm A4)
- **Status:** planned. **Likely time:** 2 h. **Tiers:** all.
- **Rules:** `rewriteCssUrls` (and the inline `<style>` path) adds `font-display: swap` to every `@font-face` rule without a
  `font-display`, and replaces `block` or `auto` with `swap`; `optional` and `fallback` stay. With Data saver or under the Ordinal cap,
  faces over 150 KB are dropped after the first two faces of a page (text uses the fallback family). `FontFace` objects created by script
  get `display: 'swap'` through the runtime when they have none.
- **Tests:** `s3-css.spec.js`: three cases (missing, block, optional) and the Data saver size rule; a fixture with a slow font shows text
  before the font finishes.
- **Measure:** first contentful paint on font-heavy fixtures and Steam, A/B.
- **Rollback:** `LB_FEATURE_FONTSWAP=false`.

## LD-14 Lazy embeds (new, brainstorm A5)
- **Status:** planned. **Likely time:** 2 to 3 h. **Tiers:** all.
- **Rules:** in the `go()` kick-off, cross-origin iframes whose position cannot be known yet are marked `data-lb-lazyframe`; the runtime
  starts them when they come within 150 percent of the viewport (the `_lazyCheck` logic), or after 8 s idle. Same-origin iframes and
  iframes with `loading=eager` load at once. `loading=lazy` set by the site is no longer flipped to eager when `lazyImg` is on (line 11507
  today flips iframes).
- **Tests:** a fixture with an embed far below the fold: not fetched before scroll, fetched after; an above-the-fold embed loads at once.
- **Rollback:** `LB_FEATURE_LAZYFRAMES=false`.

## Order
Small and early: LD-13, LD-6, LD-7, LD-14. Then LD-2 (fix first), LD-1, LD-5, LD-8 Lite view, LD-9, LD-4, then LD-3a and LD-3b (after
spec 05 TL-3 if LD-3a picks the lane path). LD-10 and LD-12 later; LD-11 on Boss's yes. Total about 40 to 47 agent hours.

Last verified: 2026-11-19
