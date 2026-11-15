# CLAUDE.md: Limitless Browser

## Purpose
Fork of GUST (Nautilus Labs, AGPLv3), rebranded for Gamble Limited Ltd. (GLL) as **Limitless Browser** (decided
2026-10-17, replaces "GLL Lens"): a browser-style web proxy in static files. Own Limitless look plus the GLL Portfolio
Stamp, not the full Gilded Ledger chrome. Copy neutral: "private browsing proxy".
**Master plan, decisions and stages: `docs/PLAN.md`** (planning Q&A 2026-10-18). Rebrand details: `docs/REBRAND-PLAN.md`.
Read both before touching names, credits, license text or features.
- **State (checked 2026-11-09):** launched 2026-10-19 (0.1.0, `7067718`, deployed by Boss); prod `.last-deploy-hash`
  `c88ce5e` (0.2.3, legal v2, `LEGAL_VERSION=2026-11-08`, deployed by Boss 2026-11-08; the hash was written by hand on 2026-11-09, see Deploy).
- **0.3.0 deployed by Boss 2026-11-15 09:43 (`072c108`, rotation preflight OK; 24 h hold until 2026-11-16 09:43).** 1.0 build started 2026-11-15. Release record `docs/releases/0.3.0.md` (Minor; speed gate fails on the fx-frames
  fixture only, rows that already failed before 0.3, so it ships only on Boss's override; HALL legal text must change first, notes section 6).
  S1, S2a, S2b, S3 and fetch core were built 2026-11-10 to 11-12 and reused (Boss, 2026-11-14); relay off, blocklist, fault fixes, libcurl 0.7.5
  and font preload were added 2026-11-14/15. the VPS relay (S4) and membership (S5) are merged into `release/1.0.0` (2026-11-15, not deployed; the old `slice/1.0-edge` ticket box is superseded). Then
  1.0.0 (VPS relay, membership, UI, admin, paid tiers). Plan and decisions: `docs/1.0/PLAN.md` section 0.2b; build cards in section 8.
- Removed (stage 2, 2026-10-19): Discord client, new-tab widgets, AI assistant, translate, `svg/`. Upstream fixes are
  cherry-picked by hand; the fork was in step with `upstream/main` 08515a7 as of 2026-10-18.
- **Invite only (decided 2026-10-17):** sign-in through GLL ID (GATE) is required and only users Boss approves get in.
  Everyone else sees an "invite only" page. Enforced server-side at nginx (`auth_request`, covering the app and
  `/wisp/`), not in client JS. Approvals live in GATE as per-app access (client `limitless-browser`). The check service
  is `~/limitless-gate` (own private repo): OIDC + direct sign-in and `/oidc/access-check`. Only `/legal/` is served
  ungated. Full design: `docs/ACCESS-CONTROL.md`. **Never ship a public, ungated deploy.** From 1.0 (Boss, 2026-11-14) every GLL
  ID gets the free tier without approval; sign-in stays required and removal is enforced by lbgate (`docs/1.0/MEMBERSHIP.md` 3.5).
- Remotes: `origin` = Gamble-Limited-Ltd/limitless-browser (renamed from `Browser` 2026-10-18; GitHub redirects the old URL), `upstream` = nautilus-os/GUST.

## Run / dev
No build system, lint or CI. `package.json` exists only for the Playwright test harness (nothing ships from it).
- `index.html` (~0.6 MB since 1.0 S3, was 3.6 MB): the markup, CSS, the libcurl.js glue and small head scripts. The ~1.1 MB application script is `app/main.js` (`<script src="app/main.js">`; the build rewrites it to `app/<sha>/main.js`, immutable). The libcurl WASM binary, acorn/acorn-walk and the skin-scoped CSS moved out earlier (see "Startup" below). No CDN or font-service requests remain.
- `patcher.html` (renamed from `GUST-Patcher.html`, 2026-10-19): standalone patcher page. Its patch definitions match
  identifiers and storage keys in `index.html`; when you rename code there, update them too. It fetches only our own
  same-origin `./index.html`; served behind the gate.
- `vendor/` and `fonts/` (stage 2): self-hosted third-party assets, each with its license file:
  `vendor/fontawesome/6.7.2/` (standardised on 6.7.2), `vendor/pdfjs/4.2.67/`, `vendor/iso-639-1/2.1.11/`, `fonts/`
  (JetBrains Mono, Space Grotesk, `fonts/fonts.css`), plus (S2) `vendor/libcurl/0.7.5/` (`libcurl.wasm`, LGPL notice) and `vendor/acorn/8.14.0/` (`acorn.min.js` = acorn + acorn-walk, MIT). Documents the app generates (error page, viewers) must use the
  absolute `LB_FA`, `LB_PDFJS`, `LB_FONTS_CSS` URLs, not relative paths.
- Relays (0.3.0): our home relay is OFF (public relays only until 1.0). One feature switch `ownRelay` (`features.ownRelay` in `version.json`, build `LB_FEATURE_OWNRELAY`, default false) drives it; `LB_applyRelayMode(features)` runs in `init()` after the boot access check and before any session.
  Off: `LB_OUR_WISP` is `''` (our `/wisp/` is no candidate, no startup probe, no relay notice), public relays are always on, a saved `limitless:relay-fallback:v1` = `0` is ignored and kept for 1.0, Settings > Connection shows "Public relays (until 1.0)" disabled, the pool benchmark runs behind the first page (no 25 s boot hold), the router and `ownSockets` stay in code but inert (`LB_FEATURE_OWNSOCKETS` default 0). On (1.0, `LB_FEATURE_OWNRELAY=true LB_FEATURE_OWNSOCKETS=4`): the stage 2 behaviour, our same-origin `/wisp/` first, the 7-entry public pool (+ `mages.io`) only when the key is `1`, startup probe and notice.
  `window.LB_relayStatus()` returns `{ours, fallbackAllowed, ownRelay}`. Pool: the dead entries were dropped 2026-11-15 (`scripts/probe-relays.mjs`, list in `docs/1.0/RELEASE-0.3.0-NOTES.md`). First load shows a plain public relays notice once (`limitless:notice-publicrelays:v1`, its button reuses `#lbRelayNo`); when every pool entry fails the benchmark a small card (`#lbRelaysDown`, link to status.taps-holdings.org) retries with backoff (10 s doubling to 5 min, `LB_watchRelays`).
  Server side: compose `relay` and `dns` are `profiles: ["relay"]` (start with `--profile relay`; `lbgate` depends on `relay` with `required: false`, `RELAY_URL` and `lb_relay` stay), and nginx answers `410` on `/wisp/` (`deploy/web/wisp.sh` writes `/tmp/wisp.conf`; `WISP_RELAY=1`, set only in the rehearsal compose, proxies as before). The rehearsal build uses `LB_FEATURE_OWNRELAY=true` (`LB_REHEARSAL_RELAYOFF=1` builds the real 0.3.0 defaults).
- **Boot access check (fail closed, SPEED 3.5):** `LB_featuresReady` fetches `version.json` first (8 s); `LB_access` is `ok`, `signin`, `invite`, `offline` or `pending`. 401 goes to `/auth/signin`, 403 to `/auth/invite`, a network error or 5xx shows "Cannot reach Limitless" (`LB_cannotReach`) and `init()` stops before `libcurl`/`LB_swapSession`; `benchmarkWispPool` also refuses until `ok`. A 404 counts as ok only for an unstamped dev build (plain static server, e2e); a deployed build fails closed on 404. The service worker never handles `version.json`, so a worker serving the shell cannot hide an offline or revoked state.
- Open `index.html` via `file://` or serve statically: `python3 -m http.server 8000`.
- Local test with a stub gate: `deploy/dev-up.sh` (`DEV_ALLOW=1` allows, `DEV_ALLOW=403` shows invite, default asks sign-in); stop with `docker compose -p limitless-browser down`.

## Ports and prod
Prod: compose project `limitless-browser`, web (nginx) on `127.0.0.1:8580`, host `limitless.taps-holdings.org` (not
rotated). Hosting and speed plan: `docs/HOSTING-AND-PERFORMANCE.md`. Served ungated: `/legal/`, `/theme/` (themes.css,
fonts, marks, brand stamp), `/favicon.svg`, `/auth/*`. Everything else, including `/wisp/` and `version.json`, goes
through `auth_request` (section 5 of that doc). Dev test server: 8599 (Playwright).

## Test / build
- `npm install` once, then `npm test`. Playwright (pinned `@playwright/test` 1.64.0, matches the chromium-1248 build
  in `~/.cache/ms-playwright`) starts `python3 -m http.server 8599` and runs the smoke test in `tests/e2e` (app shell
  loads, no uncaught page errors, title set, address bar accepts input). It does not replace manual checks: also load
  the page, check the console, and exercise the touched feature.
- Full-stack rehearsal: `npm run test:stack` (`deploy/rehearsal/run.sh`). Anything that starts it: `flock /tmp/limitless-rehearsal.lock ...`.
- Test tiers (docs/1.0/TESTING.md section 6): `npm test` (e2e, `fullyParallel`), `npm run test:speed:quick` (chromebook, fixtures, 3 reps), `npm run test:sites:smoke` (12 sites), release gate `npm run test:speed` + `npm run test:sites`; `scripts/speed-nightly.sh` runs the gate set unattended.
- Static tree: `scripts/build-static.sh <sha>` (index.html, patcher.html, sw.js, vendor/, fonts/, theme/, legal/, app/ when present,
  favicon.svg, CHANGELOG.md, version.json; gzip + brotli). It also stamps `<sha>` into the dist copy of `index.html` and `sw.js` (and the service worker precache list).
- Theme CSS is generated: edit `scripts/gen-themes.py`, rerun. Fonts: `scripts/fetch-fonts.py`.
- Not offloaded to buildpc (no `.nvmrc`; stack tests unverified there).

## Deploy / release
- `./deploy.sh [sha]` (Boss runs it): clean tree, builds from `git archive`, compose project `limitless-browser`, writes
  `.last-deploy-hash` as soon as the containers are up (the daily rotation's preflight compares the lbgate image to it), then smoke
  tests with 30 s retries; a smoke failure prints the rollback command. Before 2026-11-09 the hash came after the smoke, and a
  failed smoke on 2026-11-08 left it stale and blocked the 06:00 rotation. After a deploy: `~/gll-planning/rotation/rotate.sh check`. Rollback: `./deploy.sh <previous sha>`; when that commit has no `sw.js` (0.2.x) `deploy.sh` runs `scripts/inject-sw-stub.sh`, which serves `scripts/sw-rollback-stub.js` (installs, clears `lb-shell-*` caches, unregisters, no fetch handler) so installed 0.3.0 workers remove themselves (`c88ce5e` nginx serves `/sw.js` as gated `application/javascript`, checked 2026-11-15). Needs `~/limitless-gate` and the gitignored
  `deploy/gate.env`. Follow `~/.claude/docs/release-procedure.md`.

## Rules unique to this repo
- `index.html` is huge. Never Read it whole; use Grep with line numbers, then Read small ranges. Prefer targeted Edit over rewrites.
- AGPLv3 stays (`LICENSE` is the unmodified template). Never remove upstream credits, the libcurl.js LGPL notice, or the third-party license string
  (`copyright_notice` in `index.html`). Add GLL notices, do not replace theirs. Never copy this repo's code into
  proprietary GLL repos (gll-shared, gll-id, limitless-gate); copying GLL brand assets in is fine with a `docs/SHARDS.md` log.
- localStorage keys are `limitless:*:v1` (renamed from `gust:*:v1` in stage 3a) and are user data. The app stores most
  keys as `gi_<id>:limitless:...`; on http(s) the id is stable per origin (`limitless:inst:v1`, test
  `tests/e2e/persistence.spec.js`), on `file://` it is per tab (upstream). A shim in the first script of `index.html`
  copies old `gust:*` and `gi_<id>:gust:*` keys once (flag `limitless:migrated:v1`), keeps the old keys for one release,
  and never overwrites existing new keys; test: `tests/e2e/migration.spec.js`. `gust_ai_ctx` (removed AI assistant) is
  deleted on load. IndexedDB `gust_extensions` keeps its old name on purpose (renaming would lose installed
  extensions). Do not rename a key again without a migration.
- Code identifiers use the `lb-` / `lb` prefix (CSS classes, `data-lb-*`, `__lbLoc`), internal pages are
  `limitless://` (`gust://` is still accepted as an alias in `normUrl`), the extension API is `LimitlessExt`
  (`window.GustExt` alias kept), and the version lives in one constant `LB_VERSION`. Remaining `gust` strings are only
  the shim, aliases and credits.
- Do not imply affiliation with GUST or Nautilus Labs beyond factual credit.
- Do not add or extend filter-evasion or detection-evasion features without Boss's explicit decision.
- Docs and UI copy: no em dashes, no invented facts. Keep docs (this file, the plan) updated in the same commit as the change.
- Commit only when asked (stricter than the global git rule).

## Known gotchas
- Check CRLF vs LF before large edits (`file index.html`); commit 1a193ab was a big Windows-related rewrite.
- Feature notes below (theme engine, start page, faster browsing, admin panel) describe how the inlined code fits together.

## Theme engine (stage 3b)
- **Setting:** `localStorage['limitless:theme:v1']` = JSON `{theme, mode, mark}` (defaults `luxury`, `auto`, `orbit`). Written
  directly, not through the per-instance `ls` wrapper, because the gate's auth pages read the same un-prefixed key.
- **Attributes:** `<html data-lb-theme data-lb-mode data-lb-mark>`. A small inline script at the top of `<head>` sets them
  before first paint and exposes `window.LBTheme` (`get`, `set`, `THEMES`, `resolveFor`); `auto` follows
  `prefers-color-scheme`, Vault is always dark. A `lb-theme-change` event fires on `document` after every change.
- **Where things live:** tokens `theme/themes.css` (generated by `scripts/gen-themes.py` from `docs/DESIGN.md`; also emits
  `.lb-scope[...]` selectors so the settings previews can show any theme), fonts `theme/fonts.css`, everything else
  (variable mapping, per-theme character, splash, grid, drawer, relay notice, privacy rows) in `theme/chrome.css`.
  The UI code is the last `<script>` of `index.html` (`LBThemeUI`).
- **Mapping:** `--bg0` page = `--lb-bg`; `--bg1`, `--bg-elevated` = `--lb-surf`; `--bg2`/`--bg3` mix surf with fg;
  `--bd` = `--lb-line`; `--tx` = `--lb-fg`; `--tx3` = `--lb-mut`; `--tx2` mixes fg and mut; `--ac`/`--ac2` = `--lb-acc`/`--lb-acc2`;
  `--radius-sm/md/lg` scale `--lb-r`; `--ui` = `--lb-fb`; `--surface/--surface2` use `--ov` (white on dark, ink on light).
  All of it is scoped to `html[data-lb-theme]:not([data-skin])`: an upstream skin (Chrome, Brave, Firefox, Opera GX,
  Limitless+) wins and keeps upstream behavior. The Theme button is hidden under a skin.
- **Add a theme:** add its colors and type row to `T` and `TYPE` in `scripts/gen-themes.py` and to `docs/DESIGN.md`, run the
  script, add the id to `THEMES` (head script), `NAMES` and the grid arrays (UI script), then add its character rules and
  splash rules to `theme/chrome.css` under `[data-lb-theme="<id>"]`, and a case in `tests/e2e/themes.spec.js`.
- **Marks:** `<symbol id="lb-mk-orbit|lens|wordmark">` in `#lbMarks`, colored by `--lb-acc`/`--lb-acc2`. An `svg.lb-mk` holds
  three `<use>` children and CSS on `html[data-lb-mark]` shows one. The favicon stays Orbit.
- **Contrast (Boss, 2026-10-19):** body text and text on accent meet 4.5:1 in every theme. To get there the light
  accents of fancy, minimal, retro (`#2171dc`, `#1e74d9`) and ledger (`#7e6318`) and soft light's muted text (`#61718b`)
  were darkened slightly from the picked values. Keep 4.5:1 when adding or editing a theme.

## Start page, update notice, What's new (stages 4 and 5, 2026-10-19)
- **Start page** (`#newtab`, markup in `index.html`, theme rules in `theme/chrome.css` section 10): brand (`svg.lb-mk` + `.lb-word`),
  `.nt-orn` rule (shown by luxury, fancy, GLL themes), `#ntDate` greeting (`Good morning, Monday 19 October`; en and en-US use the day-month
  order, other locales their own), `#ntTime` clock (`#ntTimeText` + `#ntTimeSuffix`; 24 h from the Settings switch `limitless:24hrclock:v1`,
  else from the locale, helper `lbUse24h()`), `.nt-search` (engine selector `#ntEngine` inside the field, `#ntSearch`, `#ntSearchBtn` as the
  "Enter" hint), `#ntFavorites` tiles (max 6, favorites system, letter fallback until the icon loads, delete shows on hover or focus),
  `.nt-foot` with the stamp (`.lb-stamp-d`/`.lb-stamp-l` by resolved mode; mono greys it). The wallpaper button is hidden without a skin
  (its code stays for skins); the GitHub button is gone. Skins that render their own new-tab page hide `.nt-content` as before.
- **Update notice:** `window.LB_BUILD_SHA` is `'dev'` in the source. `scripts/build-static.sh` rewrites it in the dist copy only and writes the same
  sha to `version.json`. `window.LB_checkForUpdate()` fetches `version.json` (no-store); a different sha shows `#lbUpdateBanner` (Reload, What's new,
  dismiss `#lbUpdateDismiss`), `security: true` changes the wording, dismiss leaves `#lbUpdatePill` in the toolbar until reload. Polls at start (3 s),
  every 15 min and on `visibilitychange` (throttled to 1 min). Never reloads by itself. `dev`, `file://` or no `version.json`: silently skipped.
  Tests set `window.LB_BUILD_SHA` with `addInitScript` and intercept `/version.json`.
- **What's new:** `limitless://whats-new` is registered in `SKIN_PAGES` and renders `/CHANGELOG.md` (nginx: gated, `no-cache`, `text/markdown`)
  with a tiny safe renderer (headings, lists, paragraphs, `[text](url)` links to http(s) or limitless://; all DOM via `textContent`, links open inside the
  proxy). Linked from the banner, the About page, and typed in the address bar. Keep `CHANGELOG.md` plain: no bold, code or tables (shown literally).
- About links Privacy and Terms open `/legal/privacy.html` and `/legal/terms.html` in a normal new tab (outside the proxy).

## Faster browsing (0.2.0 slice)
- **Speed harness (F6):** `window.__lbPerf` (`start(url)`, `mark(name)`, `runs`) is always on and local; `go()` marks `firstBytes`, `dom`, `shown`, `load` in ms
  since the navigation started. `npm run test:speed` (= `LB_SPEED=1 deploy/rehearsal/run.sh tests/stack/speed.spec.js`, needs outbound internet) loads the sites in
  `tests/stack/speed-sites.json` cold and warm, 3 reps each in fresh contexts (`LB_SPEED_REPS`, `LB_SPEED_ONLY`, `LB_SPEED_SHA`), and writes
  `test-results/speed-<sha>.json` (medians). `node scripts/speed-compare.mjs base.json cand.json` fails (exit 1) when a median load is more than 10 % and 100 ms slower.
- **T0 harness (1.0):** `npm run test:speed` runs under projects `chromium` and `chromebook` (`tests/lib/profile.js`: 1366x768, 4x CPU, 10/5 Mbit/s, 40 ms RTT). run.sh then starts the fixture sites container (`tests/fixtures/sites`, 10.89.85.10:8080) and gives the rehearsal relay the TEST-ONLY `deploy/rehearsal/relay-fixtures.toml`; prod `deploy/relay/config.toml` keeps `allow_non_global = false` (`tests/e2e/relay-config.spec.js`). 7 reps on fixtures, 3 on public sites (`LB_SPEED_PUBLIC_REPS`); output `test-results/speed-<sha>-<project>.json`; `speed-compare.mjs` gates only fixtures and boot. 0.2.3 baseline: `docs/1.0/BASELINE.md`.
- **Parallel requests (F1):** defaults 24 idle and 24 active (stepper 1 to 32, saved values from earlier versions are kept). `lbApplyConnections(session)` calls
  `set_connections(n, n, 6)` with n = the larger setting, and runs at every session creation and live when the stepper is saved or reset.
- **Transport router (F2):** `LBTransport` is set as `libcurl.transport`; libcurl calls it with `<relay base><host>:<port>` for every TCP stream and it returns
  `LB_router.open(url)` (`LB_makeRouter(deps)`, a plain object, so tests use a stub Socket; real instance `window.LB_router`). Our relay `/wisp/` becomes
  `/wisp/N/`, N in 1..ownSockets (Settings > Connection "Sockets to our relay", `limitless:ownsockets:v1`, default 4; 1 keeps plain `/wisp/`), least open streams
  first. libcurl keys its WISP connections on the base url, so each shard is its own WebSocket; the gate accepts any `/wisp/*`. Custom or third-party bases pass
  through untouched unless multi-relay is on. `LB_swapSession(url, {pin})` is the only place a libcurl session is replaced: it applies the connection limits
  and closes the old `HTTPSession` once it has no requests in flight (60 s cap). `pin` makes the router honour that relay (retry chain, 404 retry).
- **Multi-relay (F3):** off by default, needs `limitless:relay-fallback:v1` (the switch and mode select are disabled and say so otherwise). Keys
  `limitless:multirelay:v1` (`1`) and `limitless:multirelay-mode:v1` (`site` default, `spread`, `race`). Candidates come from `rankPoolCandidates` (health,
  cooldown, latency). Per site: host -> relay map (sticky). Spread: round robin per connection. Race (port 443 only, so only a TLS ClientHello is duplicated):
  `LBRaceSocket` opens the stream on the top two, sends to both until the first data arrives, closes the other and records the host. Failures call
  `markWispFailed` and drop the sticky entry. While multi-relay is active the per-page pool pick in `go()` is skipped. Test hooks: `LB_router`, `LB_makeRouter`,
  `LB_swapSession`, `LB_net.curl`.
- **Feature switches:** `window.LB_features` `{ownRelay (default false, 0.3.0), ownSockets (1-4), worker, respCache, sw, pipeline, lazyImg, tabSleep, rewriteCache, pageCache, warm, instantBack, noDirect, blobScripts, errClass, deadlines, transfer}` defaults on/4, except `ownRelay`, `pageCache` and `warm` which are false from 0.3.0 (code stays, back in 1.1; `LB_features` in the app has the same defaults as the build) (`noDirect`: a script the proxy cannot fetch, or that is late, is never loaded from its real URL, see `docs/1.0/LOADING-REVIEW.md` L1; `blobScripts`: L6); `window.LB_featuresReady` reads `features` from `version.json`
  at boot (missing file or keys keep the defaults). Used at use time by the router, the cache and the script rewriter.
- **Parent to frame messages:** always send with `lbPostTo(win, msg, '*')`, never `frame.contentWindow.postMessage` or `_replyTo.postMessage`: the frame runtime wraps its own `window.postMessage`, so a direct call arrives with the frame as `event.source` and the runtime drops it.
- **Compat (1.0, L6 and L12):** parsed classic scripts get a `blob:` src made just before the page blob is built (`lbScriptBlobs` revokes them with the page blob in `lbRevoke`; the page cache stores `data:` copies via `lbBlobsToData`); the runtime answers `getAttribute('src')` and `script[src...]` queries with `data-original-src`. `lbPrewarm` hands the image pre-warm result to the frame's first GET for the URL. Test: `tests/e2e/compat.spec.js`.
- **Cache open never blocks boot (0.2.1):** `initCache` resolves after 3 s, on `onblocked` or on error and boot continues without `cacheDB` (it is picked up if the open succeeds later); the open handle closes itself on `versionchange`. A 0.1.0 tab held version 2 open, so 0.2.0 hung before the libcurl session existed ("libcurl not ready"). Test `tests/e2e/idb-upgrade.spec.js`. Bump the `ProxyCache` version only with this in mind.
- **Response cache (F4):** `memCache` (session, `LBMemCache`, 600 entries / 96 MB) over IndexedDB `ProxyCache` (v3, 200 MB, index `byLastAccessed` for LRU eviction,
  index `bySize` so the size is summed with a key cursor). `lbCacheEvaluate` decides storage from the response headers: only 200 GET; never `no-store`, `private`,
  `Set-Cookie`, or `Vary` other than `Accept-Encoding`; lifetime `max-age` > `Expires` > heuristic (10 % of age since `Last-Modified`, at most 24 h) > 24 h for
  css/js/font/image only; HTML only with explicit freshness and never when a cookie is sent for it; `no-cache` is stored only with a validator and always revalidated.
  Stale entries with an ETag or Last-Modified are revalidated with `If-None-Match` / `If-Modified-Since`; a 304 serves the stored body and refreshes freshness.
  Requests carrying their own Range, conditional or Authorization headers bypass the cache. Reload drops the document entry. Switch: Settings > Resource Cache
  "Keep a cache of sites on this device" (`limitless:cache:resp:v1`, default on) or `features.respCache` false: nothing is read or written. The old HEAD/Range
  size check is gone. Test hook: `LB_cache` (`now`, `put`, `get`, `has`, `count`, `setMax`, `clearAll`, `dropMemory`), `LB_queueFetch`.
- **Worker rewriter (F5):** `rewriteLocationRefs` now lives at module level (not inside `go()`); `rewriteJsAsync(src)` sends scripts of 16 KB or more to up to two Blob
  Workers built from the vendored acorn + acorn-walk script text (first `<script>` of `<head>`) plus `rewriteLocationRefs.toString()`, memoised by content hash (200
  entries / 24 M chars). Worker creation failure, a worker error or a 3 s timeout rewrites synchronously and turns workers off for the session. Awaited callers: external
  scripts, inline classic scripts, ES module sources. `window.__lbRewriteJs` (dynamic injection, called synchronously by the iframe) stays synchronous. No CSP change needed.
  Test hook: `LB_rewrite` (`sync`, `async`, `stats()`, `timeoutMs`).
- **Page pipeline (1.0 S1, `docs/1.0/SPEED.md` 2):** after the document is parsed, `go()` starts every subresource fetch at once (kick-off block after `cssLinks`: CSS links, `script[src]` up to `limitless:render:scriptlimit`, iframes, the first 24 images; none in data saver) into `_pf` (URL -> promise); the stages read their result through `qf(url, opts, prio)`, which returns that shared promise, so even a response that is not cacheable is fetched once. `queueFetch` already de-duplicates in-flight GETs by URL (F-i was a non-issue). The CSS stage (`_cssStage`) runs alongside the script and iframe stages and is awaited before the post-script checkpoint; DOM edits and script order are unchanged. The 12 s image wait is gone: `frame.src` is set as soon as CSS, scripts and iframes are done and `__lbPerf` `shown` moves with it. `features.pipeline=false` restores the old serial stages, the image wait, the overlay and the blanking of the frame. Test: `tests/e2e/pipeline.spec.js` (stub curl with per-URL delays).
- **Lazy images (`features.lazyImg`):** `makeProxyScript` embeds `LB_LAZY = lbLazyConfig()` `{on, margin, saver}`; `processEl` in the injected runtime does not promote `data-lb-src` / `data-lb-srcset` of an `<img>` until `_lazyCheck` finds it within `margin` % (150, data saver 50) of the viewport (rect test on scroll in capture, resize, image load and error; images with no size yet pass at most 8 per check). `loading="eager"` and `fetchpriority="high"` on the image are honoured, so with lazyImg on `go()` no longer flips `img[loading=lazy]` to eager (iframes and sources still are).
- **Progress bar (`lbProg`, defined before `setStatus`):** `lb-det` class on `#progress`, width driven by finished / started requests of the navigation plus a slow creep (max 90 % until shown), 100 % at `shown`, hidden 250 ms later; `lbProg.quiet` keeps `setStatus('active')` from re-showing it while late images stream. When a page is already showing in the tab (`_keepPage`), `go()` neither blanks the frame nor shows the overlay; empty tabs and `pipeline=false` keep the overlay.
- **Busy line hint (1.0 S4, `docs/1.0/RELAY.md` 3.6):** about 4 s after load (then every 2 min until shown) the app GETs `/_lb/me` (nginx proxies it to the gate); `busy:true` shows `#lbBusyNote` once per tab session (`sessionStorage` `limitless:busynote:v1`) and never changes Data saver. Test `tests/e2e/busy.spec.js` (mocked route).
- **Data saver (`limitless:datasaver:v1`, default off, Settings > Connection):** `Save-Data: on` on every request (`doFetch`), no image pre-warm, lazy margin 50 %, `preload="none"` and no `autoplay` on video/audio (document and runtime), image limit default 100. The menu bandwidth meter does not exist yet, so its "Data saver on" label is not built.
- **Kill switches at build time:** `scripts/build-static.sh` writes `features` into `version.json` from `LB_FEATURE_OWNRELAY` (`true`/`false`, default false), `LB_FEATURE_OWNSOCKETS` (0 to 4, default 0 in 0.3.0), `LB_FEATURE_WORKER`,
  `LB_FEATURE_RESPCACHE`, `LB_FEATURE_SW`, `LB_FEATURE_PIPELINE`, `LB_FEATURE_LAZYIMG`, `LB_FEATURE_TABSLEEP`, `LB_FEATURE_REWRITECACHE`, `LB_FEATURE_PAGECACHE` and `LB_FEATURE_WARM` (default false), `LB_FEATURE_INSTANTBACK`, `LB_FEATURE_NODIRECT`, `LB_FEATURE_BLOBSCRIPTS`, `LB_FEATURE_ERRCLASS`, `LB_FEATURE_DEADLINES` and `LB_FEATURE_TRANSFER` (`true`/`false`, default true unless noted), e.g. `LB_FEATURE_WORKER=false ./deploy.sh`. Users can also turn off the cache (Settings) and set sockets (Settings).
- **Blocklist (1.0 slice, SPEED 4.7):** `LB_blocklist` (in `app/main.js`) matches a host or any parent domain against a `Set` loaded from `vendor/blocklist/<date>/hosts.txt` (HaGeZi Multi LIGHT, GPL-3.0, see `SOURCE.md` there). The file is fetched once a page has finished loading and the fetch queue has been idle for 3 s (`loadWhenIdle`, so it never competes with the first page; an idle queue alone fired during the slow Chromebook boot) and cached immutable by the service worker (`vendor/` is cache first). Until it loads, the old 132-entry `SKIP_DOMAINS` substring list is the fallback; after it loads, only the domain-like old entries are kept. Custom filters stay substring matches and are always checked. The allowlist and `limitless:block:v1` are applied by the callers (they pass `blockEnabled`), unchanged. The page runtime reaches the matcher through `window.top.LB_blocklist` and falls back to the legacy list. Test: `tests/e2e/blocklist.spec.js`. To update the list, add a new dated folder and change `FILE`.

## Fetch core (1.0 slice fetchcore, docs/1.0/LOADING-REVIEW.md)
- **Error classes (`features.errClass`):** `doFetch` reads the libcurl code from "error code N" (`lbClassify`): 6 dns, 7 connect, 18 partial body, 28 timeout, 35 tls, 51/58/60 cert, 52/56 reset set `err.lbCat`/`lbCode` and fail that request only. A relay drop is read from the transport: `LB_router.epoch` counts closes or errors of the shared relay connection (`ws.connection`; libcurl's `WispWebSocket` is only one stream, and its close also fires for a refused host, a site reset or a finished keep-alive, so it is not a drop; a plain socket without `.connection` still counts itself; `noteDrop(base)` is also a test hook). libcurl.js ends the body quietly on a mid-body reset (code 18), so `doFetch` compares the body with Content-Length (skipped with content-encoding) and fails as `reset`. Only then `lbReconnect` swaps the session, once for any number of concurrent failures (`lbSessionGen`), and an idempotent request retries once; POST/PUT/PATCH/DELETE are never replayed. `go()` retries a navigation only for `e.lbDrop` on GET/HEAD, once; site errors go straight to the error card (the card text reads `lbCat`). `false` restores the substring test and the 3-step retry ladder.
- **Deadlines (`features.deadlines`):** `runQueue` gives each job its own AbortController, started at dispatch: `LB_deadlines.connect` 10 s to the first byte, then `LB_deadlines.body` 30 s total for the body (none for media or Range requests). A timeout rejects with `TimeoutError` (`lbCat` timeout) and frees the slot and the `inFlight` entry. Test hooks: `LB_deadlines`, `LB_queueState()`.
- **Queue cap:** the 150 limit refuses only image pre-warm jobs (`opts.__prewarm`, set by the kick-off); requests from the page wait.
- **Transfer (`features.transfer`):** the frame message handler (`d.t === "q"`) replies with a copied `ArrayBuffer` in the transfer list; the frame's `Base64.decode` accepts an `ArrayBuffer`. `false` sends base64 as before. `LB_stats.b64` counts encodes (test hook), `LB_stats.swaps` counts session swaps.
- **Log:** `log()` appends to a 500 entry ring (`LB_logState()`); DOM entries exist only while `#logs` is open (a MutationObserver renders the ring when it opens).
- **Tests:** `tests/e2e/fetchcore.spec.js` (stub curl, in `npm test`); `tests/stack/failures.spec.js` (fault fixtures in `tests/fixtures/sites/server.js`): `flock /tmp/limitless-rehearsal.lock env LB_FAULTS=1 deploy/rehearsal/run.sh tests/stack/failures.spec.js`. Never `git stash` in a worktree here: the stash list is shared by every checkout.

## Startup (1.0 slice S2, docs/1.0/SPEED.md section 3)
- **Moved out of `index.html`:** the libcurl WASM binary (`vendor/libcurl/0.7.5/libcurl.wasm`, 1.4 MB; the Emscripten single-file data URI is gone, `wasmBinaryFile` is the vendored URL and
  libcurl starts `fetch` + `WebAssembly.instantiateStreaming` as soon as its inline script runs; `load_wasm()` only waits); acorn + acorn-walk (`vendor/acorn/8.14.0/acorn.min.js`, a normal
  render-blocking `<script src>` in `<head>`, cached); the skin-scoped CSS (`theme/skins.css`, rules for `html[data-skin=...]`). The unscoped skin defaults (hidden skin buttons, Settings skin tiles
  and previews) stay inline in `<style id="skinStylesSlot">`: without them the toolbar overflows. `lbEnsureSkins()` adds `<link id="skinStyles">` after the slot when a skin is active
  (`applySkin`) or the Plus code needs the sheet (`plusEnsureSheet` retries when it has loaded). `theme/skins.css` is gated by an exact nginx location (not public like the rest of `/theme/`).
  PDF.js was already vendored (`vendor/pdfjs/4.2.67/`); nothing of it was inline.
- **Worker rewriter:** `lbRwSource()` no longer reads the first `<script>` of `<head>`; `lbRwLoadLib()` fetches `vendor/acorn/8.14.0/acorn.min.js` once (HTTP cache) and the pump waits for it. A failed fetch turns workers off (synchronous rewrite). Test `tests/e2e/worker.spec.js`.
- **Service worker** (`/sw.js`, scope `/`, cache `lb-shell-<sha>`): registered 8 s after load (`window.LB_SW_DELAY` in tests; early enough to be warm for the next visit, late enough not to compete with the first page for bandwidth) only on http(s) with a stamped sha (the source tree says `dev`: no worker).
  Precache: index.html, acorn, WASM, iso-639-1, Font Awesome css + faces, Latin fonts, theme css, `app/<sha>/*`. Sub-resources under `/app /vendor /fonts /theme/fonts` are cache first, other `/theme/*`
  stale-while-revalidate. **Access stays at nginx:** page loads of `/` and `/index.html` are network first (the gate answers every open, so a signed-out or revoked user gets the sign-in or invite page even with a
  warm worker; the cached index.html is used only when the network itself fails); only 200, same-origin, non-redirected, non-`no-store`, non-HTML (except index) responses are stored; `/wisp/ /auth/ /_lb/ /_gate/ /legal/ /verify/`,
  `version.json`, `CHANGELOG.md`, `/sw.js` are never handled. Cached files are given only to sub-resource requests, never to a top-level navigation to them. At boot a 401/403 from `version.json` reloads the page once
  (sessionStorage `limitless:gate-reload:v1`) so the gate shows sign-in or invite. Update: `lbCheckForUpdate` calls `registration.update()`; the banner's Reload posts `{type:'skip'}` to the waiting worker
  (it never skips waiting by itself) and then reloads.
- **Kill switch:** `LB_FEATURE_SW=false ./deploy.sh` puts `"sw": false` in `version.json`; the next load unregisters `/sw.js` registrations and deletes `lb-shell-*` caches (index.html is network first, so a bad worker cannot block this).
- **Font preload (SPEED 3.6, 0.3.0):** the head theme script adds `<link rel=preload as=font crossorigin>` for the boot theme's display and body faces only (map `PL`, URLs must match `theme/fonts.css`; a new theme needs an entry). Test `tests/e2e/fontpreload.spec.js`.
- **Not done:** lazy subsystems (moved to 1.0, Boss 2026-11-14) (inspector, extensions, log panel, PDF viewer as `app/<sha>/*.js`): they share closure state with the 1 MB main script (`selectedElement`, `elementsEl`, `ls`, `go`, ...), so moving them needs an API refactor.
  `build-static.sh` already copies a source `app/` dir to `dist/app/<sha>/` and nginx serves `/app/` immutable and gated, ready for it.
- **Tests:** `tests/e2e/boot.spec.js`, `skins.spec.js`, `sw.spec.js`; stack `tests/stack/sw.spec.js` (signed-out and revoked with a warm worker, run under `flock /tmp/limitless-rehearsal.lock`).

## Client speed extras (1.0 slice S3, docs/1.0/SPEED.md section 4)
- **Application script moved out:** the main inline script is `app/main.js` (header comment keeps the AGPL and Nautilus Labs credit; the libcurl `copyright_notice` stays in `index.html` next to the libcurl glue). `scripts/build-static.sh` copies `app/` to
  `dist/app/<sha>/`, points `index.html` at `app/<sha>/main.js`, and stamps the sha at the `@LB_BUILD_SHA@` marker inside `app/main.js` (no longer in `index.html`). The service worker precaches `app/<sha>/*`. `patcher.html` fetches `index.html`, then `inlineAppScript()` puts
  the script back inline before any patch runs, so its patch definitions see the same text as before and the download stays one file. Edit app code in `app/main.js`; line numbers in older notes refer to the old single `index.html`.
- **Instant Back and Forward (`features.instantBack`, `lbBF`, test hook `LB_bf`):** `go()` saves the rendered blob of each finished GET document (not `no-store`, not errors) per tab: last 3 entries per tab, 64 MB total, least recently used first. `go(url, false)` for a stored entry shows it at once and restores the scroll
  (`lbBF.leave` records `scrollY` as the page is left). `lbRevoke(url, ms)` replaces direct `URL.revokeObjectURL` for tab blobs so a stored blob is only revoked by eviction. Reload drops the entry.
- **Tab sleeping (`features.tabSleep`, `lbSleep`, test hook `LB_sleep`, setting `limitless:tabsleep:v1` in Settings > Tab Caching, 0 / 10 default / 30 / 60 minutes):** only the active tab has a live document; a background tab holds its blob. After the set time out of view, `lbSleep.run()` (every 60 s) frees the blob and the `lbBF` entries and marks the tab sleeping; coming back
  runs `go(tab.url, false)` (page cache and response cache make it local) and puts the scroll back. Not slept: a tab that was playing audio or video, or had typed input (value different from its default), when it was left. The spec said the iframe is replaced; in this single-frame design there is no background iframe, so the memory freed is the blob.
- **Small stores (`lbMakeKV(name, maxBytes)`):** a key-value IndexedDB wrapper on its own database name, LRU by size, never blocks, failure means no-op. Used for `LimitlessRewrite` (50 MB) and `LimitlessPages` (64 MB). `ProxyCache` is untouched. `Settings > Resource Cache` off or the `respCache` switch also turns both off; "Clear cache" wipes both.
- **Rewrite cache (`features.rewriteCache`):** `rewriteJsAsync` (scripts of 16 KB or more) looks up the rewritten text by SHA-256 of the source plus a hash of `rewriteLocationRefs.toString()` (any rewriter change invalidates everything). Test hook `LB_rewrite.stats().persistHits`, `LB_rewrite.kv`.
- **Cached rewritten pages (`features.pageCache`, test hook `LB_pc`):** at the end of `go()`, a GET document that `lbCacheEvaluate` allows (explicit freshness, no cookie, not `no-store`, HTML) stores its final HTML keyed by URL + rewriter version with `sig` (ad block, allowlist, WebRTC, user agent, spellcheck, Data saver, custom filters, build sha, lazyImg, image limit).
  A repeat visit inside the freshness window shows it before the fetch; the normal load continues. Same source document (`docSig`): nothing more. Changed: replaced silently if the member has not touched the page (first pointer, key, wheel, touch or input in the frame), else the "Updated, reload" chip (`#lbPageChip`).
- **CSS url() rewrite (4.5):** `rewriteCssUrls` now makes one pass: fetches in parallel, base64 through `FileReader.readAsDataURL` (off the main thread) and a single `replace`, instead of `String.fromCharCode` chunks plus `split/join` per url (quadratic). Output is identical. `DOMParser` cannot run in a Worker; no parse5 added.
- **Warm favourites (`features.warm`, `LB_warm`):** 3 s after boot (once libcurl exists) and on `online`, `HEAD https://host/` for the hosts of up to 6 favourites and the last 3 recent sites; the answer is discarded, no cookies, skipped with Data saver. The "bandwidth meter above 80 %" skip is not built (no meter yet).
- **Real-site suite (TESTING 6a):** `npm run test:sites` = `LB_SITES=1 deploy/rehearsal/run.sh --project=chromebook --workers=1 tests/stack/sites.spec.js; node scripts/sites-merge.mjs`. List and selectors in `tests/stack/real-sites.json` (a site "loads" when the page is shown, no error card and its selector exists in the proxied frame), 3 reps in fresh contexts,
  one test per site, per-site JSON in `test-results/sites-<sha>/`, merged into `test-results/sites-<sha>.json`. `LB_SITES_REPS`, `LB_SITES_ONLY=a,b`, `LB_SPEED_SHA`. Failure categories: dns, connect, tls, http, blocked, csp, script, render, timeout, harness. Results: `docs/1.0/baseline/`, summary in `docs/1.0/BASELINE.md`. Run it alone: it is heavy and timings move with other load.
- **Tests:** `tests/e2e/s3.spec.js`, `s3-back.spec.js`, `s3-pagecache.spec.js`, `s3-sleep.spec.js`, `s3-warm.spec.js`, `s3-css.spec.js`, `appscript.spec.js` (helpers `s3-helpers.js`, e2e port `LB_E2E_PORT`).

## Membership (1.0 slice S5, merged into `release/1.0.0` with S4, not deployed; gate side in `~/limitless-gate` CLAUDE.md "Membership")
- **nginx:** `map $lb_reason $lb_deny_path` sends a gate 403 reason (`removed`, `suspended`, `welcome`, else the invite page) to `/auth/<reason>` for HTML requests; `/_lb/me/certificate.pdf` is gated; `/_lb/verify/` (plus the secret-guarded relay sync) are the only ungated `/_lb/` paths (public status for HALL and QR codes, no name). Test `tests/e2e/membership.spec.js` fails if another `/_lb/` location loses its gate.
- **App:** the `/_lb/me` poll (with the busy hint) stores the gate's answer in `window.LB_member` and fires `lb-member` when `membership` is `on`. Display only; every access decision is the gate's. S6 (slice `slice/1.0-ui`) added `app/ui.js` (see "UI layer").
- **Stack spec:** `tests/stack/membership.spec.js` (rehearsal gate with `MEMBERSHIP=on`, set by `LB_REHEARSAL_MEMBERSHIP=1 deploy/rehearsal/run.sh --project=chromium tests/stack/membership.spec.js`; skipped otherwise, and off for the normal `npm run test:stack` because fresh accounts would stop at the ceremony): Executive invite (non-kmlhs.org email refused), redeem by the named account, sign-in, ceremony, certificate PDF, public verify without a name, relay token with the `m_` id and plan, suspend cuts the VPS stand-in socket (under 2 s) and refuses new tokens. The rehearsal must use the gate that matches this branch: `GATE_CONTEXT=~/gll-worktrees/lbgate-release-1.0` (the default is `~/limitless-gate` main). Run under `flock /tmp/limitless-rehearsal.lock`.
- **Flip to the free tier at 1.0:** GLL ID needs `limitless-browser` switched to open (`./manage.sh clients approval limitless-browser open`, built on GLL ID branch `slice/limitless-1.0`); NOT done and not to be done before the 1.0 deploy, because 0.3.0 is invite only. Open clients also require a verified email in GLL ID.

## UI layer (1.0 slice S6, `docs/1.0/UI.md` section 10; branch `slice/1.0-ui`, not deployed)
- **`app/ui.js`** (loaded after `app/main.js`; the build rewrites it to `app/<sha>/ui.js`) holds: the Limitless menu (`#lbMenuBtn`, `#lbMenu`; items click the old controls by id, so skins keep upstream; under `data-skin` the old toolbar returns and the menu button is hidden), developer mode (`limitless:devmode:v1`, `html[data-lb-dev]`), the address bar domain view (`#lbUrlView`, a value setter hook on `#url`), tab layout (`limitless:tablayout:v1`, `html[data-lb-tabs]`), the six settings groups (group = old sections shown together, `data-lb-group`; the settings nav has six items whose `data-section` is each group's first section), the Membership page (`#lbMemberPage`), splash name (`limitless:me:v1`, name and number only), start page member card, bulletin (`limitless:notices-dismissed:v1`), expiry notices (14 and 3 days), the Ordinal tab cap (`window.LB_tabGate`, called from `createTab`) and daily time (`limitless:daytime:v1`, client side only), the 3 step tour (`limitless:tour:v1`), Report a problem (`window.LBReport`, `POST /_lb/reports`), the bot check detector (`window.LB_botCheck`, called from `go()`). `window.LBUI` exposes helpers for tests. `LB_member` refreshes every two minutes (`window.LB_meRefresh()` to force); only the busy note is once per session.
- **Themes:** 13 now. Paid themes `ink`, `silver` (Cardinal), `garnet` (Prime), `gilt`, `onyx` (Executive) plus Vault (Cardinal) are locked by the plan in `/_lb/me` (`plan.tier`, the effective tier): `LBTheme.member(me)` runs on `lb-member`, `NEEDS` and `DARK_ONLY` are in the head script, a lapse falls back to the last free theme (`limitless:lastfree:v1`, else `plan.lastFreeTheme`, else Luxury) and fires `lb-theme-locked`. Without membership data nothing is locked. Locked tiles use `aria-disabled` and show a note when clicked. Tier marks `lb-mk-tier-*` in `#lbMarks`; icons `theme/icons.svg` (`<svg class="lb-i"><use href="theme/icons.svg#lb-i-NAME"/>`). New S6 CSS is `theme/ui.css`.
- **Error card:** `renderErrorPage` builds a calm card from `LB_CALM` (keyed on the error type), colours from the parent's `--lb-*` tokens. The old 18 step tutorial (overlay, settings page, `startTutorial`) is removed; `patcher.html` still carries tutorial patch definitions that now match nothing (clean-up open).
- **Ceremony (wired):** `theme/ceremony/` is served by nginx at `GET /auth/welcome` (exact location, ungated, `rewrite` to `/theme/ceremony/index.html`; its assets under `/theme/{ceremony/,fonts/,fonts.css,themes.css}` are ungated too, since a welcome-state member is refused everywhere else). Data comes from the gate's JSON routes: `GET /auth/welcome/state` (added in lbgate branch `slice/1.0-ui`; 401 `{error:'redirect', to}` signed out, the page goes to `to`), `GET/POST /auth/welcome/number`, `POST /auth/welcome/sign`, `POST /auth/welcome/step` (the page uses steps 1 and 6; the gate records 2 on number and 4 on sign; resume at the reveal when step <= 4). No Browser code is in lbgate. Tests: `ceremony.spec.js` (mocked), `membership.spec.js` (nginx rules), stack `membership.spec.js` (real gate, needs `GATE_CONTEXT` with the state route).
- **Tests:** `tests/e2e/ui-*.spec.js`, `ceremony.spec.js`, helpers `helpers-ui.js` (mock `/_lb/me`), `menuItem()` in `helpers.js` for toolbar actions that moved into the menu; `npm run test:visual` (`tests/visual/`: start page, menu, settings groups in every theme and mode at 1366x768 and 2560x1440, vertical tabs and cap dialog, ceremony steps in three themes; baselines in `tests/visual/__screens__`; `layout.js` ignores text clipped by an overflow ancestor, covered by an overlay, or beyond a tight line box). Quiet text on S6 surfaces uses `--tx2` and links `--lb-link` (accent mixed toward text) to hold 4.5:1.

## Server path (1.0 slice S4, docs/1.0/RELAY.md)
- **Auth cache:** `/_gate/check` in `deploy/web/nginx.conf` uses `proxy_cache lbauth` (5 s, 200 only, key host + session cookie, no cookie = no cache; `Cache-Control: no-store` from the gate is ignored there on purpose). A revoked or cut-off user can keep getting app files from nginx for up to 5 s; new `/wisp/` sockets are refused at once by the gate. Tests that expect a refusal right after a revoke must poll for 5 s (`tests/stack/authcache.spec.js`, `admin.spec.js`). Kill switch: remove the `proxy_cache lbauth;` lines.
- **Per-hop timing:** `Server-Timing` (security-headers snippet; empty without an auth subrequest) and `X-LB-T` on `/wisp/` carry gate ms, cache HIT/MISS and the cf-ray. Aggregates only; no hostnames anywhere.
- **Relay DNS cache:** service `dns` (`deploy/dns/`, unbound, 10.88.81.53, DoT to 1.1.1.1 and 9.9.9.9); relay `dns_servers` points at it; relay is 4 CPUs and 1 GiB. `deploy/rehearsal/run.sh` rewrites the address for the 10.89.x rehearsal networks.
- **VPS relay (1.0 S4, `slice/1.0-relay`, docs/1.0/RELAY.md 3.7):** with `features.ownRelay` on, `LB_relayTok` fetches a 5 minute token from `POST /_lb/relay-token` (renewed when under 60 s are left) and `LB_openRelaySocket` (one line in the libcurl glue in `index.html`) opens our relay's WISP sockets on the VPS URL from the answer with the token as WebSocket subprotocol `lbt.<token>`. No token or a refused socket marks our relay down (`LB_relayStatus().ours`), shows the relay notice and falls back to the same-origin `/wisp/` (410), then public relays by consent; the VPS is retried after 20 s. 1.0 build: `LB_FEATURE_OWNRELAY=true LB_FEATURE_OWNSOCKETS=4`. nginx: `/_lb/relay-token` gated, `/_lb/relay/sync` ungated in nginx but authenticated by its shared secret in the gate (the only ungated `/_lb/` paths are this and `/_lb/verify/`; spec in `tests/e2e/membership.spec.js`) (shared secret, polled by the VPS every second, nothing opened at home). VPS stack `deploy/relay-vps/` (compose project `limitless-relay-vps`, `deploy-vps.sh`, `egress-rules.sh`; secrets `.env`, `relay.env`, `loadtest.env` gitignored). Rehearsal: service `vps` (the gate in `GATE_MODE=relay`, `REHEARSAL_VPS_PORT` 8592). Tests: `tests/e2e/relaytoken.spec.js`, `tests/stack/relay.spec.js`. Host steps and the load test: `docs/1.0/S4-HOST-COMMANDS.md` 7 to 10.
- **Not applied by the repo:** BBR (host), tunnel/DNS/ports: `docs/1.0/S4-HOST-COMMANDS.md`, `docs/1.0/TUNNEL-OPTIONS.md`.

## Admin panel (0.2.0, slice D)
- **Page:** `limitless://admin`, registered into `SKIN_PAGES` through the hooks `window.LB_pages` and `window.LB_go` (added after the What's new
  block). Everything else is its own `<script>` just before the theme script, plus the `.lb-adm-*` section at the end of `theme/chrome.css`. The
  entry is the "Admin panel" link in Settings > About (`#lbAboutAdmin`), hidden until `GET /_lb/admin/api/whoami` is 200 (`window.LB_adminProbe()`,
  first run 4 s after load). Typing the URL works for anyone but shows "not available" unless whoami is 200. All data is shown with `textContent`.
- **Leaving it:** `#lbAdmClose` (Close) calls `window.LB_back()` (back to the previous page of the same tab, or the start page when there is none; the tab is never replaced or closed), Home goes to the start page; `showNewTab` calls `closeSkinPages()`, so no overlay page (admin, What's new) stays on top. Tests: "leaving the admin panel" in `tests/e2e/admin.spec.js`.
- **Sections:** Users (approve by login name, last seen, today, cut off or restore, revoke with a second click), Usage (today, 30 days, live
  sockets and streams, 80 % warnings, per-user limits), Switches (pause new sign-ins, maintenance, cut off one user), Health (relay, GLL ID, live counts,
  version, counters). A write that answers `403 {error:'stepup'}` opens the password dialog (`#lbAdmStepup`) and retries once. The dialog shows the gate's reason code (`legal_required`, `wrong_password`, `not_owner`, `rate_limited`, `gate_unavailable`...); `legal_required` reveals the acceptance checkbox and resends with `acceptedLegal: true`.
- **S7 (1.0, `slice/1.0-admin`, not merged, not deployed; `docs/1.0/ADMIN.md`):** the one script grew cards before and after the 0.2.0 ones, in this order: Members (search, filter chips, profile), Invites, Users, Usage, Live and 30 days (inline SVG `barChart`, `.lb-adm-svg`), Where the time goes (`GET hops`), Plans and knobs (all plan numbers, "Plans open for sale" ships off, second click), Switches, Health (VPS link age), Notices, Problem reports, Audit log. Card ids `lbAdm<Name>`. Member sections call the gate's `membership/*` routes and say "Membership is off" on a 404. Writes use `write(path, body, method)`, so step-up is unchanged; inside the member profile `arm2` is the second-click confirm (no re-render, so typed notes stay); the 0.2.0 `twoClick` is still used by the old cards. Members, notices and reports show names, numbers or text with `textContent`; a report shows a domain only when the member sent it. Report intake is `POST /_lb/report` (nginx `location = /_lb/report`, gated). Tests: `tests/e2e/admin.spec.js` (S7 block, all 8 themes at 1366x768, 2560x1440 and 390 wide; `LB_SHOTS=1` writes screenshots to `test-results/`), `tests/stack/admin.spec.js` (non-owner 404 on every new route, live and 30-day, notices, report to owner; run with `GATE_CONTEXT=$HOME/gll-worktrees/lbgate-admin`).
- **Server side:** `/_lb/admin/api/*` in the check service (`~/limitless-gate` CLAUDE.md, "Admin panel API"). nginx: `location ^~ /_lb/admin/`
  (gated, 16k body, no-store) and `X-LB-Reason: maintenance` maps to `/auth/maintenance` like `unavailable`.
- **Kill switches:** `ADMIN_PANEL=off` in `deploy/gate.env` (every admin route 404s), `./manage.sh clients owner-api limitless-browser off` in GLL ID.
  `OWNER_SUB` must be set in `deploy/gate.env` for the panel to work at all. `deploy.sh` passes the deployed sha to the gate as `BUILD_SHA`.
- **Tests:** `tests/e2e/admin.spec.js` (mocked routes, all 8 themes), `tests/stack/admin.spec.js` (rehearsal: owner vs normal user, approve and revoke,
  maintenance). The rehearsal seeds a mock owner (`owner` / `owner-pass-1`, fixed sub in `run.sh`) and sets `OWNER_SUB` to it.

## Paid tiers selling (1.0 slice S9, `slice/1.0-plans`, not merged, not deployed; `docs/1.0/PAID-TIERS-PLAN.md` 10c)
`limitless://plans` is a SKIN_PAGES overlay in `app/main.js` (block `S9 plans`, functions `lbPlans*`, own injected style, entry link `lbAboutPlans` in About): plan cards from `me.plan.catalog`, account panel (tier, paid-until, usage and cap, top-up, fallback line, receipts, request state), trial button, request form (reason, "I am allowed to do this" box, no payment fields), 14 and 3 day expiry banner and a first-fallback banner (`lb-ub` style, once each via localStorage). All gate truth comes from `/_lb/me`; POSTs go to `/_lb/trial` and `/_lb/plan-request`. nginx gates `/_lb/trial|plan-request|load-now|perf` (POST only). Tests: `tests/e2e/plans.spec.js` (mocked routes), `tests/stack/plans.spec.js` (rehearsal with `LB_REHEARSAL_MEMBERSHIP=1 GATE_CONTEXT=<gate worktree>`). Not built in the app: Load Now button, client load-time samples to `/_lb/perf`, the admin Queue screen (gate routes exist).

## Downloads panel (1.0 slice S8, `slice/1.0-downloads`, `docs/1.0/SPEED.md` 6)
- `window.LB_downloads` (end of `app/main.js`): `add(url)`, `pause/resume/retry/cancel(id)`, `items()`, `open()` (panel `#lbDl`, styles `.lb-dl-*` at the end of `theme/chrome.css`), `adopt(url, name, size)` (viewer path: same limits and daily count after `go()` fetched the file), `cfg.backoff`, `ls`. It calls `curl.fetch` directly (stub `LB_net.curl` in tests), streams `resp.body`, resumes with `Range: bytes=N-` when the server sent `Accept-Ranges`, saves with blob plus `<a download>`.
- Limits: `LB_member.plan.limits.downloadMbPerFile` and `downloadsPerDay` (0 = none; refreshed from `/_lb/me` at most once a minute), checked on the first response (Content-Length or Content-Range, body unread) and, without a length, as the body streams. Over 2 GB is always refused. Ordinal's daily count: `limitless:dlcount:v1` `{d, n}`. Max 2 at once (1 with Data saver). Kill switch `features.downloads` (`LB_FEATURE_DOWNLOADS=false`). Test `tests/e2e/downloads.spec.js`.
- Shared lines touched: the `downloads:` menu item in `app/main.js` (calls `LB_downloads.open()`, falls back to the old settings page), the `_ftype === 'binary'` branch in `go()` (one `adopt` line), `LB_features` default and key list, `scripts/build-static.sh` (`FEAT_DOWNLOADS`).

## Legal v2 dark launch (2026-11-01, contract in ~/gll-planning/legal-hall/PLAN.md)
`LEGAL_VERSION` (YYYY-MM-DD) on the `web` container, from `deploy/.env` (gitignored; compose pass-through, empty default). nginx cannot read env, so `deploy/web/legal-v2.sh` (an nginx `docker-entrypoint.d` script) writes `/tmp/legal-v2.conf` at container start, included by the `/legal/` location. Unset, empty or invalid: empty file, `/legal/` exactly as before. Set: `/legal/terms(.html)` and `/legal/privacy(.html)` 302 to `https://hall.taps-holdings.org/legal/terms|privacy`; `/legal/` itself stays served (it holds the AGPL source link). No consent storage here: GATE sign-in is acceptance. Go-live: put `LEGAL_VERSION=<date>` in `deploy/.env` and `docker compose -p limitless-browser -f deploy/docker-compose.yml up -d web` (recreate, no rebuild); gate side is `LEGAL_VERSION` in `deploy/gate.env`. Test: `npm run test:legal` (throwaway nginx container).

Last verified: 2026-11-15
