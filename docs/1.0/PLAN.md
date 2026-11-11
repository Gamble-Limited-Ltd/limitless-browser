# Limitless Browser 1.0: master plan

Status: **in build** (2026-11-11). T0, S1, S2, S3 and S4 are built on `release/1.0.0` / `slice/1.0-s4` (S4 gate half on
`limitless-gate` `slice/1.0-s4`); tunnel: option A picked 2026-11-11 (section 7, item 10); waiting on Boss: the go for the
speed re-run and the real-site failure work; then S5. Prod is 0.2.3 (`c88ce5e`). Decisions come from Boss's question rounds on
2026-11-10 and the design picker artifact (https://claude.ai/artifact/P1arJs1FYrMrCoBmR5VQ2h, collection `picks`, 30 picks).
This file is the index, the order of work and the ship gates. Detail lives in the topic files:

| File | What it covers |
|---|---|
| `SPEED.md` | Page loading, startup, client-side speed (the priority) |
| `RELAY.md` | Server path: tunnel, nginx, gate, relay, DNS, fair share, off-site relay research |
| `MEMBERSHIP.md` | Invites, numbers, tiers, standing, ceremony, certificate PDF, nominations, data model |
| `RULES-DRAFT.md` | Charter and full Rules: what is decided, draft text, questions still open |
| `UI.md` | Chrome, tabs, settings, splash, notices, errors, icons, Prime theme, tier marks |
| `ADMIN.md` | Admin panel additions and the gate API behind them |
| `TESTING.md` | Harness upgrades, test layers, gates for the Major lane, Boss's Chromebook checklist |
| `design/` | Design reference for dev: `design-room.html` (snapshot of the picker artifact, open in a browser; names in it are examples) and `picks.json` (Boss's 30 picks with notes). Build from the `fav` picks and apply the notes. |

## 1. What 1.0 is
One release, version **1.0.0**, **Major lane** (Boss, 2026-11-10: speed and membership ship together). It contains:
1. **Speed** (priority): pages appear sooner (parallel loading, no wait on images), faster startup (WASM and libraries out of
   `index.html`, service worker app shell), and a set of client and server speed-ups. Proven with a Chromebook-profile harness.
2. **Membership**: single-use invite links, permanent member numbers (Boss is No. 000), tiers Ordinal / Cardinal / Prime,
   a signed Membership Charter, a six-step welcome ceremony, a certificate PDF signed by Boss as Director, nominations,
   and a warning / suspension / removal process.
3. **UI**: restrained toolbar with one Limitless menu, classic or vertical tabs, settings in six groups, new splash, notices,
   error cards, custom icon set, a Prime-only theme, tier marks.
4. **Admin**: member list with filters, profiles, invite and nomination queue, live and 30-day charts, per-hop timing,
   audit log viewer, problem reports.
5. **Upstream and dependencies**: GUST upstream has no new commits since `08515a7` (checked 2026-11-10). libcurl.js 0.7.5
   (published 2026-10-21) and a newer epoxy-tls commit exist: reviewed and taken only if clean (`RELAY.md` section 8).

Out of scope for 1.0: E2E encrypted sync (slice C), custom theme editor (slice G), command palette, mobile/tablet layout,
paid hosting of any kind.

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
| 0 | **T0 Measure** (not a feature slice) | Browser | Chromebook harness profile, fixture pages, baseline numbers for 0.2.3, home upload test | `TESTING.md` 2, `RELAY.md` 2 |
| 1 | **S1 Page pipeline** | Browser | Parallel loading stages, show before images, progress bar, lazy offscreen images, data saver | `SPEED.md` 2 |
| 1 | **S2 Startup** | Browser | WASM, acorn, PDF.js and skins CSS out of `index.html`; service worker shell; lazy subsystems | `SPEED.md` 3 |
| 2 | **S3 Client speed extras** | Browser | Tab sleeping, rewrite cache, cached rewritten pages, worker CSS rewrite, instant Back, warm favourites | `SPEED.md` 4 |
| 2 | **S4 Server path** | Browser deploy, gate | Per-hop timing, nginx auth cache, relay DNS cache, BBR, relay resources, fair share + tier weights, dependency review | `RELAY.md` |
| 3 | **D2 Design round 2**: **dropped** (Boss, 2026-11-10: the design room is done). S5/S6 build from `design/picks.json` and apply its notes (corner QR, typed number, name before number) directly | none | Crimson Prime theme, rings marks, certificate A with corner QR, typed number entry, splash and settings fixes | `UI.md` 9, `design/` |
| 3 | **S5 Membership** | gate, Browser | Data model, invites, ceremony, numbers, tiers, standing, PDF, verify page, nominations | `MEMBERSHIP.md` |
| 4 | **S6 UI** | Browser, theme | Toolbar and menu, tabs, settings, splash, notices, errors, icons, Prime theme, Vault lock, tour | `UI.md` |
| 4 | **S7 Admin** | gate, Browser | **First: fix the existing panel** (Boss, 2026-11-11: the owner password step-up does not work, so no changes can be saved; more issues to list), then members, profiles, queue, charts, hops, audit viewer, reports, broadcast notices | `ADMIN.md`, section 7 item 11 |
| 5 | **S8 Downloads panel** | Browser | Queue, progress, pause/resume, retry, counts against caps | `SPEED.md` 6 |
| any | **R1 Cloudflare Workers relay prototype**: **dropped** (Boss, 2026-11-10): Cloudflare SSA 2.2.1(j) forbids proxy services on Workers | none | Result in `R1-WORKERS-RESULT.md` | `RELAY.md` 7 |
| any | **Rules round** (questions, then text) | docs | Charter and full Rules wording | `RULES-DRAFT.md` |

Why this order: speed is the priority and needs a baseline first; S1 and S2 touch different parts of `index.html`
(the `go()` pipeline vs. the vendored scripts and boot), so they can run side by side. Membership needs the round 2
design approval before UI work. Admin depends on the membership data model.

## 4. Kill switches (all default on unless stated)
- `version.json` `features` (read once at boot, stamped by `scripts/build-static.sh`): existing `ownSockets`, `worker`,
  `respCache`, plus new `pipeline` (parallel stages; false = old serial path), `lazyImg`, `sw` (false = the app
  unregisters its service worker on next load), `tabSleep`, `rewriteCache`, `pageCache`, `warm`, `instantBack`.
  Each gets an `LB_FEATURE_*` build variable like the existing three.
- `deploy/gate.env`: `MEMBERSHIP=off` (no ceremony gating; members browse as plain approved users, admin membership
  routes 404), `FAIR_SHARE=off`, `NOMINATIONS=off`, `REPORTS=off`, existing `ADMIN_PANEL=off`.
- The WASM split and the removed tutorial have no switch: rollback is redeploying 0.2.3 (`./deploy.sh c88ce5e`).

## 5. Ship gates for 1.0.0 (Major lane)
From `~/.claude/docs/release-procedure.md`, plus this repo's tests:
1. `npm test` green (all e2e specs, including new ones) and the visual snapshot suite green.
2. `npm run test:stack` rehearsal green, including the new ceremony, invite, standing and load specs.
3. Speed: Chromebook-profile harness, 7 reps, fixture pages and public sites, compared with the 0.2.3 baseline from T0.
   Targets in `TESTING.md` section 6.
4. Migration rehearsal: a copy of the prod gate SQLite shape (seeded, never real data) migrated to the 1.0 schema;
   existing members numbered by approval date; Boss is 000; ceremony required on next visit.
5. Load: 20 simulated members on the rehearsal stack (fair share, caps, owner priority, relay stays up).
6. Zero open P0/P1. Release record (skill `release-record`) with pinned sha, rollback sha `c88ce5e` and the exact commands.
7. Privacy policy and Rules text for the new data live on HALL before or with the deploy (Boss pre-approved Claude's
   text on 2026-11-10: "auto approve your work, when work begins"; logged as a standing approval for this release).
8. After deploy: smoke check, `~/gll-planning/rotation/rotate.sh check` says `preflight OK`, 24 h hold.
Boss's Chromebook checklist (`TESTING.md` section 8) is advisory, never a blocker.

## 6. Decisions log (2026-11-10)
Speed
- **Main issue (Boss, 2026-11-10, after wave 1):** real web pages, how long they take and whether they load at all.
  Fixture targets stay, but from wave 2 every slice reports a real-site suite (`TESTING.md` 6a): success rate and
  time to shown on popular public sites, with failure categories. Fixing failures outranks shaving fixture ms.
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
- Numbers: Boss 000, existing members by join order, new members type a free 3-digit number at invite time
  (design note: typed, not a grid). Reserved set for Boss. Removed numbers retired forever.
- Nominations: 1 per month (tier-scaled), Boss approves. Delivery: copy link and optional email
  (click "Send email" = Boss's approval for that one email).
- Tiers: **Ordinal / Cardinal / Prime**, promotion only by Boss. Perks: bandwidth and priority, more nominations,
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
- Admin: invites + nominations queue, live + 30 days charts, member profiles (lineage, standing, sessions,
  re-issue certificate), audit log viewer, search and filters. Totals only, never sites.
- Report a problem: hostname only when ticked, timings, device class, category. Extensions: curated list + lazy load.
  Downloads panel in 1.0. HALL: discreet "by invitation" listing.

## 7. Open items
Answered by Boss on 2026-11-10 (second question round):
1. Director signature: **"James Thiessen, Director of Gamble Limited Ltd."** on the certificate, letter and notices.
2. Exit IP: **decide after measuring** (home upload test and the Workers prototype). Home IP until then.
3. Numbers: existing members take **001 upward** by join order; reserved list **007, 100, 777** (only numbers still
   free; if join order lands an existing member on 007 they keep it).
4. Tier perks: **1 / 2 / 3 nominations a month**, fair-share weights 1 / 1.5 / 2. The 50 / 75 / 100 Mbit/s caps were dropped after T0
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
   **Decided 2026-11-11 (Boss): option A**, `/wisp/` moves off the Cloudflare tunnel to a direct, DNS-only name on the home IP
   (`TUNNEL-OPTIONS.md`). Whether the relay moves to its own VM or LXC is being worked out (Boss asked for ideas).
11. **Admin panel fixes (Boss, 2026-11-11), first part of S7.** Boss's password does not work in the panel's step-up, so
   no write (approve, revoke, overrides, kill, flags) can be made. Code reading, not yet reproduced: `POST
   /_lb/admin/api/step-up` (`limitless-gate/src/admin.ts`) calls GATE direct login and turns every GATE refusal into
   one `stepup_failed`, so the real reason is hidden. Leading suspect: GATE legal v2 answers `403
   LEGAL_ACCEPTANCE_REQUIRED` and step-up never sends `acceptedLegal` (the sign-in page does). Other suspects: login
   name vs email, GATE rate limit. Fix starts with a failing test against the mock GATE; the panel must show the real
   reason. Boss to list the other panel problems ("and more").
   **Status 2026-11-11:** cause confirmed in GATE (`gll-id/apps/server/src/routes/direct.ts:289`, legal v2
   `LEGAL_ACCEPTANCE_REQUIRED`). Fixed: step-up sends `acceptedLegal`, answers safe reason codes, the dialog shows the
   acceptance box and every reason. Other panel problems found are in `ADMIN.md` section 0. Merged into `release/1.0.0`
   (both repos) 2026-11-11, not deployed.
12. **Speed limits that follow the real line (Boss, 2026-11-11, in 1.0.0, build when ready).** Today fair share splits a
   fixed `TOTAL_UPLINK_MBPS` (18, from one T0 measurement). Wanted: the total follows the real ISP speed (periodic upload
   measurement on the box that carries `/wisp/`, smoothed, never above the box's shaped rate), per-member limits derived from
   it and the tier weights, and the admin panel showing the measured line, each member's share and the limit in force.
   Builds after the relay box slice (the box changes where the upload is measured). Detail to write in `RELAY.md` 3.5.
13. **Upload, ranks and cloud relay (Boss, 2026-11-11 question rounds).** Context: about 10 members, about 4 at once,
   mostly pages and school tools, speed is key, home upload about 21 Mbit/s. Free options only; paid hosting stays out of 1.0.
   - **Fetch less:** Data saver is ON for everyone; only Prime and Owner can turn it off (`SPEED.md` 2.5). Small interactive
     requests get a reserved lane (about 25 percent) over bulk transfers (`RELAY.md` 3.5).
   - **Limits:** fair share (slow heavy streams) AND a daily quota per rank as backstop: Ordinal 3, Cardinal 8, Prime 20 GiB,
     Owner unlimited (`MEMBERSHIP.md` 5, `RELAY.md` 6). Weights stay 1 / 1.5 / 2. Standing ladder unchanged (warning,
     suspension, removal; no demotion step, no quota strike). Numbers may be reconsidered after real usage data.
   - **Downloads:** file saves (save-as, attachments) are blocked for Ordinal. Cardinal may save small files only (about 10 MB
     each, any count). Prime and Owner have full downloads. Streaming and normal page loads are allowed for all. The S8
     Downloads panel is Prime and Owner only (`SPEED.md` 6).
   - **Cloud relay (free, Oracle first):** prototype and measure; the home relay stays the fallback. **Before any VM is
     made, read Oracle's LIVE Cloud Services Agreement and AUP and quote the clauses** (older versions bar reselling or
     making the service available to third parties; a public service probably counts). Checked 2026-11-11 from web
     sources only: 10 TB/month free outbound listed on Oracle's free-tier page; the Ampere A1 free shape was reported cut
     to 2 OCPU / 12 GB in 2026; idle reclaim below about 15 percent use over 7 days; account suspensions without warning
     reported. Plan B if it fails: a small paid VPS (about 4 EUR/month), which needs Boss's go.
   - **Relay choice per member:** automatic by measured speed with a Settings override; the choices offered depend on rank.
     Home relay: Owner and Prime; Cardinal only as light overflow and cannot choose it; Ordinal does not use it. Prime may
     default to the cloud relay if it is the fastest. When a site fails on the cloud relay (captcha, 403), Prime and Owner
     retry via the home relay automatically (counts toward quota); automated tests cover it. Details `RELAY.md` 4.
   - **Third-party relays join the 1.0 speed work** (were out of scope): opt-in for every rank with a plain notice (the
     operator sees hostnames and timing, not page contents); their bytes count against the same daily quota. Racing the
     first connection, spreading connections and using home plus cloud together are all toggleable (`RELAY.md` 4.1).
   - **CONDITIONAL, only if the cloud relay works (Boss decides, no fixed test):** Limitless leaves invite-only for open
     sign-up with a GLL ID required (limits and bans still work). Ordinal rises to 5 GiB/day; Cardinal and Prime rise by
     numbers set after measuring. This overrides the hard constraint "invite only" and the repo rule "never ship a public
     ungated deploy" ONLY when Boss says go. Before it opens: abuse report and takedown form, sign-up throttle with email
     checks, blocklist of malware and phishing domains at the relay, ACCESS-CONTROL, Charter, Privacy and Rules updated
     (`ACCESS-CONTROL.md` 12). All limits are per account, never per IP (shared school connections).
   - **Not planned, only possible:** if Limitless becomes popular and a cloud VM carries the upload, Ordinal free and
     Cardinal/Prime paid. Needs a host whose terms allow resale, a Terms of Service and an abuse process. Not in 1.0.
   - **Still open:** exact Cardinal/Prime extras (more awake tabs and parallel connections, never turned away when busy are
     decided), Prime-only perks list, the rank comparison page (3 columns, built when Boss says), the rule for a 5th active member.
Slices in flight (2026-11-11): `slice/1.0-edge` (relay box, item 10); `slice/1.0-adminfix` merged. Gate now has a
`release/1.0.0` branch (from `slice/1.0-s4`) as the merge target.
Still open: none blocking. Exit IP is decided after T0 (home link vs Proton egress, `RELAY.md` 5); R1 was dropped.

Last verified: 2026-11-11
