# Speed, reach and bot checks: status ledger (restructured 2026-11-19)

**Since the 2026-11-19 overhaul this file is the ledger only.** The plan is `docs/1.3/NATIVE-SPEED-PLAN.md`; every item is specified in
`docs/1.3/specs/` (new ids by area: MS measuring, CL client speed, LD loading, SV server help, TL through Limitless, BC bot checks, VD video,
TS test speed, AD admin). The old ids below map to the new ones. Decision records that other files point to (pricing K to K3, the N2 parser
bench, N3/N4/N8 status) are kept verbatim at the end. The idea tables of the 2026-11-17/18 version (sections A, B, C, E, F, G to J, T,
Order) are folded into the specs; read them in git history (`git show ad5b465:docs/1.2/SPEED-NEXT.md`).

When an item changes status, update its row here and its status line in the spec, in the same commit.

## Ledger
Status words: **shipped** (in prod, version), **ready** (in a prepared release), **built** (on a branch, not released), **planned**, **measure first**, **later**, **dropped**, **closed** (nothing to do).

| new id | old ids | item | status | spec |
|---|---|---|---|---|
| CL-1 | N2, N4, 2.2 | meriyah parser, acorn fallback | HELD 2026-11-19 (`release/1.2.3`): gate failed twice on different noise rows (spec 02); needs TS-4 or Boss's override | 02 |
| CL-2 | N8, 2.5, R2 | 6 sockets for paid tiers | HELD 2026-11-19 (`release/1.2.4`): one row 2 ms over the floor (spec 02); needs TS-4 or Boss's override | 02 |
| CL-3 | N3 | skip scripts with no `location`/`import(` | closed (exists since 1.0) | 02 |
| CL-4 | N1 | compact blocklist | shipped 1.2.0 | 02 |
| CL-5 | H4 | ad and tracker blocking on | shipped 1.0 | 02 |
| CL-6 | 2.1 | stable script URLs (blob reuse, then code cache via the lane) | planned | 02 |
| CL-7 | 2.3 | rewrite Worker pool from the device | planned | 02 |
| CL-8 | C1, H5, Phase 3 | libcurl in a Worker, slices 2 to 5, then on | slice 1 shipped 1.2.0 OFF; rest planned | 02 |
| CL-9 | N9, 3.6 | HTML parse in a Worker | measure first | 02 |
| CL-10 | H6, 2.6 (Coolmath) | chunk remaining long tasks | planned | 02 |
| CL-11 | 2.6 | named-site fixes (Steam app, Discord, Kahoot, Khan, Tumblr) | planned | 02 |
| CL-12 | G8 | device cache that survives | planned | 02 |
| CL-13 | H7 | lighter app shell | measure first | 02 |
| CL-14 | N10, H3 | transport bench (epoxy-tls vs libcurl.js) | planned (research) | 02 |
| LD-1 | G1 | visible-first images | ready in 1.2.2, OFF | 03 |
| LD-2 | N7, 2.4 | hover prefetch | built (`speed/1.3-quick`); gate FAILED (fx-app, fx-frames +15 to +29 percent), fix first | 03 |
| LD-3 | H2, 4.3 | streamed documents | measure first (LD-3a) | 03 |
| LD-4 | H1 | warm connections | planned | 03 |
| LD-5 | pageCache, warm | instant repeat visits back on | built, OFF since 0.3.0; measure | 03 |
| SV-0 | G6, 1.3 | VPS CPU and RAM budget | planned | 04 |
| SV-1 | S1 | image lane (WebP, cache) | shipped 1.2.0, OFF | 04 |
| SV-2 | 5.1, 5.2, G2 | image lane on, coverage | planned (privacy line first) | 04 |
| SV-3 | N6, G2, 5.3 | resize to shown width, WebP only | planned | 04 |
| SV-4 | S2, G3, G4, 5.4 | shared rewrite cache, server rewrite | planned (design done) | 04 |
| SV-5 | G5, 5.5 | URL mode and overnight prewarm | planned | 04 |
| SV-6 | G7 | home second-layer cache | later (parked) | 04 |
| TL-1 | L1, L3 | lockdown CSP and 3 rewriter gaps | release A ready 2026-11-19 (`release/1.2.5`, record 1.2.5, gate passed, not deployed) | 05 |
| TL-2 | L3 rest | remaining rewriter gaps | planned | 05 |
| TL-3 | L2, N5, 4.1, 4.2 | SW lane gaps, then lane on | lane shipped 1.2.0 OFF; gaps planned | 05 |
| TL-4 | L4 | out of scope, documented | planned (docs) | 05 |
| TL-5 | (new) | direct-load table | planned | 05 |
| BC-1 | 1.1 Part A | human-check detector | shipped 1.1.0 | 06 |
| BC-2 | 1.1 Part B, J4 | request hygiene | shipped 1.1.0 | 06 |
| BC-3 | J5, B5, 7.2 | Google sign-in card | ready in 1.2.2 | 06 |
| BC-3b | K2 | YouTube blocked card | ready in 1.2.2 | 06 |
| BC-4 | J1, B1, 7.1 | challenge experiment, then cards per kind | planned | 06 |
| BC-5 | J2 | keep the member's own pass | planned (check first) | 06 |
| BC-6 | J3 | relay reputation (rDNS, abuse page, counter) | planned | 06 |
| BC-7 | B2, T3 | challenges per site and vantage | planned | 06 |
| BC-8 | B3, 7.3 | private search page | later (CPU budget) | 06 |
| (none) | B4, 7.4 | home egress | dropped (Boss, 2026-11-19) | 06 |
| VD-1 | I1, M-N5, Phase 6 | stream media bodies | planned | 07 |
| VD-2 | I3 (non-YouTube) | quality at shown size, 480p start on small devices | planned | 07 |
| VD-3 | I2 (non-YouTube) | posters through the image lane | planned (in SV-2) | 07 |
| (none) | I3 Executive buffering, YouTube parts of I1 to I3 | | dropped | 07 |
| MS-1 | 0.1 | native column | built 2026-11-20 (`tools/1.3-measure`, `npm run test:native`) | 01 |
| MS-2 | 0.2 | in-app bench for the school Chromebook | planned | 01 |
| MS-3 | 0.3 | steadier gate | moved to TS-2, TS-4 | 08 |
| MS-4 | 0.4, 1.1, B2 | real-VPS lane (`lbtest`) | planned (Boss creates accounts) | 01 |
| MS-5 | 1.3, 1.4 | VPS sampler, meter alerts | built 2026-11-20, sampler live on VPS, Kuma push disabled (needs monitor url) | 01 |
| MS-6 | Phase 0 exit | "x native" table per Minor | planned | 01 |
| MS-7 | S9b samples | field numbers per release | exists | 01 |
| TS-1, TS-2, TS-3, TS-5, TS-6 | F, T1 | gate runner, quiet machine, build cache, tagged e2e, tagged sites | built 2026-11-19 on `tools/1.3-test-speed`; first item run (CL-1) 37.5 min, was about 2 to 2.5 h (e2e 25.2 to 3.9 min, sites about 60 to 9.1 min measured) | 08 |
| TS-4, TS-7, TS-8 | F, T3 | A/B early stop, bot-check metric, baselines | planned. TS-4 is now the blocker for releases: the 3-rep and 7-rep gate runs on CL-1 failed on different rows each time (noise and base/candidate drift) | 08 |
| AD-0 to AD-3 | K3 gate line | catalog prices, receipt, number suggest, Grant plan tab | planned (Boss, 2026-11-19) | 09 |

New from the brainstorm (2026-11-19, `docs/1.3/BRAINSTORM-2026-11-19.md`):

| new id | item | status | spec |
|---|---|---|---|
| CL-15 | token-level rewriter with AST fallback | measure first (prototype) | 02 |
| CL-16 | adaptive defaults per device | planned (after MS-8) | 02 |
| CL-17 | libcurl WASM compile check on the device | measure first | 02 |
| LD-6 | connect to the search engine at boot | planned | 03 |
| LD-7 | connect while typing | planned | 03 |
| LD-8 | Lite view (Readability) | planned (Boss yes) | 03 |
| LD-9 | fast restore after tab discard | planned | 03 |
| LD-10 | prerender on strong intent | later | 03 |
| LD-11 | fast search option | planned (Boss yes, option only) | 03 |
| LD-12 | idle prefetch of likely next pages | later (after LD-2) | 03 |
| LD-13 | text before fonts (`font-display: swap`) | planned | 03 |
| LD-14 | lazy embeds | planned | 03 |
| SV-7 | native fetch lane for public files | planned (privacy line) | 04 |
| SV-8 | stable lane URLs with a relay cookie | planned | 04 |
| SV-9 | VPS network tuning (BBR, buffers, unbound) | planned | 04 |
| SV-11 | Cloudflare free edge for lanes | spec written; go and DNS open (Boss) | 04 |
| TL-6 | leak zoo fixture | planned | 05 |
| TL-7 | no real service worker from proxied code (security) | planned, before TL-3 on | 05 |
| BC-9 | site status hints | planned | 06 |
| MS-8 | field breakdown samples | planned (Boss yes) | 01 |
| MS-9 | "this page was slow" report | planned | 01 |
| TS-9 | real-site recordings as fixtures | planned | 08 |
| TS-10 | rewriter micro-bench per commit | built 2026-11-19, skips until bundles exist | 08 |
| TS-11 | automatic bisect | planned | 08 |
| TS-12 | non-timing suites side by side | partial 2026-11-19: built, rc tier not run yet | 08 |
| AD-4 | admin speed card | planned (after MS-8) | 09 |

## Release pace (Boss, 2026-11-18)
Speed items ship as each one is ready, in small releases over days and weeks, not saved up into one big release. Each item keeps its feature switch so a rollback is a build flag, and one item per release pins any speed regression to its change. The release rules still apply (24 h hold after a Minor, at most 2 deploys a day, Boss runs every deploy).

## Kept records

### Tier ladder (Boss, 2026-11-18 afternoon)
Free (Ordinal) traffic stays off our VPS. Relay-side work is paid only, as a ladder: **Cardinal** = shared cache + image shrink; **Prime** = plus server rewrite + prefetch; **Executive** = plus media help. When the VPS is busy, priority lanes: Executive, then Prime, then Cardinal (no hard CPU numbers promised).

### K. Tiers, prices, caps, promises
- Today (gate src/membership.ts, placeholders, not public): Ordinal free 3 Mbit/s, 240 min a day; Cardinal $15 a year, 15 Mbit/s, 12 GB a week; Prime $35 a year, 30 Mbit/s, 100 GB a month; Executive per person, 80 Mbit/s, 200 GB a month.
- **Caps go weekly for all tiers** (e.g. Cardinal 12, Prime 25, Executive 50 GB a week; final numbers from cost).
- **Prices from cost + margin** (VPS costs $40 a year, Boss 2026-11-18): VPS cost per member per tier from measured data and CPU, plus margin, checked against a student budget.
- **Plan for up to 25 paid members** on the one VPS; adjust when membership changes. At full caps 2.5 TB fits about 48 Cardinal, 25 Prime or 12 Executive; the cache raises that.
- **Promise = measured examples on our test pages only**, Ordinal against each paid tier, refreshed each release.

### K2. Capacity plan (Boss, 2026-11-18 evening): 50 users, 4 Executives, no YouTube
- **Target: about 50 paid members** on the one VPS (was 25). **Executive limited to 4 seats.**
- **YouTube is not allowed on our relay.** Gate refuses WISP CONNECT to youtube.com, youtu.be, youtube-nocookie.com, googlevideo.com, ytimg.com (gate already sees the hostname per stream: `src/sites.ts` `isVideoHost`, `src/wisp.ts`), and the app shows a plain card instead of a broken page. **Blocked everywhere, all tiers (Boss):** the app refuses those hosts before any request (same place as the hosts blocklist, `LB_blocklist`, not switchable by the member), plus the gate refusal on our relay. Known limit: on public relays only the app enforces it (a modified copy of the open-source app skips it, as with the Ordinal speed cap). Effect: removes the worst data risk (YouTube fetched 43.7 MB to play 2.9 MB); I1 drops in rank, I2/I3 YouTube parts are dropped; other video sites (Twitch, Vimeo) stay under the gate's video cap.
- Budget: 2,500 GB member traffic a month (5 TB both ways), planned at 80 percent = 2,000 GB. Reference mix: 23 Cardinal, 23 Prime, 4 Executive. No cache savings counted.
- Usage scenarios without YouTube (estimates, GB a week C / P / E, then fleet GB a month): worst = everyone at cap (10/20/40: 3,683, over budget; 5/10/20: 1,842, fits); heavy 5/10/25: 1,928; average 2/4/8: 737; light 1/2/4: 368; minimal 0.3/0.6/1.5: 116.
- **Caps decision (Boss): launch with 10/20/40 GB a week plus the auto pause at 80 percent of the month, measure one week of real per-member use, then lower if needed.** Previous note: : 10/20/40 GB a week only fits 50 members if most are not at cap (top-up and cap pause at 80 percent protects the box); 5/10/20 fits even the worst case. Measure one week of real per-member use (the gate already counts) before choosing.
- Past the data budget the limits are uplink (`TOTAL_UPLINK_MBPS=300` set on the relay; check the RackNerd port speed) and 2 CPU cores (server rewrite, image shrink); at 50 members with about 25 online at once, about 12 Mbit/s each.

### K3. Pricing (Claude proposal 2026-11-18; APPROVED by Boss 2026-11-19, not open for sale yet)
- **Status (Boss, 2026-11-19):** the prices below are final. Plans stay closed (`plansOpen` false) until Boss opens them; the gate catalog placeholders ($15 Cardinal, $35 Prime, Executive null) still need changing to $15 / $25 / $50 in its own gate release before opening.
- Cost: VPS $40 a year, about $1.33 per TB of transfer; a full-cap seat costs $0.83 (Cardinal) to $3.47 (Executive) a year (research job E, PLAN-NOTES K). Price is set by what members will pay, not cost; capacity (K2) is the real limit.
- Evidence: beta testers said about $12 a year for Cardinal and $20 to $25 for Prime.
- Proposal, round $5 steps for cash: **Cardinal $15 a year (deal $10), Prime $25 (deal $20), Executive $50 (deal $40), Executive max 4 seats.** Deals $5 each, stackable to a floor ($10 / $15 / $30): early or beta members, bring a friend ($5 off both), pay 2 years at once, seasonal sales.
- **Top-ups**: $5 = 20 GB, $10 = 50 GB, any paid tier, last until used or renewal; sales pause automatically at 80 percent of the VPS month.
- Revenue at 50 members (23 C, 23 P, 4 E): list $1,120 a year, all at deal price $850, against $40 VPS; room for a second VPS ($40) when uplink or CPU runs out.
- Gate placeholders (`src/membership.ts`) still hold the old numbers; changing them is its own gate release.

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


### N8 status (2026-11-18): BUILT
6 WISP sockets for paid tiers. Effective sockets = min(setting, features.ownSockets, tier cap); tier cap 6 for cardinal, prime and executive with membership on, 4 otherwise. Caps raised to 6 in app/main.js (feature clamp, router clamp, setting, stepper) and scripts/build-static.sh (0 to 6, default 6). Rollback: build with LB_FEATURE_OWNSOCKETS=4. Checked: the gate (limitless-gate src/wisp.ts, config.ts) refuses a WebSocket upgrade with 429 once a user has 8 open sockets, counted per user across all windows; in-app tabs share one router, so one window peaks at 6 shards + `v/` + `dl/` = 8, exactly the cap (sockets open lazily). Two separate browser windows of one user can exceed 8 (already true at 4: 12), the failed open follows the normal failed-socket path. Tests: tests/e2e/router.spec.js (tier cap, rollback value, 6 shards).

## D. Sources (2026-11-17 web search)
- oxc parser benchmark (Node, NAPI): https://github.com/oxc-project/bench-javascript-parser
- older meriyah vs acorn numbers (Node, 2022): https://github.com/prantlf/ecmascript-parser-benchmark
- Scramjet rewriter uses OXC in Rust/WASM (docs mirror): https://www.mintlify.com/mercuryworkshop/scramjet/advanced/rewriters
- SearXNG limiter (4 non-HTML requests per IP per hour): https://docs.searxng.org/admin/searx.limiter.html
- no head-to-head epoxy-tls vs libcurl.js benchmark was found.

Last verified: 2026-11-19
