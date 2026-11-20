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

## SV-7 Native fetch lane for public files (new, brainstorm A2)
- **Status:** planned. **Likely time:** 6 to 8 h. **Tiers:** Cardinal and up. **Needs:** privacy line (D6) and the HALL legal change before
  it is switched on.
- **Why:** every script, stylesheet and font today goes through libcurl.js (TLS, HTTP/2 and brotli in WASM, then a copy). The browser's
  own `fetch()` does all of that natively; the image lane already proves the server side.
- **Rules:**
  1. Gate image, mode `img` grows a second path `/p/` (or a sibling mode `GATE_MODE=pub` with its own compose profile; pick the one that
     keeps the image lane's limits separate). The VPS fetches the URL with no cookies, no Referer, no credentials, the member's UA class
     (SV-4 rule), the SSRF guard from `src/img/net.ts`, redirects re-checked, 3 at most.
  2. It answers with the body only when the response is shared-cacheable (status 200, GET, no `Set-Cookie`, not `private`/`no-store`,
     `Vary` only `Accept-Encoding`, a freshness lifetime; the SV-4 public rule); otherwise `409 {reason}` and no body.
  3. Content types allowed: JavaScript, CSS, fonts (woff2, woff, ttf, otf), JSON, plain text, WASM; 8 MB per file. Everything else 415.
  4. Answers carry `Access-Control-Allow-Origin: <app origin>`, `Access-Control-Allow-Credentials: true` (for SV-8),
     `Cross-Origin-Resource-Policy: same-site`, `Cache-Control: private, max-age=<origin lifetime capped at 1 day>`, `nosniff`.
  5. Shared disk cache (LRU, 2 GB start, from SV-0's budget) keyed by URL + UA class; hits do not count toward member caps (G3
     decision, 2026-11-18) and cost the meter one direction only.
  6. App (`features.pubLane`, default false): in `queueFetch`, a GET with no `Cookie` the jar would send, no `Authorization`, no custom
     auth headers, for a script, style, font or fetch/XHR of those types, goes to `fetch(<lane url>, {credentials: 'include'})`; a 409 or
     415 marks the host + first path segment as "own path" for the session and retries through libcurl at once; any network error, 429 or
     503 does the same and 5 in a row open a 2-minute breaker (the image lane's rule). The response then follows the normal pipeline
     (rewrite, blob, cache).
  7. Never for Ordinal (no relay token, no cookie), never with our relay down, never for `POST` or any request with a body.
- **Edge cases:** a site that serves a different bundle to cookie-less requests (the 409 rule does not see this; the per-host "own path"
  list can be pre-seeded from the sites suite when a site breaks with the lane on); CORS-mode fetches from the page (`fetch` with
  `mode: cors` from the frame): the app replies with the lane body and the site's own `access-control-*` headers copied from the origin
  answer (the VPS forwards them as `x-lb-origin-acao` etc.); `Range` requests stay on libcurl.
- **Tests:** gate unit (public rule table, 409, 415, size, SSRF, headers, cache hit not counted); app e2e with a mocked `/p/` route (hit,
  409 fallback and memory, breaker, cookie request never goes to the lane, Ordinal never uses it); rehearsal with the real service; item
  gate A/B on fixtures (expect lower page-thread busy time) and the real-VPS lane.
- **Measure:** page-thread busy time during load (profile harness), `shown` on Steam and Discord through MS-4, lane hit rate.
- **Rollback:** `LB_FEATURE_PUBLANE=false` or stop the profile.

## SV-8 Stable lane URLs with a relay cookie (new, brainstorm A3)
- **Status:** planned. **Likely time:** 4 h. **Tiers:** paid.
- **Why:** lane URLs carry the 5-minute token in the path, so the browser HTTP cache and V8's code cache never see the same URL twice.
- **Rules:**
  1. `POST /_lb/relay-token` (app origin) also returns a short one-time code; the app calls `https://<relay host>/lane/session` with
     `credentials: 'include'` and that code; the VPS answers `Set-Cookie: lbr=<token>; (host-only: no Domain attribute);
     Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300` and refreshes it with each token renewal.
  2. Lane paths drop the token: `/i/<mode>/<bucket>/<url>`, `/p/<url>`, `/rw/u/<url>`. The token in the path stays accepted for one
     release (old app builds).
  3. The cookie is host-only on the relay host, so it is never sent to any site and never to the app host.
  4. Lane answers are `Cache-Control: private` (no shared cache in between stores them) with the origin's lifetime (SV-7 rule 4), so the
     browser's HTTP cache reuses them across tokens; the relay checks the cookie on every request.
  5. Server-rewritten scripts in URL mode (`/rw/u/`) are loaded by the frame with `<script src="https://<relay host>/rw/u/...">` (not a
     `blob:`), so Chrome can code-cache them (research section 3). The `import.meta.url` and `__LB_IMU__` post-steps move to the server
     for this mode (the server knows the URL), or this mode is limited to classic scripts until they do.
- **Edge cases:** third-party cookie settings on managed Chromebooks (same-site requests are not third-party, but test it on the school
  device in MS-2); a revoked member (the relay refuses the cookie's token within its 5 minutes, same as the path token today).
- **Tests:** gate unit (cookie set, host-only, expiry, path without token accepted); e2e: second load of the same image within 10 minutes
  makes no network request (browser cache), across a token renewal.
- **Rollback:** the app sends the token in the path again (`features.laneCookie=false`).

## SV-9 VPS network tuning (new, brainstorm D1)
- **Status:** done 2026-11-20 (Boss approved the VPS change; no app release). BBR, fq and the buffers were already in place since 2026-11-16 (speed audit, `/etc/sysctl.d/90-limitless-net.conf`, docs/1.1/SPEED-AUDIT.md); only unbound `serve-expired` was missing and is now live. **Likely time:** 1.5 h. VPS host change (standing-approved VPS work), logged in the release record.
- **Notes (2026-11-20, VPS `limitless-relay`, before the change):** `tcp_available_congestion_control = reno cubic bbr`, `tcp_congestion_control = bbr`, `default_qdisc = fq` (eth0 shows `fq`), `rmem_max = wmem_max = 16777216`, `tcp_rmem = 4096 131072 16777216`, `tcp_wmem = 4096 65536 16777216`, plus `tcp_slow_start_after_idle=0`, `tcp_notsent_lowat=131072`, `tcp_mtu_probing=1`. Buffers stay at 16 MB (above the 8 MB the rules name; not lowered, 2 GB RAM is not at risk and the file is the live audited one). unbound (container `limitless-relay-vps-dns-1`, image `limitless-dns:5aef5b9`): `prefetch: yes`, no `serve-expired`.
- **After:** unbound has `serve-expired: yes`, `serve-expired-ttl: 3600`. Applied by rebuilding the dns image on the VPS from the old one with the new `unbound.conf` (same tag `limitless-dns:5aef5b9`, compose file untouched) and recreating only `dns` (relay, relaygate, tls not restarted; 0 open sockets on :443 at the time). `deploy/dns/unbound.conf` carries the same two lines so the next `deploy-vps.sh` matches. Old image kept as `limitless-dns:5aef5b9-pre-sv9`; files in `/root/sv9/` on the VPS.
- **Rollback (unbound, as root on the VPS):** `docker tag limitless-dns:5aef5b9-pre-sv9 limitless-dns:5aef5b9 && cd ~/limitless-relay-vps && GATE_SHA=$(docker inspect limitless-relay-vps-relaygate-1 --format '{{.Config.Image}}' | cut -d: -f2) RELAY_SHA=5aef5b9 DNS_SHA=5aef5b9 docker compose -p limitless-relay-vps up -d --no-build --no-deps dns` (and revert the two lines in `deploy/dns/unbound.conf`). Sysctl rollback is the line in docs/1.1/SPEED-AUDIT.md.
- **Checked after:** dns container healthy, `nslookup example.com 10.88.81.53` answers from the relay network, relaygate `/healthz` ok, `https://relay.taps-holdings.org/healthz` 200 (VPS and outside). Not run: the MS-4 before/after and the 100 MB download (MS-4 lane not run yet; the sysctl part did not change, so the DNS change is the only delta). `check.sh` does not exist yet.
- **Rules:** check `sysctl net.ipv4.tcp_available_congestion_control`; if `bbr` exists, set `net.core.default_qdisc=fq` and
  `net.ipv4.tcp_congestion_control=bbr` in `/etc/sysctl.d/90-limitless.conf`; TCP buffers `net.ipv4.tcp_rmem`/`tcp_wmem` max 8 MB
  (300 Mbit/s at about 60 ms RTT needs about 2.3 MB, doubled); unbound `prefetch: yes`, `serve-expired: yes`, `serve-expired-ttl: 3600`.
  Before and after: MS-4 run (3 reps on the official sites) and a 100 MB download through the relay. Rollback: delete the file, `sysctl
  --system`, revert the unbound lines.
- **Tests:** `deploy/relay-vps/check.sh` prints the active values (added to the VPS check step).

## SV-11 Cloudflare free edge in front of the lanes (Boss, 2026-11-19: spec it; the go and the DNS change stay open)
- **Status:** specified, not approved to build. **Likely time:** 3 to 4 h + Boss's DNS step. **Tiers:** paid (the lanes are paid only).
  **Needs first:** SV-7 and SV-8 (stable lane URLs; a token in the path would make every URL unique and nothing would cache).
- **Why:** Cloudflare's free plan caches at an edge near the school. A hit never reaches the VPS: no Buffalo round trip, and no bytes on the
  5 TB meter. It costs nothing (no-spending rule holds).
- **How it would work:**
  1. A new hostname `lane.taps-holdings.org`, proxied (orange cloud), pointing at the VPS. The relay hostname stays DNS-only (grey):
     WISP is never put behind Cloudflare. **DNS change = Boss** (an explicit record is needed because `*.taps-holdings.org` is a proxied
     wildcard).
  2. VPS nginx serves only the lane paths (`/i/`, `/p/`, `/rw/u/`) on that host, with a Cloudflare Origin certificate (SSL mode "Full
     (strict)"), and accepts connections for that host only from Cloudflare's published IP ranges (refreshed by a weekly script).
  3. Edge cache only for public answers: lane answers for public files get `Cache-Control: private, max-age=<lifetime>` for the browser
     and `CDN-Cache-Control: public, max-age=<lifetime capped at 1 day>` for Cloudflare. Answers that are not public (409, errors, any
     `Set-Cookie`) carry `CDN-Cache-Control: no-store`.
  4. The cache key is the URL path only (Cloudflare ignores cookies in the key by default); the path already holds mode, bucket and UA
     class (SV-3, SV-4), so members with different UA classes never share a script.
  5. One Cache Rule on the free plan: "Eligible for cache" on `lane.taps-holdings.org` paths `/i/*`, `/p/*`, `/rw/u/*`; everything else
     bypass.
  6. App: `features.laneEdge` (default false) switches the lane base from the relay host to the lane host; off means today's direct VPS lane.
- **What changes for safety and privacy (read before saying go):**
  - **No member check on edge hits.** Cloudflare answers a cached file to anyone who asks for that exact URL, without our cookie. Only
    public files that some member already fetched can be served this way, and anyone could fetch them from the original site anyway. A
    miss still reaches the VPS, which checks the cookie, so non-members cannot use the lane to fetch anything new.
  - **Cloudflare sees** the member's IP address and the addresses and contents of the public files on that hostname (it terminates TLS for
    the lane host). It never sees relay (WISP) traffic or private pages. The privacy line for the lanes (D6) gets one more sentence naming
    Cloudflare as the network provider for public files; Boss approves it with the others.
  - **Cloudflare terms:** the free plan is fine for scripts, CSS, fonts and images; it is not for serving video, which the lanes never
    carry (`/p/` refuses media types, SV-7 rule 3). Files over 512 MB are not cached on the free plan (lane files are at most 8 MB).
- **Edge cases:** a site changes a file at the same URL (edge lifetime capped at 1 day, the origin's validators still apply on the VPS);
  Cloudflare outage (the app's lane breaker falls back to the libcurl path after 5 failures, the same as a VPS lane outage); purge
  (Cloudflare dashboard "Purge everything", Boss or an approved session with the API token on the hub; no token on this VM).
- **Tests:** gate unit: `CDN-Cache-Control` header rules per answer kind; nginx test: the lane host refuses a non-Cloudflare source
  address; app e2e: `laneEdge` changes only the base host; rehearsal cannot include Cloudflare, so a short real check through `lbtest`
  (MS-4): the second request for a file shows `cf-cache-status: HIT`.
- **Measure:** Cloudflare's free analytics (cached bytes share), the VPS meter before and after for one week, `firstBytes` for lane files
  on the school Chromebook (MS-2).
- **Rollback:** `features.laneEdge=false` (instant, app build), or grey-cloud the record (DNS, Boss).

## Decisions for Boss (also in the master plan)
- **SV-D1 (answered 2026-11-19: yes)** May Cardinal members **read** server-rewritten hits (a disk read, almost free), while only Prime and Executive trigger new
  rewrites? Recommended yes: Cardinal gets prewarmed top sites at no CPU cost; the ladder stays (Prime gets its own sites rewritten).
- **SV-D2 (answered 2026-11-19: yes)** Disk budget: 3 GB for the rewrite cache next to the image lane's 1 GB (28 GB free). Recommended yes.
- **SV-D3 (answered 2026-11-19: draft them for review)** Privacy lines for the image lane, the public file lane (SV-7: same family as the image line, "public files" instead of
  "pictures") and the rewrite cache (drafts in IMGLANE and the design file, section 3.8).
- **SV-D4 (D10, answered 2026-11-19: spec it)** Cloudflare free edge in front of the lanes: SV-11 is written; the go and the DNS change stay open.

## Order
SV-9 (any time, small), SV-0, SV-2 (after the legal step) with SV-8, SV-3, SV-7, SV-4 (G4-1, G4-2, G4-3 as three releases; re-weigh after
CL-15 is measured), SV-5. SV-11 only on Boss's yes. Total about 37 to 49 agent hours.

Last verified: 2026-11-19
