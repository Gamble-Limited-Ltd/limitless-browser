# GLL Rebrand Plan (draft)

Status: planning only. Nothing has been renamed yet. Decisions marked **OPEN** need Boss. Master plan and stages: `PLAN.md`.

## 1. Baseline (from exploration, 2026-10-15)
- Current brand: "GUST" by "Nautilus Labs", v2.0. Fork of `nautilus-os/GUST`.
- 7 tracked files, no build system. See `CLAUDE.md` for layout.
- Contributors by commits: dinguschan 135, CompactAI 9, jaysyrk 3, xor 3, dinguschan-owo 3, hvtrs 2, Jacob 1.

## 2. License and attribution (non-negotiable parts)
- Project license is **AGPLv3**. This is a derivative work, so it stays AGPLv3. GLL cannot relicense.
- `LICENSE` is the stock template with no project copyright line. Keep the text as is.
- Must do:
  1. Prominent modification notice: "Modified by Gamble Limited Ltd." (README, About page, `NOTICE`). AGPL section 5.
  2. Source offer: the in-app source link and "Report an issue" links must point to the GLL repo. AGPL section 13.
  3. Keep libcurl.js LGPL v3 notice (about `index.html:9303`) and the `copyright_notice` string (about `:9906`: curl, mbedtls, cjson, brotli, nghttp2, zlib).
  4. Keep credits for upstream authors (lanefiedler, dinguschan, x8rr/hvtrs), Mercury Workshop (WISP), ading2210 (libcurl.js), Mozilla (PDF.js). Reword as "Based on GUST by Nautilus Labs", not removal.
  5. Add a `NOTICE` file listing upstream, third-party libs and the GLL modification statement.
- Trademarks: "GUST" and "Nautilus Labs" are upstream's. Use them only for factual attribution.
- Per `~/.claude/CLAUDE.md`: this is a separate AGPL fork, so GLL-proprietary code must not be mixed in without checking license compatibility, and nothing here is copied from HT.

## 2b. Decisions (Boss, 2026-10-15)
- Product name: ~~GLL Lens~~ **Limitless Browser** (changed 2026-10-17, see 2c). Repo rename to `limitless-browser` at the end (phase 7). Public host: `gll-browser.taps-holdings.org` (hostname does not match the name; rename later if wanted).
- Wording: neutral "private browsing proxy". Drop school-filter marketing. No new evasion work.
- Logo: reuse the Gilded Ledger brand (seal/wordmark/tokens) from `~/gll-shared`, **copied once with a provenance log** (`docs/SHARDS.md`, same idea as Meridian). gll-shared is empty today, so until it has a built brand package, use the pieces in `~/gll-site` (`src/components/brand/`) or a plain wordmark. Lens is AGPL: never copy Lens code into gll-shared or any proprietary repo. Brand assets owned by GLL may be copied in; state in `NOTICE` that the GLL logo/marks are not covered by AGPL trademark-wise.
- GLL ID (GATE): ~~optional sign-in later; must work signed out~~ **SUPERSEDED 2026-10-17, see 2c: sign-in is now required and the tool is invite only.** Still true: use the redirect flow as a client only; no secrets in the static page. Settings sync stays a separate feature needing a privacy review first.
- Portfolio: list on the company site as a tool (not a game) in `~/gll-site/src/data/games.ts` plus legal links, then redeploy `~/gll-site/deploy.sh`; add the "A Gamble Limited Ltd. product" stamp in the Lens footer; links from GLL, Meridian and HT are wanted, each needing Boss's go per repo (HT: link only, leave OpenFront/AGPL attribution untouched).

## 2c. Decisions (Boss, 2026-10-17): Limitless Browser, invite only
- Name: **Limitless Browser**, GLL branded ("A Gamble Limited Ltd. product" stamp stays). Replaces "GLL Lens" everywhere in docs and planned UI copy. AGPL credits, "Based on GUST by Nautilus Labs, modified by Gamble Limited Ltd." wording and the `NOTICE` plan are unchanged.
- Access: **invite only.** Sign-up and sign-in through GLL ID (GATE) is a requirement. Only users/emails Boss approves can use it; anyone else, signed in or not, sees an invite-only page.
- Enforcement is server-side (nginx `auth_request` against GATE, covering `/wisp/` too). Allowlist lives in GATE as per-app access. Unapproved users get an invite-only page with no request form. Limitless waits for GATE v1.
- Design and open items: `ACCESS-CONTROL.md`.
- Consequences: Lens no longer needs to work signed out. Settings sync via GATE becomes easier but still needs the privacy review. The company-site listing (`games.ts`) must describe it as invite only, not offer a sign-up link. Rebrand phases are otherwise unchanged; add phase 5b (gate integration) after hosting.

## 2d. Decisions (Boss, 2026-10-18): planning Q&A
- Host **`limitless.taps-holdings.org`** (replaces `gll-browser.taps-holdings.org`, never deployed).
- Look: **own Limitless look plus the GLL Portfolio Stamp** and "A Gamble Limited Ltd. product" (HT precedent), not the full Gilded Ledger chrome. Supersedes the 2026-10-15 "reuse the Gilded Ledger brand" logo line.
- Themes: Limitless themes on `#4DA6FF` / `#BDFFFF` in several styles (formal, modern, fancy, more), a GLL theme (light and dark), a GLL monochrome theme. GLL theme colors copied from gll-shared tokens (`packages/tokens/core.css`, `ledger.css`) with a `SHARDS.md` entry; Portfolio Stamp from `packages/brand/svg-outlined/portfolio-stamp-{dark,light}.svg`, carved out in `NOTICE` as company mark, all rights reserved (same as HT).
- Logo and icon: own Limitless mark, not the Filing Tab G. Logo and theme options go to Boss in a design artifact first (stage 1).
- Repo rename to `limitless-browser` moves from phase 7 to stage 0 (after this Q&A, with Boss's go).
- Version: own semver from `0.1.0`; About credits "GUST 2.0 (08515a7)".
- Upstream: cherry-pick bug and compatibility fixes by hand, monthly; no evasion commits. Our `main` equals upstream `main` as of 2026-10-18.
- Removed: Discord client, new-tab widgets, AI assistant (`gust_ai_ctx` retired), translate, `svg/` variant. Patcher kept but behind the gate and built from our copy. Filter-targeted upstream code left as is, not extended.
- Stale outside listings (gll-shared `packages/games-registry/src/games.ts` slug `lens`, gll-site `src/content/roadmap/lens.md` with host `lens.taps-holdings.org` and "optional sign-in") are fixed at launch with Boss's OK per repo.

## 3. Name and repo
Repo is already `Gamble-Limited-Ltd/Browser`. Product name is **decided: Limitless Browser** (2c). Old ideas (check for collisions, incl. the planned GLL ID / GATE project):
| Idea | Notes |
|---|---|
| `gll-browser` (product "GLL Browser") | Plainest; matches company naming |
| `gll-gateway` | Fits proxy role; may clash with GATE (shared login) |
| `gll-portal` | Neutral, generic |
| `gll-lens` | Short, brandable |
| Keep `Browser` | Zero churn; repo name is not user-facing |
Superseded: repo becomes `limitless-browser` (2c, 2d). Keep the `upstream` remote for cherry-picking fixes.

## 4. Rename surface (counts are case-sensitive greps)
| Area | Where | Risk |
|---|---|---|
| Titles | `index.html:27`, `:11739`; `svg/site.svg:7`; `GUST-Patcher.html:6` | Low |
| UI copy / credits | footer `index.html:6082`, About `~7461-7466`, tour `~23140`, `~23272` | Low; keep factual credit |
| Links | star button `~21373`, menu `~24580`, `~26969`, `~27006` -> nautilus-os | Low; AGPL s13 relevant |
| Logo | `gust-letter-G/U/S/T` animation, CSS in `svg/static/css.css` | Medium; needs new art |
| JS/DOM ids | `GustExt` (13), `gustLoc`, `gust-href`, `gust-*` classes | Medium; cross-file, `svg/static` copies |
| localStorage | 56 unique literal `gust:*` keys (2026-10-18 count; others built at runtime, so migrate by prefix scan), `gust_ai_ctx` (retired with the AI panel) | **High**; needs migration shim |
| Patcher | `GUST-Patcher.html` fetches `nautilus-os/GUST@main/index.html` via raw GitHub, jsDelivr, codetabs, allorigins (`:872`, `:1106`) | **High**; repoint to our gated copy, serve behind the gate |
| README | title, badges, vercel URL, jsDelivr URL, user-attachments images | Medium |
| Filenames | `GUST-Patcher.html` | Low |
Counts (2026-10-18, case-sensitive `GUST` / `Gust` / case-insensitive `gust` / `nautilus`): index.html 159 / 95 / 839 / 11, GUST-Patcher.html 105 / 0 / 211 / 11, README.md 20 / 0 / 21 / 5. `svg/` is being removed. Extra spots: error title "Error - Gust Browser" (`:11739`), skins CSS, logo letter animation (`:2393+`).

## 5. Phases
Superseded 2026-10-18 by the stage plan in `PLAN.md` section 5 (rename moves to stage 0, trim and design stages added). Old list kept for reference:
1. **Decide** (Boss): ~~product name~~ (done), repo name, logo direction, what to do about README marketing wording (below).
2. **Docs + legal** (safe, no behavior change): `NOTICE`, README rewrite with GLL framing and preserved credits, this plan kept current.
3. **Visible strings**: titles, footer, About, tour, links to GLL repo. Mirror into `svg/` copies.
4. **Logo/CSS**: new art, rename `gust-*` classes together with their `svg/static` copies.
5. **Storage migration**: on load, copy `gust:*` keys to new prefix if absent, keep old keys one release, then drop. Test with a profile that has old data.
6. **Patcher + hosting**: repoint patcher and jsDelivr URLs, set up new deploy host, update `~/gll-site` games list if this ships there.
7. **Repo rename** last, then fix remotes and README links.
Verify each phase by loading the page, console clean, About/links correct, old settings preserved. Do phases 3 to 5 as separate commits.

## 6. Open questions / risks
- README markets the tool as evading school filters (Securly, Lightspeed, etc.) and recent upstream commits are detection-evasion work. A company name on that is a legal and reputational decision for Boss. Suggest neutral wording ("private browsing proxy") and no new evasion work in the fork. **DECIDED 2026-10-16 (Boss): neutral wording, no school-filter marketing, no new evasion work.**
- Default WISP relays and AI/translate/CDN services are third-party; availability and terms are not ours.
- README images are on github.com/user-attachments and need re-hosting.
- Privacy/terms pages for GLL, if this is published on the company site.

## 7. Decision log
| Date | Decision | By |
|---|---|---|
| 2026-10-15 | Plan drafted, no changes made | Claude |
| 2026-10-15 | Legal pages in house format; relay logging abuse-only; upstream credit wording approved ("Based on GUST by Nautilus Labs, modified by Gamble Limited Ltd."); keep merging upstream fixes so renames stay small and mechanical; all of this is early planning, no dev steps yet | Boss |
| 2026-10-17 | Renamed to **Limitless Browser** (was GLL Lens). Invite only: GATE sign-in required, approved users only, server-side nginx enforcement, allowlist in GATE per-app access, plain invite-only page, ship after GATE v1. Supersedes the 2026-10-15/16 "works signed out, GATE optional" decision | Boss |
| 2026-10-18 | Planning Q&A: host `limitless.taps-holdings.org`; own look + GLL stamp; theme set and logo via design artifact; repo rename at stage 0; semver 0.1.0; cherry-pick upstream; remove Discord, widgets, AI, translate, `svg/`; Patcher gated; filter code left as upstream; own epoxy-server relay on this VM with 3rd-party fallback off by default; proprietary check service with OIDC + direct sign-in, 7-day session, 60 s revocation; staged hybrid frontend; in-app legal with ungated `/legal/`; release procedure from 0.1.1; persistence/sync (E2E, per-category toggles), admin dashboard, download manager post-launch; start page at launch. See `PLAN.md` | Boss |
| 2026-10-18 | Repo renamed to `Gamble-Limited-Ltd/limitless-browser`, `origin` updated | Claude (Boss go) |
| 2026-10-18 | Design picks: themes Limitless Luxury, Fancy, Minimal, Soft, Retro + GLL Gilded Ledger, Monochrome, Vault all ship as selectable themes with light/dark; official logo Orbit, marks follow the theme and are user-selectable (Orbit, Lens, Wordmark); custom theme editor post-launch; theme grid picker, privacy layout A, update banner. See `PLAN.md` 2b | Boss |
| 2026-10-18 | Upstream check: `main` equals `upstream/main` (08515a7); no update needed | Claude |
| 2026-10-19 | Stage 3a done: storage prefix `limitless:*:v1` with a copy-once shim (old keys kept one release), internal scheme `limitless://` (old `gust://` accepted), identifier prefix `lb-`, `GustExt` to `LimitlessExt` with alias, `GUST-Patcher.html` to `patcher.html`, version constant `LB_VERSION`; IndexedDB `gust_extensions` keeps its name to avoid data loss | Claude |
| 2026-10-15 | Self-host via Docker nginx on 127.0.0.1:8580 under a taps-holdings.org subdomain; speed work scoped in `HOSTING-AND-PERFORMANCE.md` | Boss |
