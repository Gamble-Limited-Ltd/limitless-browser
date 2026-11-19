# Limitless speed and reach: master plan (overhauled 2026-11-19)

**End goal (Boss, 2026-11-18):** on the paid plans, browsing through Limitless on a Chromebook is about as fast as native Chrome on that
same Chromebook, and faster where our server can do the Chromebook's work. Prime and Executive first; Cardinal gets every fix that costs
nothing extra; Ordinal gets every client fix but has no speed target. Alongside speed: nothing a page asks for leaves outside Limitless,
human checks are handled honestly, and the gate runs that slow the work down get much shorter.

**Overhaul (Boss, 2026-11-19):** this file is now the master plan. The detail lives in build-ready specs in `docs/1.3/specs/` (one per area,
fixed item template, section 4). `docs/1.2/SPEED-NEXT.md` is the status ledger (one line per item, old id to new id). Research behind the
specs: `docs/1.3/research/`. New ideas from the 2026-11-19 brainstorm (reasoning, scores and rejected ideas):
`docs/1.3/BRAINSTORM-2026-11-19.md`; the accepted ones are items in the specs. Nothing in the specs is built unless its status says so.

**Hard limits (Boss):**
- No additional spending: no new subscriptions, servers, GPU rentals or bigger VPS. The home VM, the RackNerd VPS ($35.99 a year, 2 vCPU,
  2 GB RAM, 5 TB a month) and the members' own devices.
- Real-VPS test traffic: at most 50 GB a month on prod test accounts.
- Real device: only a school Chromebook (no installs, short manual runs).
- Gate runs: this VM only; the build PC is not used for Limitless (Boss, 2026-11-19).
- Honest paths only for human checks: no CAPTCHA solving, IP rotation, residential proxies or fingerprint spoofing; home egress is dropped
  (Boss, 2026-11-19); filter-evasion features need Boss's explicit decision.
- Every advertised number is measured, dated, names the profile, the median and n (SPEED-AUDIT 4b).
- No-break rule (Boss, 2026-11-18): each item ships with its switch OFF and is turned on only when the official sites, the 42-site list and
  the full e2e suite pass with it on. Rollback is a build flag.
- Release pace (Boss, 2026-11-18): one item per release as each is ready; 24 h hold after a Minor; at most 2 deploys a day; Boss runs every
  deploy; at most 2 feature slices in flight.

## How to read the time estimates
Past plan estimates ran long, so every item gives **likely agent hours** (one Sonnet run, calibrated on the 2026-11-17/18 runs: compact
blocklist with tests and two speed runs about 2.3 h; a full final gate pass about 2.7 h). 1 old plan day is about 2 to 4 agent hours. Gate
runs are most of the wall time today (about 2 to 2.5 h per item); spec 08 aims at about 40 min.

## 1. The official site list
| Group | Sites |
|---|---|
| General | Steam (front page), Reddit, Discord |
| School tools | Google Classroom, Quizlet, Desmos, Khan Academy (replaces YouTube, Boss 2026-11-19) |
| Web games | Kahoot, Gimkit, Coolmath Games |

YouTube has been blocked on every tier since 1.2.2, so it cannot be a speed row. It stays in the site suite as "blocked card shows" (TS-6).
Every Minor reports these sites in an "x native" table (spec 01 MS-6).

## 2. Targets ("shown" time as a ratio to native, measured, not promised)
| Plan | Ratio target, official sites | Longest task caused by us | Comes from |
|---|---|---|---|
| Ordinal | no target | under 200 ms | client fixes (specs 02, 03, 05) on public relays, 3 Mbit/s cap |
| Cardinal | 2.0x native or better | under 200 ms | client fixes, image lane pass-through, shared cache hits |
| Prime | 1.5x | under 100 ms | plus WebP and resize, server rewrite, prefetch |
| Executive | 1.3x, faster than native on Steam, Discord, Kahoot | under 100 ms | plus favourites prewarmed, Load Now, highest weight |

## 3. Where we are (2026-11-19)
- **Prod:** 1.2.5 (`cec4d6f`, deployed 2026-11-19 14:28: TL-1 release A, lockdown CSP and three rewriter gaps, switches OFF), on top of
  1.2.2 (`5615cb6`, 07:35: YouTube block, Google sign-in card on, G1 visible-first built OFF; VPS relaygate `f9f7040`). 1.2.3 (CL-1) and
  1.2.4 (CL-2) are held for the gate verdict (TS-4).
- **Built, not released:** meriyah parser (CL-1), 6 sockets for paid (CL-2), hover prefetch (LD-2) on `speed/1.3-quick`; lockdown CSP and
  three rewriter gaps (TL-1) on `speed/l1-lockdown` (speed gate passed with no regression row, 42-site run 95 of 126 reps against 94, 28
  sites lost some images). Overnight gate 2026-11-18/19: N8 noise, **N7 slowed fx-app and fx-frames by 15 to 29 percent**, N4 no gain
  over N7; each is rerun alone on a quiet machine before a record.
- **Shipped OFF:** libcurl Worker slice 1 (CL-8), SW document lane (TL-3), image lane (SV-1).
- **Numbers (1.2.0, chromebook, VPS stand-in on this VM):** Steam front shown about 14.3 to 15.0 s, Kahoot 23.6 to 26.8 s, Discord about 55
  s, Reddit 2.5 to 3.5 s, Coolmath about 5 s (one rep with a 7.9 s task). Native column and real-VPS numbers do not exist yet (spec 01).
- **Bot checks:** 8 of 42 sites showed the Human Check card from this VM's address; from the VPS address the 2026-11-16 probe saw 20 of 48
  front pages challenged. The data-centre address is the main factor (spec 06).

## 4. The specs
Every item uses one template: **id** (old ids), **status**, **why**, **rules** (numbered, testable), **how**, **state** (files, storage keys,
env), **edge cases**, **tests** (failing test first for code), **measured by / exit**, **rollback**, **likely time**. Spec files are shorter
than Meridian's platform specs on purpose: no data model or catalog sections, because Limitless keeps its state in the browser and the gate.

| File | Area | Items | Likely agent hours |
|---|---|---|---|
| `specs/01-measuring.md` | MS: native column, in-app bench, real-VPS lane, VPS capacity, "x native" table, field numbers | MS-1 to MS-9 | about 19 |
| `specs/02-client-speed.md` | CL: parser, sockets, stable script URLs (code cache), Worker pool, libcurl Worker, long tasks, site fixes, device cache | CL-1 to CL-17 | 75 to 95 |
| `specs/03-loading-times.md` | LD: visible-first images, hover prefetch, streamed documents, warm connections, instant repeat visits | LD-1 to LD-14 | 40 to 47 |
| `specs/04-server-help.md` | SV: CPU budget, image lane on, resize, server rewrite cache, prewarm | SV-0 to SV-11 | 37 to 49 |
| `specs/05-through-limitless.md` | TL: lockdown CSP, rewriter gaps, SW lane gaps, direct-load table | TL-1 to TL-7 | 26 to 34 |
| `specs/06-bot-checks.md` | BC: challenge experiment and cards, keep the pass, relay reputation, measurement, private search | BC-1 to BC-9 | 18 to 23 |
| `specs/07-video.md` | VD: stream media bodies, quality at shown size (YouTube work dropped) | VD-1 to VD-3 | 14 to 22 |
| `specs/08-test-speed.md` | TS: gate runner, quiet machine, build cache, interleaved A/B with early stop, tagged e2e and sites | TS-1 to TS-12 | 30 to 33 |
| `specs/09-admin-grant-tab.md` | AD: Grant plan tab with autocomplete and copyable receipt (Boss, 2026-11-19), catalog prices | AD-0 to AD-4 | about 14 |

Total about 270 to 340 agent hours after the brainstorm (was 190 to 245). With overnight gate runs and at most 2 slices in flight that is
roughly 8 to 12 weeks; spec 08 is what makes the lower end possible, so it goes first. The biggest new levers: CL-15 (token-level
rewriter, all tiers), SV-7 and SV-8 (native fetch lane with stable URLs, paid), LD-8 (Lite view, all tiers, faster than native on
articles), MS-8 (field data from real Chromebooks).

## 5. Release and work order
Tooling and measuring are not releases (no deploy); they run alongside. Lanes are proposals: the release record decides (skill
`release-record`).

| Step | What | Kind | Likely hours | Waits on |
|---|---|---|---|---|
| 0 | 1.2.2 (YouTube block, Google card) | Patch, **live 2026-11-19** | 0 | done |
| 1 | TS-1, TS-2, TS-3, TS-12, TS-5, TS-6, TS-10 (gate runner, quiet machine, build cache, suites side by side, tagged e2e and sites, rewriter micro-bench) | tooling | 13 | nothing |
| 2 | AD-0, AD-1, AD-2 gate release, then AD-3 Grant tab | gate release + app Patch | 11 | Boss's deploy |
| 3 | CL-1 meriyah | Patch | 1 + gate | step 1 helps |
| 4 | CL-2 six sockets | Patch | 1 + gate | |
| 5 | LD-2 hover prefetch (fix the fx-app/fx-frames regression first) | Patch | 4 + gate | |
| 6 | TL-1 release A (lockdown and gaps, switches off) | Patch | 2 | |
| 6a | Small new wins, one release each: LD-13 text before fonts, LD-6 boot connect, LD-7 connect while typing, LD-14 lazy embeds, SV-9 VPS tuning (no app release) | Patches | 8.5 | |
| 6b | MS-8 field breakdown (app + gate), CL-15 prototype (no release), TL-6 leak zoo (tooling) | mixed | 17 to 21 | |
| 7 | MS-1 native column, MS-4 real-VPS lane, MS-5 sampler | tooling | 7 | D1, D2, D7 |
| 8 | TS-4 interleaved A/B gate, TS-9 recordings, TS-11 bisect, TS-7, TS-8 | tooling | 18 | D3 |
| 9 | CL-7 Worker pool, CL-6 step A blob reuse, LD-1 on, LD-5 on, LD-8 Lite view, LD-9 discard restore, BC-9 site hints, MS-9 | one release each | 20 | |
| 10 | TL-5 direct-load table, TL-2 gaps, TL-1 release B (lockdown on) | Minor for B | 10 to 14 | |
| 11 | CL-10 long tasks, VD-1 media streaming | releases per item | 15 to 25 | |
| 12 | SV-0 budget, SV-2 image lane on with SV-8 stable URLs, SV-3 resize, SV-7 native fetch lane | Minors | 22 to 24 | HALL legal change (privacy lines pre-approved) |
| 13 | CL-8 libcurl Worker slices 2 to 5 and on | 4 to 5 releases | 18 | MS-2 device run before slice 3 |
| 14 | BC-4 experiment and cards, BC-5, BC-6, BC-7 | releases per item | 12 to 15 | D4, D5 |
| 15 | TL-7 service worker guard, then TL-3 SW lane gaps and lane on | Minors | 13 to 17 | |
| 16 | CL-15 token rewriter (if the prototype passed), then SV-4 server rewrite (3 releases, re-weighed after CL-15), SV-5 prewarm | Minors | 21 to 26 | D6 |
| 17 | LD-3 streamed documents, CL-6 step B code cache | Minors | 16 to 22 | TL-3 |
| 18 | CL-11 site fixes, CL-12, LD-4, VD-2, CL-14 bench, CL-9, CL-13 and CL-17 measure-first, CL-16, AD-4, BC-8, LD-12, LD-10 | as ready | 35 to 45 | |

Each Minor ends with the rc tier of spec 08 (full e2e, A/B speed on both projects, full sites, profile harness), one real-VPS run (inside
50 GB) and, before Minors that move work into Workers or the lane, a school-Chromebook run (MS-2).

## 6. Ideas considered and left out
- **Cloud browser** (a real Chrome on a server, the Chromebook receives video): one session needs about the whole VPS. No spending.
- **Own cloud gaming; Xbox Cloud Gaming benchmark:** needs a GPU host or a TURN relay plus about 7 GB an hour and a filter-evasion decision.
  A "could do" idea only (Boss, 2026-11-18).
- **Bigger VPS, GPU rental, home streaming hardware:** no spending.
- **Home egress for challenge-prone sites:** dropped (Boss, 2026-11-19).
- **Build PC for Limitless gate runs:** out of scope (Boss, 2026-11-19).
- **Matching Chrome's TLS fingerprint:** spoofing, excluded.
- **AVIF on the VPS:** 5 to 15x the CPU of WebP and a RAM risk on a 2 GB box (spec 04 SV-3).
- **YouTube work** (video, thumbnails, Executive video buffering): YouTube is blocked on every tier.
- **Home second-layer cache:** parked, home upload is slower than the VPS fetching itself.
- **Relay-side TLS termination, peer-to-peer cache between members, picking another relay per site to dodge a check, overnight prewarm
  on the member's device:** rejected in the brainstorm (reasons in `BRAINSTORM-2026-11-19.md`).

## 7. Risks
- The emulated profile cannot slow down Workers; the school-Chromebook bench is the only real check for Worker and lane changes.
- 2 vCPU and 2 GB on the VPS: server help competes with the relay; SV-0 decides what fits, and every helper falls back to the device.
- The VPS meter is shared by members, image work, prewarm and the 50 GB of tests.
- Every server feature means the VPS sees what it handles; each needs an approved privacy line and the HALL legal change first.
- Sites change every week; the "x native" table is rerun before any ad uses it.
- The SW lane, streamed documents and the Worker router are the riskiest changes; each ships behind a switch with the old path kept.
- A shorter gate (TS-4) must not let a real regression through: inconclusive counts as a fail for release candidates.

## 8. Decisions (answered by Boss on 2026-11-19 unless marked open)
| id | Decision | Boss's answer | Spec |
|---|---|---|---|
| D1 | What replaces YouTube in the official list | **Khan Academy** | 01 MS-D1 |
| D2 | Create prod test accounts `lbtest` (Cardinal, $0) and `lbtest-free` | **yes, both**; Boss creates them in prod (50 GB a month) | 01 MS-D2 |
| D3 | Speed gate verdict by interleaved A/B with a confidence interval and early stop; thresholds unchanged (10 percent and 100 ms); inconclusive = fail for a release | **yes** (replaces the "fails twice" idea) | 08 TS-4 |
| D4 | TLS mismatch: keep the member's real UA with libcurl's TLS and say some sites may still check | **keep the real UA** | 06 BC-D1 |
| D5 | Reverse DNS for the VPS address and an abuse page on HALL (text) | **reverse DNS only** (Boss sets it in the RackNerd panel); no abuse page | 06 BC-D2, BC-D3 |
| D6 | Server help: Cardinal reads rewrite-cache hits; 3 GB rewrite cache; privacy lines for the image lane, the public file lane (SV-7), the rewrite cache and "nothing loads outside Limitless" | **yes to all four**; privacy lines are **approved as drafted** (Boss, 2026-11-19: no separate review round), the HALL legal change still goes before the feature turns on | 04 SV-D1 to SV-D3, 05 TL-4 |
| D7 | RackNerd ticket: does the 5 TB count both directions | **skip**: plan with both directions (about 2.5 TB for members) | 01 MS-5 |
| D8 | Lite view (LD-8): a new member-facing button and an offer on slow article pages | **yes, button and offer** | 03 LD-8 |
| D9 | "DuckDuckGo Lite (fastest)" as an extra search engine choice (default unchanged) | **yes, as an option** | 03 LD-11 |
| D10 | Cloudflare free edge in front of the lanes | **spec it** (written; the go and the DNS change stay open, Boss's) | 04 SV-11 |
| D11 | Field breakdown samples (MS-8): more numbers in the existing anonymous 1-in-5 sample, still no URL or member id | **yes** | 01 MS-8 |

Last verified: 2026-11-19
