# Brainstorm: new ways to reach the goals (2026-11-19, Opus)

Asked by Boss on 2026-11-19: think up completely new features and optimizations for the plan's goals (native-Chrome speed on a
Chromebook, loading times, honest bot-check handling, everything through Limitless, faster gate runs), then add them to the plans.
This file is the thinking; the accepted ideas are written as build-ready items in `docs/1.3/specs/` (ids at the end of each idea) and
ranked in the master plan. Rejected ideas stay here with the reason, so nobody proposes them again without new facts.

Method: start from where the time and the failures actually go (master plan section 3, the 2026-11-18/19 runs), ask "what would remove
this cost entirely instead of shaving it", then check each idea against the hard limits (no spending, honest paths, AGPL, 2 vCPU VPS,
school Chromebook, privacy promise "the relay cannot read your private pages"). Every idea was checked against the code on 2026-11-19
where the code decides it (line refs are `app/main.js` on `speed/1.3-quick`).

Scoring: **Gain** (H/M/L for the paid "x native" ratio or member-visible time), **Cost** (agent hours), **Risk** (breakage, privacy,
security), **Reach** (which tiers). Verdict: **Add** (in a spec), **Measure first**, **Later**, **Boss decides**, **Rejected**.

---

## A. Stop paying the biggest costs at all

### A1. A token-level rewriter (no AST for most scripts)
- **Problem:** the rewrite parses a full AST to find a handful of `location` and `import(` uses. On the Kahoot controller (5.5 MB) parse is
  2.2 s (meriyah) of a 3.3 s rewrite at 4x CPU; the walk and edit join are the rest (SPEED-NEXT N2). Server rewrite (SV-4) helps only paid
  members, and only from the second member on.
- **Idea:** a single-pass scanner that tokenizes JavaScript (strings, template literals, comments, regex vs divide by the previous
  token) and edits at the token level: `.location` member reads become the runtime's guarded form, a bare `location` identifier in an
  expression becomes the existing guard call, `location =` assignments and `import(` get today's edits. The guard already passes through
  anything that is not the real `Location`, so a local variable that happens to be named `location` stays correct without scope
  analysis. Any construct the scanner cannot classify safely (`with`, odd regex contexts, a parse error) sends the script to today's AST
  path.
- **Why it can work:** we never need the tree, only positions and a little context. Scanners of this kind run near memory speed: a 5 MB
  script should take on the order of 100 to 300 ms at 4x CPU against 3 to 4.6 s today (estimate, to be measured in the prototype).
- **Risk:** correctness. The edit set must cover every edit the AST rewriter makes on the golden corpus (38 real bundles of 16 KB or
  more plus the repo's scripts); extra edits are allowed only where the guard makes them harmless. A fuzz test compares runtime behaviour
  of both outputs on small generated programs.
- **Score:** Gain H (all tiers, first visits, every heavy site), Cost 8 to 12 h prototype + 6 h build, Risk M, Reach all. **Add as
  measure-first prototype: CL-15.** If it lands, SV-4 (server rewrite) shrinks in value; keep SV-4 after CL-15 is measured.

### A2. Let the browser do TLS and decompression for public files (native fetch lane)
- **Problem:** every byte of every script, stylesheet and font goes through libcurl.js: TLS records, HTTP/2 framing and brotli in WASM,
  then a copy to the page. The image lane already proved the alternative for images: the VPS fetches public images without cookies and
  the browser loads them natively.
- **Idea:** extend the lane to all public, cookie-less GETs (scripts, CSS, fonts, JSON). The app calls the browser's own `fetch()` to
  `https://relay.taps-holdings.org/p/<url>` instead of libcurl; the VPS fetches the URL without cookies or credentials and answers only
  when the response is shared-cacheable (RFC 9111 rules already used by SV-4); anything private answers 409 and the app uses libcurl as
  today (and remembers that host and path prefix for the session). The body arrives already decoded by the browser's native code, off
  the WASM path; the rest of the pipeline (rewrite, blob, cache) is unchanged.
- **Why it can work:** native TLS and brotli are far cheaper than WASM on a Chromebook, and the VPS keeps a shared cache of public files
  (cache hits cost the meter only one direction). It needs no new trust: the image lane's privacy line covers "public files you load,
  no cookies, no identity", extended from pictures to files.
- **Risk:** sites that serve different files to cookie-less requests (rare for static bundles; the 409 rule and a per-host memory catch
  it); VPS CPU is small (no re-encode), bandwidth is the same bytes as the relay.
- **Score:** Gain H for Cardinal and up, Cost 6 to 8 h (VPS side mostly exists in the image lane), Risk M (privacy line), Reach paid.
  **Add: SV-7.**

### A3. Stable lane URLs so the browser's own caches work (cookie instead of token in the path)
- **Problem:** lane URLs carry the 5-minute relay token in the path (IMGLANE "Known limit"), so the browser HTTP cache and V8's code cache
  never see the same URL twice after 5 minutes.
- **Idea:** the relay host and the app are the same site (`*.taps-holdings.org`), so the app can hold a `Secure; HttpOnly;
  SameSite=Lax` cookie for the relay host, refreshed with the token, and lane URLs become stable (`/i/<mode>/<bucket>/<url>`,
  `/p/<url>`, `/rw/u/<url>`). Then repeat visits hit the browser's HTTP cache with no request at all, and server-rewritten scripts loaded
  from a stable https URL get Chrome's code cache (research: code cache is keyed by http(s) URL), which `blob:` scripts never get.
- **Risk:** the cookie must never reach the origin sites (it is scoped to the relay host only); `Cache-Control: private` on lane answers
  so no shared cache in between stores member traffic.
- **Score:** Gain M to H (repeat visits, every lane), Cost 4 h, Risk L, Reach paid. **Add: SV-8.**

### A4. Show text before fonts arrive
- **Problem:** pages with web fonts and `font-display: block` (or none) keep text invisible until the font has crossed the relay. The
  CSS rewriter never touches `font-display` (checked: no `font-display` in `app/main.js`).
- **Idea:** `rewriteCssUrls` adds `font-display: swap` to every `@font-face` that has none or has `block`/`auto`; Data saver and Ordinal
  also skip faces over 150 KB after the first two (text uses the fallback stack).
- **Score:** Gain M (first paint on font-heavy sites: Steam, Discord, news), Cost 2 h, Risk L (a short swap flash), Reach all. **Add: LD-13.**

### A5. Lazy embeds
- **Problem:** `go()` starts every iframe at once in the kick-off and flips `iframe[loading=lazy]` to eager (line 11507). Embeds below
  the fold (maps, social posts, comment widgets, ads not on the blocklist) compete with the visible page.
- **Idea:** iframes outside 1.5 viewports are not fetched in the kick-off; the runtime starts them when they come near the viewport
  (the image lazy logic already exists). Site-marked `loading=lazy` is honoured.
- **Score:** Gain M on news and blog pages, Cost 2 to 3 h, Risk L (an iframe that a script expects to be loaded early: keep same-origin
  iframes eager). Reach all. **Add: LD-14.**

## B. Start before the member asks

### B1. Open the search connection at boot
- Most sessions start with a search from the start page. At boot (after the access check, once libcurl is ready) open the WISP stream and
  TLS to the chosen search engine's host with no request (warm the connection only). Cost 1 h, Gain M for the first search, Risk L, data
  a few KB. **Add: LD-6.**

### B2. Connect while typing
- When the address bar text resolves to a host (typed domain, a history or favourite match) and typing pauses for 150 ms, open the
  connection to that host. Never sends a request. Skipped with Data saver and under the Ordinal cap. Cost 2 h, Gain M. **Add: LD-7.**

### B3. Idle prefetch of likely next pages (Prime and Executive)
- After a page is shown and the queue is idle for 3 s, prefetch up to 2 same-site documents linked from the visible part of the page,
  ranked by link size and position, with the LD-2 safety rules (no logout, delete, buy words). Counts against the member's cap. Only
  after LD-2's regression is fixed and its hit rate is known. Gain M, Cost 2 h, Risk M (data). **Later: LD-12.**

### B4. Prerender on strong intent (Executive, 8 GB devices)
- Render the next document in a hidden frame on a long hover. Chrome's own prerender limits side effects carefully; ours could run
  analytics and state changes twice. Memory on most school Chromebooks is 4 GB. **Later: LD-10**, only if LD-12 shows high hit rates.

### B5. Overnight prewarm on the member's own device
- The app cannot run while the tab is closed (no background sync on our origin for a closed app without a service worker task; periodic
  background sync needs an installed app and is unreliable on managed devices). **Rejected** for now; the VPS prewarm (SV-5) covers the
  shared part.

## C. Loading that feels finished sooner

### C1. Lite view (reader mode)
- **Problem:** articles and reference pages (news, Wikipedia, blogs, MDN) wait for heavy scripts and ads they do not need to be read.
- **Idea:** a "Lite view" button in the toolbar, and an offer in the progress bar when a page has not shown after 6 s and the document
  looks like an article. It parses the already-fetched HTML with Mozilla Readability (Apache-2.0, fits AGPL), shows text and images in a
  clean Limitless-themed page, runs no site scripts, and images go through the normal or lane path. One click back to the full page.
- **Why it matters:** for the "read something for school" case this is faster than native Chrome, which is the end goal's "faster than
  native" part without any server cost, and it helps Ordinal most (3 Mbit/s cap).
- **Score:** Gain H on articles, Cost 5 to 6 h, Risk L (opt-in per page), Reach all. **Add: LD-8.**

### C2. Fast restore after ChromeOS discards the tab
- 4 GB Chromebooks discard background tabs; coming back reloads the whole app (WASM, workers, tabs). Nothing reads `document.wasDiscarded`
  today (checked). Idea: on a discarded load, skip the splash, restore the tab list and show each active tab from the page cache and
  Instant Back snapshot at once, then refresh in the background. Gain M (perceived), Cost 3 h, Risk L. **Add: LD-9.**

### C3. Fast search option
- Offer "DuckDuckGo Lite" (HTML only, no scripts) as a search engine choice labelled "Fastest". It is a product choice (default engine is
  Boss's call), so: **Boss decides (D9); item LD-11** if yes (1 h).

## D. Server side, still no spending

### D1. VPS network tuning
- The VPS has never had BBR or buffer tuning checked (S4-HOST-COMMANDS skipped BBR for the home VM only). Long RTT from Buffalo to a
  school with Wi-Fi loss is where BBR helps. Check the kernel, enable `bbr` + `fq` if available, size TCP buffers for 300 Mbit/s at about
  60 ms, unbound `prefetch: yes` and `serve-expired: yes`. Before/after with MS-4. Cost 1.5 h, Gain M (paid, unmeasured), Risk L (a
  sysctl, rollback is one line). **Add: SV-9.**

### D2. Cloudflare free edge in front of the lanes
- An orange-clouded lane hostname would cache public files near the school for free. But Cloudflare would serve cached hits to anyone
  without our check (only files some member fetched, all public), it adds a third party that sees file URLs, and it is a DNS change.
  Gain M, Cost 3 h + DNS, Risk M. **Boss decides (D10); later: SV-11.**

### D3. Relay-side TLS termination ("turbo")
- The VPS would do TLS for the member and send plain HTTP over WISP. Huge speed win, but the relay would read private pages: it breaks
  the promise in the privacy text and turns the VPS into a target. **Rejected.**

### D4. Peer-to-peer cache between members
- Members' devices sharing cached public files over WebRTC: privacy, school-network blocking, complexity. **Rejected.**

## E. Everything through Limitless

### E1. Leak zoo fixture
- One fixture page that uses every known direct-load pattern (about 50: runtime `Image`, `Audio`, `srcset`, CSS from script,
  `insertRule`, preload links, beacons, workers, `document.write`, `<meta refresh>`, forms, `window.open`, `navigator.sendBeacon`,
  `EventSource`, fonts in `FontFace`, `import()`, `importScripts` in a worker, SVG `<image href>`, `<object>`, `<embed>`, video posters,
  favicons set by script). The test fails on any request that reaches a host other than the proxy path. Regression guard for TL-1 to
  TL-3 and a checklist for TL-2. Cost 3 h, Gain M (safety), **Add: TL-6.**

### E2. No real service worker from proxied code (security)
- Today proxied pages get a fake `navigator.serviceWorker` (line 8916). With the lane on (TL-3), documents live on our own origin at real
  paths, and with CL-6 step B rewritten site scripts do too. A page could reach the real API through a fresh `about:blank` frame and
  register a script served from `/~lb/js/` as a worker on our origin, which would outlive the page. Fix: the runtime patches
  `navigator.serviceWorker` in every same-origin child frame it creates or sees; `sw.js` refuses `/~lb/*` to requests whose destination is
  `serviceworker`, `sharedworker` or `worker` unless the app asked for it; nginx answers `/~lb/*` with 404 when the lane is off. Must land
  before TL-3 or CL-6 step B is switched on. Cost 3 h, Risk if skipped: H. **Add: TL-7.**

## F. Bot checks and sign-in walls (honest)

### F1. Site status hints
- Members lose time on sites that cannot work here (Google sign-in, sites whose check cannot run in a proxy). From BC-7 and the sites
  suite, build `sites-status.json` at release time: site, status (`works`, `slow`, `human-check`, `cannot-work-here`), one-line reason.
  The address bar shows a quiet hint as the member types or loads a listed site; the error card links it. No evasion, just honesty.
  Cost 3 h, Gain M, Risk L. **Add: BC-9.**

### F2. Choose another relay per site to dodge a check
- Moving a challenged site to a public relay because it is less challenged is evasion by another name (it picks an address to avoid a
  check). **Rejected.** Members can already pick relays in Settings; we do not automate it for this reason.

## G. Measure the real thing

### G1. Field breakdown samples
- The emulated profile cannot slow Workers, and the only device is one school Chromebook. Members' own loads are the best data we can get.
  Extend the existing 1-in-5 `page_shown` sample with a breakdown: document fetch ms, rewrite ms (and how many scripts), script wait ms,
  longest task ms, bytes, relay kind (ours, public, lane share), cache hits. Device class only, no URL, no host, no member id (the S9b
  rules). The admin chart gets a stacked bar per device class. Cost 3 h, Gain H (decides what to build next), **Add: MS-8.**

### G2. "This page was slow" report
- One tap in the menu after a slow load sends that one load's breakdown plus the site's domain, only when the member chooses to (like
  Report a problem). Cost 2 h. **Add: MS-9.**

### G3. Adaptive defaults per device
- With MS-8 data, pick defaults by device class: rewrite Worker pool, image pre-warm count, sockets, a Data saver suggestion on very slow
  devices. Cost 2 h after MS-8. **Add: CL-16.**

### G4. Libcurl WASM compile on the device
- Check whether the 1.4 MB `libcurl.wasm` gets Chrome's WASM code cache on our setup (`instantiateStreaming` from a service-worker
  cached response). If boot spends more than 150 ms compiling on the device, serve it so the cache applies. Cost 1.5 h measure.
  **Measure first: CL-17.**

## H. Faster gate runs (VM only)

### H1. Real-site recordings as fixtures
- The speed gate measures small synthetic fixtures; the real cost lives in Steam's, Kahoot's and Discord's bundles. Record each site once
  (HAR), remap its hosts to fixture hostnames, keep the recordings in `~/.cache/limitless-fixtures/` (third-party content: never
  committed), and serve them from the fixtures container. The gate then has deterministic `fx-steam`, `fx-kahoot`, `fx-discord`,
  `fx-reddit` rows: real payloads, no internet noise, no bot checks. Re-record monthly. Cost 6 h. **Add: TS-9.**

### H2. Rewriter micro-bench per commit
- Node runs the rewriter on the recorded bundles in seconds; a commit that makes the rewrite more than 10 percent slower fails before
  any stack run. Cost 2 h. **Add: TS-10.**

### H3. Automatic bisect
- When a combined branch fails the item gate, `gate.sh --bisect` reruns only the failing rows on each item's commit (1.2.0 needed a manual
  bisect). Cost 3 h. **Add: TS-11.**

### H4. Non-timing suites side by side
- e2e uses a static server and the sites suite uses the stack; neither is timing-gated, so they can run at the same time (never with a
  speed step). Saves about 10 to 25 min on a release candidate. Cost 1 h. **Add: TS-12.**

## I. Admin

### I1. Speed card
- One admin card for the goal: field p50 and p90 by device class (MS-8), lane and cache hit rates (SV counters), VPS CPU (MS-5),
  challenge rate (BC-7), "x native" of the last release (MS-6). Cost 3 h. **Add: AD-4.**

---

## Summary of what was added
| New id | Idea | Gain | Likely hours | Verdict |
|---|---|---|---|---|
| CL-15 | token-level rewriter with AST fallback | H | 14 to 18 | measure first (prototype) |
| CL-16 | adaptive defaults per device | M | 2 | add (after MS-8) |
| CL-17 | WASM compile check | L to M | 1.5 | measure first |
| LD-6 | connect to the search engine at boot | M | 1 | add |
| LD-7 | connect while typing | M | 2 | add |
| LD-8 | Lite view (Readability) | H | 5 to 6 | add |
| LD-9 | fast restore after tab discard | M | 3 | add |
| LD-10 | prerender on strong intent | M | | later |
| LD-11 | fast search option | M | 1 | Boss decides (D9) |
| LD-12 | idle prefetch of likely next pages (Prime+) | M | 2 | later (after LD-2) |
| LD-13 | text before fonts (`font-display: swap`) | M | 2 | add |
| LD-14 | lazy embeds | M | 2 to 3 | add |
| SV-7 | native fetch lane for public files | H | 6 to 8 | add (privacy line) |
| SV-8 | stable lane URLs with a relay cookie | M to H | 4 | add |
| SV-9 | VPS network tuning | M | 1.5 | add |
| SV-11 | Cloudflare free edge for lanes | M | 3 | Boss decides (D10), later |
| TL-6 | leak zoo fixture | M | 3 | add |
| TL-7 | no real service worker from proxied code | security | 3 | add, before TL-3 on |
| BC-9 | site status hints | M | 3 | add |
| MS-8 | field breakdown samples | H | 3 | add |
| MS-9 | "this page was slow" report | M | 2 | add |
| TS-9 | real-site recordings as fixtures | H (gate) | 6 | add |
| TS-10 | rewriter micro-bench per commit | M (gate) | 2 | add |
| TS-11 | automatic bisect | M (gate) | 3 | add |
| TS-12 | non-timing suites side by side | M (gate) | 1 | add |
| AD-4 | admin speed card | M | 3 | add |

Rejected: relay-side TLS termination, peer-to-peer cache, relay choice to dodge checks, on-device overnight prewarm.

Last verified: 2026-11-19
