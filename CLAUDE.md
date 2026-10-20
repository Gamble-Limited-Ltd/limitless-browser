# CLAUDE.md

Fork of GUST (Nautilus Labs, AGPLv3), being rebranded for Gamble Limited Ltd. (GLL).
**Master plan, decisions and implementation stages: `docs/PLAN.md`** (planning Q&A 2026-10-18). Rebrand details: `docs/REBRAND-PLAN.md`. Read both before touching names, credits, license text or features.

Product name is **Limitless Browser** (decided 2026-10-17, replaces "GLL Lens"). Own Limitless look plus the GLL Portfolio Stamp, not the full Gilded Ledger chrome. Public host **`limitless.taps-holdings.org`** (decided 2026-10-18, replaces `gll-browser.taps-holdings.org`). Copy neutral: "private browsing proxy".
Removed (stage 2, 2026-10-19): Discord client, new-tab widgets, AI assistant, translate, `svg/`. Upstream fixes are cherry-picked by hand; the fork is in step with `upstream/main` 08515a7 as of 2026-10-18.
Limitless Browser is AGPL: never copy its code into proprietary GLL repos (gll-shared, gll-id); copying GLL brand assets in is fine with a `docs/SHARDS.md` log.

**Invite only (decided 2026-10-17):** sign-in through GLL ID (GATE) is required and only users Boss approves get in. Everyone else sees an "invite only" page. Enforced server-side at nginx (`auth_request`, covering the app and `/wisp/`), not in client JS. Approvals live in GATE as per-app access (client `limitless-browser`). GATE v1 is live (2026-10-17); a small proprietary check service (own private repo) does OIDC + direct sign-in and `/oidc/access-check`. Only `/legal/` is served ungated. Full design: `docs/ACCESS-CONTROL.md`. Never ship a public, ungated deploy.

Hosting (Docker nginx on 127.0.0.1:8580) and speed plan: `docs/HOSTING-AND-PERFORMANCE.md`.

## What this is
A browser-style web proxy in static files. No build system, lint or CI. `package.json` exists only for the Playwright test harness (dev dependency, nothing ships from it).
- `index.html` (~3.6 MB): the whole app, JS and CSS inlined, with vendored libs (acorn, libcurl.js WASM). Third-party assets are self-hosted (below); no CDN or font-service requests remain.
- `patcher.html` (renamed from `GUST-Patcher.html`, 2026-10-19): standalone patcher tool page. Its patch definitions match identifiers and storage keys in `index.html`; when you rename code there, update them too. It fetches only our own same-origin `./index.html` (no third-party fallbacks); served behind the gate.
- `vendor/` and `fonts/` (stage 2, 2026-10-19): self-hosted third-party assets, each with its license file: `vendor/fontawesome/6.7.2/` (Font Awesome Free; upstream mixed 6.7.2 and 6.5.1, we standardised on 6.7.2), `vendor/pdfjs/4.2.67/`, `vendor/iso-639-1/2.1.11/`, `fonts/` (JetBrains Mono, Space Grotesk, `fonts/fonts.css`). `svg/` (stale CDN variant) was removed. Documents the app generates (error page, viewers) must use the absolute `LB_FA`, `LB_PDFJS`, `LB_FONTS_CSS` URLs, not relative paths.
- Relays (stage 2): default relay is our own same-origin `/wisp/` (`ws:`/`wss:` from the page protocol; none on `file://`). The 13-entry third-party pool plus the `mages.io` fallback stay in the code but are used only when "Allow third-party relays" is on (`gust:relay-fallback:v1` = `1`, settings: Connection, reloads the page). `window.LB_relayStatus()` returns `{ours:'ok'|'down'|'unknown', fallbackAllowed}`; if our relay fails the startup probe a plain notice offers to enable third-party relays (themed UI comes in a later stage).
- `README.md`, `LICENSE` (AGPLv3, unmodified template).

Remotes: `origin` = Gamble-Limited-Ltd/limitless-browser (renamed from `Browser` 2026-10-18; GitHub redirects the old URL), `upstream` = nautilus-os/GUST.

## Deploy (stage 5, local only; no public route until stage 7)
- Prod stack: `./deploy.sh [sha]` (clean tree, builds from `git archive`, compose project `limitless-browser`, web on `127.0.0.1:8580`, smoke test, `.last-deploy-hash`). Rollback: `./deploy.sh <previous sha>`. Needs `~/limitless-gate` and gitignored `deploy/gate.env`.
- Local test with a stub gate: `deploy/dev-up.sh` (`DEV_ALLOW=1` allows, `DEV_ALLOW=403` shows invite, default asks sign-in); stop with `docker compose -p limitless-browser down`.
- Static tree: `scripts/build-static.sh <sha>` (index.html, patcher.html, vendor/, fonts/, theme/, legal/, favicon.svg, CHANGELOG.md, version.json; gzip + brotli). It also stamps `<sha>` into the dist copy of `index.html` (see Start page, update notice below).
- Served ungated: `/legal/`, `/theme/` (themes.css, fonts, marks, brand stamp), `/favicon.svg`, `/auth/*`. Everything else, including `/wisp/` and `version.json`, goes through `auth_request`. Details: `docs/HOSTING-AND-PERFORMANCE.md` section 5.
- Theme CSS is generated: edit `scripts/gen-themes.py`, rerun. Fonts: `scripts/fetch-fonts.py`.

## Run / verify
- Open `index.html` via `file://` or serve statically: `python3 -m http.server 8000` then browse to it.
- Tests: `npm install` once, then `npm test`. Playwright (pinned `@playwright/test` 1.64.0, matches the chromium-1248 build already in `~/.cache/ms-playwright`) starts `python3 -m http.server 8599` and runs the smoke test in `tests/e2e` (app shell loads, no uncaught page errors, title set, address bar accepts input). It does not replace manual checks: also load the page, check the console, and exercise the touched feature.
- Check CRLF vs LF before large edits (`file index.html`); commit 1a193ab was a big Windows-related rewrite.

## Rules
- `index.html` is huge. Never Read it whole; use Grep with line numbers, then Read small ranges. Prefer targeted Edit over rewrites.
- AGPLv3 stays. Never remove upstream credits, the libcurl.js LGPL notice, or the third-party license string (`copyright_notice` in `index.html`). Add GLL notices, do not replace theirs.
- localStorage keys are `limitless:*:v1` (renamed from `gust:*:v1` in stage 3a) and are user data. The app stores most keys as `gi_<id>:limitless:...`; on http(s) the id is stable per origin (`limitless:inst:v1`, test `tests/e2e/persistence.spec.js`), on `file://` it is per tab (upstream). A shim in the first script of `index.html` copies old `gust:*` and `gi_<id>:gust:*` keys once (flag `limitless:migrated:v1`), keeps the old keys for one release, and never overwrites existing new keys; test: `tests/e2e/migration.spec.js`. `gust_ai_ctx` (removed AI assistant) is deleted on load. IndexedDB `gust_extensions` keeps its old name on purpose (renaming would lose installed extensions). Do not rename a key again without a migration.
- Code identifiers use the `lb-` / `lb` prefix (CSS classes, `data-lb-*`, `__lbLoc`), internal pages are `limitless://` (`gust://` is still accepted as an alias in `normUrl`), the extension API is `LimitlessExt` (`window.GustExt` alias kept), and the version lives in one constant `LB_VERSION`. Remaining `gust` strings are only the shim, aliases and credits.
- Do not imply affiliation with GUST or Nautilus Labs beyond factual credit.
- Do not add or extend filter-evasion or detection-evasion features without Boss's explicit decision.
- Writing style for docs and UI copy: no em dashes, no invented facts.
- Commit only when asked. Keep docs (this file, the plan) updated in the same commit as the change.
- The company site (`~/gll-site`) and the global CLAUDE.md describe cross-project rules; follow them if this project ships.

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

## Faster browsing (0.2.0 slice, 0.2.0 slice)
- **Speed harness (F6):** `window.__lbPerf` (`start(url)`, `mark(name)`, `runs`) is always on and local; `go()` marks `firstBytes`, `dom`, `shown`, `load` in ms
  since the navigation started. `npm run test:speed` (= `LB_SPEED=1 deploy/rehearsal/run.sh tests/stack/speed.spec.js`, needs outbound internet) loads the sites in
  `tests/stack/speed-sites.json` cold and warm, 3 reps each in fresh contexts (`LB_SPEED_REPS`, `LB_SPEED_ONLY`, `LB_SPEED_SHA`), and writes
  `test-results/speed-<sha>.json` (medians). `node scripts/speed-compare.mjs base.json cand.json` fails (exit 1) when a median load is more than 10 % and 100 ms slower.
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
- **Feature switches:** `window.LB_features` `{ownSockets (1-4), worker, respCache}` defaults on/4; `window.LB_featuresReady` reads `features` from `version.json`
  at boot (missing file or keys keep the defaults). Used at use time by the router, the cache and the script rewriter.
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
- **Kill switches at build time:** `scripts/build-static.sh` writes `features` into `version.json` from `LB_FEATURE_OWNSOCKETS` (0 to 4, default 4), `LB_FEATURE_WORKER` and
  `LB_FEATURE_RESPCACHE` (`true`/`false`, default true), e.g. `LB_FEATURE_WORKER=false ./deploy.sh`. Users can also turn off the cache (Settings) and set sockets (Settings).
## Admin panel (0.2.0, slice D)
- **Page:** `limitless://admin`, registered into `SKIN_PAGES` through the hooks `window.LB_pages` and `window.LB_go` (added after the What's new
  block). Everything else is its own `<script>` just before the theme script, plus the `.lb-adm-*` section at the end of `theme/chrome.css`. The
  entry is the "Admin panel" link in Settings > About (`#lbAboutAdmin`), hidden until `GET /_lb/admin/api/whoami` is 200 (`window.LB_adminProbe()`,
  first run 4 s after load). Typing the URL works for anyone but shows "not available" unless whoami is 200. All data is shown with `textContent`.
- **Sections:** Users (approve by login name, last seen, today, cut off or restore, revoke with a second click), Usage (today, 30 days, live
  sockets and streams, 80 % warnings, per-user limits), Switches (pause new sign-ins, maintenance, cut off one user), Health (relay, GLL ID, live counts,
  version, counters). A write that answers `403 {error:'stepup'}` opens the password dialog (`#lbAdmStepup`) and retries once.
- **Server side:** `/_lb/admin/api/*` in the check service (`~/limitless-gate` CLAUDE.md, "Admin panel API"). nginx: `location ^~ /_lb/admin/`
  (gated, 16k body, no-store) and `X-LB-Reason: maintenance` maps to `/auth/maintenance` like `unavailable`.
- **Kill switches:** `ADMIN_PANEL=off` in `deploy/gate.env` (every admin route 404s), `./manage.sh clients owner-api limitless-browser off` in GLL ID.
  `OWNER_SUB` must be set in `deploy/gate.env` for the panel to work at all. `deploy.sh` passes the deployed sha to the gate as `BUILD_SHA`.
- **Tests:** `tests/e2e/admin.spec.js` (mocked routes, all 8 themes), `tests/stack/admin.spec.js` (rehearsal: owner vs normal user, approve and revoke,
  maintenance). The rehearsal seeds a mock owner (`owner` / `owner-pass-1`, fixed sub in `run.sh`) and sets `OWNER_SUB` to it.
