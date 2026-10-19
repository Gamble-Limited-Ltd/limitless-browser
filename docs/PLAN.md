# Limitless Browser: master plan

Status: planning. Decisions from Boss's planning Q&A on 2026-10-18 unless dated otherwise. Nothing is built yet.
Detail lives in the topic docs: `REBRAND-PLAN.md` (names, credits, license), `ACCESS-CONTROL.md` (GATE gate),
`HOSTING-AND-PERFORMANCE.md` (deploy, relay, speed). This file is the index and the stage plan.

## 1. Baseline (checked 2026-10-18)
- Fork of `nautilus-os/GUST`. Our `main` equals `upstream/main` (08515a7, 2026-10-03), so we are on the latest
  upstream. The only other upstream branch (`copilot/fix-gust-browser-errors`, 2026-04-25) is an unmerged
  experiment that deletes the SVG variant; not a release, not taken.
- Upstream version: "GUST 2.0" (README badge only). Vendored libcurl.js 0.7.4, WISP 1.1.1, PDF.js 4.2.67.
- `index.html`: 28,664 lines, LF endings. 56 unique literal `gust:*` storage keys (docs said ~130; some keys
  are built at runtime, so the migration must scan by prefix, not by a fixed list).
- GATE (GLL ID) v1 is live since 2026-10-17 and already has per-app approvals and `POST /oidc/access-check`
  for Limitless. Limitless is second in GATE's integration order (Meridian, Limitless, HT, GLL).

## 2. Decisions (2026-10-18)
### Identity
| Topic | Decision |
|---|---|
| Host | `limitless.taps-holdings.org` (replaces `gll-browser.taps-holdings.org`, never deployed) |
| Look | Own Limitless look plus the GLL Portfolio Stamp and "A Gamble Limited Ltd. product" (HT precedent). Not the full Gilded Ledger chrome. |
| Themes | Theme set, shown first in a design artifact for Boss to pick: Limitless themes built on `#4DA6FF` and `#BDFFFF` in several styles (formal, modern, fancy, more), a GLL branded theme (light and dark), a GLL monochrome theme. GLL theme colors are copied from gll-shared tokens with a `SHARDS.md` entry. |
| Logo / icon | Own Limitless mark, options shown in the same artifact. Not the Filing Tab G. |
| Repo rename | **Done 2026-10-18**: `Gamble-Limited-Ltd/Browser` is now `Gamble-Limited-Ltd/limitless-browser`, `origin` updated. |
| Version | Own semver, `0.1.0` at launch. About shows "Based on GUST 2.0 (08515a7) by Nautilus Labs, modified by Gamble Limited Ltd." `CHANGELOG.md` in player style. |

### Features: keep, cut, add
| Area | Decision |
|---|---|
| Discord Anywhere client | **Remove** |
| New-tab widgets (deals, NYT RSS, picsum/Unsplash) | **Remove**, replaced by the Limitless start page |
| AI assistant (Pollinations) | **Remove** (also retire `gust_ai_ctx`) |
| Translate (libretranslate.com) | **Remove** |
| Chrome extension emulation, CRX install, Opera GX mods | Keep |
| GUST-Patcher | Keep, **served behind the gate only**, builds from our gated copy, not from upstream |
| SVG/CDN variant (`svg/`) | **Remove** (stale, exists for hosting outside the gate) |
| Fonts, Font Awesome, PDF.js, iso-639-1 | Self-host from our origin, keep license notices |
| Filter-targeted upstream code (Lightspeed Base64, Lightspeed-tuned retries, fingerprint mimicry, disguise skins) | Leave as upstream, never extend (Boss). Do not port new upstream evasion commits. |
| Third-party WISP relays (15) | Kept as a hidden fallback, **off by default**. If our relay is unreachable the app shows a notice ("this relay is not run by Gamble Limited Ltd.") with a link to switch on the third-party fallback. |
| New: Limitless start page | Launch scope |
| New: persistence and sync | Post-launch (section 4) |
| New: admin dashboard + per-user usage meter | Post-launch |
| New: download manager | Post-launch, in-browser only |

### Platform
| Topic | Decision |
|---|---|
| Gate | Small **proprietary** check service (Node 24 + Hono, GATE's stack), own private repo and container, HTTP-only contact with GATE. OIDC redirect login **and** GATE direct sign-in (`/oidc/direct/*`, like HT). Details: `ACCESS-CONTROL.md`. |
| Session | Limitless session cookie lasts 7 days; access re-checked against GATE at most every 60 s |
| Email rule | Follow GATE as is (kmlhs.org accounts plus owner-approved exceptions) |
| Revocation | Open `/wisp/` connections are cut within about 60 s |
| Relay | Own **epoxy-server** (Rust) in a locked-down container on this VM, same origin `/wisp/` |
| Abuse caps | Conservative per-user caps; Boss's account near-unlimited |
| Deploy | Baked nginx image pinned to a git sha, precompressed files, `127.0.0.1:8580` |
| Frontend | **Staged hybrid**: keep the single file through the rebrand, add compression, then move vendored libs to hashed files, and only move to `src/` + esbuild if editing pain warrants it |
| Upstream | Cherry-pick bug and compatibility fixes by hand, checked monthly; skip evasion work |
| Updates | App polls `version.json`; shows "Update available, reload" with a What's new link. Never reloads by itself. |
| Tests | Playwright smoke suite for the app; Vitest for the check service. Every fix starts with a failing test. |
| Legal | Privacy and terms **in the app**. `/legal/` is the one path served without the gate so people can read the policy before signing in (plain static text, no app code). |
| Invite page | Plain "Limitless Browser is invite only." notice, signed-in email, sign-out and switch-account, GLL stamp. No request form. |
| Release procedure | Adopted **after launch**: `0.1.0` launches outside the lanes; lanes, gates and watch periods apply from `0.1.1`. Boss still runs prod deploys. |
| Company site and gll-shared | Stale "GLL Lens" entries (gll-shared `games-registry`, gll-site `roadmap/lens.md`) are fixed **at launch**, with Boss's OK per repo at that time |

## 2b. Design picks (Boss, 2026-10-18, from the design picker artifact)
Source: https://claude.ai/artifact/UaudLygUksTJaxxSccEXue, collection `picks` (44 picks). Rule from Boss: every
favourite **and** maybe ships as a selectable theme, so users pick from several Limitless and GLL themes, each with
a light and a dark mode where one exists. Splash, auth screens and settings menus are styled by the active theme.

| Area | Ships | Not taken |
|---|---|---|
| Limitless themes | **Luxury** (light fav, dark maybe), **Fancy**, **Minimal**, **Soft**, **Retro** (each light + dark) | Formal, Modern, Glass, Editorial, Neon |
| GLL themes | **Gilded Ledger** light + dark (fav), **GLL Monochrome** light + dark (fav), **Vault** dark (maybe) | none |
| Logo | **Official logo: Orbit** (favicon, app icon, README, About, invite page). In the app the logo follows the theme: each theme has a default mark and colors it, and users can pick their mark (Orbit, Lens, Wordmark) in settings. | Loop, Horizon, L-Sweep, Aperture, Frame |
| Splash | Follows the active theme. Reference designs: Gilded Ledger dark, Luxury dark, Minimal light (fav), Glass light (maybe, its layout adapted to a shipped theme) | Formal, Neon |
| Auth screens (sign-in, redirecting, invite only, expired, GATE down, relay notice) | Themed. References: Luxury dark, Modern dark layouts (maybe). Before sign-in, use the last theme saved on the device, default Luxury. | Editorial |
| Settings: theme picker | **Theme grid** (A, fav) as the main picker; theme drawer (B, maybe) as a quick switcher | none |
| Privacy toggles | Layout **A** (fav); soft-light version (B, maybe) is just A in the Soft theme | none |
| Update notice | **Banner** (A, maybe) by default; the pill (C, maybe) as a compact form | Toast (B) |

Implementation notes: themes are CSS custom property sets (`[data-theme][data-mode]`), one token file per theme,
so adding a theme is data, not new components. GLL themes copy gll-shared token values with a `SHARDS.md` entry.
Theme choice and light/dark/auto are saved locally and later join settings sync.

## 3. New dependencies
| Dep | Where | Why | License check |
|---|---|---|---|
| epoxy-server | relay container | own WISP relay | before adoption |
| Node 24, Hono, Zod | check service (private repo) | gate, later sync and admin APIs | MIT (verify versions at build) |
| Postgres (or SQLite) | check service | later: usage counters, encrypted sync blobs | decide in the sync slice |
| Playwright, Vitest | dev only | tests | Apache-2.0 / MIT (verify) |
| esbuild | dev only, only if frontend step 3 happens | bundling | MIT (verify) |
| Self-hosted fonts, Font Awesome, PDF.js | static | drop CDN calls | keep each notice in `NOTICE` |

The check service has a dev DB on a free port (next free after 5437, confirm at build) and never touches other projects' DBs.

## 4. Persistence and sync (post-launch, Boss wants it)
Today: open tabs (URL + per-tab history) persist locally in `gust:tabs:v1` with the tab cache on by default,
and the proxy's own cookie jar persists in `gust:cookies:v1` (`index.html:12056`, `:12843`). Page state is not
kept (tabs reload), and everything is lost when site data is cleared, in private windows, or on another device.
- **Local first:** move tabs, cookies, history and bookmarks from localStorage to IndexedDB, behind the same
  migration shim as the rebrand.
- **Opt-in server sync,** tied to the GATE account, **end-to-end encrypted** in the browser with a key only
  the user holds (a sync passphrase). The server stores blobs it cannot read. A lost passphrase means lost
  synced data; say so plainly in the UI.
- **Separate toggles** for each category: open tabs + per-tab history, site cookies (sign-ins), browsing
  history, bookmarks + settings. All off by default.
- **Controls:** "clear everything when I close Limitless" mode, per-site "never keep cookies", one-click wipe
  of all server data, export.
- Needs the privacy review and a privacy-page update before it ships. Effort: local part medium, sync medium
  to hard (crypto, conflict handling, quotas).

## 5. Implementation stages
Each stage is one or more commits with docs updated in the same commit. Verify each by loading the app,
console clean, Playwright smoke green.

**Launch track (0.1.0)**
0. **Prep.** Repo rename done 2026-10-18. `NOTICE`, README rewrite with
   preserved credits, `CHANGELOG.md`, `docs/SHARDS.md`. Playwright harness and a baseline smoke test.
1. **Design artifact.** Done 2026-10-18 (section 2b): 5 Limitless themes + 3 GLL themes, each light/dark where available; official logo Orbit, per-theme and user-selectable marks.
2. **Trim.** **Done 2026-10-19**: Discord client, new-tab widgets (deals, news feeds, picsum/Unsplash), AI
   assistant, translate and `svg/` removed; fonts, Font Awesome 6.7.2, PDF.js and iso-639-1 self-hosted in
   `vendor/` and `fonts/`; Patcher fetches only `./index.html`; built-in third-party relays are off by default
   (own `/wisp/` is the default, `gust:relay-fallback:v1` turns the third-party list on).
3. **Rebrand.** Split in two.
   - **3a. Done 2026-10-19:** visible strings, About (version `LB_VERSION`, "Based on GUST 2.0 (08515a7)", source and
     issue links, legal links), Orbit mark in `#4DA6FF` / `#BDFFFF` replacing the GUST letters, `gust-*` to `lb-*`
     identifiers, `GustExt` to `LimitlessExt` (`window.GustExt` alias kept), `gust://` to `limitless://` (old scheme
     still accepted), `GUST-Patcher.html` to `patcher.html`, storage migration shim (see section 6), NOTICE complete.
     Test: `tests/e2e/migration.spec.js`.
   - **3b. Done 2026-10-19:** theme engine (`theme/chrome.css`, head script `window.LBTheme`, key `limitless:theme:v1`),
     settings Appearance (theme grid, Light/Dark/Auto, mark picker), theme drawer (toolbar Theme button), themed splash,
     themed relay notice, privacy toggles in layout A, Orbit/Lens/Wordmark marks. Upstream skins still override the
     themes. Open: on/acc contrast below 4.5:1 in four light themes and muted text in Soft light (see CLAUDE.md, theme
     engine), so the approved palette is unchanged. Test: `tests/e2e/themes.spec.js`. Keep all credits.
4. **Start page.** Limitless new-tab page: search, shortcuts, GLL stamp.
5. **Hosting.** `deploy/` compose project `limitless-browser`, baked nginx image on `127.0.0.1:8580`,
   brotli/gzip_static, caching rules, `version.json` + update banner, in-app legal pages, relay container
   with egress blocks and caps. Local only, no public route.
   Progress 2026-10-19: hosting files built and tested locally with a stub gate (`deploy/`, `deploy.sh`, `scripts/build-static.sh`, `theme/`, `legal/`, relay image builds). Open: legal text review by Boss, host egress rules not applied, real gate and relay run together untested.
6. **Gate.** Check service (private repo), GATE client registration (Boss runs the `manage.sh` command),
   OIDC callback + direct sign-in, invite page, 60 s access cache, `/wisp/` revocation, rate limits.
7. **Launch rehearsal and launch.** Full smoke on the gated stack, Cloudflare Tunnel route for
   `limitless.taps-holdings.org` (Boss runs it), approve first users, then fix the gll-shared and gll-site
   listings (Boss's OK) and redeploy the site.

**Post-launch slices** (release procedure applies, at most 2 in flight)
- A. Frontend step 2: vendored libs (libcurl WASM, acorn, PDF.js) to hashed files with long-lived caching.
- B. Persistence, local part (IndexedDB, toggles, clear on close).
- C. E2E encrypted sync.
- D. Admin dashboard (active users, usage per user, per-user kill switch) + user usage meter.
- E. Download manager (queue, progress, pause/resume via HTTP range, retry; counts against caps).
- G. Custom theme editor: start from any shipped theme, adjust fonts (from a fixed self-hosted list), colors, and light/dark values; saved locally, joins settings sync later. Builds on the token-per-theme design (section 2b). Effort: medium. Not in 0.1.0.
- F. Monthly upstream cherry-pick routine (recurring, not a slice).
- Later ideas, not yet approved: PWA, feedback button, What's new panel, bookmark collections, tab sync,
  second relay region, ad-block list updates, command palette, reader mode.

## 6. Open items
- Exact per-user caps (proposal: 64 concurrent streams, about 50 Mbit/s, 20 GB/day soft cap; SMTP/IRC/torrent
  ports blocked) and how they are enforced: check whether epoxy-server supports per-user limits; if not, enforce
  in a small wrapper or at nginx keyed by user. Abuse contact address.
- ~~New storage key prefix~~ Decided `limitless:*:v1` (stage 3a, 2026-10-19). A shim at the top of `index.html` copies
  every `gust:*` and `gi_<id>:gust:*` key to the new prefix once (flag `limitless:migrated:v1`), rewrites `gust://`
  inside copied values, never overwrites an existing `limitless:*` key, and keeps the old keys for one release.
  Kept on purpose: IndexedDB `gust_extensions` (installed extensions; renaming would lose them).
- ~~Per-session storage namespace~~ Fixed 2026-10-19: upstream's `ls` wrapper keyed data to a `gi_<random>` id in
  sessionStorage (meant for `file://` copies), so hosted data would not survive a new tab or visit. On http(s) the id
  is now stable per origin (`limitless:inst:v1`); a tab that already had an id adopts it once. `file://` keeps the
  upstream behavior. Two open windows share one tab list (last write wins); slice B can refine that.
- Whether the check service (`limitless-gate`, name confirmed by Boss 2026-10-19) also hosts sync and admin APIs.
- Which theme defaults to which mark (Orbit everywhere unless a theme suits Lens or Wordmark better). Design picker at https://claude.ai/artifact/UaudLygUksTJaxxSccEXue (picks stored in its `picks` collection).
- ~~Stamp text~~ Decided 2026-10-19 (Boss): "A Gamble Limited Ltd. product" variant added to gll-shared v0.2.3 (local tag, push pending Boss), copied to `theme/brand/`.
- Whether a separate VM or egress IP for the relay is needed later.
- Cloudflare's terms for relaying arbitrary traffic and WebSocket idle timeouts.
