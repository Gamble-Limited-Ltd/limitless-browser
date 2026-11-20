# 05: Everything through Limitless (spec, 2026-11-19)

Area code **TL**. Old ids merged here: SPEED-NEXT E (L1 to L4), B N5, NATIVE-SPEED-PLAN Phase 4.1 and 4.2, `docs/1.2/SWCURL-DESIGN.md` 2.3
and 3 item 2. Goal (Boss, 2026-11-18): nothing a proxied page asks for leaves the member's browser except through our relay or a public
relay. A direct load skips the relay (privacy, the Ordinal cap), is blocked by school filters and breaks the page.

**No-break rule (Boss, 2026-11-18):** every item ships with its switch OFF and is turned on only after the official 10 sites
(master plan section 1), the 42-site list and the full e2e suite pass with it on, with no site going from "loads" to "does not load".
Rollback is the build flag.

## 0. Where we are (2026-11-19)
- Direct loads happen because the proxied document is a `blob:` URL (no service worker controls it) and its CSP is only
  `frame-src blob: data: about:` (`app/main.js`, about line 10852). Counter numbers before the 1.0 compat fixes: Coolmath 23 to 30, Reddit 10
  to 15, Steam 2 (SWCURL-DESIGN 1).
- **L1 lockdown CSP is built** on `speed/l1-lockdown` (`features.lockdown`, build `LB_FEATURE_LOCKDOWN`, default false): the proxied
  document gets `default-src 'self' blob: data:`, `connect-src` limited to our origin and the relay hosts in use, plus a
  `securitypolicyviolation` listener that counts blocked hosts (`cspBlocked`). Measured 2026-11-19 (job C): speed gate passed on both
  projects with no regression row (cold load +0.3 to +5.7 percent on fixtures, inside the gate); 42-site run loaded 95 of 126 reps with it
  on against 94 base, and no site broke, but **28 sites lost some images** under lockdown (blocked, not leaked): TL-2 and TL-3 exist for these.
- **L3 gaps 1 to 3 are built** on the same branch (`features.rwGaps`, default false): `setAttribute('srcset')` and `new Audio(url)`;
  `setAttribute('src')` on a script and `href` on preload, modulepreload and prefetch links; CSS `url()` and `@import` written by script
  (`setProperty`, `<style>.textContent`). Each test was written first and failed first (`tests/e2e/rwgaps.spec.js`).
- **The SW document lane is built and OFF** since 1.2.0 (`features.swDoc`); its known gaps are TL-3.

---

## TL-1 Ship L1 + L3 (switches off), then turn on (was L1, L3)
- **Status:** built, not released. **Likely time:** 2 h to merge onto the release line and run the item gate; turning on is a separate
  release after TL-5's table says so. **Tiers:** all.
- **Rules:**
  1. Release A (Patch): merge `speed/l1-lockdown` with both switches OFF. Nothing changes for members.
  2. Release B (Minor): `lockdown` and `rwGaps` ON together, only when, with both on: the official 10 and the 42-site list lose no site,
     `npm test` passes, and the TL-5 direct-load table shows no official site with more than 0 blocked requests that the page needs
     (blocked ad and telemetry hosts are fine: they are what the blocklist drops anyway).
  3. The `securitypolicyviolation` counts are aggregate only (host counts in `lbRw.stats`, admin Usage as totals), never sent with a URL.
- **Edge cases already checked by the branch tests:** `blob:` Workers, srcdoc frames and the popup bridge inherit the policy; the error card
  and viewers still load from our origin.
- **Rollback:** `LB_FEATURE_LOCKDOWN=false LB_FEATURE_RWGAPS=false`.

## TL-2 Remaining L3 gaps (one small item each, driven by the counts)
- **Status:** planned. **Likely time:** 1 to 2 h each. **Tiers:** all. Switch: each joins `features.rwGaps` (one switch, the gaps are
  one family) unless an item touches the parser stage, then it gets its own.
- **List (from job C and the l1-on site run, 2026-11-19), in order of sites affected:**
  1. Parser-made image markup: `<link rel=preload imagesrcset>`, `<img srcset>` in HTML the page writes with `innerHTML` (BBC: 75
     `ichef` images blocked).
  2. `CSSStyleSheet.insertRule`, `replace`, `replaceSync`, and style text added by `appendChild(textNode)` or `innerHTML` on a `<style>`.
  3. `link.href` set before `rel` (the branch handles rel first only).
  4. Telemetry beacons (sentry envelope, gtag, `ay.delivery`): confirm they hit `sendBeacon`/`fetch` paths; if they are blocklisted
     hosts, no work (count only).
  5. Wikipedia `load.php` image URLs (CSS from a module loader).
  6. Form posts and `location` changes in frames the app does not own (cross-origin iframes): handled by TL-3 instead.
- **Tests:** one failing e2e per gap in `rwgaps.spec.js`, written first, plus the "switch off still loads direct (blocked under
  lockdown)" pattern the branch uses.
- **Measured by:** TL-5 per-site blocked counts before and after.

## TL-3 SW document lane gaps, then on (was L2, N5, Phase 4.1, 4.2)
- **Status:** lane built, off. **Likely time:** 8 to 12 h for the gaps, 2 h to turn on. **Tiers:** all.
- **Why:** with the lane on, a URL the rewriter missed is fetched through the proxy by the service worker instead of being blocked (with
  TL-1) or leaking (without). It also lets the document carry a real CSP header instead of a meta tag (a meta CSP cannot report or use
  `frame-ancestors`), and it is the base for streamed documents (spec 03 LD-3).
- **Gaps (SWCURL-DESIGN 3.2), one item each:**
  1. Cross-origin iframe navigations inside a lane document: the iframe gets its own lane document (`/~lb/doc/<appKey>.<docId>`) built by
     the app, so its requests are bounced too.
  2. Dedicated workers created by a page: the worker script is served by the lane (same-origin URL), so its fetches are controlled.
  3. Viewer pages (`loadViewerPage`) and page-cache documents (`pcUrl`): `go()` uses `LB_swDoc.put` for them as for normal pages.
  4. First page of a first visit (before the worker is active): wait for activation up to 800 ms today; keep that, and count how often
     the blob fallback is used (`LB_swDoc.stats().blobFallback`). Accept a non-zero count on the very first page; it must be 0 on later
     pages.
  5. First page after a release that ships a new worker: same counter.
- **Rules to turn on (`features.swDoc` true):** TL-5 table shows 0 direct loads on the official 10 on the second and later page loads;
  `npm test` and the stack `sw.spec.js` (signed out and revoked with a warm worker) pass; a real school-Chromebook run (MS-2) shows no
  slower "shown" time on the official sites than with the lane off (median of 3, same session).
- **Edge cases:** a revoked member with a warm worker (the boot check never goes through the lane: unchanged rule); a worker killed after
  30 s idle (the lane rebuilds the owner map by asking `lbwho`); `features.sw=false` deletes `lb-docs`.
- **Tests:** `swdoc.spec.js` gets one case per gap (iframe navigation bounced, page-made worker fetch bounced, viewer document served by the
  lane, blob fallback counted).
- **Rollback:** `LB_FEATURE_SWDOC=false`.

## TL-4 Out of scope, documented (was L4)
- **Status:** documented 2026-11-20 in `docs/1.3/OUT-OF-SCOPE.md` (help-text line proposed there, Boss approves the wording before it ships).
- The browser's own requests that no page code makes: the tab favicon of the Limitless app itself, extensions installed in the member's
  Chrome, DNS prefetch outside the page (lockdown stops page-level `dns-prefetch`). Say so in the help text and the privacy line.
- The privacy line "nothing loads outside Limitless" may be used only when TL-1 release B and TL-3 are on (Boss approves the wording).

## TL-5 Direct-load table (measurement, used by TL-1 to TL-3)
- **Status:** planned. **Likely time:** 1.5 h.
- **Rules:** the real-site suite (spec 08 TS-6) records per site: blocked hosts under lockdown (`cspBlocked`), direct loads without
  lockdown (the existing counter in `profile.spec.js`), blob fallbacks of the lane. Written to the run's `SUMMARY.md` and, per release,
  to `docs/1.3/DIRECT-LOADS.md` (site, blocked needed, blocked junk, direct, fallback, date). "Needed" = the host is not on the blocklist.
- **Exit:** the table exists for the current release candidate.

## TL-6 Leak zoo fixture (new, brainstorm E1)
- **Status:** built 2026-11-20 (branch `tools/1.3-leakzoo`): `tests/e2e/leakzoo.spec.js` + `leakzoo-cases.js`, 65 cases, results in
  `docs/1.3/LEAKZOO.md`. Built as an e2e test (stub curl plus `context.route`, like `swdoc.spec.js`), not as the `tests/fixtures/sites/leakzoo/`
  stack pages: the e2e form runs in 100 s with no stack. 34 cases leak today and are `test.fail()` with their closing item. The stack variant
  with a real `leak.fixture` host and the relay-address check stays open (low value until TL-3 lane is on). **Likely time:** 3 h.
- **Rules:** `tests/fixtures/sites/leakzoo/` holds one page per family (about 50 cases in total): runtime `Image`/`Audio`/`Video`,
  `srcset` and `<source>` changes, CSS from script (`setProperty`, `cssText`, `insertRule`, `replaceSync`, style text nodes), preload,
  modulepreload and prefetch links, `navigator.sendBeacon`, `EventSource`, `WebSocket`, `Worker`/`SharedWorker` with `importScripts`,
  `FontFace`, `import()`, `document.write`, `<meta http-equiv=refresh>`, form posts, `window.open`, SVG `<image href>`, `<object>`,
  `<embed>`, video `poster`, script-set favicons. Every URL points at a second fixture host (`leak.fixture`). The stack test fails if
  `leak.fixture` receives any request that did not come through the relay (the fixture server logs the client address: the relay's vs
  the browser's). Each case is tagged with the TL item that closes it; open cases are `test.fail()` with the item id, so closing one
  turns the test green and the expected-fail must be removed.
- **Exit:** every case passes or is marked out of scope in TL-4.

## TL-7 No real service worker from proxied code (new, security, brainstorm E2)
- **Status:** planned. **Must land before** TL-3's lane goes on and before CL-6 step B. **Likely time:** 3 h.
- **Why:** proxied pages get a fake `navigator.serviceWorker` (`app/main.js` line 8916). Lane documents (TL-3) and stable script URLs
  (CL-6 step B) put site content on our own origin at real paths; a page could reach the real API through a fresh `about:blank` or
  `srcdoc` child frame and register a worker on our origin that outlives the page.
- **Rules:**
  1. The runtime installs the fake `navigator.serviceWorker` on every same-origin child window it can reach: on `iframe` insertion
     (MutationObserver it already has for `processEl`), on `contentWindow` access, and on `window.open` results that are same-origin.
  2. `sw.js` never answers `/~lb/*` to a request whose `destination` is `serviceworker`, `sharedworker` or `worker` (404), and nginx serves
     no file under `/~lb/` at all (the lane lives only in the service worker).
  3. The app's own registration keeps its exact URL check: only `/sw.js` with scope `/`.
  4. At boot the app lists registrations (`getRegistrations`) and unregisters any registration that is not `/sw.js`, and counts it
     (`LB_swGuard.stats`), so a worker planted by an older build's gap is removed.
- **Tests:** e2e: a page tries `iframe.contentWindow.navigator.serviceWorker.register('/~lb/js/x.js')` in four ways (about:blank,
  srcdoc, `window.open('')`, a nested frame): each gets the fake container; the boot sweep removes a planted registration.
- **Rollback:** none needed for rules 2 to 4 (pure safety); rule 1 has no switch on purpose.

## Order
TL-1 release A, TL-6 leak zoo and TL-5, then TL-2 items as the table ranks them, then TL-1 release B, then TL-7 (security, before any
site content lives on our origin), then TL-3 gaps and the lane on. Total about 26 to 34 agent hours.

Last verified: 2026-11-19
