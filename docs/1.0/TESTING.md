# Limitless 1.0: testing plan

Major lane (`~/.claude/docs/release-procedure.md`): everything the repo has, plus load and migration rehearsal, then a
24 h hold. Every fix starts with a failing test. Current harness: Playwright 1.64.0 (chromium-1248), e2e on
`python3 -m http.server 8599`, stack rehearsal `deploy/rehearsal/run.sh`, speed `npm run test:speed`, gate on vitest.
Not offloaded to buildpc (no `.nvmrc` in this repo; the gate has one and can use `buildpc-run --node-from .nvmrc`).

## 1. Test layers (Boss picked all four)
| Layer | Command | Runs where | New in 1.0 |
|---|---|---|---|
| e2e (static, mocked routes) | `npm test` | local, every commit | pipeline, boot/service worker, sleep/back, rewrite and page cache, blocklist, menu, settings groups, tab layout, membership UI with mocked `/_lb/me`, admin views |
| Visual snapshots | `npm run test:visual` (new) | local | every new screen x every theme x 1366x768 and 2560x1440 |
| Stack rehearsal | `npm run test:stack` | local Docker, throwaway stack | ceremony, invites, standing, verify, migration, per-hop timing, auth cache, DNS cache |
| Speed | `npm run test:speed` (release gate); `npm run test:speed:quick` (slices) | local Docker + internet | Chromebook profile, fixture pages, 7 reps, boot timings; quick = chromebook only, fixtures only, 3 reps |
| Load | `npm run test:load` (new) | local Docker | 20 simulated members |
| Gate unit | `cd ~/limitless-gate && npm run check` | local or `buildpc-run` | membership, invites, numbers, fair share, encryption, retention sweep |

## 2. T0: baseline before any code (wave 0)
1. Add a Playwright project `chromebook`: viewport 1366x768, device scale 1, CPU throttling 4x
   (`Emulation.setCPUThrottlingRate` over CDP), network 10 Mbit/s down, 5 Mbit/s up, 40 ms RTT
   (`Network.emulateNetworkConditions`). Keep the existing `chromium` project unthrottled.
2. **Fixture pages** (`tests/fixtures/sites/`): a heavy news-style page (60 images, 12 scripts, 4 CSS with imports),
   a module-graph app page, a page with a slow image (5 s) and a slow script (2 s), a long article, a page with iframes.
   Served by a fixture container in the rehearsal on a **public-looking test network**: the relay refuses non-global
   addresses (`allow_non_global = false`), so the rehearsal gets a test-only relay config allowing just the fixture
   subnet (never in prod config; a test asserts the prod `config.toml` still has `allow_non_global = false`).
3. Run on `c88ce5e` (0.2.3): 7 reps per site cold and warm, both projects. Store `test-results/speed-c88ce5e-*.json` and
   copy the medians into `docs/1.0/BASELINE.md` with the date and machine.
4. Record transfer sizes (cold and repeat open), boot timings (`navigationStart` to splash hidden, to start page
   interactive), `DOMParser` and rewrite time on fixtures, long tasks during scroll.
5. Home upload/download measurement (`RELAY.md` 2.1).
6. Fix the noise problem from 0.2.0 (base vs itself failed at 3 reps): 7 reps, compare medians, and gate only on fixture
   pages (stable); public sites are reported, not gated.

## 3. Visual and layout checks
- `toHaveScreenshot` for: toolbar + menu open, vertical tabs, start page with member card and notice, splash, settings
  (each of the six groups), membership page, error card, ceremony steps 1 to 6, certificate on screen, removal and
  suspension notices, admin (members, profile, queue, usage, health), in every theme (8 shipped + Prime) and both modes
  where the theme has them, at 1366x768 and 2560x1440. Animations disabled for snapshots (`reducedMotion: 'reduce'`).
- An automatic layout check on the same pages: no element with text has `scrollWidth > clientWidth` unless it is meant
  to ellipsis (`text-overflow: ellipsis` set), no two visible text boxes overlap (bounding-box test over text nodes),
  no horizontal page scroll. Fails with the element path.
- Contrast check: computed text and background colours of every text node meet 4.5:1 (3:1 for 24 px and up).
- Hallmark audit and Impeccable critique run on the round 2 design page and on screenshots of the built screens.

## 4. Ceremony end to end (stack)
On the rehearsal with the mock GATE:
1. Owner creates an invite for `alice` (kmlhs.org email); an invite with an outside email is refused.
2. Invite page shows; expired, used and revoked tokens show the right page.
3. Accept -> owner API approve -> sign-in -> ceremony: number typed (taken, reserved, invalid, free), charter signed
   with a legal name, reveal, certificate downloaded (screen and print), PDF parsed (3 pages, name, number, code present),
   QR decodes to the verify URL, verify page says genuine for a member and redirects to sign-in for no session.
4. A different account signing in after accept gets the invite-only page.
5. Existing member path after migration: welcome card, sign, certificate, no number step.
6. Suspend with an open socket: socket closed within 2 s, sign-in shows the suspension notice and the read-only
   membership page, WISP still refused, lifts at the end date (test clock). Remove: notice naming the Article,
   certificate void, number retired and refused at the number step. Reserved numbers 007, 100, 777 refused for members.
7. `MEMBERSHIP=off`: no ceremony, members browse, membership routes 404.

## 5. Load and abuse (stack)
`tests/load/members.mjs` (Node, `ws`, no new dependency in the Browser repo; runs from the gate's dev dependencies or a
small `tests/load/package.json`):
- 20 members (seeded sessions), each 4 sockets, mixed traffic against the fixture server: page-like bursts and 3 members
  streaming large files.
- Checks: fair share engages when the total passes the configured uplink (set low in the test, e.g. 100 Mbit/s), weights
  hold within 15 %, the owner stays first, per-user caps hold, stream and socket caps refuse cleanly, the relay and gate
  stay up, gate CPU and memory recorded, no `overloaded` closes under the normal mix.
- 30-minute soak at 10 members for memory growth (gate RSS growth under 50 MB).

## 6. Speed targets (confirmed after T0, measured on fixture pages, Chromebook profile, medians of 7)
| Metric | Target vs 0.2.3 baseline |
|---|---|
| Page shown (heavy fixture, warm cache) | at least 40 % faster |
| Page shown (slow-image fixture) | not delayed by the slow image at all (shown before it finishes) |
| Repeat open: start page interactive | under 1.0 s |
| Cold open transfer size | at least 40 % smaller |
| Back to previous page | under 150 ms (from memory) |
| No regression | no fixture page more than 10 % and 100 ms slower on any metric (`scripts/speed-compare.mjs`) |
Public speed sites are measured and reported in the release record but do not gate (internet noise).

**Tiers (T1-T4, T7, 2026-11-12).** Slice work: `npm test` (e2e, fullyParallel), `npm run test:speed:quick`, `npm run test:sites:smoke` (12 sites flagged `smoke: true`). Release gate: `npm run test:speed` (both projects, 7 reps, public sites 3 reps) and `npm run test:sites` (all sites, 1 worker, rep 3 skipped when reps 1 and 2 fail with the same category). The speed harness signs in once per run and reuses the cookies (caches stay empty) and an error card ends a rep at once. `scripts/speed-nightly.sh` runs the whole gate set unattended under the rehearsal lock and writes `~/gll-planning/reports/limitless-speed/<date>/`. Always wrap anything that starts the stack in `flock /tmp/limitless-rehearsal.lock`.

## 6a. Real-site suite (Boss's priority, added 2026-11-10)
`tests/stack/sites.spec.js` (built in S3, `LB_SITES=1`): a fixed list of about 40 popular public sites in `tests/stack/real-sites.json`
(search, video, reference, news, social, school tools, docs, shopping). Per site, chromebook profile, 3 reps through the rehearsal
relay: loaded (page shown, no fatal page error, a site-specific selector present), time to shown, time to load, and a failure
category (DNS, relay connect, TLS, HTTP status, rewrite or script error, CSP or frame block, timeout). Output
`test-results/sites-<sha>.json`; the release record lists success rate vs the 0.2.3 run. Gate: success rate not lower than 0.2.3,
and every failure on the list has a category and an issue or a note.

## 7. Migration rehearsal
Seeded gate SQLite with the 0.2.3 schema and mock approvals (owner + 6 users with varied `approvedAt`), run
`scripts/membership-migrate.ts` dry run and apply, check numbers (000 owner, 001 upward by date), tiers, `welcome`
state, idempotency on a second run, and rollback: redeploying 0.2.3 against the migrated database still starts
(new tables are ignored by the old code). Never with real data.

## 8. Boss's Chromebook checklist (advisory, never a blocker)
Written into the vault before the release, about 15 minutes on a real school Chromebook:
1. Open Limitless cold and again: splash shows your name, start page appears quickly.
2. Open a news site and a video site: page appears before all images; progress bar moves; scrolling is smooth.
3. Back and Forward feel instant. Leave a tab 10+ minutes, return: it wakes without a reload from the network.
4. Menu, settings (six groups), vertical tabs, a few themes including Prime.
5. Membership page, download the certificate, scan the QR with a phone (it should ask you to sign in).
6. Report a problem with and without the address ticked; see it in admin.
7. Anything that looks off: note it with a screenshot.

## 9. Release gate summary
All of sections 1 to 7 green, zero open P0/P1, privacy text approved and live, release record with pinned sha and
rollback `./deploy.sh c88ce5e`, host changes applied with Boss's go, then deploy by Boss, smoke check,
`~/gll-planning/rotation/rotate.sh check` = `preflight OK`, 24 h hold.

Last verified: 2026-11-10
