# End-game plan: native Chrome speed on a Chromebook, and better (Boss, 2026-11-18)

**Official end-game goal (Boss, 2026-11-18):** on the paid plans, browsing through Limitless on a Chromebook should be about as fast as
native Chrome on that same Chromebook, and faster where our server can do work the Chromebook would otherwise do. Prime and Executive
come first; Cardinal gets every fix that costs nothing extra; Ordinal keeps every client fix but has no speed target.

**Hard limits (Boss, 2026-11-18):**
- No additional spending: no new subscriptions, servers, GPU rentals or bigger VPS. Everything runs on the home VM, the existing
  RackNerd VPS ($35.99 a year, 2 vCPU, 2 GB RAM, 5 TB two-way meter, about 2.5 TB a month for members) and the members' own devices.
- Test traffic through the real VPS: at most **50 GB a month**, on one prod test member account.
- Real device: only a **school Chromebook**, so real-device runs must need no install, be short and be manual.
- Repo rules still apply: no CAPTCHA solving, IP rotation, residential proxies or fingerprint spoofing; filter-evasion features need Boss's explicit decision; every advertised number is measured and dated (SPEED-AUDIT 4b).

Builds on `docs/1.1/SPEED-AUDIT.md`, `docs/1.2/SPEED-NEXT.md`, `docs/1.2/SWCURL-DESIGN.md`, `docs/1.2/IMGLANE.md`, `docs/1.2/TIER-NUMBERS.md`,
`docs/releases/1.2.0.md`. Nothing here is built unless it says so.

## How to read the time estimates

The times are for Boss's planning, not commitments. Past plan estimates ran long against reality, so each item has two numbers:
- **Plan size**: the old-style "agent-day" size, kept so items compare with SPEED-AUDIT.
- **Likely time**: wall-clock time of one Sonnet agent run, calibrated on the 2026-11-17/18 runs: compact blocklist with tests and two
  speed runs, about 2.3 h; warm-load bisect plus a parser bench across 4 real bundles, about 1.75 h; a full final gate pass, about 2.7 h;
  three-slice merge plus every gate, about 8.8 h. Rule of thumb: **1 plan day is about 2 to 4 agent hours**, and gate runs (speed gate
  about 1 h, `npm test` about 25 min, sites suite about 1 h) are most of the wall time.

## 1. The official site list (skimmed to 10)

| Group | Sites | Why |
|---|---|---|
| General | Steam (front page), YouTube (home), Reddit, Discord | heavy apps, video, the original freeze cases |
| School tools | Google Classroom, Quizlet, Desmos | what members open at school; Quizlet is a human-check case |
| Web games | Kahoot, Gimkit, Coolmath Games | real-time games; Coolmath still has a 7.9 s task |

Every release reports these 10 in a "x native" table (Limitless median divided by native median, same profile, same day, cold and warm).

## 2. What "native speed" means (targets, measured as ratios, not promises)

| Plan | "Shown" ratio target, the 10 sites | Longest task caused by us | Comes from |
|---|---|---|---|
| Ordinal | no target | under 200 ms | client fixes only (public relays, 3 Mbit/s cap) |
| Cardinal | 2.0x native or better | under 200 ms | client fixes, image pass-through, shared rewrite cache |
| Prime | 1.5x native or better | under 100 ms | plus WebP and resize, prewarm, higher relay weight |
| Executive | 1.3x native or better, faster than native on Steam, Discord, Kahoot | under 100 ms | plus Load Now, highest weight, prewarm of their own favourites |

"Faster than native" is possible because the server can do work the Chromebook would do itself: script rewriting and parsing done once
on the VPS, images shrunk before they cross the school Wi-Fi, bundles prewarmed overnight, and repeat visits served from the member's cache.

## 3. Where we are (1.2.0, chromebook profile)

| Site | Native | Limitless 1.2.0 | Source |
|---|---|---|---|
| Steam front, longest task | 2.4 s | 1.3 to 1.4 s | SPEED-AUDIT 0a, TIER-NUMBERS |
| Steam front, shown | not measured | 14.3 to 15.0 s | TIER-NUMBERS |
| Kahoot, shown | not measured | 23.6 to 26.8 s | TIER-NUMBERS |
| Discord, shown | not measured | 54.7 to 55.6 s | TIER-NUMBERS |
| YouTube home, shown | not measured | 13.6 to 14.5 s | TIER-NUMBERS |
| Reddit, shown | not measured | 2.5 to 3.5 s | TIER-NUMBERS |
| Coolmath, shown | not measured | 4.9 to 5.0 s | TIER-NUMBERS |
| Classroom, Quizlet, Desmos, Gimkit | not measured | not measured in 1.2 | |

The freezes are gone; the gap now is time until the page shows. Where it goes: rewriting large scripts on the Chromebook, building
the whole frame document before anything shows, TLS and HTTP in WASM on the page thread, every image through libcurl and postMessage,
and the extra relay hop.

## 4. Phases

Each phase lists: items, plan size, likely time, tests, exit check. "Boss" marks a step only Boss can do.

### Phase 0. Measuring (first; everything else is judged by it)
| Item | What | Plan size | Likely time |
|---|---|---|---|
| 0.1 Native column | `profile.spec.js` and `speed.spec.js` get a `native` mode (same Chromium and throttle, direct to the site); output a "x native" column for the 10 sites | 0.5 d | 1.5 h |
| 0.2 In-app benchmark | `limitless://bench` (Executive and owner only): loads the 10 sites one by one in Limitless and shows the `__lbPerf` times, with a copy button. Lets Boss run it on the school Chromebook in about 10 minutes with nothing installed. Native times on that device are typed in once by hand from a stopwatch run, or the emulated native column is used and labelled | 1 d | 3 h |
| 0.3 Steadier speed gate | Quiet-hour runs, 7 reps, flag a row only if it fails in 2 runs; thresholds unchanged (Boss's OK, it is a gate change) | 0.5 d | 1.5 h |
| 0.4 Real-VPS lane | Boss makes a prod test member (`lbtest`, Cardinal); the harness runs through Buffalo; a counter stops test runs at 50 GB a month | 1 d + Boss 15 min | 3 h |

Tests: the new modes run in a dry run against the fixtures. Exit: one dated table for the 10 sites with native, Ordinal, Cardinal and Prime through the real VPS, plus one school-Chromebook run.

### Phase 1. Real-VPS check (no spending)
| Item | What | Plan size | Likely time |
|---|---|---|---|
| 1.1 Page loads per tier through the real VPS | Phase 0 harness, about 5 GB | 0.5 d | 1.5 h |
| 1.2 Human checks from the VPS address | the 42-site list, 3 reps, about 3 GB | 0.25 d | 1 h |
| 1.3 VPS CPU and RAM under load | relay (1.5 vCPU cap) and the image lane (0.75) together are over 2 vCPU; sample both | 0.5 d | 1.5 h |
| 1.4 Meter | RackNerd ticket (Boss sends it): does the 5 TB count both directions; Kuma alerts at 70 % and 90 % | 0.25 d | 1 h |

Exit: real paid numbers in `TIER-NUMBERS.md`; a written CPU budget that decides which Phase 5 items fit on 2 vCPU.

### Phase 2. Quick wins (a 1.2.x patch)
| Item | What | Gain | Plan size | Likely time |
|---|---|---|---|---|
| 2.1 Module link cache | reuse each module's `blob:` URL by content hash on repeat visits | wins back the +100 to 130 ms the 1.2.0 gate flagged | 0.5 to 1 d | 2 h |
| 2.2 meriyah parser | swap behind `features.parser`; `parseScript` then `parseModule`; keep acorn-walk | parse 1.1x to 2.0x faster on big bundles (R3 bench, identical output) | 1 to 1.5 d | 3 h |
| 2.3 Rewrite Worker pool | size from `navigator.hardwareConcurrency` (today 2) | many-script pages rewrite in parallel | 0.5 d | 1 h |
| 2.4 Hover and idle prefetch | next same-site document on a 100 ms hover; respects the cap and Data saver | clicks feel hundreds of ms faster | 1 d | 2.5 h |
| 2.5 6 relay sockets for paid | SPEED-AUDIT R2 | fewer stalls | 0.5 d | 1 h |
| 2.6 Site bugs | Steam app page blank text; Coolmath 7.9 s task | named sites feel finished | 1 to 2 d | 3 to 5 h |

### Phase 3. Network off the page thread (libcurl in a Worker)
Slice 1 is built and off in 1.2.0. The prototype cut page-thread busy time from 1783 ms to 94 ms while 70 images streamed.
| Item | What | Plan size | Likely time | Risk |
|---|---|---|---|---|
| 3.1 | our relay and the relay token in the Worker | 1 d | 2.5 h | low |
| 3.2 | the router (shards, multi-relay) in the Worker; school-Chromebook bench (0.2) first | 2 d | 5 h | highest |
| 3.3 | streamed bodies with backpressure, Downloads session | 1.5 d | 4 h | medium |
| 3.4 | page WebSockets, pool probe, a single WASM load | 1.5 d | 4 h | medium |
| 3.5 | `curlWorker` on by default after stack (both modes) and the gate | 0.5 d | 2 h | |
| 3.6 | HTML parse in a Worker (htmlparser2): measure first, build only if Steam's parse is over 300 ms | 0.5 + 2 d | 1.5 h + 5 h | medium |

Exit: page-thread busy during image streaming under 10 %; no speed-gate regression.

### Phase 4. Service worker lane, then pages that show while they load
| Item | What | Plan size | Likely time |
|---|---|---|---|
| 4.1 Lane gaps | cross-origin iframe navigations, page-made workers, viewer and page-cache documents, the first page of a first visit | 3 to 4 d | 8 to 12 h |
| 4.2 Lane on | `swDoc` on once the direct-load counter reads 0 on the 10 sites | 0.5 d | 2 h |
| 4.3 Streamed documents | the worker streams the rewritten HTML as it arrives, so the top of the page shows before the whole page is processed. The largest single step toward native "shown" times | 2 to 4 d | 6 to 10 h |

Bonus: "nothing loads outside Limitless" becomes true and can be advertised.

### Phase 5. Server help for paid plans (must fit the existing 2 vCPU VPS)
| Item | What | Plan size | Likely time | Plans |
|---|---|---|---|---|
| 5.1 Image lane on | HALL privacy line first (its branch must be merged onto current HALL main and released), VPS container, flag; real-pair rehearsal | 1.5 to 2 d | 4 h + Boss deploys | Cardinal pass-through; Prime, Executive WebP |
| 5.2 Image coverage | `srcset`, CSS images, video posters | 2 d | 4 h | same |
| 5.3 Resize to shown size | width in the token; resize before WebP. Measure CPU first (Phase 1.3) | 1.5 d | 3 h | Prime, Executive |
| 5.4 Shared rewrite cache | rewrite a public, cookie-less script once on the VPS, keyed by its hash; needs its own privacy line | 3 to 4 d | 8 h | Cardinal and up |
| 5.5 Overnight prewarm | the 10 sites' public bundles plus each Executive member's favourites, rewritten and cached by 06:00 | 1 d | 2.5 h | Cardinal and up (favourites: Executive) |

CPU rule: anything that does not fit in Phase 1.3's budget waits or is limited to Executive. No VPS upgrade (no spending).

### Phase 6. Video
Streamed media bodies (YouTube fetches 43.7 MB to play 2.9 MB): chunked reply message, Range-aware `doFetch`, cache, deadline and
speed-cap paths changed. Plan size 5 to 8 d, likely time 12 to 20 h over several runs. Saves VPS data as well as time.

### Phase 7. Human checks (allowed paths only)
| Item | What | Plan size | Likely time |
|---|---|---|---|
| 7.1 Member-solvable checks | Cloudflare/Turnstile and similar render and can be passed by the member; keep the pass cookie | 2 to 3 d | 5 to 8 h |
| 7.2 Google sign-in | trace the `K[z] is not a function` error; stays best effort until it works | 0.5 to 1 d | 2 h |
| 7.3 Private search page | SearXNG on the VPS for members only, if Phase 1.3 shows the CPU and RAM (2 GB box); privacy line | 2 to 4 d | 5 to 8 h |
| 7.4 Home egress | only on Boss's yes | 1 d | 2.5 h |

## 5. Release order

| Release | Contents | Plan size | Likely agent time | Likely calendar |
|---|---|---|---|---|
| 1.2.1 Patch | 2.1, 2.5 | 1 to 1.5 d | 3 h | 1 day |
| 1.3.0 Minor | Phases 0 and 1, rest of 2, Phase 3 | 15 to 18 d | 40 to 55 h | 1.5 to 2.5 weeks |
| 1.4.0 Minor | Phase 4, Phase 5.1 to 5.3 | 11 to 15 d | 30 to 40 h | 1.5 weeks |
| 1.5.0 Minor | Phase 5.4 to 5.5, 6, 7 | 15 to 22 d | 40 to 60 h | 2 weeks |

Totals: plan size 45 to 60 days; likely about 110 to 160 agent hours, which is roughly **4 to 6 weeks** with overnight runs and at most 2
slices in flight. The gates set the pace more than the coding: each Minor ends with e2e, stack in both membership modes, the speed
gate, sites, the profile harness with the "x native" column, one real-VPS run (inside the 50 GB) and, before 1.3.0 and 1.4.0, a
school-Chromebook bench.

## 6. Ideas considered and left out (Boss, 2026-11-18)

- **Cloud browser** (a real Chrome runs on a server, the Chromebook only receives video): the fastest path to "better than native" on
  heavy pages, but third-party guides put one session at 2 vCPU and 2 to 4 GB RAM, which is the whole VPS, and it needs a server per
  few members. Left out: no additional spending.
- **Own cloud gaming** (PC games from a GPU machine): needs a GPU host. Left out: no additional spending.
- **Xbox Cloud Gaming as a "could do" benchmark**: playing a member's own Xbox Cloud Gaming through Limitless would show off the relay's
  speed. It would need a TURN relay on the VPS for its WebRTC video, about 7 GB of member data per hour at 1080p, and Boss's explicit
  filter-evasion decision. Boss: a benchmark idea only, not tested, not in the plan.
- **Bigger VPS, GPU rental, home streaming hardware**: no additional spending.

## 7. Risks

- The emulated profile cannot slow down Workers; the school-Chromebook bench is the only real check, so keep it in every Minor.
- 2 vCPU and 2 GB RAM on the VPS: server help competes with the relay; Phase 1.3 decides what fits.
- The VPS meter (about 2.5 TB a month for members) is shared by members, image work and the 50 GB of tests.
- Every server feature means the VPS sees what it handles; each needs its own approved privacy line in HALL.
- Sites change every week; the "x native" table is rerun before any ad uses it.
- The service worker lane and the Worker router are the riskiest changes; each ships behind a switch with the old path as fallback.

## 8. Decisions for Boss

1. Phase 0.3: the "fails twice" rule for the speed gate (thresholds unchanged).
2. Phase 0.4: create the prod test member `lbtest` (Cardinal); 50 GB a month is already approved.
3. Phase 5.4 and 7.3: privacy lines for the shared rewrite cache and the search page.
4. Phase 7.4: home egress yes or no.

Last verified: 2026-11-18
