# 04: Server help for paid plans on the VPS (spec, 2026-11-19)

Area code **SV**. Work the VPS does so the Chromebook does not: shrink images, rewrite big public scripts once for everyone, warm the
cache overnight. Paid plans only (Ordinal traffic never reaches the VPS). Old ids merged here: SPEED-NEXT G2 to G7, N6, S2,
NATIVE-SPEED-PLAN Phase 5, `docs/1.2/IMGLANE.md`. Design detail for the server rewrite: `docs/1.3/research/server-rewrite-design-2026-11-18.md`
(Sonnet research, 2026-11-18: read it before SV-4). Image numbers: `docs/1.3/research/speed-2026-11-19.md` section 5, media notes
`docs/1.3/research/media-2026-11-18.md` section 1.

## 0. Hard limits
- **No extra spending** (Boss, 2026-11-18): the one RackNerd VPS, 2 vCPU, 2 GB RAM (about 1.4 GB free), 34 GB disk (28 GB free), 5 TB a
  month (about 2.5 TB for members if both directions count; MS-5 asks RackNerd).
- The relay keeps 1.5 vCPU; image lane 0.75 vCPU; a rewrite service 0.5 vCPU. That is over 2 on purpose: helpers yield to the relay
  (lower CPU shares) and every helper falls back to the device when busy.
- **Tier ladder (Boss, 2026-11-18):** Cardinal = shared cache + image shrink; Prime = plus server rewrite + prefetch; Executive = plus
  media help and their own favourites prewarmed. Busy order: Executive, Prime, Cardinal. No CPU numbers are promised.
- Every server feature needs its own privacy line approved by Boss and the HALL legal text changed **before** it is switched on.
- Nothing is logged per member or per URL: aggregate counters only (the image lane pattern).

## 1. Status
| id | item | old ids | status |
|---|---|---|---|
| SV-1 | Image lane: VPS fetches public images without cookies, WebP q75 for JPEG/PNG of 30 KB or more, 1 GB 24 h disk cache, SSRF guard, falls back to the device path | S1, IMGLANE | shipped 1.2.0, OFF (build, member opt-in and server profile) |

---

## SV-0 CPU and memory budget (measure before sizing anything; was G6, 1.3)
- **Status:** planned (uses MS-5's sampler). **Likely time:** 2 h + one week of samples.
- **Rules:** with the relay at its evening peak (one week of samples), write down the spare CPU and RAM at p95. Then:
  - image lane gets what it needs at 10 images a second (13.5 ms CPU each measured, so about 0.15 vCPU), cap 0.75;
  - server rewrite gets the rest up to 0.5 vCPU and 512 MB;
  - private search (spec 06 BC-8) only if 0.25 vCPU and 256 MB are still free.
  Any item that does not fit waits or is limited to Executive. Written into this file as a table.

## SV-2 Image lane on, then coverage (was 5.1, 5.2, G2, N6 part 1)
- **Status:** planned. **Likely time:** 4 h + Boss steps; coverage 4 h. **Tiers:** Cardinal pass-through plus shared cache (WebP only
  with Data saver), Prime and Executive WebP always (IMGLANE "Tiers").
- **Steps:** (1) Boss approves the privacy line (draft in IMGLANE) and the HALL legal change ships; (2) VPS: `imglane.env`, start the
  profile (VPS work is standing-approved since the 1.0 build, but only after step 1); (3) a rehearsal on the real pair
  through `lbtest` (spec 01 MS-4); (4) build with `LB_FEATURE_IMGLANE=true`, member switch still default off; (5) after a week of counters,
  member default on for Prime and Executive (Boss decides).
- **Coverage (`features.imgLaneMore`):** `srcset` candidates, CSS `background-image` from `rewriteCssUrls`, `<video poster>`, YouTube-free
  thumbnail grids of other sites. Same fallback rule.
- **Tests:** existing `imglane.spec.js`; new cases per coverage path with the mocked `/i/` route.
- **Measure:** image bytes per page (Steam grid, Reddit feed) on vs off; `vpImages` (spec 03).

## SV-3 Resize to the shown width (was G2 resize, N6, 5.3)
- **Status:** planned. **Likely time:** 3 h.
- **Rules:**
  1. The app sends the layout width in device pixels, rounded **up** to a bucket (160, 320, 480, 640, 960, 1280, 1920) in the lane URL
     (`/i/<token>/<mode>/<bucket>/<url>`); never larger than the source.
  2. WebP only (q70 at 1280 and below, q75 above). **No AVIF** on this box: 5 to 15x the CPU of WebP and a reported RAM peak near 2.5 GB
     on large images (research section 5).
  3. Cache key = SHA-256 of mode, bucket and URL. `sharp.concurrency(1)`, `UV_THREADPOOL_SIZE=2`, `MALLOC_ARENA_MAX=2`,
     `sharp.cache({memory: 50})` (sharp docs).
  4. Measured cost first: 20 real images per bucket on the VPS, CPU ms p50 and p95, before turning resize on.
- **Tests:** gate unit tests: bucket rounding, never upscale, key differs per bucket; app e2e: the bucket in the URL follows the element
  width and DPR.

## SV-4 Shared rewrite cache and server rewrite (was G3, G4, S2, 5.4)
- **Status:** design done (research file). **Likely time:** 5 to 6 h + 2.5 days of plan size, three releases. **Tiers:** Prime and
  Executive trigger rewrites; Cardinal reads hits if Boss agrees (SV-D1).
- **Why:** the first visit to Steam, Discord or Kahoot spends 2 to 5 s rewriting multi-MB public bundles on the Chromebook; the rewrite
  output does not depend on the page URL, so one rewrite can serve every member.
- **Rules (summary; the design file is the detail):**
  1. **G4-1 shared module:** the rewriter moves to `app/rewriter.js` (one file for the page, the Worker and Node); `rwVer` = SHA-256 of
     the rewriter, acorn and meriyah files plus the wrapper version, stamped in `version.json`. This invalidates device rewrite caches
     once (say so in the release note). Parity test: page and Node output byte-identical on a golden corpus.
  2. **G4-2 `rwcache` service:** gate image in `GATE_MODE=rw`, compose profile `rwcache`, nginx `/rw/`, `cpus: 0.5`, 512 MB, one
     `worker_threads` parser, sources 16 KB to 4 MB, queue 16 then 503, disk 3 GB brotli at rest (SV-D2), LRU, verify a stored SHA-256 on
     read. Endpoints: `GET /rw/h/<token>/<sha>/<rwVer>[/i]` (hit or 404), `PUT` same path with the source (the server re-hashes, rewrites
     itself, stores), `GET /rw/ver`. Content-addressed, so a member can neither read a script they do not hold nor poison the cache.
  3. **G4-3 app client (`features.srvRewrite`, default false):** in `rewriteJsAsync` after the device cache misses: only paid tier with
     the entitlement, token alive, our relay in use, `rwVer` equal, scripts of 64 KB or more; lookup budget `min(1500 ms, 3 ms per KB)`;
     for 256 KB or more race the device Worker; on a miss, fire-and-forget `PUT` only when the request carried no cookie and no auth
     header and the response is public-cacheable (RFC 9111 shared-cache rules, the app's `lbCacheEvaluate`); output SHA-256 checked before
     use; 5 failures open a 2-minute breaker.
  4. Priority lanes by the token's `plan` claim, weights from the gate's `PlanLimits.weight` (Cardinal 1.5, Prime 2, Executive 3); hits are
     served from disk without queueing; 20 rewrites a minute per member, burst 10, then 429.
- **Edge cases:** rewriter version drift (handshake), truncated or corrupt files (verify), VPS busy (race and breaker), private script
  uploaded by mistake (unreadable without its content; app sends only cookie-less public responses), disk full (refuse fills under 5 GB free).
- **Tests:** gate unit (parity, token and plan, public rule table, fill hash mismatch, verify on read, lanes, buckets, SSRF reuse), app e2e
  with mocked `/rw/` (hit, miss + PUT, timeout, 503, breaker, version mismatch, off = no request), rehearsal with a 1.9 MB fixture bundle,
  item gate.
- **Exit:** Steam front first visit (fresh device cache) `shown` at least 1 s earlier for a Prime member on the second member's visit;
  device longest task during the load under 200 ms.
- **Rollback:** `LB_FEATURE_SRVREWRITE=false` or stop `rwcache`; the app rewrites itself.

## SV-5 URL mode and overnight prewarm (was G5, 5.5)
- **Status:** after SV-4. **Likely time:** 2.5 h.
- **Rules:** `GET /rw/u/<token>/<url>`: the VPS fetches a public script itself (no cookies, member's UA class in the key) and returns it
  rewritten, saving the member the download too. A nightly job at 04:30 Chicago (before school, after the 03:30 backups) prewarms the
  official sites' public bundles and, for Executive members, the scripts of their favourites (the app sends favourite hosts once a day,
  opt-in, hosts only). Fonts and CSS next, then resized images. Budget: at most 1 GB of VPS transfer a night, counted in the meter.
- **Tests:** unit for the public rule in URL mode and revalidation with `If-None-Match`; prewarm dry run lists what it would fetch.

## SV-6 Home second-layer cache: PARKED (was G7)
Home upload is under 20 Mbit/s, so a home cache is slower than the VPS fetching from the internet. Revisit only if the VPS disk is too
small or the upload improves.

## Decisions for Boss (also in the master plan)
- **SV-D1** May Cardinal members **read** server-rewritten hits (a disk read, almost free), while only Prime and Executive trigger new
  rewrites? Recommended yes: Cardinal gets prewarmed top sites at no CPU cost; the ladder stays (Prime gets its own sites rewritten).
- **SV-D2** Disk budget: 3 GB for the rewrite cache next to the image lane's 1 GB (28 GB free). Recommended yes.
- **SV-D3** Privacy lines for the image lane and the rewrite cache (drafts in IMGLANE and the design file, section 3.8).

## Order
SV-0, SV-2 (after the legal step), SV-3, SV-4 (G4-1, G4-2, G4-3 as three releases), SV-5. Total about 25 to 35 agent hours.

Last verified: 2026-11-19
