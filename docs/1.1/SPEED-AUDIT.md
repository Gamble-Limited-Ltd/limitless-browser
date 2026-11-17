# Limitless speed and stability audit (2026-11-16)

Branch `audit/speed-2026-11-16` (worktree `~/gll-worktrees/Browser-speed-audit`, base `release/1.1.0` 7f23ee5). Brainstorm and
measurements asked for by Boss: page and image loading on heavy sites (Steam, Reddit, school sites, web apps), freezes, RAM,
the relay, bot checks and Google sign-in. Nothing here is deployed. Everything measured is marked with how it was measured.
Detail files: `docs/1.1/audit/PROFILE-RESULTS.md` (client profile), `docs/1.1/audit/BOTCHECK-GOOGLE.md` (bot checks, Google),
`~/gll-worktrees/Browser-worker-proto/docs/1.1/audit/WORKER-PROTO.md` (libcurl in a Worker).

Boss's answers that frame this (2026-11-16): members use school Chromebooks near home; the "crash" is a "Page unresponsive"
dialog or a frozen UI (not an out-of-memory tab crash); sites that matter: image-heavy (Steam, Reddit), school sites and games,
web apps; server-side work that needs plaintext is fine as an opt-in for paid plans; home IP for hard sites is a look-into, no
plan; no new spending; VPS kernel tuning, real measurements and prototypes are allowed.

## 0a. Overnight results (2026-11-17): what changed the picture

All runs: rehearsal stack, chromebook profile (4x CPU, 1366x768, 10/5 Mbit/s, 40 ms), `tests/stack/profile.spec.js` unless named,
busy VM (another session tested at the same time, so wall times move; compare reps of the same night only). Prototypes are in
worktrees, nothing is committed or deployed.

1. **The Steam "Page unresponsive" is ours, and it is fixed in a prototype.** The 22 to 26 s task is the browser parsing one line
   of the document we build: `<script type="module" src="data:text/javascript;base64,...">` holding Steam's 1.9 MB `main.js` as a
   2.6 MB data: URL (the frame document is 12.98 MB; Steam's own page is 1.0 MB). Proof:
   - Chrome trace (trace3, waits for the task to end): one `ParseHTML` of 25.0 s over lines 20122 to 20123 (app page: 23.5 s, lines
     31744 to 31745). Earlier traces missed it because tracing stopped at "shown + 10 s" while the task was still running.
   - Plain Chromium, same throttle, minimal pages, 2 reps each (`scratchpad/parsetest`): that one module tag alone 23.9 to 25.6 s;
     the same bytes from a short URL 0 s; our 3.6 MB import map alone 0.5 to 0.6 s; a 2.6 MB plain attribute 0.2 s.
   - Native Steam (plain Chromium, direct, same throttle): longest task 2.4 s (front page), 1.2 s (app page).
   - Fix (worktree `Browser-rw-proto`): ES modules run from `blob:` URLs over http(s) (the frame shares our origin; `file://` keeps
     data:, which was the code's original reason). In-app, 2 reps: Steam front page longest task 22.6 to 26.0 s -> 1.9 and 6.7 s, shown
     16.6 s -> 13.1 to 14.5 s, page text 64 -> 5,245 chars; app page 22.5 to 25.6 s -> 0.8 to 1.1 s, shown 40 to 44 s -> 30 to 34 s.
2. **Kahoot and Discord now show.** Same worktree (rewriter join + size-scaled Worker timeout, CSS as blob: URLs, module blobs):
   Kahoot never shown in 90 s with a 650 MB heap -> shown at 46 s, longest task 5.3 s, heap 82 to 92 MB; Discord never shown with up
   to 1.28 GB -> shown at 57 to 60 s, longest task 2.1 to 2.8 s, heap 33 to 41 MB. Still slow to show; no longer frozen.
3. **Pages load parts directly, outside the relay** (new counter in the profile spec: any request from the browser to a non-local
   host). Today: Coolmath 30, Reddit 10 to 15, Steam 2, Wikipedia 1; with the module fix Steam's own code runs and the count rises to
   59 (front page) and 115 (app page, which also navigated the frame to the real site because a lazily `import()`ed chunk ran
   unrewritten). At school these are filtered (missing parts) and they show the member's IP. Our test VM has open internet, so every
   suite so far passed with these leaks. Causes, all confirmed by URL: static and runtime `<link rel=preload>`, images created by page
   JS (the browser fetches before our MutationObserver swaps the src), ES module chunks loaded by `import()` (a documented runtime
   shortcut), inline `<style>` images (only fonts were inlined), a failed module fetch setting its real URL.
4. **One mechanism closes every hole (item 2e):** a service worker sees every request of a document it controls, cross-origin
   included. Tested in Playwright Chromium: a `blob:` frame is NOT controlled (all requests went to the network), but a frame whose
   document is served by the service worker from a same-origin path (`/~lb/doc/<id>`) is, and the worker answered a static
   cross-origin `<img>`, a JS-created image, `fetch()` and a cross-origin `import()`. Design work is still open (see 2e).
5. **Every page pays a second task after it shows** (2 to 4 s on Coolmath, Reddit, Wikipedia): the blocklist load is part of it
   (0.6 to 0.9 s long task at 4x, 224k entries split and put in a Set on the main thread); the rest is the page's own work.
6. **Combined tree on the media sites** (`sites-media.spec.js`, 2 reps, against the sweep's own latest baseline batch): YouTube home shown
   47 to 49 s -> 14 to 15 s and its longest task 32 s -> 7.7 s; Spotify shown 32 s -> 11 s, longest task 21 to 22 s -> 3.5 s (still a
   blank page); Gemini shown 17 to 18 s -> 6.7 s (still blank); Twitch unchanged (a 28 s task of another cause, being traced);
   Instagram the same (one rep failed in the harness). Load on the VM differed between the batches: treat these as direction, re-measure
   before quoting.
   Native Chrome on the same throttle, longest task (2 reps): YouTube 6.8 to 7.8 s, Spotify 3.0 to 3.7 s, Coolmath 3.5 to 3.6 s,
   Twitch 3.7 to 4.0 s. So with the combined tree YouTube (7.7 s) and Spotify (3.5 s) are at native level and Coolmath close (4.0 to
   4.2 s). Twitch is not: its 28 s is Twitch's own code (a 17 s React render and a 10 s webpack module load, Chrome trace and CPU
   profile) that native Chrome runs in pieces of 4 s or less. Ruled out: React hydration failure (the profile spec now counts React
   errors #418 to #425 and "hydrat" messages: 0 on Twitch, Coolmath, Spotify, YouTube, Reddit). After the font and 204 changes one
   untraced rep showed Twitch's longest task at 4.2 s (native level), but the 28 s rep was traced (tracing adds cost) and Twitch still
   shows only its shell (40 chars of text): direction only, re-measure.
7. **Combined tree on the games and school sites** (`sites-games.spec.js`, 2 reps, against the sweep's baseline batches): Kahoot join
   never shown with a 22 to 25 s task -> shown in 1 of 2 reps at 44.6 s, longest task 1.1 to 5.4 s; Wayground join 0 of 2 -> 2 of 2
   loaded (32 s), longest task 12 s -> 1.1 s; Desmos shown 28.9 s -> 7.8 s, longest task 20.5 s -> 4.6 s; Gimkit join 19.6 s -> 15.4 s,
   4.1 s -> 1.0 s; Scratch 60 s freeze -> 13.3 to 13.5 s, 1 of 2 -> 2 of 2 loaded, but its heap rose 202 MB -> 290 to 326 MB and it
   showed later (15 s -> 20.8 s); Chess.com main thread unresponsive -> 2 of 2 loaded at 15.4 s (a 19 s task is left). Unchanged:
   Kahoot create (1,016 font requests, 14 MB of fonts: every format of every face was fetched; fixed since, re-run pending), Agar,
   Roblox, Wordle.
8. **Site sweeps:** `docs/1.1/audit/SITES-MEDIA.md` (30 social, media, shopping and app sites, finished) and `SITES-GAMES.md`
   (games and school sites, if present; the agent was still running at the time of writing).

## 0. Ranked list (value for effort)

| # | Item | Where | Effort | Expected effect | Status |
|---|---|---|---|---|---|
| 0 | ES modules as `blob:` URLs over http(s), not multi-MB `data:` URLs; a module that cannot be proxied gets no src | `_toDataModule`, import map, module src (`app/main.js` 10845-10912, 10978-11015) | 10 lines | Steam: the 22 to 26 s "Page unresponsive" task gone (longest 0.8 to 6.7 s); the doc shrinks by about 6 MB | **LANDED 2026-11-17** on `slice/1.2-speed-land` (ported from `Browser-rw-proto`, e2e `esm.spec.js`; no switch, `file://` keeps data:) |
| 1 | Rewriter: apply edits with one join (not slice per edit) | `app/main.js` 9670-9673 | 5 lines | Byte-identical output on 23 real bundles (Kahoot, Discord, YouTube, Roblox, Reddit, Steam); total 8.0 s -> 5.0 s in Node | **LANDED 2026-11-17** |
| 2 | Rewriter: Worker timeout = 3 s + 8 ms per KB; a timed-out Worker is replaced, Workers stay on; a script over 256 KB is never rewritten on the main thread | `app/main.js` 9863-9908 | small | Kahoot: no fallback in the 2 reps where the stats could be read (was 1 per load, then Workers off for the session) | **LANDED 2026-11-17**; the 256 KB skip leaves that script unrewritten (did not trigger in any run) |
| 2b | CSS fonts and images as `blob:` URLs (no base64), one fetch per URL per page, skip `@font-face` subsets outside Latin and the private use area, inline `<style>` through the same function | `rewriteCssUrls`, inline style loop | medium | Discord heap up to 1.28 GB -> 33 to 41 MB and the page shows; Kahoot 650 MB -> 82 to 181 MB | **LANDED 2026-11-17**, kill switch `features.cssBlobs` (build `LB_FEATURE_CSSBLOBS`); Coolmath A/B with the switch, 3 reps each: no 10 s+ task either way (max 4.0 to 4.2 s), so the earlier 10 to 15 s tasks (Coolmath's own React code) were not caused by 2b; shown 4.6 to 4.9 s off vs 5.1 to 5.2 s on (one 7.8 s), too few reps to call |
| 2f | Fonts the browser asks for, not every face declared: one file per `@font-face` (woff2 > woff > ttf/otf; done in the prototype); subsets limited to Basic Latin + Latin-1 and the private use area (done); next, lazy faces through the FontFace API (empty `blob:` src, `document.fonts` `loadingerror` names the faces the page really needs, fetch those through the proxy, `document.fonts.add`) or the 2e lane | `rewriteCssUrls`, runtime | small (first two), medium (lazy) | Gimkit join shown 15.4 s -> 6.3 s, page weight 20.3 MB -> 3.4 MB (fonts 19.4 -> 2.4 MB); Wordle 17.0 -> 13.4 s; Roblox 23.9 -> 20.1 s; Kahoot join with Latin-1 only: 973 -> 380 font requests, shown 44.4 s -> 23.8 s in 2 of 2 reps (it never showed at baseline; it declares 1,345 faces for its theme picker, the browser would fetch a handful); Kahoot create still not shown | first two **LANDED 2026-11-17** (lazy faces still an idea) |
| D | Direct loads: drop static `<link rel=preload>` (loadCSS becomes a stylesheet), runtime preload links keep only the URL, a failed stylesheet or module never falls back to the real URL, a blocked dynamic script fires error | go() link cleanup, runtime `href`/`src` setters | small | Coolmath 30 -> 23 direct loads; the rest needs 2e or the `import()` helper | **LANDED 2026-11-17** (gated by `noPrefetch`), partial |
| D2 | `import()` helper: the AST rewriter turns `import(x)` into `__lbImport(x, base)` that fetches through the proxy, rewrites and imports a `blob:` URL | `rewriteLocationRefs`, runtime | medium | Steam's lazy chunks stop loading directly and stop navigating the frame to the real site | **LANDED 2026-11-17**, kill switch `features.importHelper` (`LB_FEATURE_IMPORTHELPER`), e2e `import.spec.js`; not yet re-measured on Steam's app page (direct-load counter) |
| 2c | Fetch queue: page-critical requests before images, images by viewport, check connection reuse (each new connection about 1.5 to 2 s at Chromebook speed) | `MAX_CONCURRENT` 2817, `LB_CONN_DEFAULT` 2816, cap 5575 | medium | Steam app page: 306 requests, 140 to 213 waiting, 6.7 s average queue wait; Reddit: 5.8 s median per image with an empty queue | **LANDED 2026-11-17**, kill switch `features.qPrio` (`LB_FEATURE_QPRIO`), e2e `qprio.spec.js`: a quarter of the slots (at most 4) stay free of images while page-critical requests are being queued, top images sort first; connection reuse not checked; not re-measured on Steam or Reddit |
| 2e | Service worker document lane (big bet): the frame document is served by the service worker from `/~lb/doc/<id>`, so every request of the page (cross-origin images, fonts, CSS `url()`, `fetch`, `import()`, preloads) reaches the worker, which fetches through libcurl | `sw.js`, frame load in `go()` | large | closes every direct load; lets the browser do lazy images, `unicode-range`, CSS and module resolution natively; would remove most of 2b and D | **feasibility proven** (blob frames are not controlled; SW-served frames are); open: libcurl from the worker (bounce to the page or libcurl in the worker), worker lifetime, first page before the worker controls, WebSockets stay hooked |
| B | Blocklist: before the big list loads (the whole first page) match the fallback list on host labels, not substrings of the URL; build the 224k Set off the main thread | `shouldSkip`, `LB_blocklist` | small | Twitch's app chunk no longer dropped (299 vs 287 requests), threads.net and `uploads.` hosts; 0.6 to 0.9 s task after each first page | **LANDED 2026-11-17**: label match, and the Set is built in 4 ms slices with yields (`features.blocklistYield`, build `LB_FEATURE_BLOCKLISTYIELD`; a Worker would make `hostBlocked` async); the compact hash array is still an idea |
| 3 | VPS TCP: BBR, fq, no slow start after idle, 16 MB buffers, notsent_lowat 128 KB | VPS host + compose `sysctls` | done (host), branch (compose) | 2 MB burst after idle: 490 ms to 295 ms (-40 %) | APPLIED to the VPS 2026-11-16 |
| 4 | Rewriter: one AST walk instead of two; faster parser (meriyah, ISC, about 2x acorn) | `rewriteLocationRefs` + vendored lib | medium | parse 1.3 s to 0.62 s on Steam's bundle | first half **LANDED 2026-11-17** (one AST walk, output byte-identical on 23 real bundles plus this repo's scripts, 32 files, 0 mismatches; no switch: identical output); meriyah (second half) not built |
| 5 | libcurl.js (TLS, HTTP/2, gzip/brotli) off the main thread, in a Worker | glue + `doFetch`/router | large | see WORKER-PROTO.md | prototype |
| 6 | Native image lane for paid plans (opt-in): images load as plain `<img src>` from the VPS, which fetches, caches and re-encodes them | gate relay mode + nginx + runtime | large | Steam images 72 % smaller, no libcurl or base64 work per image in the page | measured cost, not built |
| 7 | Memory budget by device: caches sized from `navigator.deviceMemory`; blocklist as a compact hash array | `app/main.js` | small | up to about 150 MB less on a 4 GB Chromebook | **LANDED 2026-11-17** (caches only, `features.memBudget`, build `LB_FEATURE_MEMBUDGET`; blocklist hash array not built) |
| 8 | Google sign-in: real popup/opener bridge for `window.open`, Trusted Types handling | frame runtime `app/main.js` 8036 | medium | "Sign in with Google" on other sites; Google's own login stays best effort | research |
| 9 | Bot checks: home egress for challenge-prone hosts (Boss's decision), PTR, keep `cf_clearance` | gate + router | medium | VPS challenges 10/30 vs 2/30 from home; SITES-MEDIA: ChatGPT, Canva, Character.ai challenged and IMDb, Crunchyroll blocked from the VPS | research |
| M | Media and app fixes from SITES-MEDIA.md: error card for empty 4xx/5xx and challenge pages (X, Tumblr, IMDb sit blank at "Ready"), stream media bodies instead of whole responses (YouTube fetched 43.7 MB to append 2.9 MB), de-duplicate repeated script fetches (Gemini 58 MB for 15 MB unique) | see that file, section 7 | small to medium | per site | **partly LANDED 2026-11-17**: error card for empty 4xx/5xx and AWS WAF / "Checking your browser" pages (`features.errCard`), script memo per navigation (`features.scriptDedup`); streaming media bodies NOT built (needs a chunked reply message, Range-aware `doFetch` and the cache, deadline and speed-cap paths changed: too large to land safely); Gemini's repeat cause still untraced |

Spotify and Twitch: the integrity and blocklist fixes are correct but not enough (Spotify still blank, Twitch still shell only, with a
26 to 29 s task of the same class as Steam's: retest both with item 0).

## 1. What was measured today

### 1.1 VPS network (applied)
Before: `cubic`, `pfifo_fast`, `rmem_max`/`wmem_max` 208 KB, `tcp_slow_start_after_idle=1`, `tcp_notsent_lowat` unlimited.
Test: one kept-open SSH connection from the Gamble VM, VPS sending (the direction member traffic goes); 5 reps of a 2 MB burst
after 3 s idle (the pattern of a relay WebSocket during browsing), 3 reps of 40 MB bulk.

| | 2 MB burst after idle (ms) | 40 MB bulk (Mbit/s) |
|---|---|---|
| before | 493, 499, 600, 478, 480 | 111.6, 118.5, 112.1 |
| after | 302, 292, 280, 296, 318 | 111.5, 112.5, 110.2 |

Bulk is the home line's download ceiling (about 104 to 118 Mbit/s), so it cannot move in this test. The burst is what a page
load looks like on an idle WISP socket, and it is 40 % faster.
- Host: `/etc/sysctl.d/90-limitless-net.conf` and `/etc/modules-load.d/limitless-bbr.conf`; old values saved in
  `/root/sysctl-before-limitless-net.txt`; qdisc `fq` on eth0.
- Containers have their own network namespace and do NOT inherit slow start, notsent_lowat or buffer sizes. They were set live
  (`nsenter`, no restart, no socket dropped) in `tls`, `relay` and `relaygate`; that is lost when those containers are recreated.
  The permanent form is the `x-net-sysctls` block in `deploy/relay-vps/docker-compose.yml` on this branch (validated with
  `docker compose config`), picked up at the next VPS deploy.
- Rollback (VPS, as root): `rm /etc/sysctl.d/90-limitless-net.conf /etc/modules-load.d/limitless-bbr.conf && sysctl -p /root/sysctl-before-limitless-net.txt && sysctl -w net.core.default_qdisc=pfifo_fast net.ipv4.tcp_mtu_probing=0 && tc qdisc replace dev eth0 root pfifo_fast`, then recreate the three containers.
- Not measured: the full member path through `tls` with a real token (needs a relay token from prod); the host test proves the mechanism.

### 1.2 Freezes: the script rewriter (measured in the app on Kahoot; bench on Steam's bundle)
In-app profile (`docs/1.1/audit/PROFILE-RESULTS.md`, rehearsal, chromebook profile, 2 reps per URL, busy VM): Kahoot `LB_rewrite.stats()` =
`{worker:5, fallback:1, disabled:true}` in both reps; the 5.5 MB bundle ran through `rewriteLocationRefs` on the main thread (13 to 17 s self,
one 24 to 29 s task) and the page never showed in 90 s. **Steam is different:** its 22 to 26 s task is browser-native work caused by our
module `data:` URL (item 0, section 0a); the bench below shows Steam's bundle would hit the same rewriter path on a slower device.
Steam's front page (fetched from home, 2026-11-16): 990 KB of HTML, 167 `<img>`, about 6000 elements, 13 inline scripts (one of
547 KB without the word `location`, so it is skipped), 10 external scripts. The big one,
`store.akamai.steamstatic.com/public/javascript/applications/store/main.js`, is 385 KB on the wire and **1867 KB decoded**.

The app's own `rewriteLocationRefs` (extracted from `app/main.js`, run in Node 22 on the busy Gamble VM, load about 5):

| Step on store/main.js (1867 KB, 139 edits) | ms |
|---|---|
| acorn parse | 1277 to 1630 |
| `walk.full` (declared check) | 108 to 219 |
| `walk.ancestor` (find edits) | 163 to 271 |
| apply edits: `out.slice() + text + out.slice()` per edit | **864 to 877** |
| apply edits with one array join | **4 to 6** |
| whole function | 2451 (x4 CPU, Chromebook profile: about 9.8 s) |

How that becomes "Page unresponsive" (`app/main.js` 9863-9908, seen on Kahoot): the bundle goes to a Worker with a fixed 3 s timer
(`lbRw.timeoutMs`). At Chromebook speed the Worker needs about 10 s, so the timer fires, `lbRwDisable()` turns Workers off for the
whole session, every queued script fails over, and `rewriteLocationRefs(src)` runs **synchronously on the main thread** for this
bundle and every later big script. The app UI and the proxied page share that thread, so the tab freezes for about 10 s per
bundle. The persistent rewrite cache helps only on a repeat visit with the same bundle hash.

Parser alternatives on the same file (same machine): meriyah 6 `parseModule` 622 to 1026 ms (ESTree, ISC, pure JS);
`@oxc-parser/wasm` 0.60 4284 to 5515 ms including handing the AST to JS (fast in Rust, slow across the boundary, so it only pays
if the whole rewrite runs in WASM); acorn tokenizer alone 213 ms (580k tokens; not enough on its own, the `__lbSafe(` insert
needs the start of the member expression).

Fix order: (1) join instead of slice per edit, (2) fold the declared check into the one ancestor walk, (3) timeout scaled by size
(for example 3 s + 8 ms per KB at the measured Chromebook rate) and a timed-out job keeps its Worker instead of disabling all of
them; never rewrite a script over 256 KB on the main thread: show the page with that script delayed, or skip the rewrite for it
and let the runtime `__lbLoc` shim catch what it can, (4) meriyah behind a switch. Estimated result for Steam's bundle: about
0.8 s unthrottled, about 3 s on a Chromebook, all off the main thread.

### 1.3 Images (Steam, real files)
79 of the front page's images (4.27 MB), fetched from home with the app's AVIF/WebP `Accept` header: **78 came back as JPEG**.
Steam's CDN ignores `Accept`, so the 1.0 `imgAccept` saving does nothing there. Median width 462 px, max 1920.
Re-encoded with sharp (libvips), one thread:

| Output | Size | ms per image, Gamble VM (E5-2670) | ms per image, VPS (E5-2690 v4, `--cpus 1`) |
|---|---|---|---|
| original JPEG | 4.27 MB | | |
| WebP q75, same size | 1.22 MB (-72 %) | 24.6 | 13.5 |
| WebP q70, max 683 px wide | 1.03 MB (-76 %) | 21.9 | 11.7 |
| AVIF q50 | 0.77 to 0.99 MB (-77 to -82 %) | 195.6 | 101.4 |

AVIF costs about 8x the CPU for a few points more: not worth it on a 2 vCPU box. One VPS core does about 74 WebP images a second,
about 32 Mbit/s of JPEG in and about 9 Mbit/s out. That is a few paid members at once, more with a shared cache (every member
sees the same Steam capsules).

### 1.4 Memory (static, Node heap)
- Blocklist: 223,869 hosts in a `Set` = **20.8 MB of JS heap** (4.4 MB file). A sorted `Uint32Array` of 32-bit hashes is 0.9 MB
  (a false match rate of about 1 in 19,000 per lookup, acceptable for an ad list), or keep the Set inside a Worker.
- Caps that live in the same renderer as the proxied page: response memory cache 96 MB, Instant Back 64 MB, rewrite memo up to
  24 M chars (about 48 MB as UTF-16), page blobs, log ring. Up to about 230 MB of caches next to the page, on Chromebooks that
  often have 4 GB. Proposal: scale with `navigator.deviceMemory` (4 or less: memCache 32 MB, Instant Back 24 MB, memo 8 M chars).

## 2. Client ideas (Chromebook CPU is the bottleneck)
- **C1 libcurl in a Worker** (item 5): TLS records, HTTP/2 frames and brotli for every request run in WASM on the main thread today
  (`new libcurl.HTTPSession()` in `app/main.js` 998). Prototype (`proto/libcurl-worker` branch, WORKER-PROTO.md): libcurl.js 0.7.5 runs in a
  dedicated Worker through a real epoxy relay (upstream README: works in workers, no COOP/COEP; two shims needed: `self.window = self`
  only after `importScripts`, and the wasm URL must not read `document.baseURI`). 70 requests (60 images of 50 to 200 KB, 10 gzip scripts,
  10.8 MB, plain http through the relay), medians of 3 at 4x CPU:

  | | main thread (today) | Worker |
  |---|---|---|
  | main-thread busy | 1783 ms | 94 ms |
  | longest task | 78 ms | none over 50 ms |
  | worst UI stall | 100 ms | 6 ms |
  | wall time | 2265 ms | 1727 ms (optimistic: CDP throttling does not slow Workers) |

  The work moves, it does not shrink: expect about the same wall time on a real Chromebook, but a UI and page that stay responsive while
  images stream. Real https adds mbedTLS decrypt, so real sites move more work. Call sites: libcurl glue, `LB_openRelaySocket`/`LB_relayTok`,
  the router (`LB_makeRouter`, `LBTransport`) into the Worker, `LB_swapSession`, `lbApplyConnections`, `LB_dl`, `doFetch`, error class rebuild
  (`{name, message}` across the boundary), downloads streaming with backpressure, `benchmarkWispPool`, boot. `runQueue` and `LB_speedCap`
  stay on the main thread. Estimate: 5 slices, 5 to 6 days, router slice the riskiest. Do it behind a `curlWorker` switch with the main-thread
  path as fallback; measure once on a real Chromebook before the router slice.
- **C2 the rewriter fixes** above (items 1, 2, 4).
- **C3 HTML parse**: Steam's 990 KB document goes through `DOMParser` and serialisation on the main thread. `DOMParser` cannot run in a
  Worker; a Worker parser (htmlparser2, MIT, small) could do the attribute rewriting off thread. Measure first in PROFILE-RESULTS.md.
- **C4 yield during long work**: break long loops (processing thousands of elements, CSS rewrites) with `scheduler.yield()` or
  `setTimeout(0)` every few ms so Chrome never shows "Page unresponsive" and the UI stays usable even when a page is heavy.
- **C5 memory budget** (item 7).
- **C6 lazy subsystems** (inspector, extensions, PDF viewer out of the 1.2 MB `app/main.js`): already planned, saves parse time at boot.

## 3. Relay and network ideas
- **R1 TCP tuning**: done (1.1).
- **R2 sockets**: 4 WISP sockets per tab; one lost packet stalls every stream on that socket (head-of-line blocking over TCP). With
  BBR and `notsent_lowat` the stall is shorter; 6 sockets for paid tiers is cheap to try (the gate's per-user socket cap is 8).
- **R3 relay software**: epoxy-server pinned `0c11678` is one commit behind upstream (a CA change only); libcurl.js 0.7.5 is current.
  No gain from upgrading.
- **R4 relay location**: members are near home; the VPS is in Buffalo (46 ms from the VM). No new spending, so the VPS stays. The home
  relay (low latency, residential IP, 21 Mbit/s upload) could carry small latency-bound and challenge-prone requests; see section 6.

## 4. Server offload for paid plans (opt-in, the server sees plaintext)
Boss: acceptable as an opt-in for paid plans. Today the relay only forwards encrypted bytes; each of these changes that for what it covers,
so each needs its own switch, a privacy line in the legal text, and the gate rule "no per-member destinations" kept (aggregate only).
- **S1 native image lane** (item 6): the frame's `<img>` gets `https://<relay host>/i/<signed short-lived token>/<url>`; the VPS fetches the
  image without cookies, caches it (disk LRU), re-encodes to WebP when it is a JPEG/PNG over about 30 KB, and serves it over HTTP/2.
  The browser then loads and decodes images natively, off the main thread, with its own cache, and libcurl, postMessage and blob work per
  image disappear. Fallback to the normal path on error (sites that need cookies or a Referer for images). Cost: measured in 1.3.
- **S2 shared rewrite cache**: the VPS fetches a public script by URL, rewrites it once and serves the rewritten text keyed by the source
  hash, so the 10 s Chromebook rewrite of Steam's bundle happens once for everybody. Only public, cookie-less script URLs.
- **S3 server-side HTML pre-processing**: heavier; parse and rewrite the document on the server. Cookies and logins make it hard; not now.
- Capacity: the VPS has 2 vCPU and the relay already holds 1.5 of them as a limit; image re-encoding needs its own CPU limit (for example
  0.75) and a per-member rate so it never slows the relay.

## 4b. Tiers and advertising (Boss, 2026-11-16: big speedups go into advertising; server-side features restricted by tier)
Proposal for Boss to decide; numbers are starting points to measure, not promises.

| Feature | Ordinal (free, public relays) | Cardinal | Prime | Executive | Why this split |
|---|---|---|---|---|---|
| Client fixes (rewriter, Worker libcurl, memory budget, yields) | yes | yes | yes | yes | no server cost; the "no more freezes" headline is for everyone |
| VPS TCP tuning | n/a (public relays) | yes | yes | yes | already live on our relay |
| Shared rewrite cache (S2) | no | yes | yes | yes | cheap CPU, one rewrite serves all |
| Native image lane, pass-through + shared cache (S1 without re-encode) | no | yes | yes | yes | low CPU, saves member CPU |
| WebP re-encode of images (S1) | no | Data saver only | yes | yes | about 13.5 ms of VPS CPU per image; budget per member (for example images per minute) and a total CPU limit |
| Home egress for challenge-prone hosts (if Boss says yes) | no | no | yes | yes | home upload is 21 Mbit/s; keep the list short |

Rules for advertised claims (repo rule: no invented facts): every number in an ad comes from a dated before/after run of the same harness
(`npm run test:speed` fixtures on the chromebook profile, `tests/stack/profile.spec.js` and the named real sites), states the device profile and
the median, and is re-run before each release that keeps the claim. Candidates once built and re-measured: Steam without the "Page unresponsive" freeze (prototype:
longest task 22 to 26 s -> under 7 s), Kahoot and Discord show instead of freezing (prototype: shown at 46 s and 57 to 60 s, were never shown in
90 s), Discord's memory from up to 1.28 GB to about 40 MB (prototype), page bursts on our relay 40 % faster after idle (measured), images on
paid tiers up to 72 % smaller (Steam, measured). A privacy line such as "nothing loads outside Limitless" is NOT true today (section 0a item 3)
and must not be used until the direct-load counter reads 0 on the named sites. Claims about other people's relays or named competitors stay out (PAID-TIERS-PLAN rule).

## 5. Not doing (and why)
- AVIF re-encoding on the VPS: 8x the CPU of WebP for a few points.
- Swapping the relay software: already current.
- New paid infrastructure: Boss, no new spending.

## 6. Bot checks and Google sign-in
See `docs/1.1/audit/BOTCHECK-GOOGLE.md`. Standing line (docs/1.1/PLAN.md, 2026-11-16): no CAPTCHA solving or clicking, no IP rotation,
no residential proxy services, no fingerprint that is not the member's own browser's.

**Google sign-in.** accounts.google.com serves the full sign-in page (200, about 1.25 MB, email field present) to curl from home and from the
VPS, so neither the IP nor the request is refused at the door; the failure is in our page runtime. Causes found in `app/main.js`:
`window.open` in the frame runtime (8036) navigates the same tab and returns a dummy window with no opener and a no-op `postMessage`, so every
"Sign in with Google" popup on third-party sites, One Tap and FedCM cannot work by design; Google sends `require-trusted-types-for 'script'`,
a likely clash with the script rewriting (not yet proven in a browser); WebAuthn and passkeys are absent. Separate from that, Google's own
policy blocks sign-in from embedded browsers ("This browser or app may not be secure", support.google.com/accounts/answer/7675428), which we
cannot honestly get past, so Google account sign-in should be labelled best effort. Next step (allowed): a Playwright trace of the real in-app
failure, then a real popup bridge (second tab with `opener` and `postMessage` relayed) and Trusted Types handling.

**Bot checks.** 15 member sites, 2 reps, 1.1 headers, curl TLS: home 28 ok and 2 challenged (Etsy); VPS 18 ok, 10 challenged (Quizlet, Canva,
ChatGPT, Medium, Etsy), 2 blocked (Reddit). Steam, Discord, Khan, Kahoot, Coolmath, Twitch, Roblox, Spotify, Pinterest were clean from both, so
the 1.0 baseline's Khan "Client Challenge" and the Discord and Kahoot timeouts come from libcurl.js's handshake or our runtime, not the IP. The VPS
is on no blocklist (Spamhaus ZEN, Barracuda, SpamCop), its PTR is the generic `107-173-50-59-host.colocrossing.com`, no IPv6.
- Allowed: capture the real libcurl.js ClientHello (to know, not to fake), set the PTR to `relay.taps-holdings.org` (Boss, RackNerd panel),
  keep the challenge cookie (`cf_clearance`) when the member solves a challenge themselves, an honest "this site checks for bots" card.
- Needs Boss's decision: home egress for a short host list (reddit, quizlet, canva, chatgpt, medium, etsy). Estimate (page weights, no prod data
  read): 0.2 to 0.6 GB a day per 10 members for their HTML and API only; all traffic would be 5 to 15 GB a day per 10 members without video and
  saturate the 21 Mbit/s upload at video peaks, so not all traffic. Abuse reports would reach the home ISP.
- Out of scope: TLS fingerprint matching, IP rotation, residential proxies, solver services.

Last verified: 2026-11-17

## 7. Prototypes, harness and how to reproduce (2026-11-17)
- `~/gll-worktrees/Browser-rw-proto`, branch `proto/rewriter-2026-11-17` (base 7f23ee5, uncommitted): items 0, 1, 2, 2b (switch `cssBlobs`), 2f (one font per face, Latin-1 subsets), the frame fetch fix for 204/205/304 (`new Response` with a body throws for those statuses; from SITES-GAMES), and the compat patch (D, B). Tests changed or
  added: `tests/e2e/worker.spec.js` (timeout keeps Workers on; over 256 KB is skipped, not cached), `s3-css.spec.js` (blob: URLs, one blob
  per URL, subsets), new `esm.spec.js`. Passing: worker, s3-css, s3-pagecache, s3-back, compat, pipeline, s3, esm (39 tests).
- `~/gll-worktrees/Browser-compat-proto`, branch `proto/compat-2026-11-17` (uncommitted): items D and B (label match), integrity removal on
  dynamic scripts. Tests: `blocklist.spec.js` (new fallback case), `compat.spec.js` (new preload case, no direct request). 26 pass.
- Combined tree: the compat patch is also applied in `Browser-rw-proto` (so that worktree holds items 0, 1, 2, 2b, D, B). Full `npm test`
  there: 408 passed, 2 failed in `savings.spec.js` (they expected a plain style preload to stay); after gating the preload clean-up by the
  `noPrefetch` switch and updating that expectation, the file passes (18 of 18 with compat). Final tree (with 2f, the 204 fix and the
  `cssBlobs` switch): full `npm test` 413 passed, 0 failed (2026-11-17 about 05:45).
- Harness (`tests/stack/profile.spec.js`, this branch): `res.direct` counts and lists requests to non-local hosts (direct loads); the run
  ends only once the page answers again (a freeze is now inside the trace); `LB_PROFILE_HARD`, `LB_PROFILE_NOPAUSE`, `LB_PROFILE_DUMPHTML`
  (saves the frame document); a pending debugger pause is dropped; Chrome trace uses timeline categories with `recordAsMuchAsPossible`.
- Run: `flock /tmp/limitless-rehearsal.lock env LB_PROFILE=1 LB_PROFILE_ONLY=steam-home,kahoot LB_PROFILE_REPS=2 deploy/rehearsal/run.sh --project=chromebook --workers=1 tests/stack/profile.spec.js`
  from the worktree under test (the rehearsal builds from that working tree). Results: `test-results/profile-2026-11-17-<suffix>/`.
- Raw result files of the prototype runs `-rwproto`, `-rwproto2`, `-cm-proto` and `-esmblob` were lost: an e2e run in that worktree
  cleared its `test-results/` (Playwright's default output folder). The numbers in this file were read from them before that; rerun
  with the command above to get the files again. Run e2e with `--output <other dir>` in a worktree that holds stack results.
- Evidence kept (git-ignored, local only): `test-results/overnight-2026-11-17/` in this worktree: `results-backup/` (combined, compat,
  cssBlobs A/B, Twitch trace and dump, games-combined, games-fonts, games-latin1, hydration), `native.json` + `native2.log` (plain
  Chromium baselines), `parsetest/run2.cjs` + `run2.out` (the data: URL micro-test), `swtest/` (service worker control test),
  `rweq.cjs` (rewriter equivalence), `prestreak.py` (CPU profile streak finder), `NIGHT-NOTES.md` (the night's running notes).
- Open before any of this ships: more Coolmath reps on time-to-shown for 2b, Spotify and Twitch with item 0, the `import()` helper (D2), `npm run test:sites` and the
  speed gate on a merged branch, and Boss's call on 2e.

## 8. Landed (2026-11-17)
Branch `slice/1.2-speed-land` (worktree `~/gll-worktrees/Browser-speed-land`, base `release/1.1.0` 9bbe004), uncommitted: items 0, 1, 2, 2b, 2f, D, B (label match and off-thread build), the 204/205/304 frame fetch fix and item 7 (memory budget). Part B (same day, same tree, uncommitted) added D2, 2c, the first half of 4 and the M error card and script memo. Not built: 2e, 3 (host, done), meriyah, 5, 6, 8, 9, M media streaming. New switches (default true): `cssBlobs`, `blocklistYield`, `memBudget`, `importHelper`, `qPrio`, `errCard`, `scriptDedup`. The profile, sites-games and sites-media harness files are ported with it.

**Update 2026-11-17 night:** the slice is merged into `release/1.2.0` with swcurl and imglane-google; gates, re-measured site numbers and the open speed gate rows are in `docs/releases/1.2.0.md`. Re-measured: Steam front page longest task 1.5 to 1.9 s (was 22.6 to 26 s), Kahoot shown 23 to 24 s, Discord 53 to 57 s, Coolmath direct loads 23, Reddit 16, Steam app page text 0 chars.
