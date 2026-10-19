# CLAUDE.md

Fork of GUST (Nautilus Labs, AGPLv3), being rebranded for Gamble Limited Ltd. (GLL).
**Master plan, decisions and implementation stages: `docs/PLAN.md`** (planning Q&A 2026-10-18). Rebrand details: `docs/REBRAND-PLAN.md`. Read both before touching names, credits, license text or features.

Product name is **Limitless Browser** (decided 2026-10-17, replaces "GLL Lens"). Own Limitless look plus the GLL Portfolio Stamp, not the full Gilded Ledger chrome. Public host **`limitless.taps-holdings.org`** (decided 2026-10-18, replaces `gll-browser.taps-holdings.org`). Copy neutral: "private browsing proxy".
Removed in the plan: Discord client, new-tab widgets, AI assistant, translate, `svg/`. Upstream fixes are cherry-picked by hand; the fork is in step with `upstream/main` 08515a7 as of 2026-10-18.
Limitless Browser is AGPL: never copy its code into proprietary GLL repos (gll-shared, gll-id); copying GLL brand assets in is fine with a `docs/SHARDS.md` log.

**Invite only (decided 2026-10-17):** sign-in through GLL ID (GATE) is required and only users Boss approves get in. Everyone else sees an "invite only" page. Enforced server-side at nginx (`auth_request`, covering the app and `/wisp/`), not in client JS. Approvals live in GATE as per-app access (client `limitless-browser`). GATE v1 is live (2026-10-17); a small proprietary check service (own private repo) does OIDC + direct sign-in and `/oidc/access-check`. Only `/legal/` is served ungated. Full design: `docs/ACCESS-CONTROL.md`. Never ship a public, ungated deploy.

Hosting (Docker nginx on 127.0.0.1:8580) and speed plan: `docs/HOSTING-AND-PERFORMANCE.md`.

## What this is
A browser-style web proxy in static files. No build system, lint or CI. `package.json` exists only for the Playwright test harness (dev dependency, nothing ships from it).
- `index.html` (~3.8 MB): the whole app, JS and CSS inlined, with vendored libs (acorn, libcurl.js WASM, PDF.js).
- `GUST-Patcher.html`: standalone patcher tool page. It fetches upstream `index.html` from jsDelivr (see plan).
- `svg/site.svg` + `svg/static/{css.css,js.js}`: stale SVG-foreignObject variant for CDN hosting. Planned for removal (`docs/PLAN.md` stage 2); do not spend effort syncing it.
- `README.md`, `LICENSE` (AGPLv3, unmodified template).

Remotes: `origin` = Gamble-Limited-Ltd/limitless-browser (renamed from `Browser` 2026-10-18; GitHub redirects the old URL), `upstream` = nautilus-os/GUST.

## Run / verify
- Open `index.html` via `file://` or serve statically: `python3 -m http.server 8000` then browse to it.
- Tests: `npm install` once, then `npm test`. Playwright (pinned `@playwright/test` 1.64.0, matches the chromium-1248 build already in `~/.cache/ms-playwright`) starts `python3 -m http.server 8599` and runs the smoke test in `tests/e2e` (app shell loads, no uncaught page errors, title set, address bar accepts input). It does not replace manual checks: also load the page, check the console, and exercise the touched feature.
- Check CRLF vs LF before large edits (`file index.html`); commit 1a193ab was a big Windows-related rewrite.

## Rules
- `index.html` is huge. Never Read it whole; use Grep with line numbers, then Read small ranges. Prefer targeted Edit over rewrites.
- AGPLv3 stays. Never remove upstream credits, the libcurl.js LGPL notice, or the third-party license string (`copyright_notice` in `index.html`). Add GLL notices, do not replace theirs.
- localStorage keys (`gust:*:v1`, ~130, plus `gust_ai_ctx`) are user data. Do not rename without a migration (see plan).
- Do not imply affiliation with GUST or Nautilus Labs beyond factual credit.
- Do not add or extend filter-evasion or detection-evasion features without Boss's explicit decision.
- Writing style for docs and UI copy: no em dashes, no invented facts.
- Commit only when asked. Keep docs (this file, the plan) updated in the same commit as the change.
- The company site (`~/gll-site`) and the global CLAUDE.md describe cross-project rules; follow them if this project ships.
