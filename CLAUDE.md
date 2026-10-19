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
- Static tree: `scripts/build-static.sh <sha>` (index.html, patcher.html, vendor/, fonts/, theme/, legal/, favicon.svg, version.json; gzip + brotli).
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
