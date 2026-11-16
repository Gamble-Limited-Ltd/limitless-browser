# Limitless Browser 1.0: master plan

Status: **0.3.0 deployed 2026-11-15 (`072c108`). 1.0 build started 2026-11-15 (Sonnet builders, Opus reviews at Boss-set points).** Prod is 0.3.0 (`072c108`). Refinement pass
2026-11-13 (section 0) reconciles this plan with the paid-tiers draft and adds build cards (section 8). Decisions come from
Boss's question rounds on 2026-11-10 and 2026-11-13 and the design picker artifacts (round one:
https://claude.ai/artifact/P1arJs1FYrMrCoBmR5VQ2h, 30 picks; round two: "Limitless 1.0 Design Room", 77 picks).
This file is the index, the order of work and the ship gates. Detail lives in the topic files:

| File | What it covers |
|---|---|
| `SPEED.md` | Page loading, startup, client-side speed (the priority) |
| `RELAY.md` | Server path: tunnel, nginx, gate, relay, DNS, fair share, off-site relay research |
| `MEMBERSHIP.md` | Invites, numbers, tiers, standing, ceremony, certificate PDF, data model |
| `RULES-DRAFT.md` | Charter and full Rules: what is decided, draft text, questions still open |
| `UI.md` | Chrome, tabs, settings, splash, notices, errors, icons, Prime theme, tier marks |
| `ADMIN.md` | Admin panel additions and the gate API behind them |
| `TESTING.md` | Harness upgrades, test layers, gates for the Major lane, Boss's Chromebook checklist |
| `design/` | Design reference for dev: `design-room.html` (snapshot of the picker artifact, open in a browser; names in it are examples), `picks.json` (round one, 30 picks with notes) and `picks-round2.md` (round two, 2026-11-13, wins over round one where they differ). Build from the favourites and apply the notes. |
| `PAID-TIERS-PLAN.md` | Approved 2026-11-13 (D1, D2): VPS relay, paid Cardinal / Prime / Limitless Executive, Ordinal free on public relays. All of it ships in 1.0; prices wait for measured numbers. |
| `BASELINE.md`, `R1-WORKERS-RESULT.md` | T0 numbers for 0.2.3; the dropped Workers relay study. |
| `REVIEW-2026-11-14.md` | Review pass: conflicts fixed (newest wins), 0.3.0 deploy hazards, 1.0 relay design, open questions for Boss. Read before building. |
| `~/gll-planning/limitless-1.0/RELAY-OFF-CLOUDFLARE.md` | Option A: move `/wisp/` off Cloudflare on a direct home-IP path. Unnecessary now: the VPS was approved (D1a), so Option A is not built. |

## 0. Refinement pass (2026-11-13): read this first
### 0.1 What changed and why it matters
(Historical table: the right column won; all six decisions are in 0.2.)
The 2026-11-10 plan (this folder) assumes **one free relay at home**, every member on it, fair share by tier weight.
The 2026-11-13 paid-tiers draft assumes a **RackNerd VPS relay** for paid tiers, **Ordinal on public third-party relays
only**, a fourth tier (Limitless Executive), cash prepaid plans, trials and per-plan limits. Several files now disagree:

| Topic | 2026-11-10 files say | 2026-11-13 draft says | Where fixed |
|---|---|---|---|
| Paid hosting | out of scope (section 1), "no new paid services" (`RELAY.md`) | Boss buys a $35.99/yr VPS | D1 |
| Who uses the home relay | every member | nobody by default; only Executive as a fallback | D1, D5 |
| Cloudflare SSA fix | Option A (home IP direct path, "overkill" security) | VPS relay is the Option B exit of that same plan | D1 |
| Tiers | Ordinal / Cardinal / Prime, Boss promotes | + Executive, tiers are bought, trials | D2 |
| Prime immunity | yes (`RULES-DRAFT.md` 4) | removed | D2 (follows paid tiers) |
| Certificates | every member gets one, only Prime may show it | none for Ordinal; Cardinal / Prime / Executive designs | D3 |
| QR target | members-only `/verify/` on the browser host | public verify page on HALL, styled per tier (round two favourite) | D3 |
| File downloads | no download feature at all (Boss, 2026-11-10, relay-off plan); S8 Downloads panel still in this file | per-tier download limits | D4 |
| GATE (GLL ID) changes | none | "GATE: paid-until, tier, ..." | 0.3 item 1 (store in lbgate instead) |
| Design round 2 | dropped | held on 2026-11-13 (`design/picks-round2.md`) | updated in section 3 |

### 0.2 Decisions Boss needs to make (recommendation first)
- **D1 Relay host. ANSWERED (a).** (a) **Recommended:** approve the VPS now and make it *the* relay for all of 1.0. It removes the
  Cloudflare SSA problem without exposing the home IP (Option A's port forward, firewall set and CGNAT risk all go away),
  lifts the 21 Mbit/s home ceiling, and the relay-token work (relay-off plan S1, S4, S5) carries over unchanged.
  (b) Keep the free home relay and build Option A. Either way only one of the two relay plans gets built.
- **D2 Paid tiers in 1.0 or after. ANSWERED (b): everything in 1.0.** (a) **Recommended:** 1.0 ships the tier and limits *engine* (plans table, per-plan
  limits, paid-until field, admin knobs) with Ordinal / Cardinal / Prime, prices hidden, Boss granting tiers by hand.
  Selling (HALL pricing page, request form, trials, top-ups, Executive, Load Now) is **1.1**, once the VPS has measured
  numbers (the draft itself says prices and caps wait for measurements). (b) All of the paid draft in 1.0 (adds about
  three slices and a HALL release). Prime immunity: removed if Prime is ever sold, so remove it now and the Rules are
  written once.
- **D3 Certificates and QR. ANSWERED: as recommended.** Recommended: follow round two (none for Ordinal, Cardinal plate without QR, Prime slab with
  corner QR) and point the QR at a public HALL page that shows tier, number, date and status only (never name, never the
  browser address). HALL is public-facing, so the HALL route is its own small `~/gll-launcher` change with Boss's OK.
- **D4 Downloads. ANSWERED the other way: downloads are a feature, S8 stays in 1.0.** Recommended: **drop S8 (Downloads panel) from 1.0**, matching the 2026-11-10 "no downloads feature"
  decision. Large responses are already counted against the data caps by the gate; per-file download limits come back
  only with D2(b) or in 1.1.
- **D5 Executive fallback to the home relay. ANSWERED: no home fallback.** Recommended: no home fallback at all (Executive falls back to public relays
  like everyone else). A home fallback through the tunnel is the same SSA problem; through a direct path it needs Option A.
- **D6 Ship speed first. ANSWERED yes.** Recommended: ship S1 + S2 as **0.3.0 (Minor lane)** as soon as they pass, instead of holding
  them for the 1.0 Major. Members get the speed weeks earlier, the Major gets smaller, and a speed regression is found
  apart from membership bugs. This reverses "speed and membership ship together" (Boss, 2026-11-10), so it is Boss's call.

**Answered by Boss, 2026-11-13:** D1 = (a) the VPS is the relay. D2 = (b) everything in 1.0; Boss buys the VPS before
the release so prices come from measured numbers first; Boss gives SSH only (no provider API key). D3 = follow round two,
public HALL verify page. D4 = reversed: downloads are a feature (per-tier limits from `PAID-TIERS-PLAN.md`), so S8 stays in 1.0.
D5 = Executive falls back to public relays like everyone (no home fallback; this replaces Series 17). D6 = yes, ship S1 + S2
as 0.3.0 first. Sections 0.1, 0.4 and the build cards still show the old recommendations until they are reconciled.

### 0.2b Decisions for 0.3.0 (Boss, 2026-11-14)
- **Nominations removed (Boss, 2026-11-14):** any GLL ID can use the free tier and asks to upgrade, so members no longer nominate. Only Boss invites, and an Executive invitation is written fully custom (typed per person in the gate admin, no template). Certificate letter: one shared body plus a short tier paragraph (Cardinal, Prime, Executive); no nominator line on the certificate.
- **Scope:** 0.3.0 = S1 + S2a + S2b + S3 (all client-side), Minor lane, one release, 24 h hold.
- **Home relay completely disabled in 0.3.0; public relays only; our cloud (VPS) relay arrives with 1.0.** Changes: client default is
  third-party relays on and our same-origin `/wisp/` out of the list; nginx answers `/wisp/` with 410; the `relay` container is stopped and
  removed from compose; `lbgate` stays for sign-in, `/oidc/access-check` and the admin panel. `/wisp/` no longer crosses the Cloudflare tunnel,
  so the SSA 2.2.1(j) risk is gone until 1.0 (S4 then puts `/wisp/` on the VPS, not on Cloudflare). The container and nginx change needs Boss's go
  when applied; Claude pastes the exact commands.
- **Known limit until 1.0:** public-relay traffic never reaches the gate, so a suspended or removed member loses the app (gate) but their open
  tabs are not cut off, and per-user caps, usage counters and fair share show nothing. Admin Usage and Health relay rows must say "public relays".
- **Speed gate for 0.3.0:** the Chromebook harness still runs against the rehearsal relay and fixture sites (client pipeline, startup, bytes);
  public-relay numbers are measured on public sites only and are advisory. `ownSockets` (F2) and our-relay paths are inert in 0.3.0 but stay in the code.
- **Service worker rollback:** `deploy.sh` always serves a `/sw.js`; a rollback build serves a self-removing stub (clears caches, unregisters) so
  browsers that installed the 0.3.0 worker clean up on their next visit. Test: `tests/e2e/boot.spec.js` gains a stub case.
- **Members are told:** one-time in-app notice on first load after the update, a Privacy policy line (other relay operators can see connection
  metadata) and a What's new entry. Text drafted by Claude under Boss's standing approval ("legal auto approved", 2026-11-14).
- **libcurl.js:** review 0.7.5 in S2a (diff, licence, HTTP/2, full tests); take it only if clean, else stay on 0.7.4.
- **All public relays down:** calm error card, automatic retry with backoff, link to the Status page (no owner alert in 0.3.0).
- **Blocklist (S3):** a permissively licensed domains-only list, vendored in `vendor/blocklist/<date>/` with its licence file; suffix matcher.
- **Start:** nothing starts until Boss says work begins (planning is being finalised). Slice order then is open: S1 and S2a in parallel is the plan default.
- **1.0 relay design (Boss, 2026-11-14):** home `lbgate` keeps the members DB and all personal data; the VPS runs only the relay plus a small
  token checker (verifies short-lived signed relay tokens from lbgate, counts bytes, reports usage back, takes a revoke push list). No personal
  data on the VPS. The browser reaches it on its own hostname, DNS-only (not proxied by Cloudflare), TLS from Let's Encrypt on the VPS; DNS, port
  and VPS steps are Boss-run. **Order unchanged:** everything in one 1.0 Major (no separate 0.4.0), so members stay on public relays until 1.0.
  **Selling switch:** 1.0 ships with everything built and one admin switch "Plans open for sale" OFF; Boss turns it on after prices are final and his
  self-review checklist is done (until then tiers are granted by hand and the pricing page says "coming soon").
- **Numbers:** all caps, weights, slow-stage speed, reserve and Prime seats are admin knobs with placeholders; S4 includes automated load and speed
  tests on the real VPS and the release record holds the final numbers (Boss, 2026-11-14).
- **Wayfinder:** completes before any Limitless work begins (Boss), so W3c is no longer a blocker and the original wave order stands.
- **Extra 1.0 gates (Boss, 2026-11-14):** VPS load test (CPU per Mbit/s, 20 simulated members); token revoke test (suspended member's socket dies
  within seconds); VPS failure drill (relay down, fall back to public relays with the notice; rehearsal stack and real VPS); lbgate SQLite restore
  drill (members, receipts); plus speed tests per plan, rate limiting, loading times and more multi-user tests.
- **Plan requests:** in-app form lands in the admin queue AND a copy is emailed to gamblelimitedsupport@taps-holdings.org (needs a privacy line;
  no email address typed by the member, the copy goes to Boss only). **Expiry notices (14 and 3 days):** in-app only (start page and account panel).
- **Build crew (Boss, 2026-11-14):** Sonnet 5.5 medium builds everything; Opus manages and reviews only when Boss asks, after certain stages and at
  the end. This replaces the section 8 advice (Haiku for mechanical parts, Opus approves each slice).
- **Downloads (S8):** check before starting (Content-Length) and refuse early with a plain message and the plans link; without a length, stop at the
  limit with a note. All plan limits, and the separate download limits for Prime and up, are TBD and set by testing (admin knobs). **Lapse:** a paid
  theme falls back to the member's last free theme, the choice is remembered for renewal. **Real devices:** the automated Chromebook harness is the
  gate; Boss's playtest is optional and never a blocker.
- **Numbers (Boss, 2026-11-14):** four digits, Boss is 0000. Reserved (only Boss gives, Executives may ask): 0000 to 0009, 0007, 0100, 0777, 1000, 6969,
  7777, 9999. Executive-only block 0010 to 0099. Ordinal and Cardinal pick non-primes, Prime picks only primes, Executive from its block or an approved
  reserved number. Existing members migrate from 0100 skipping primes and reserved. Prime upgrade forces a prime and retires the old number. Reserved,
  used or block numbers say "unavailable"; a prime for Ordinal or Cardinal says "Not available for your plan". Full text: `MEMBERSHIP.md` section 4.
- **Certificates:** Cardinal, Prime and Executive may show one; Ordinal has the member card only. **Placeholder prices:** Cardinal $15/yr, Prime $35/yr,
  Executive per person. Other placeholder knobs: `PAID-TIERS-PLAN.md` section 11.
- **parse5:** pre-approved only if the harness shows DOMParser time over about 100 ms (logged in the changelog when added).
- **Bot checks:** no evasion; the harness compares home, public and VPS relays on challenge-prone sites (advisory), the app shows a plain notice card
  and Report a problem gets a "bot check" category. A datacenter VPS IP is likely challenged more than home, so the VPS will not fix it alone.
- Build cards for S8, S9 and the 0.3.0 release are in section 8.
- **Review answers (Boss, 2026-11-14, `REVIEW-2026-11-14.md` 5):** trials stay off until "Plans open for sale" is on; 0.3.0 boot fails closed
  (no browsing without a 200 from `version.json`); multi-relay stays off by default and is measured. Q1 replaced: **every GLL ID gets the
  free tier with no approval** (from 1.0; GLL ID client flipped to open, removal lives in lbgate; `MEMBERSHIP.md` 3.5). The access-request
  form and its queue are dropped; invites remain only for Executive.

### 0.2c Build run (Boss, 2026-11-15)
- **Standing approval:** agents may do VPS work (`limitless-relay`), GLL ID changes and DNS records when 1.0 needs them, each logged in
  `~/gll-agents/logs/changelog.md` (host and DNS also in the vault Homelab Work Log). Still Boss's: home ports, tunnel changes, prod deploys,
  and the prod GLL ID client flip to open (done at the 1.0 deploy, not before, so 0.3.0 stays invite only).
- **One fixed stop:** before any automated test on the real VPS (load, speed, revoke, failure drill); Boss says when they run, to get detailed numbers. Otherwise Boss steps in as it goes. **Opus reviews:** R1 after S4 + S5 merge into `release/1.0.0` (relay tokens, revoke,
  server-side gating, member data, migration) before S6/S7 build on the S5 API; R2 after S7 + S9 (admin, money path, `plans_open`, HALL)
  before the release gates; R3 end-of-dev review of the whole `release/1.0.0` diff before the release record.

### 0.2d Relay speed and data savings (Boss, 2026-11-15, after the VPS tests)
VPS test (short runs, Boss's go): raw link about 500 Mbit/s in; through the relay 20 members 199 Mbit/s, 1 member 8.8 Mbit/s;
each stream tops out near 2.2 Mbit/s. RackNerd meters in plus out, so 5 TB is about 2.5 TB delivered. Numbers page:
https://claude.ai/artifact/9V2K7cY62h9JrfBA6ydXVG (plan limits and prices NOT decided yet).
**All of the following ships in 1.0** (Boss chose one release; 1.0 waits and its gates rerun):
- Diagnose the per-stream limit now, then try every server fix that helps: relay container TCP buffers + BBR, epoxy tuning or
  update, faster gate forwarding, and a per-connection ceiling once fast.
- Split downloads by plan: Ordinal 1 part, Cardinal 2, Prime 4, Executive 8 (files over about 20 MB, servers with Range).
- Pages first: downloads yield relay bandwidth while a page loads.
- No-visible-effect savings: request compressed responses (check first), AVIF/WebP Accept on every image request, no
  pre-fetch of images far below the screen, ignore prefetch/prerender hints, HaGeZi Normal blocklist (was Light).
- Video hard cap by plan: Ordinal 480p (app only, public relays), Cardinal 720p, Prime 1080p, Executive none. Enforced by
  forcing player quality on known video sites plus a speed limit to video hosts on our relay.
- One video at a time (background tabs and muted autoplay header videos pause). Data saver turns on by itself at 90 % of the
  allowance, with a note.
- Data meter in the menu; per-site usage report in the account panel, kept on the member's device only.
- Big files: member setting, off by default, to send files over 200 MB through public relays (privacy note).
- **Usage stats (server side):** daily bytes per site per plan, no member link, kept 30 days. Reverses "no routine logs of the
  sites you visit" for this aggregate only; legal text change auto-approved by Boss. Pushed back once (minors, the gate's
  "never log destinations" rule); Boss chose per plan per site. The gate rule changes to: no per-member destinations.
- Every saving gets its own build/admin kill switch.
- Not chosen: click-to-load embeds, lighter web fonts, video sites via public relays, night bonus.

### 0.3 Simplifications applied (no decision needed; they follow from existing rules)
1. **All membership and plan data lives in the lbgate SQLite** (`members`, plus `paid_until`, `plan`, `amount`,
   `receipt_note`, `executive` columns when D2 lands). No GLL ID schema change, keeping the 2026-11-10 "no GATE change" rule.
   The draft's "GATE admin" means the Limitless admin panel (`limitless://admin`). Trial checks (account age, verified)
   use the owner API `list` data already fetched.
2. **Ordinal limits on public relays are client-side only.** Public-relay traffic never touches our gate, so the tab cap
   and daily time limit live in the app and can be bypassed with devtools. That is acceptable: they cost us nothing and
   exist to show the plans. Anything that protects *our* relay (data caps, speed, sockets) stays server-side.
3. **Pick the libraries now** so S5 has no open research: `pdf-lib` (MIT) for the PDF, `qrcode` (MIT) for the QR, both
   in `~/limitless-gate` only.
4. **S3 trimmed**: tab sleeping, instant Back, rewrite cache and the blocklist stay. Cached rewritten pages (4.4) and warm
   favourites (4.6) move to 1.1 (the paid tiers are in 1.0 now, only these two items go later): 4.4 is the riskiest code (silent swap of a live page) and 4.6 spends relay bandwidth on
   pages nobody asked for, which matters on a capped VPS.
5. **S2 split** into S2a (move WASM, acorn, skins CSS out of `index.html`: mechanical, low risk) and S2b (service worker).
   S2a alone should meet the cold-size target; S2b is what gets the repeat open under 1 s.
6. **Wayfinder overlap.** Wayfinder slice W3c changes `~/limitless-gate` (static GATE issuer). Do W3c before S5 starts
   so the two never sit on parallel branches of the same repo.

## 1. What 1.0 is
One release, version **1.0.0**, **Major lane**. The speed work (S1, S2a, S2b, S3) ships first as **0.3.0** (D6, 0.2b), so 1.0 builds on
0.3.0 and its rollback target is the deployed 0.3.0 sha, not `c88ce5e`. It contains:
1. **Speed** (priority): pages appear sooner (parallel loading, no wait on images), faster startup (WASM and libraries out of
   `index.html`, service worker app shell), and a set of client and server speed-ups. Proven with a Chromebook-profile harness.
2. **Membership**: access requests and Boss-only invite links, permanent four-digit numbers (Boss is No. 0000), tiers Ordinal /
   Cardinal / Prime / Executive, a signed Membership Charter, a six-step welcome ceremony, certificates from Cardinal up signed by Boss as Director,
   and a warning / suspension / removal process.
3. **UI**: restrained toolbar with one Limitless menu, classic or vertical tabs, settings in six groups, new splash, notices,
   error cards, custom icon set, a Prime-only theme, tier marks.
4. **Admin**: member list with filters, profiles, invite queue, live and 30-day charts, per-hop timing,
   audit log viewer, problem reports.
5. **Upstream and dependencies**: GUST upstream has no new commits since `08515a7` (checked 2026-11-10). libcurl.js 0.7.5
   (published 2026-10-21) and a newer epoxy-tls commit exist: reviewed and taken only if clean (`RELAY.md` section 8).

6. **Paid tiers and the VPS relay** (D1, D2): Cardinal / Prime / Limitless Executive, pricing page and request form on HALL,
   trials, top-ups, Load Now, transfer brake, per-tier download limits. Boss buys the VPS first and gives SSH only; prices and caps are set from measured numbers before release.

Out of scope for 1.0: E2E encrypted sync (slice C), custom theme editor (slice G), command palette, mobile/tablet layout.

## 2. Hard constraints (from the repo and company rules)
- **Invite only stays server-side.** Every new member gate (ceremony not signed, suspended, removed) is enforced by the check
  service and nginx (`/_gate/check` reason + WISP refusal), never only in client JS. Never an ungated deploy.
- **AGPL.** The Browser repo stays AGPLv3. Nothing from it is copied into `~/limitless-gate` (proprietary). The charter
  cannot restrict the source code (Article II says so explicitly). The served app keeps the source link.
- **Privacy promise.** The admin panel shows totals only, never which sites a member visits. New personal data (legal
  name, signature, standing history, reports) needs Privacy policy text before launch (`MEMBERSHIP.md` section 9).
- **No evasion features** without Boss's explicit decision (repo rule). Nothing in this plan adds any.
- **`index.html` rules:** never read it whole, keep LF endings, keep `patcher.html` patch definitions in step with
  renamed identifiers, keep the storage key rules (`limitless:*:v1`, no rename without a migration).
- **`ProxyCache` IndexedDB version:** bump only with the 0.2.1 lesson in mind (open never blocks boot). New stores in this
  plan use **new database names** instead of a version bump.
- **Cross-repo:** no GLL ID change (Boss 2026-11-10: invites are for kmlhs.org accounts only). HALL listing change is in
  `~/gll-launcher` (read its `CLAUDE.md`, Boss OK because it is public-facing).
- **Host and container config** (BBR sysctl, relay resources, DNS cache container, nginx auth cache) need Boss's go
  before they are applied, even though they are planned here.
- **Docs in the same commit**, no em dashes, commit only when Boss asks (repo rule, stricter than the global one).

## 3. Slices and order
At most **2 feature slices in flight** for this project (and 3 across the portfolio). Each slice is built on its own branch
`slice/1.0-<name>` and merged into `release/1.0.0`; nothing ships until the whole release passes its gates.

| Wave | Slice | Repos | Summary | Detail |
|---|---|---|---|---|
| 0 | **T0 Measure**: **done** 2026-11-10 (merged `a6c1403`) | Browser | Chromebook harness, fixture pages, 0.2.3 baseline, home link (21 Mbit/s up) | `BASELINE.md` |
| 1 | **S1 Page pipeline** | Browser | Parallel loading stages, show before images, progress bar, lazy offscreen images, data saver | `SPEED.md` 2 |
| 1 | **S2a Startup: split** | Browser | WASM, acorn, skins CSS out of `index.html`; lazy subsystems; boot work | `SPEED.md` 3.1 to 3.4, 3.6, 3.7 |
| 2 | **S2b Startup: service worker** | Browser | App shell `sw.js`, update banner hand-off, `features.sw` kill switch | `SPEED.md` 3.5, 3.8 |
| 2 | **S3 Client speed extras** (trimmed, 0.3 item 4) | Browser | Tab sleeping, instant Back, rewrite cache, worker CSS rewrite, blocklist | `SPEED.md` 4 |
| (D6) | **0.3.0 release** (0.2b) | Browser | Minor lane: S1 + S2a + S2b + S3 + relay off (public relays only) | card in section 8, `REVIEW-2026-11-14.md` 2 |
| 2 | **S4 Relay** (D1a, 0.2b) | Browser deploy, gate, VPS (bought 2026-11-14, Buffalo NY) | VPS relay + lbgate in relay mode (token check, byte counts, fair share) + relay tokens from home lbgate. Also: per-hop timing, DNS cache and BBR on the VPS, dependency review. nginx auth cache dropped (`/wisp/` no longer passes nginx) | `RELAY.md`, `REVIEW-2026-11-14.md` 3 |
| 3 | **S5 Membership** (after Wayfinder W3c) | gate, Browser | Data model, invites, ceremony, numbers, tiers + plan limits engine, standing, PDF, verify. **Built 2026-11-15 on `slice/1.0-membership` (gate + Browser), merged with S4 into `release/1.0.0` 2026-11-15 (relay claims and member id wired to membership; MEMBERSHIP.md 12 stack spec `tests/stack/membership.spec.js` green), not deployed; status block at the top of `MEMBERSHIP.md`** | `MEMBERSHIP.md` |
| 4 | **S6 UI** | Browser, theme | Toolbar and menu, tabs, settings, splash, notices, errors, icons, Prime and Cardinal themes, Vault lock, tour | `UI.md`. **Built 2026-11-15 on `slice/1.0-ui` (Browser) plus `slice/1.0-ui` in the gate (one JSON route, `GET /auth/welcome/state`); visual suite green at 1366x768 and 2560x1440 in every theme; the designed ceremony is wired. Not merged, not deployed.** |
| 4 | **S7 Admin** | gate, Browser | Members, profiles, queue, plan knobs, charts, hops, audit viewer, reports, notices | `ADMIN.md` |
| 5 | **S8 Downloads panel**: **in 1.0** (D4 reversed), per-tier limits | gate, Browser | Panel, pause and resume, early refusal against plan limits | `SPEED.md` 6 |
| 5 | **S9 Paid tiers selling** (D2b, in 1.0) | gate, Browser, `gll-launcher` | HALL pricing page + request form, trials, top-ups, Executive, Load Now, transfer brake | `PAID-TIERS-PLAN.md` |
| done | **D2 Design round 2**: held 2026-11-13 after all (`design/picks-round2.md`); its picks replace round one where they differ | none | | `design/` |
| done | **R1 Workers relay**: dropped (Cloudflare SSA 2.2.1(j)) | none | | `R1-WORKERS-RESULT.md` |
| done | **Rules round**: decisions done 2026-11-10; one edit pending (remove Prime immunity, D2 now applies) | docs | | `RULES-DRAFT.md` |

Why this order: speed is the priority and needs a baseline first (done); S1 and S2a touch different parts of
`index.html` (the `go()` pipeline vs. the vendored scripts and boot), so they run side by side as the project's two slices
in flight. S4 waits for D1. Admin depends on the membership data model. Portfolio cap: Wayfinder takes up to 3 slices
while W1, W2 and W3a run together, so Limitless slices start when Wayfinder is down to one (section 9).

## 4. Kill switches (all default on unless stated)
- `version.json` `features` (read once at boot, stamped by `scripts/build-static.sh`): existing `ownSockets`, `worker`,
  `respCache`, plus new `pipeline` (parallel stages; false = old serial path), `lazyImg`, `sw` (false = the app
  unregisters its service worker on next load), `tabSleep`, `rewriteCache`, `pageCache`, `warm`, `instantBack`.
  Each gets an `LB_FEATURE_*` build variable like the existing three.
- `deploy/gate.env`: `MEMBERSHIP=off` (no ceremony gating; members browse as plain approved users, admin membership
  routes 404), `FAIR_SHARE=off`, `REPORTS=off`, existing `ADMIN_PANEL=off`.
- The WASM split and the removed tutorial have no switch: rollback is redeploying 0.2.3 (`./deploy.sh c88ce5e`).

## 5. Ship gates for 1.0.0 (Major lane)
From `~/.claude/docs/release-procedure.md`, plus this repo's tests:
1. `npm test` green (all e2e specs, including new ones) and the visual snapshot suite green.
2. `npm run test:stack` rehearsal green, including the new ceremony, invite, standing and load specs.
3. Speed: Chromebook-profile harness, 7 reps, fixture pages and public sites, compared with the 0.2.3 baseline from T0.
   Targets in `TESTING.md` section 6.
4. Migration rehearsal: a copy of the prod gate SQLite shape (seeded, never real data) migrated to the 1.0 schema;
   existing members numbered by approval date; Boss is 0000; ceremony required on next visit.
5. Load: 20 simulated members on the rehearsal stack (fair share, caps, owner priority, relay stays up).
6. Zero open P0/P1. Release record (skill `release-record`) with pinned sha, rollback sha = the deployed 0.3.0 sha, and the exact commands.
7. Privacy policy and Rules text for the new data live on HALL before or with the deploy (Boss pre-approved Claude's
   text on 2026-11-10: "auto approve your work, when work begins"; logged as a standing approval for this release).
8. After deploy: smoke check, `~/gll-planning/rotation/rotate.sh check` says `preflight OK`, 24 h hold.
Boss's Chromebook checklist (`TESTING.md` section 8) is advisory, never a blocker.

## 6. Decisions log (2026-11-10)
Historical. Where it differs from 0.2, 0.2b or the topic files, those win (newest wins): no free-only rule (VPS bought), no home
relay, no Prime immunity, no nominations, certificates from Cardinal up, public HALL verify page, Executive tier exists.
Speed
- All three slow points matter: boot, page loading, jank. Page loading first.
- Parallel stages and no wait on images (recommended option). Thin progress bar replaces the blur overlay.
- Startup: "will be decided, can be big changes" -> plan takes the split + service worker route (`SPEED.md` 3).
- Instead of link-hover prefetch: relay DNS cache, warm favourite sites, ad/tracker blocking by default (already on:
  `limitless:block:v1` defaults true; the work is the list), lazy offscreen images, instant Back.
- Also: tab sleeping, rewrite cache across visits, cached rewritten pages, off-thread rewrite work.
- Members use school Chromebooks and personal laptops. Layout targets 1366x768 and scales to 1440p.
- Proof: better harness (Chromebook profile, 7 reps, fixture pages) plus anonymous load-time medians from members.

Server
- Home upload speed unknown: measure it. All recommended server tuning is in (needs Boss's go when applied).
- Enforcement stays in the gate. Keep everything free of paid services; Boss has Proton VPN for about 1.5 years.
- Exit IP (home vs Proton): undecided. Off-site relay: prototype on Cloudflare Workers and measure.
- Relay choice: automatic by latency. Heavy use: data saver mode, fair share, owner priority, tier weighting.

Membership
- Single-use invite links, 7 days, bound to a GLL ID login name; kmlhs.org accounts only (second round replaced the
  earlier "invite adds the GATE email exception" choice, so no GATE change).
- Numbers: Boss 0000, existing members by join order, new members type a free 4-digit number at invite time
  (design note: typed, not a grid). Reserved set for Boss. Removed numbers retired forever.
- Invites: Boss only (member nominations removed 2026-11-14). Delivery: copy link and optional email
  (click "Send email" = Boss's approval for that one email).
- Tiers: **Ordinal / Cardinal / Prime**, promotion only by Boss. Perks: bandwidth and priority,
  Vault theme for Cardinal and Prime (locked now, may be redesigned), tier marks (rings), seal on certificate and card.
  Prime gets its own theme (Crimson and obsidian favourite, Obsidian and platinum maybe) and partial immunity by severity.
- Certificate: one PDF, page 1 certificate (layout A, centred; QR small in a corner), page 2 personal letter signed by Boss
  as Director, page 3 signed charter. Midnight paper with ice foil on screen, cream print copy. Pinyon Script + Cormorant.
  Only Prime members and Boss may show a certificate.
- Full legal name required, encrypted at rest, ciphertext only in backups, kept 1 year after removal, policy notice.
- Ceremony: full six steps; existing members do it on their next visit; reveal = engraved serif numerals (seal version maybe).
- Rules: short charter of numbered Articles ("The Member shall") plus full Rules at `/legal/`; enforcement warning,
  suspension (length set each time), removal; wording gets its own question round.

UI and admin
- Classic tabs default, vertical as a member setting; full URL with the domain emphasised; slow and precise motion;
  Luxury dark default; restrained toolbar + one menu; settings in six groups; ceremony replaces the tutorial;
  custom thin-line icons; splash shows the member's name with the number small beneath; ceremony-only sounds;
  calm error cards; engraved notice bulletin; member card on the start page; skins kept as they are.
- Admin: invites queue, live + 30 days charts, member profiles (lineage, standing, sessions,
  re-issue certificate), audit log viewer, search and filters. Totals only, never sites.
- Report a problem: hostname only when ticked, timings, device class, category. Extensions: curated list + lazy load.
  Downloads panel in 1.0. HALL: discreet "by invitation" listing.

## 7. Open items
Answered by Boss on 2026-11-10 (second question round):
1. Director signature: **"James Thiessen, Director of Gamble Limited Ltd."** on the certificate, letter and notices.
2. Exit IP: **decide after measuring** (home upload test and the Workers prototype). Home IP until then.
3. Numbers: SUPERSEDED 2026-11-14 (four digits, Boss is 0000, new rules): see 0.2b and `MEMBERSHIP.md` section 4.
4. Tier perks (nominations removed 2026-11-14): fair-share weights 1 / 1.5 / 2. The 50 / 75 / 100 Mbit/s caps were dropped after T0
   measured about 21 Mbit/s home upload (Boss, 2026-11-10): tiers are shares of the total. A brainstorm on making the
   whole link faster comes later (with the S4 tunnel study).
5. Rules round: done the same day; decisions in `RULES-DRAFT.md`.
6. Email exceptions: **kmlhs.org accounts only**. No GLL ID change. Invites refuse other email domains.
7. Privacy text: **Boss pre-approved** Claude's text for this release ("auto approve your work, when work begins").
   Still recorded: members are 13+, and storing minors' legal names was flagged; Boss chose to keep legal names.
8. Invite email sender: the existing **gamblelimitedsupport@taps-holdings.org** (check the Resend domain set-up at S5).
9. Host changes: Claude prepares and tests them on the rehearsal stack, then **pastes the exact commands** when S4 lands;
   Boss runs the host parts; container config ships with the 1.0 deploy.
10. Cloudflare SSA 2.2.1(j) (no proxy services) covers the existing tunnel carrying `/wisp/` (`R1-WORKERS-RESULT.md`
   addendum). Boss: **accept the risk for now**; the alternatives (move `/wisp/` off Cloudflare, separate account and domain,
   written permission) get a proper study during S4, decided before 1.0 ships because 1.0 raises traffic.
Decided (2026-11-13): D1 to D6 in section 0.2. D1a also settles the exit IP (sites see the VPS IP, the home IP is
no longer exposed) and makes the Proton egress question moot.

## 8. Build cards (one per slice, for the implementing session)
Every card: branch `slice/1.0-<name>` off `main`, merge into `release/1.0.0` (or `release/0.3.0` for the D6 speed release); failing test
first for every fix; docs and `CLAUDE.md` in the same commit; commit at the end of each section, never push a tag. Model
advice (Boss, 2026-11-14): Sonnet 5.5 medium builds everything; Opus manages and reviews only when Boss asks, after certain stages and at the end. `index.html` is never read whole (Grep, then small ranges).

| Card | Start when | Touches | Done when | Notes for the builder |
|---|---|---|---|---|
| **S1** | now | `index.html` `go()` stages, `queueFetch`, `processEl`, `showOverlay`; new `tests/e2e/pipeline.spec.js` | fx-slow shown before its 5 s image; fx-news warm shown at least 40 % faster on the chromebook project; script order spec green; `features.pipeline=false` gives the old path | First confirm F-i (duplicate fetches) with a test, then build 2.1. Keep the serial path behind the switch, do not delete it. |
| **S2a** | now | `index.html` libcurl block, acorn block, `#skinStyles`; new `vendor/libcurl/`, `vendor/acorn/`, `theme/skins.css`, `app/`; `scripts/build-static.sh`; `patcher.html` | Cold transfer at least 40 % smaller; all e2e and stack specs green; `patcher.html` patches all still match | Extraction is mechanical (Sonnet medium is fine): decode the data URI once with a script, check the `.wasm` hash, keep the LGPL notice. Decide 0.7.5 here (`RELAY.md` 8) before splitting. |
| **S2b** | S2a merged | new `sw.js`, nginx location, boot `version.json` 401/403 path | Repeat open under 1 s chromebook; `boot.spec.js` green; `features.sw=false` unregisters | Never cache `/wisp/`, `/auth/`, `/_lb/`, `/legal/`, `version.json`. |
| **S3** | S1 merged | `index.html` tabs, history, rewriter, `SKIP_DOMAINS`; new `vendor/blocklist/` | Back under 150 ms; rewrite cache hit on second visit; blocklist unit cases | Blocklist: pick a list whose licence allows redistribution, licence file next to it. |
| **S4** | D1 answered (done) | VPS compose, gate relay mode, relay token, client relay URL (relay-off plan Option A is dropped) | `/wisp/` crosses no Cloudflare service; revoke still cuts a socket within 2 s; speed harness no regression | **Status 2026-11-15: built on `slice/1.0-relay` (both repos), merged into `release/1.0.0` (with S5), tested in the rehearsal, NOT deployed; VPS and DNS not touched.** Host, DNS, port and VPS steps: `S4-HOST-COMMANDS.md` sections 7 to 10 (exact commands and rollback). Real-VPS load test, revoke test and failure drill wait for Boss's go (numbers wanted in detail). Never send credentials through a prompt. |
| **S5** | Wayfinder W3c merged; D2 and D3 answered (done) | gate `store.ts` migration, `pages.ts`, new `membership.ts`, `cert.ts`; Browser `/_lb/me` reader | `MEMBERSHIP.md` 12 tests green; migration rehearsal (section 5 gate 4) | New tables via `CREATE TABLE IF NOT EXISTS` like the existing ones; 0.2.3 must still start on the migrated file. |
| **S6** | S5 API shapes merged (can mock `/_lb/me` before) | `index.html` toolbar, menu, settings, splash; `theme/`; `scripts/gen-themes.py`; `docs/DESIGN.md` | Visual suite and layout checks green at 1366x768 and 2560x1440 in every theme | Hallmark and Impeccable on each new screen. Round two picks win over round one. |
| **S7** | S5 merged | gate `admin.ts`; `limitless://admin` script, `.lb-adm-*` CSS | `ADMIN.md` 10 tests green; non-owner gets 404 on every new route | Charts as inline SVG, no library. Totals only, never sites. **Status 2026-11-15: built on `slice/1.0-admin` (both repos), not merged; gaps and decisions in `ADMIN.md` Status.** |
| **0.3.0 release** | Boss says work begins (Wayfinder done) | S1, S2a, S2b, S3 plus relay-off: client default (public relays only), nginx `/wisp/` 410, `relay` behind a compose profile (not deleted), `sw.js` rollback stub, in-app notice, all-relays-down card, Privacy line, What's new | Minor gates (`npm test`, `test:stack`, harness vs the 0.2.3 baseline on fixtures, `boot.spec.js` stub case, rollback to `c88ce5e` rehearsed with a 0.3.0 worker installed), 24 h hold | Boss runs the host steps (Claude pastes them). Privacy text on HALL before deploy. Rollback `./deploy.sh c88ce5e` serves the stub. Public-relay speed is advisory. **Must read `REVIEW-2026-11-14.md` section 2 first** (rotation hazard, saved relay-fallback key, boot access check, dead pool relays). |
| **S8** (built 2026-11-15, `slice/1.0-downloads`, see `SPEED.md` 6 status) | S4 merged | `index.html` downloads panel and menu; gate download limits and admin knobs; new `tests/e2e/downloads.spec.js` | Queue, progress, pause and resume (Range), retry, cancel; early refusal from Content-Length with the plans link; no length: stop at the limit with a note; over 2 GB refused; limits read from admin knobs (values TBD by testing) | Counts against caps. Ordinal limits (10 MB per file, 10 a day) are client-side on public relays. Save with blob plus `<a download>`. |
| **S9** (built 2026-11-15, `slice/1.0-plans` in Browser and lbgate, `feat/limitless-plans` in `~/gll-launcher`; not merged; VPS load, revoke, failure and restore drills are Boss's) | S5 and S7 merged, S4 numbers measured | gate (plans, trials, top-ups, Load Now, transfer brake, in-app plan request queue plus email copy to support, ungated rate-limited verify status route for HALL, `plans_open` switch); Browser plans page, account panel, request form, expiry notices; `~/gll-launcher` (HALL pricing page without a form, and public verify pages; read its CLAUDE.md, Boss OK) | Every behaviour in `PAID-TIERS-PLAN.md` 10c tested; VPS load test, revoke test, failure drill, restore drill green; "Plans open for sale" ships OFF | Prices are placeholders. No card data ever. Boss's legal self-check happens before the switch is turned on. |

## 9. Fit with the week's roadmap (2026-11-13)
Boss's order: (1) Wayfinder, (2) Meridian plan pass on Fable 5.2 (`~/meridian/FABLE-PLAN-PASS.md`, planning only, writes no
code, so it is not a feature slice), (3) Limitless 1.0. Limitless needs nothing from Wayfinder except W3c (lbgate issuer)
before S5. Limitless S1 and S2a are pure client work. Boss (2026-11-14): Wayfinder completes before any Limitless work begins, and Boss says when work begins.

Last verified: 2026-11-15
