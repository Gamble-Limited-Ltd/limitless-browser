# G4: server-side script rewrite and shared rewrite cache (design, research 2026-11-18)

Status: research only. No code, commits, runs or VPS access. Sources are listed as URLs; "not found" means a search did not settle it.
Plan reference: `~/Browser/docs/1.2/SPEED-NEXT.md` sections E, G (G3, G4, G5, G6), SPEED-AUDIT 4 (S2, S3, 4b).

## 1. How other open-source proxies do it

| Project | Where rewriting runs | Server-side cache of rewritten output | Source |
|---|---|---|---|
| Ultraviolet (Titanium Network, now "not really maintained", superseded by Scramjet) | In the browser: a service worker intercepts requests (`uv.sw.js`), a bundle holds the rewriter, a client script hooks the page. Parser listed as Acorn. | None documented. The server is only a transport (Bare/Wisp). | https://raw.githubusercontent.com/titaniumnetwork-dev/Ultraviolet/main/README.md ; file roles and Acorn from search results (third-party READMEs), not the official docs |
| Scramjet (MercuryWorkshop) | In the browser, inside the service worker. JS goes through an OXC-based Rust/WASM rewriter, wrapped by a TypeScript layer (`src/shared/rewriters/js.ts`); HTML, CSS and headers handled by the same worker. | None documented. | https://github.com/MercuryWorkshop/scramjet/wiki ; mirror pages (unofficial, flagged as such by the search) at mintlify.com/mercuryworkshop/scramjet ; design write-up by the author: https://developer.puter.com/blog/how-I-ported-the-web-to-the-web/ |
| Rammerhead (built on `testcafe-hammerhead`) | On the server: a URL-rewriting proxy that processes HTML, CSS and JS before sending them, and injects a client script. | Yes, one: Rammerhead v1.2.62 changelog "add disk cache option for processed JS files. fixes huge server memory usage and enables workers to share the same cache". The cache is of processed (rewritten) JS on disk, shared by worker processes. Key format and invalidation: not found. | https://cdn.jsdelivr.net/npm/rammerhead@1.2.64/CHANGELOG.md ; https://raw.githubusercontent.com/DevExpress/testcafe-hammerhead/master/README.md |
| TestCafe proxy (hammerhead) | Server. | Asset cache (stylesheets, scripts, images) behind `--cache`, not for HTML and not for assets over 5 MB. Whether processed scripts are cached: not found. | https://directcut.github.io/testcafe/documentation/guides/advanced-guides/speed-up-test-execution.html (via search result) |
| Corrosion | Server: `proxy.request(req, res)` rewrites on the server. | None documented in the README. | https://raw.githubusercontent.com/titaniumnetwork-dev/Corrosion/main/README.md |
| Classic PHProxy/CGIProxy/Glype | Server, HTML URL rewrite only. | Not found. | Puter post above |

What this tells us:
1. The two modern, maintained designs (UV, Scramjet) rewrite in the browser and keep the server dumb because the transport is end-to-end encrypted (Puter post, "Privacy" section: a server that rewrites can see and alter everything). Limitless is the same: libcurl.js does TLS in the browser, the relay only sees WISP bytes. A server rewrite is therefore a deliberate privacy trade, and only fine for public, cookie-less files (the Boss rule).
2. The only precedent for caching rewritten JS is Rammerhead's disk cache, and it exists because memory use of rewriting on a server grew too big. Lesson for us: put the cache on disk, not RAM (2 GB box).
3. Nobody documents a shared, content-addressed rewrite cache. That is what Limitless can do cheaply because its rewrite is a pure function of the script text (see 2).
4. No source gave a measured hit rate for any proxy: "not found". That is why G6 (measure first) matters.

## 2. Where the rewriter lives today (read from `~/Browser/app/main.js`, 2026-11-18)

- `rewriteLocationRefs(src, imp)` at line 9936, module level, self-contained. It reads two globals: `acorn` (with `acorn.walk`) and optional `meriyah`. It parses (meriyah script, then module, then acorn), finds `location` member and identifier uses, `__lbSafe(` guards, `import()` helper edits, and applies edits with one `join`. Output is the rewritten source string.
- It is shipped to the rewrite Worker as text: `lbRwSource()` (line 10204) = vendored acorn text (+ meriyah text, `lbRwLoadLib` line 10186) + `rewriteLocationRefs.toString()` + a tiny `onmessage`. So the function already runs unchanged in a second JS context from its own source text. That is exactly what a Node service needs.
- Cache key today (`lbRwKey`, line 10114): SHA-256 of the source + `lbRwHash(rewriteLocationRefs.toString())` (`_lbRwVer`), plus `'i'` when the import helper is on. Persistent store: IndexedDB `LimitlessRewrite`, 50 MB LRU (`lbMakeKV`). In-memory: `lbRw.memo`.
- Output is URL-independent: the import marker `"__LB_IMU__"` is swapped for the script's URL afterwards by `lbImu()` (line 10250), and the ES module `import.meta.url` and import-specifier patterns are applied by callers after the rewrite (line 11309). So a cached rewrite can be served to any page and URL. This is the property that makes a shared cache correct.
- Call sites that await the rewrite: external scripts, inline classic scripts, ES module sources (lines 11309, 11371, 11475). `window.__lbRewriteJs` (dynamic injection, called synchronously from the frame) stays synchronous and is out of scope.
- Gate for small scripts: under 16 KB (`LB_RW_MIN`) the rewrite is synchronous and not cached; a script with neither `location` nor `import(` is returned untouched (`lbRwWants`), so those never need the server.
- Costs measured earlier (SPEED-AUDIT 1.2 and the N2 table in SPEED-NEXT): Steam `store/main.js`, 1.9 MB decoded: whole rewrite 2451 ms in Node 22 on the busy Gamble VM with acorn (about 9.8 s on a Chromebook profile); Chromium Worker at 1x: 514 ms (acorn), 481 ms (meriyah). meriyah is 1.1x to 1.5x faster in total. So one rewrite on the VPS is about 0.5 to 2.5 s of one core for the biggest bundles, about 0.25 to 1.3 ms per KB. The VPS CPU is E5-2690 v4 class (SPEED-AUDIT 1.3): same order as the Gamble VM. Memory of the AST for a 2 MB script in Node: not measured (risk, see 7).

Two weaknesses to fix before sharing anything:
- `_lbRwVer` hashes only the function text. It does not cover the vendored parser versions (acorn 8.14.0, meriyah 7.4.2) or the wrapper steps. A parser upgrade with unchanged function text would reuse stale entries. The version for a shared cache must be `sha256(rewriter file + acorn file + meriyah file + wrapper version)`.
- The function lives inside `go()`'s scope neighbourhood in a 19,000-line file and is only reachable through `toString()`. The vendored acorn file is two UMD bundles glued together (acorn, then acorn-walk); in Node `require` would give both onto one `exports`, not `acorn.walk`. The service must load it the way the Worker does (text into a `vm` context with a fake global), not with `require`.

## 3. Design for Limitless

### 3.1 Principle
Content-addressed cache. Key = `sha256(source bytes)` + `rwVer` + `imp` flag. The value is the rewritten text. Because the key is the content, a lookup can only return something the asker already holds the source of (they hash it themselves), so a hash lookup leaks nothing even if a private script was once stored. Every fill is rewritten by the VPS itself from bytes it hashed itself, so a member cannot poison the cache. The hash check on read (store the output's SHA-256 beside the file, re-verify on load) covers disk corruption.

### 3.2 Shared module plan
1. New file `app/rewriter.js` (classic script, no imports, assigns `self.LBRewriter = { VERSION_SRC, rewrite }`). `rewrite(src, imp)` is today's function, moved verbatim. The page loads it as a script, `lbRwSource()` concatenates its text (replacing `rewriteLocationRefs.toString()`), and the Node service loads it by `vm.runInContext`. One file, three hosts, byte-identical code. AGPL: the service is part of the same repo's licence family (see 8).
2. Build stamps `rwVer = sha256(app/rewriter.js + vendor/acorn/8.14.0/acorn.min.js + vendor/meriyah/7.4.2/meriyah.umd.min.js + wrapper version)` into `version.json` (`scripts/build-static.sh` already stamps `version.json`). The service computes the same value from the same three files at its image build. The app uses the server only when `rwVer` matches (see 3.5). That makes "deploy order" safe in both directions: a new app with an old server, or the reverse, just falls back.
3. Parity test (failing test first, as the repo rule says): a golden corpus (the repo's own scripts plus the real bundles used for the earlier `rweq.cjs` equivalence harness, kept in the audit scratch folder, not committed) run through the page function and the Node host, outputs must be byte-identical. This also guards the meriyah path (`webcompat`, retry as module).
4. Keep `lbImu` and the ES module post-steps in the app. The server never sees a page URL.

### 3.3 VPS service
- Name: `rwcache`. A third mode of the gate image, like the image lane (`GATE_MODE=img`, `src/img/lane.ts`, Hono, `RelayAuth` token check, `TokenBuckets`, `isPublicAddress` SSRF guard in `src/img/net.ts`). New `src/rw/` with the same shape. Compose service in `deploy/relay-vps/docker-compose.yml` as `profiles: ["rwcache"]`, so a normal `up` never starts it, with an nginx `/rw/` location resolved at request time. Rollback = stop the container; the app falls back by itself.
- Resources: `cpus: 0.5` for rewriting (images have 0.75, relay keeps 1.5: the box is oversubscribed by design, so the rw service must be the first to yield), `mem_limit` 512 MB, Node `--max-old-space-size=384`, one `worker_threads` worker doing the parse so the HTTP loop never stalls. Reject sources over 4 MB (fallback, see 7). Queue depth 16, then 503.
- Disk budget: start 3 GB for rewritten text (brotli-compressed at rest, quality 5, served `Content-Encoding: br` when accepted), 28 GB free today. Final number from G6 measurements. LRU by last access, size-capped like `lbMakeKV`.
- Endpoints (all need the relay token, same 5 minute token as the image lane, `plan` claim read from the token, never from the app):
  - `GET /rw/h/<token>/<sha256>/<rwVer>[/i]`: lookup. 200 + rewritten text, or 404.
  - `PUT /rw/h/<token>/<sha256>/<rwVer>[/i]`: fill. Body = gzip source. The server re-hashes, refuses on mismatch, rewrites, stores, answers 204. Only sent by the app when its own fetch satisfied the public rule (3.4).
  - `GET /rw/u/<token>/<url>`: URL mode. The server fetches the script itself without cookies, Referer or credentials (same fetch code as the image lane), applies the public rule to the response, rewrites, stores, answers with the rewritten text plus `X-LB-Src-Sha`, `X-LB-RwVer`. Saves the member's download too. This is also what the nightly pre-warm (G5) calls, from the VPS itself with a service token.
  - `GET /rw/ver`: returns `rwVer` and a few counters' names; used by the app's handshake.
- Response headers: `Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`, `X-Content-Type-Options: nosniff`, `Content-Type: text/javascript`, `Cache-Control: no-store` (the browser's own HTTP cache is not used; the app writes to its IndexedDB store and memo, which already exist).
- Cache key for URL mode: a metadata record `{urlKey -> srcSha, etag, lastModified, freshUntil, uaClass}` pointing at the content-addressed blob. Revalidation upstream with `If-None-Match`/`If-Modified-Since` when stale. Many URLs can share one blob.

### 3.4 The public-only rule
A response may be fetched by the VPS, stored and shared only when all hold (RFC 9111 gives the shared-cache rules, https://datatracker.ietf.org/doc/html/rfc9111 ; the Authorization, `private`, `s-maxage` and `public` points are confirmed by the RFC text found through search, `Set-Cookie` handling not confirmed there, so we simply refuse it):
- GET, status 200, no Range, request carried no cookie and no `Authorization` and no custom auth header;
- response has no `Set-Cookie`, no `Cache-Control: private` or `no-store`, no `Vary` other than `Accept-Encoding` (and `User-Agent` handled by the UA class below);
- response is `public`, or has `max-age`/`s-maxage` of at least 5 minutes, or is `immutable`; response without freshness information is not stored in URL mode (the app's own `lbCacheEvaluate`, line 3392, already encodes most of this: reuse its logic as the app-side check before any PUT);
- content type is JavaScript (`text/javascript`, `application/javascript`, `application/x-javascript`), size 16 KB to 4 MB.
App side extra: the app uploads (PUT) only when the libcurl request it made had no `Cookie` header and no auth header. Where the app attaches the cookie jar in `doFetch` (`saveCookieJar` at 2760 is the jar; the place where `Cookie` is added: not located, to be found in slice 3) is the single place to read "did this request carry cookies".
Hash lookups (GET by hash) need no rule: content-addressed, see 3.1.
User-Agent: some sites serve different bundles by UA. The VPS fetches with the member's UA string (the app sends it as a header on URL mode) and the metadata key includes a UA class (browser family + major), so a Chromebook Chrome gets Chrome's bundle. If a response has `Vary: User-Agent` and the class is unknown, do not store.

### 3.5 App protocol and fallback (`features.srvRewrite`, default false, member-invisible in the first release)
Inside `rewriteJsAsync` (line 10251), after the persistent store miss and before the Worker:
1. Preconditions: switch on, paid tier with the server-rewrite entitlement (Prime and Executive by the ladder), token alive (`LB_relayTok.left() > 20000`), our relay in use, handshake says `rwVer` equal to the app's (cached for the session, fetched once from `/rw/ver`), circuit breaker closed, script at least 64 KB (smaller scripts are cheap to rewrite in a Worker; a round trip costs more).
2. Lookup by hash with a budget of `min(1500 ms, 3 ms per KB)`. For scripts of 256 KB or more, start the Worker rewrite in parallel and use whichever returns first (cancel the other; the Worker result is also stored). For smaller ones, lookup first, then Worker.
3. Hit: `lbRwMemoPut`, `lbRwKV.put`, return. Stat `srvHit`.
4. Miss and eligible (3.4): after the Worker finishes, fire-and-forget `PUT` of the gzip source so the next member hits; never awaited, never retried, bounded (at most 2 in flight, 1 MB per second budget).
5. Any error, timeout, 429/503, bad `rwVer`, or a verify failure (see below): fall back to today's path, count `srvFail`; 5 failures in a row open the breaker for 2 minutes (same shape as `LB_imgLane.note`).
6. Integrity: the response carries `X-LB-Out-Sha` (SHA-256 of the rewritten text); the app checks it against what it received (cheap) so a truncated body never reaches `new Function`/blob. Also a quick structural check (balanced length marker: the server sends `Content-Length`; the app compares to bytes read).
URL mode (`/rw/u/`) is a second step, used first by the pre-warm and later by the app for URLs matching the "immutable or long max-age" shape, because it removes the download and the member rewrite together.

### 3.6 Priority lanes by tier
The token's `plan` claim picks the queue. Three queues, served by weighted round robin using the weights the gate already has in `PlanLimits.weight` (`~/limitless-gate/src/membership.ts`: Cardinal 1.5, Prime 2, Executive 3). Under no load, everybody is served at once; under load a Cardinal request waits behind Executive and Prime. Reads (hash lookup hits) are served from disk without queueing at all, because they cost almost no CPU. Only misses that need a rewrite queue. Per member: token bucket (like `TokenBuckets` in the image lane), suggested 20 rewrites a minute with burst 10, then 429. No hard CPU numbers are promised (Boss rule).
Entitlement options (Boss decides): the plan says Cardinal = shared cache + image shrink, Prime = + server rewrite. A cheap variant to consider: all paid tiers may READ rewritten hits (a disk read, almost free), only Prime+ may TRIGGER a rewrite. That keeps the ladder honest and gives Cardinal the pre-warmed top sites at no CPU cost. This is a suggestion, not a decision.

### 3.7 Failure modes and what happens
| Failure | Effect | Handling |
|---|---|---|
| Rewriter version drift (app vs server) | wrong or stale rewrite | `rwVer` handshake; mismatch = no server use; both parsers and wrapper in the version |
| Corrupt or truncated cached file | broken site for everyone who gets it | store output SHA-256, verify on read and in the app; on mismatch delete the entry and answer 404 |
| Poisoned fill | someone stores a bad rewrite | impossible by construction: the server rewrites from bytes it hashed itself |
| Site serves different bytes by UA, geo or A/B | wrong script for this member | URL mode keyed with UA class; hash mode cannot mismatch (the member's own bytes define the key) |
| VPS CPU queue (2 cores) | slower than local rewrite | lanes, budget timeout, parallel Worker race for big scripts, 503 at queue depth |
| Memory: AST of a large script in a 512 MB container | OOM kill of the service | 4 MB source cap, one worker thread, `--max-old-space-size`, container restart policy, relay unaffected (own container); measure first (not measured) |
| Disk full | writes fail | size-capped LRU, 3 GB start, statvfs guard refuses fills below 5 GB free |
| Service down | none visible | token/handshake fails, breaker, app rewrites itself |
| Privacy: private script uploaded by mistake | stored under its hash | cannot be read without knowing its content; app only uploads when no cookie/auth was sent; privacy line text needed (see 3.8) |
| Abuse: member uses `/rw/u/` as a free fetcher | bandwidth and SSRF | token required, JS-only content type, size cap, `isPublicAddress` checks, per-member bucket, counters not logs |
| Pre-warm pulls a site's script that changed in between | none | URL mode revalidates by validators |
| Cached output reaches an Ordinal member | free tier on our VPS | tier from token claim; Ordinal never gets a relay token |

### 3.8 Privacy line (draft for Boss, needs HALL legal change before switch-on)
Same family as the image-lane line: the relay's server rewrite service sees the address and text of public script files you ask it for (or a fingerprint of a script your browser already holds), keeps the rewritten copy for others, sends no cookies, does not know who asked, and only totals are counted. Everything else still travels encrypted to the site and the relay cannot read it. (Wording is a draft; legal text changes only with Boss.)

### 3.9 Counters for G6 (no URLs, no hosts, no members; aggregate only, printed every 10 minutes like the image lane)
`rw_req_hash`, `rw_hit_hash`, `rw_miss_hash`, `rw_put`, `rw_put_refused`, `rw_req_url`, `rw_hit_url`, `rw_fetch_up` (upstream fetches), `rw_bytes_src_in`, `rw_bytes_out`, `rw_bytes_saved` (source bytes the member did not have to download or parse), `rw_cpu_ms` (rewrite time), `rw_queue_ms_p50/p95` by plan, `rw_busy`, `rw_err`, `rw_verify_fail`, `rw_disk_bytes`, `rw_evict`, plus size buckets (16-64 KB, 64-256 KB, 256 KB-1 MB, over 1 MB) of hits and misses. Hit rate = hits / (hits + misses) per bucket; "bytes saved" and "member CPU saved" estimated as source KB x 8 ms (the measured Chromebook rate in `lbRwPump`) so a number for the promise exists without logging identities. The app can add its own local counters to `lbRw.stats` (`srvHit`, `srvMiss`, `srvFail`, `srvMs`) and send the daily totals with the existing `lbPerfSample` path (no URL, 1 in 5), which gives the true member-side gain.

### 3.10 How to test it
- Unit (Node, in the gate repo like `src/tests/imglane.test.ts`): parity corpus (3.2), token and plan enforcement, public rule table, fill hash mismatch, verify-on-read corruption, lane order under load, bucket limits, SSRF (reuse `net.ts` cases), disk cap eviction.
- App e2e (Playwright, `tests/e2e/`): mocked `/rw/` routes: hit, miss + PUT, timeout, 503, breaker, `rwVer` mismatch, off by default = no request (`context.route` proves it), module path still gets `import.meta.url` patched after a hit.
- Rehearsal stack (`npm run test:stack`, under `flock`): real service container, fixture site with a large bundle (add one fixture page copying Steam's shape: 1.9 MB script with 139 `location` edits, plus a second origin script); paid-like context; first visit (miss) against second visit in a fresh context (hit).
- Speed gate: 7 reps on fixtures, chromebook profile; judge `fx-app` and a new `fx-bigjs` warm-from-server visit. Real sites by tag (T1): `heavy-js` sites, in this order of expected benefit from the existing data: Steam, Discord (benchmark only), Kahoot, Reddit, Gemini, TikTok, Spotify, Twitch, Desmos, Scratch. Compare shown-time and longest task with the switch off and on, same night, per Release pace.
- No-break rule (section E): switch off by default; turned on only after Steam, the 10-site list and the full e2e suite pass with it on; rollback is the build flag or `docker compose stop rwcache`.

## 4. Three small release slices (effort in working days, Boss's 5 to 6 days total holds)

| Slice | Content | Effort | Risk | Gate |
|---|---|---|---|---|
| G4-1 Shared module | `app/rewriter.js`, `lbRwSource()` and the page use it, `rwVer` stamped in `version.json`, Node `vm` host and the parity corpus test, `_lbRwVer` becomes the full version (this invalidates the device rewrite caches once: say so in the release note) | 1.5 d | low: no server, no switch needed beyond a build flag; behaviour identical | e2e + parity; speed gate unchanged |
| G4-2 `rwcache` service | `src/rw/` in the gate repo, compose profile, nginx `/rw/` location, counters, lanes, unit tests, `GATE_MODE=rw`; not wired to the app | 2.5 d | low to medium: new container, not started by default; CPU and memory limits | gate tests, rehearsal with a stand-in app call |
| G4-3 App client | `features.srvRewrite` (default false), handshake, lookup, PUT, race for big scripts, breaker, Settings card for Prime+, counters; privacy line to Boss | 2 d | medium: touches `rewriteJsAsync`, the hot path | e2e, rehearsal, 7-rep gate, real Chromebook run before enabling |
After G4-3: G4-4 URL mode + nightly pre-warm of top-site bundles (that is G5, 1 d) and the G6 hit-rate review after a week of data.

## 5. Open questions Boss may want to answer
- Are Cardinal members allowed to read server-rewritten hits (cheap), or only Prime+ (the ladder as written)?
- Is a 3 GB disk budget for the rewrite cache acceptable next to the image cache (1 GB)?
- The privacy text and HALL legal change must precede the switch-on, as for the image lane.

## Sources used
- https://raw.githubusercontent.com/titaniumnetwork-dev/Ultraviolet/main/README.md
- https://github.com/MercuryWorkshop/scramjet/wiki
- https://developer.puter.com/blog/how-I-ported-the-web-to-the-web/
- https://cdn.jsdelivr.net/npm/rammerhead@1.2.64/CHANGELOG.md
- https://raw.githubusercontent.com/DevExpress/testcafe-hammerhead/master/README.md
- https://raw.githubusercontent.com/titaniumnetwork-dev/Corrosion/main/README.md
- https://datatracker.ietf.org/doc/html/rfc9111
- Local: `~/Browser/app/main.js` lines 3392, 9936-10026, 10109-10290, 11309; `~/Browser/docs/1.1/SPEED-AUDIT.md` 1.2, 1.3, 4, 4b; `~/Browser/docs/1.2/IMGLANE.md`; `~/Browser/docs/1.2/SPEED-NEXT.md` N2 table; `~/limitless-gate/src/img/lane.ts`, `src/membership.ts`.
- The scramjet mintlify pages returned HTTP 410 when fetched directly; their content in this note comes from the search summary only.

Last verified: 2026-11-18
