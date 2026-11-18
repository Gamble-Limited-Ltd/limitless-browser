# Speed and bot-check: next ideas (planning, 2026-11-17)

Written after the 1.2.0 integration run (record `docs/releases/1.2.0.md`). Builds on `docs/1.1/SPEED-AUDIT.md` sections 2 to 4b; ids
there (C1 to C6, R1 to R4, S1 to S3) are not repeated. Nothing here is measured yet unless it says so. Every number that reaches an ad
follows SPEED-AUDIT 4b (dated, same harness, device profile, median).

Bottleneck recap (measured in 1.1 and 1.2 runs): Chromebook CPU on the page thread (rewrite, HTML parse, libcurl TLS), first-visit
rewrite of multi-MB bundles (Steam, Discord, Kahoot), direct loads while the SW lane is off, and human checks on this VM's address.

## A. Overnight tonight (time-boxed, measured, behind switches)

| id | idea | why | effort | how it is judged |
|---|---|---|---|---|
| N1 | **Prebuilt compact blocklist**: `scripts/build-static.sh` turns `vendor/blocklist/<date>/hosts.txt` (4.5 MB text, 224k hosts) into a sorted 64-bit hash array file (about 1.8 MB, two `Uint32Array`s); lookup hashes each host label suffix and binary-searches. No `Set` is built at runtime, so no yields and no warm-visit task. | The speed gate failed on a ~90 ms warm-visit long task traced to `features.blocklistYield` (Set built in 4 ms slices). This removes the work instead of slicing it; also SPEED-AUDIT item 7's unbuilt half (memory). | small to medium | failing test first (warm visit has no long task from the blocklist); `npm test`, speed gate; memory before/after |
| N2 | **Parser bench**: acorn 8.14 (today, `app/main.js` 9919) vs meriyah (ISC, ESTree, pure JS) vs oxc-parser WASM (MIT, ESTree-conformant) on the real bundles (Steam, Discord, Kahoot, Reddit) inside the rewrite Worker, chromium at 4x CPU. Bench only; do not swap tonight. | The first-visit rewrite of Steam's bundle is the largest single cost left. Old Node numbers put meriyah near 2x acorn; no browser numbers exist, so measure. | small | a table in this file: parse ms and total rewrite ms per bundle, AST compatibility notes (walker uses acorn-walk) |
| N3 | **Rewrite skip scan**: before parsing, a cheap token scan; if a script contains none of the identifiers the rewriter touches (location, top, parent, eval, import, postMessage, document.domain, ...), skip the AST walk. Check first whether something like it already exists. | Many library chunks need no edit; skipping parse saves the full cost for them. | small | count of scripts skipped on the named sites, rewrite ms saved; zero new failures in `npm test` and sites |

N1 status 2026-11-17 night: BUILT (`features.compactBlocklist`, `scripts/build-blocklist.mjs`, committed `hosts.bin`, e2e `blocklist.spec.js`); speed gate numbers in `docs/releases/1.2.0.md`.

### N2 result: parser bench (R3, 2026-11-18, Chromium 4x CPU throttle on the page thread, medians of 5, ms)
Method: the app's own `rewriteLocationRefs` (extracted from `app/main.js`, `imp` on) with only the parse call swapped; parse ms is the parse alone, rewrite ms is parse + the `acorn.walk.ancestor` walk + the edit join. Real bundles fetched on 2026-11-18 from this VM (not committed): Steam `store/main.js`, a Discord web app chunk, Kahoot's controller and one app chunk, one Reddit chunk. Bench deps (acorn 8.14.0, meriyah 7.4.2, `@oxc-parser/wasm` 0.60.0) installed only in a scratch directory, not in `package.json`.
**Caveat: CDP cannot throttle Workers** ("Operation is only supported for pages, not workers"), so the 4x run is on the page thread with the same code and the Worker run is at 1x. The ratio between parsers is what counts; a real Chromebook Worker sits between the two columns.

| bundle (size) | acorn 8.14 parse / rewrite, 4x | meriyah 7.4.2 parse / rewrite, 4x | oxc WASM 0.60 parse / rewrite, 4x | Worker 1x: acorn / meriyah / oxc rewrite |
|---|---|---|---|---|
| Reddit chunk (68 KB) | 139 / 138 | 192 / 237 | 308 / 345 | 29 / 48 / 88 |
| Discord app chunk (1.2 MB) | 1420 / 1981 | 1189 / 1635 | 6220 / 6718 | 549 / 505 / 1732 |
| Steam `store/main.js` (1.9 MB) | 1976 / 2445 | 1331 / 1920 | 7323 / 8357 | 514 / 481 / 1835 |
| Kahoot app chunk (2.0 MB) | 2707 / 3456 | 1361 / 2296 | 9510 / 10794 | 877 / 722 / 2477 |
| Kahoot controller (5.5 MB) | 3701 / 4628 | 2194 / 3270 | 13161 / 14804 | 1051 / 1053 / 3511 |

- **Output:** all three parsers gave a byte-identical rewritten script on every bundle (the same edits), so the ESTree shapes `rewriteLocationRefs` reads (`MemberExpression`, `Identifier`, `Property`, `ImportExpression`, `VariablePattern` via acorn-walk) are compatible as used. Nothing failed to parse.
- **Compatibility changes a swap needs:** meriyah: `ranges: true` (for `start`/`end`), `next: true`, `webcompat: true`, `globalReturn: true`; it has no mixed script/module mode, so it needs `parseScript` first and `parseModule` on a SyntaxError (acorn's `allowImportExportEverywhere` does both in one pass); acorn-walk (`acorn.walk.ancestor`) still works on its tree, so the walk stays; no `allowHashBang` / `allowAwaitOutsideFunction` options (webcompat covers hashbang; top-level await only in module mode). oxc: `parseSync(src, {sourceType})` returns the program through serde, `sourceType` must be chosen like meriyah, errors come back in an array, not thrown.
- **Sizes (raw / gzip):** acorn.min.js 122 KB / 36 KB (includes acorn-walk); meriyah.umd.min.js 118 KB / 33 KB (the walker would still come from acorn.min.js, so the total grows, not shrinks, unless acorn-walk alone is vendored, about 8 KB); oxc WASM 737 KB + 15 KB glue / about 260 KB, plus an async WASM init in every Worker.
- **Reading:** meriyah parse is 1.1x to 2.0x faster than acorn on the big bundles (Kahoot app chunk 2.0x, controller 1.7x, Steam 1.5x, Discord 1.2x) but 1.4x slower on a 68 KB file; total rewrite is 1.1x to 1.5x faster (the walk and join are the same cost and now dominate: walk + join is about 0.5 to 1.4 s of the rewrite). The oxc build tested (0.60, the wasm-bindgen web package; the napi WASI build needs threads and cross-origin isolation) is 3x to 5x SLOWER than acorn, because it turns the AST into JS objects through serde; not a candidate in this form.
- **Verdict for N4:** meriyah is a small, real gain (up to about 30 to 40 percent of rewrite time on large bundles, 1.1 s of 4.6 s on the Kahoot controller at 4x) at the cost of a parser option change and the script-then-module retry; it does not remove the first-visit rewrite. Not swapped. Larger wins are elsewhere (S2 shared cache, skipping the walk).
- **Not measured:** Reddit's real feed bundle (this VM's address gets the Reddit bot check, so only a 68 KB chunk was fetchable), Discord's 12.7 MB main bundle, the real Chromebook, memory.

### N4 status (BUILT 2026-11-18, branch worktree-agent-a64ab688fea352956)
Worker parser swap behind `features.meriyah` (build `LB_FEATURE_MERIYAH`, default true): meriyah parseScript, then parseModule, then acorn as last resort (counted in `LB_rewrite.stats().meriyahFallback`); off is exactly the old acorn path and never fetches meriyah. Vendored `vendor/meriyah/7.4.2/` (ISC, verified against the npm tarball integrity). Test `tests/e2e/meriyah.spec.js` (identical output on and off). Not yet measured in the speed gate.

### N3 status (R3, 2026-11-18): the cheap form already exists
`rewriteLocationRefs` begins with `if (!src || (src.indexOf('location') === -1 && !(imp && /\bimport\s*\(/.test(src)))) return src;`, so a script with no `location` substring and (with `importHelper`) no `import(` is never parsed. A token-level scan (word-boundary `location` or the string `'location'`) was tried on the 38 fetched bundles of 16 KB or more (28.6 MB): 27 contain the substring and the same 27 contain the token, so a finer scan skips nothing more here. No `rewriteSkip` switch was built.

Order: N1 (it is the gate fix), then the existing tier measurement, then N2 and N3 only if time remains before 05:30.

## Release pace (Boss, 2026-11-18)
Speed items ship as each one is ready, in small releases over days and weeks, not saved up into one big release. Each item keeps its feature switch so a rollback is a build flag, and one item per release pins any speed regression to its change. The release rules still apply (24 h hold after a Minor, at most 2 deploys a day, Boss runs every deploy).

## B. Next release candidates (ranked by value for effort)

| rank | id | idea | gain | effort | tiers | notes |
|---|---|---|---|---|---|---|
| 1 | S2 | **Shared rewrite cache on the VPS** (already in SPEED-AUDIT 4); add nightly pre-warm of the top 50 sites' public bundles | first visit to Steam/Discord/Kahoot skips the 10 s rewrite | medium | paid | public cookie-less script URLs only; needs privacy line like the image lane |
| 2 | N4 | **Parser swap** if N2 shows a clear win (meriyah first: pure JS, no WASM load) | every first-visit rewrite | small to medium | all | keep acorn behind a switch as fallback |
| 3 | N5 | **Turn on the SW document lane** after its gaps close (record "Open items") | removes direct loads (Steam front page 18), fixes privacy line "nothing loads outside Limitless" | medium | all | do not switch on before the direct-load counter reads 0 |
| 4 | C1 | **libcurl Worker slices 2 to 5** | page thread stays responsive while images and scripts stream | 5 to 6 days | all | a real Chromebook run before the router slice |
| 5 | N6 | **Image lane resize**: VPS resizes to the displayed width (`sizes`/layout width sent with the token), plus `srcset`, CSS `url()`, video posters | bulk images: far fewer bytes than WebP alone on photo-heavy pages | medium | paid | CPU budget per member (SPEED-AUDIT 4) |
| 6 | N7 | **Hover and idle prefetch of the next document** through the proxy (link hover > 100 ms, same-site only, low queue priority) | perceived navigation 100s of ms faster | small | all, Ordinal under its cap | respects the speed cap and Data saver |
| 7 | N8 | **6 WISP sockets for paid tiers** (SPEED-AUDIT R2) | fewer head-of-line stalls | small | paid | gate cap is 8 |
| 8 | M-N5 | **Media streaming** (YouTube fetches 43.7 MB to append 2.9 MB) | video start time and data use | large | all | biggest data win for video |
| 9 | N9 | **Worker HTML parse** (SPEED-AUDIT C3, htmlparser2 MIT) | Steam's 990 KB document off the page thread | medium | all | measure first |
| 10 | N10 | **Transport bench: epoxy-tls vs libcurl.js 0.7.5** on the same WISP server, and WISP over WebTransport if the relay supports it | unknown; no published comparison exists | small (bench) | all | research only until numbers exist |

**N7 status: BUILT 2026-11-18** (`features.hoverPrefetch`, build `LB_FEATURE_HOVERPREFETCH`, default true). Not measured yet: no navigation-time number (needs a real-site Chromebook run), no hit rate, no extra data cost.

## E. Everything through Limitless (no direct loads) (Boss, 2026-11-18)
Boss hit direct loads on Steam; any big site that builds URLs in script does the same. Today the proxied page has a CSP of only `frame-src blob: data: about:` (app/main.js about line 10852: "scripts/styles/images/fetch are untouched"), so a URL the rewriter or the runtime patches miss is loaded by the browser straight from the internet: it skips the relay (privacy, Ordinal cap, school filters block it, the page breaks). The runtime already patches fetch, XHR, WebSocket, EventSource, Worker, SharedWorker, RTCPeerConnection and sendBeacon. Ship each item below as its own small release behind a switch, when ready (see Release pace).

**Rule (Boss, 2026-11-18): nothing here may break a site that works today.** Each item ships with its switch OFF, is turned on only after Steam, the 10-site list and the full e2e suite pass with it on, and rollback is the build flag. Work that needs no long run (code, e2e tests) starts as soon as it can; the long runs (speed gate, real sites) wait for a free night.

| rank | id | idea | gain | effort | tiers | notes |
|---|---|---|---|---|---|---|
| 1 | L1 | **Lockdown CSP** on the proxied document: `default-src 'self' blob: data:` plus `connect-src` limited to our origin and the relay hosts in use (`LB_OUR_WISP`, public relays), `'unsafe-inline' 'unsafe-eval'` as the rewriter needs; plus a `securitypolicyviolation` listener that counts blocked URLs (`lbRw.stats`, admin Usage) | nothing leaves outside the relay; leak list for L3 | small | all | fail closed: a miss breaks the item instead of leaking. Switch `features.lockdown`, default off until Steam and the 10-site list pass with it on. Check blob: Workers, srcdoc frames and the popup bridge inherit it |
| 2 | L2 | **SW document lane on** (= B N5) | misses are fetched through the proxy instead of blocked | see N5 | all | with L1 on: no leaks and fewer broken items |
| 3 | L3 | **Close the known gaps**: CSS `@import` and `url()` set from script (`style.setProperty`, `cssText`, `insertRule`, `CSSStyleSheet.replace`), `srcset`/`<source>` changed after load, script-added `<link rel=preload/prefetch/modulepreload>`, `Image()`/`Audio()`/media `src` setters, form posts and `location` in frames we do not own | fewer L1 blocks | medium (one item per gap, driven by the L1 counts) | all | each gap gets a failing test first (Steam fixture) |
| 4 | L4 | **Out of scope, documented**: the browser's own favicon fetch, extensions, DNS prefetch outside the page (L1 stops page-level `dns-prefetch`) | none | none | all | say so on the privacy line |

## F. Faster long runs (Boss, 2026-11-18)
Ideas to cut the multi-hour gate runs, cheapest first:
- **Keep baselines:** a prod build's speed and site JSON does not change; store it once per release in `docs/1.0/baseline/` and reuse it instead of rerunning 1.2.0 every night (rerun only when the harness or fixtures change). Saves one full run per night.
- **Chromebook first:** per-item runs on `--project=chromebook` only; both projects only for the final candidate (used from 2026-11-18 night, job A).
- **Early stop:** run 3 reps, run the full 7 only for rows within 2x the threshold of failing (`speed-compare.mjs` knows the threshold). Most rows settle at 3.
- **Skip unchanged builds:** `run.sh` rebuilds the static output every run; reuse it when the commit and `LB_FEATURE_*` set match.
- **Shared stack for the sites suite:** pass/fail site runs are not timing-sensitive; they could run in a second rehearsal project (own subnet) in parallel with a non-speed job, never alongside a speed run.
- **Sites by need:** `LB_SITES_ONLY` for the sites an item touches; the full list only for the release candidate.
- **Build PC:** only if Docker is set up there for the rehearsal stack (not today); speed numbers from another machine are not comparable, so pass/fail suites only.

## C. Bot checks (allowed paths only: no CAPTCHA solving, IP rotation, residential proxies or fingerprint spoofing)

| id | idea | gain | notes |
|---|---|---|---|
| B1 | **Member-solvable challenges**: make sure Cloudflare/Turnstile and similar checks render and can be completed by the member inside the proxy, and keep the clearance cookie for the session (and across sessions if the member opts in) | the 8 sites behind a human check become usable after one human click | the member solves it; nothing is automated. Needs a test per challenge vendor |
| B2 | **Measure from the VPS address**, not this VM | paid members use the VPS; the 6 "new" human checks are this VM's address | part of tonight's tier run |
| B3 | **Native search page** backed by a self-hosted SearXNG (AGPL) on the VPS with its limiter off for gate-authenticated members only | search without Google's challenge; results in the Limitless UI | SearXNG's public limiter allows 4 JSON calls per IP per hour, so it must be private behind the gate; upstream engines can still challenge the VPS; needs a privacy line (the VPS sees queries) |
| B4 | **Home egress** for the short challenge-prone list (BOTCHECK-GOOGLE section 3) | residential address for reddit, quizlet, canva, chatgpt, medium, etsy | Boss decision, not implemented; 0.2 to 0.6 GB a day per 10 members on that list |
| B5 | **Google sign-in**: popup bridge shipped; trace the real Google flow (allowed next step in BOTCHECK-GOOGLE) | tells us if "best effort" can become "works" | label stays best effort until measured |

## D. Sources (2026-11-17 web search)
- oxc parser benchmark (Node, NAPI): https://github.com/oxc-project/bench-javascript-parser
- older meriyah vs acorn numbers (Node, 2022): https://github.com/prantlf/ecmascript-parser-benchmark
- Scramjet rewriter uses OXC in Rust/WASM (docs mirror): https://www.mintlify.com/mercuryworkshop/scramjet/advanced/rewriters
- SearXNG limiter (4 non-HTML requests per IP per hour): https://docs.searxng.org/admin/searx.limiter.html
- no head-to-head epoxy-tls vs libcurl.js benchmark was found.

Last verified: 2026-11-18

### N8 status (2026-11-18): BUILT
6 WISP sockets for paid tiers. Effective sockets = min(setting, features.ownSockets, tier cap); tier cap 6 for cardinal, prime and executive with membership on, 4 otherwise. Caps raised to 6 in app/main.js (feature clamp, router clamp, setting, stepper) and scripts/build-static.sh (0 to 6, default 6). Rollback: build with LB_FEATURE_OWNSOCKETS=4. Checked: the gate (limitless-gate src/wisp.ts, config.ts) refuses a WebSocket upgrade with 429 once a user has 8 open sockets, counted per user across all windows; in-app tabs share one router, so one window peaks at 6 shards + `v/` + `dl/` = 8, exactly the cap (sockets open lazily). Two separate browser windows of one user can exceed 8 (already true at 4: 12), the failed open follows the normal failed-socket path. Tests: tests/e2e/router.spec.js (tier cap, rollback value, 6 shards).
