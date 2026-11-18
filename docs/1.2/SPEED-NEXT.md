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

Order: N1 (it is the gate fix), then the existing tier measurement, then N2 and N3 only if time remains before 05:30.

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

Last verified: 2026-11-17
