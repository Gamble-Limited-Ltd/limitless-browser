# Limitless 1.0: membership

Built in slice S5 (wave 3) in `~/limitless-gate` (proprietary) and the Browser repo, after design round 2 (`UI.md` 9).
Everything that decides access is enforced by the gate and nginx. The app only displays.

> **2026-11-14 update (Boss answers, `PAID-TIERS-PLAN.md` 10c, `RULES-DRAFT.md` clause 8):** tiers carry per-plan limits and a
> `paid_until` in the gate's `members` table, never in GLL ID. A fourth plan, **Limitless Executive**, is invitation-only
> (Boss grants it, hidden flag). Certificates start at Cardinal (silver, no QR), Prime (crimson, corner QR) and Executive
> (gold, corner QR); Ordinal has the member card instead. The QR opens a **public HALL verify page** (tier, number, date,
> status; never the name or the browser address). No plan has moderation immunity. Number rules by tier: section 4 (four digits;
> Ordinal and Cardinal non-prime, Prime prime only, Executive its own block). Libraries fixed: `pdf-lib` and `qrcode` (both MIT).

## 1. Concepts
- **Member:** a GLL ID account approved for Limitless (GATE per-app approval, client `limitless-browser`) that has a
  membership row in the gate. Boss (`OWNER_SUB`) is No. 0000, tier Executive.
- **Number:** 0000 to 9999 (four digits, section 4), unique, permanent. Retired numbers (removed members) are never reissued. A reserved
  set is assignable only by Boss.
- **Tier:** Ordinal (default, free), Cardinal, Prime (paid, one term each) and Executive (invitation-only, never shown to
  members without the hidden flag). Boss grants every paid plan after recording the cash; Executive is granted only by Boss, through a fully custom invitation. A plan has a `paid_until` date; at expiry the member returns to Ordinal.
- **Standing:** `good`, `warned`, `suspended` (with an end date or indefinite), `removed`.
- **Charter signature:** full legal name typed by the member, the charter version, the time. Required before browsing.
- **Certificate:** a PDF issued from the signature and membership data, with a verification code. Cardinal and above only.

## 2. Access states and how they are enforced
`/_gate/check` (called by nginx for every gated request and the WISP upgrade) gains reasons, in this order:
| State | `/_gate/check` | nginx for HTML | WISP | Notes |
|---|---|---|---|---|
| Not signed in | 401 | `/auth/signin` | refused | unchanged |
| Not approved in GATE | 403 | `/auth/invite` (invite-only page) | refused | unchanged |
| Removed | 403 `X-LB-Reason: removed` | `/auth/removed` (formal notice) | refused | sessions deleted at removal |
| Suspended | 403 `X-LB-Reason: suspended` | `/auth/suspended` (letter notice with end date, plus a read-only view of their membership page: certificate, standing, charter) | refused | lifts by itself at the end date |
| Approved, charter not signed | 403 `X-LB-Reason: welcome` | `/auth/welcome` (ceremony) | refused | covers new and existing members |
| Member in good standing or warned | 200 | app | allowed | |
| Maintenance | 401 `maintenance` | `/auth/maintenance` | refused | unchanged, owner exempt |
- `/auth/welcome`, `/auth/removed`, `/auth/suspended`, `/auth/invite/<token>` live under the ungated `/auth/` prefix,
  served by the gate, styled with `theme/` like the existing auth pages, and each checks the session itself.
- `MEMBERSHIP=off` in `deploy/gate.env` skips every membership reason (members behave like plain approved users) and
  makes the membership admin routes 404. That is the kill switch.
- **WISP column in 1.0:** `/wisp/` moves to the VPS (S4), so "refused" means `POST /_lb/relay-token` gives no token and the
  revoke list closes open VPS sockets. In 0.3.0 there is no WISP of ours at all (public relays only).
- The 60 s access cache in the gate applies to GATE approval only. Membership state is read from the local SQLite on
  every check (cheap, indexed), so a suspension or removal takes effect at the next request; sockets are closed at once
  by the same code path revoke uses today.

## 3. Invites
3.1 **Why invites approve first.** GATE refuses sign-in to accounts that are not approved for the app (`ACCESS_DENIED`
in both the redirect flow and direct sign-in, `~/gll-id/docs/DIRECT-SIGNIN.md`), and non-kmlhs.org addresses fail with
`SCHOOL_EMAIL_REQUIRED` unless they have an email exception. So an invite cannot wait for the invitee to sign in first;
accepting the invite approves the named account through the owner API, and then the person signs in.
**Invites are for kmlhs.org accounts only** (Boss, 2026-11-10). No GLL ID change is made; an account that already has
an exception Boss added by hand in GLL ID still works, because approval goes by login name.

3.2 **Creating an invite** (admin panel, step-up required):
- Fields: GLL ID login name (required: the owner API approves by login name), email (optional, for sending; must end in
  `@kmlhs.org`, other domains are refused with "Invites are for kmlhs.org accounts"), note (private). Invites are made by Boss only.
- The gate makes a 32-byte random token, stores only its SHA-256, expiry now + 7 days, single use.
- Output: the link `https://limitless.taps-holdings.org/auth/invite/<token>` with a Copy button, and a free-text message box: Boss types the invitation text per person (no template). Optional **Send email** from **gamblelimitedsupport@taps-holdings.org** (Resend;
  check the domain set-up at S5): the click is Boss's approval for that one email (standing approval, invites only,
  Boss 2026-11-10). Email template in `UI.md` 6.6. The only automatic email is the plan request copy to the support
address (to Boss only, `PLAN.md` 0.2b); nothing is ever emailed to members automatically.

3.3 **Redeeming:**
1. Visitor opens the link. The gate shows the invitation card (ceremony step 1, design picked): Boss's own invitation
   text (typed per person), signed by the Director, and the expiry date. No inviter number (only Boss invites). If the token is unknown, used, revoked or
   expired: a calm "This invitation is no longer valid" page (no detail about why beyond expired vs. used).
2. "Accept invitation": the gate calls owner API `approve` with the invite's login name (actor `OWNER_SUB`), stores the
   returned `sub` on the invite, marks it redeemed, and redirects to sign-in.
3. Sign-in through GLL ID. After the callback, if the session `sub` equals the invite's `sub`, the member row is created
   (state `welcome`), then `/auth/welcome` runs the ceremony. If a different account signs in, it is treated like any
   other unapproved account (invite-only page); the invite stays bound to the named account.
- A leaked link is harmless beyond burning the invite: it can only approve the named account.
- Rate limits: the invite endpoints share the gate's existing auth rate limiter.

3.4 **No GATE change.** (An owner-API endpoint for email exceptions was considered; Boss chose kmlhs.org only.)

3.5 **Open free tier (Boss, 2026-11-14, replaces the access-request form and the 2026-10-17 invite-only rule from 1.0 on).**
Every GLL ID account may use Limitless on the free Ordinal tier with no approval; members then ask to buy a plan.
- **GLL ID side:** the `limitless-browser` client is switched from invite-only to open (`requiresApproval` = false, a field
  GLL ID already has; per-app `AppAccess` rows are then not needed). Today `manage.sh clients` sets it only at create, so
  GLL ID needs one small owner command to flip it (or Boss runs one SQL update). Boss's go, logged in the cross-repo changelog.
- **lbgate side:** a GLL ID sign-in with no member row creates one (Ordinal, state `welcome`) and runs the ceremony. Removal and
  suspension live only in lbgate (`members.standing`), so a removed member stays out even though GLL ID lets them sign in.
- **Data moves to lbgate:** the members list, migration order and the trial "account 7 days old" check stop using owner API
  `approve`/`list`; use lbgate's own `admitted_at` (and GLL ID `AppSignIn.firstAt` only for the migration of existing members).
- **When:** with 1.0 (`MEMBERSHIP=on`), not in 0.3.0: until the charter, ceremony and removal state exist, opening the door
  would let anyone in with no rules signed. 0.3.0 stays invite-only.
- Boss-made invitations (3.2) remain only for Executive, written fully custom per person. Member nominations were removed.
  The charter is signed before any plan is bought.

## 4. Numbers (rewritten 2026-11-14: four digits, Boss is 0000)
- **Format:** `0000` to `9999`, always four digits everywhere (`No. 0047`, `Nº 0047` on the certificate and the reveal). Unique and permanent.
  A typed field, never a grid, pre-filled with the next free number that the member's tier may take.
- **Boss:** `0000`.
- **Reserved set (only Boss gives; an Executive may ask, the request lands in Boss's queue):** `0000` to `0009`, `0007`, `0100`, `0777`, `1000`,
  `6969`, `7777`, `9999`. Editable in admin (more may come). Admin: member profile > "Assign reserved number".
- **Executive-only block:** `0010` to `0099`. Only an Executive may hold one of these; nobody else can pick one. Editable in admin.
- **Rules by tier (Boss, 2026-11-14):**
  - Ordinal and Cardinal: any free number that is **not prime**, not reserved and not in the Executive block.
  - Prime: **only a free prime**, not reserved, not in the Executive block.
  - Executive: only from the Executive block, or a reserved number Boss approves on request.
- **Existing members at migration:** numbered by GATE `approvedAt` (oldest first) from `0100` upward, **skipping primes and reserved numbers**
  (so `0100` is skipped; first numbers are 0102, 0104, 0105, 0106, 0108 ...). Primes therefore stay a real Prime-only perk. All start Ordinal.
- **Upgrade to Prime:** the member must choose a free prime at upgrade; the old number is retired forever. A prime stays with its holder for life,
  even after the plan lapses (the member then keeps a prime on a lower tier). Cardinal and Ordinal never hold a prime they chose.
- **Live check** `GET /auth/welcome/number?n=0048` returns `free | unavailable | not_for_plan | invalid`. Wording (Boss): a reserved, used, retired or
  Executive-block number simply says **"unavailable"**; only a prime number typed by an Ordinal or Cardinal member says **"Not available for your
  plan"** (the same message is used for a non-prime typed by a Prime member, an assumption to confirm at build). Nothing hints at the reserved set.
  On Continue the gate re-checks and claims the number in one SQLite transaction (unique index), so two people cannot take the same number.
- **Retired:** a removed member's number (and a number given up at a Prime upgrade) moves to `numbers_retired` and is never offered again.

## 5. Tiers (values confirmed by Boss, 2026-11-10; paid-plan rows 2026-11-14)
| | Ordinal | Cardinal | Prime | Executive |
|---|---|---|---|---|
| Plan | free | paid | paid | invitation-only |
| Relay | public relays only | our relay | our relay | our relay |
| Fair-share weight under load (`RELAY.md` 3.5) | n/a | 1.5 | 2 | reserved share (size after measuring) |
| Limits (tabs, data, downloads) | `PAID-TIERS-PLAN.md` 2, set live in the admin panel | same | same | same |
| Themes | all except Vault and the paid themes | + Vault, Ink blue, Silver | + Garnet | + Gilt, Onyx |
| Mark (rings set, picked) | Orbit | Orbit + silver ring | Orbit in obsidian disc + fine ice ring | gold rings (Opus polish) |
| Seal | ice | silver | crimson and obsidian | gold |
| Certificate | none (member card) | silver, no QR | crimson, small corner QR | gold, small corner QR |
| May show their certificate | n/a | yes | yes | yes |
| Membership number | not prime | not prime | prime only | Executive block or approved reserved |
| Moderation immunity | none | none | none | none |
- Owner: unlimited, first under load, everything unlocked.
- **Added by Boss, 2026-11-11 (`PLAN.md` item 13):**
  | | Ordinal | Cardinal | Prime |
  |---|---|---|---|
  | Daily data | 3 GiB | 8 GiB | 20 GiB (Owner unlimited) |
  | File saves | none | small files only (about 10 MB each) | full |
  | Data saver | on, cannot turn off | on, cannot turn off | can turn off |
  | Tabs and parallel connections | base | more | most (numbers to set) |
  | Busy line | slowed first | never turned away | never turned away |
  | Home relay | no | light overflow only, cannot choose | yes |
  | Cloud relay default | by speed | by speed | may default to it if fastest |
  Promotion: Boss by hand, plus a member "request with a reason" from their profile (lands in Boss's queue). Prime is Boss's
  choice only; no automatic routes. A 3-column rank comparison list is built when Boss says. If the cloud relay works and
  sign-up opens, Ordinal becomes 5 GiB and the others rise (numbers after measuring).
- **Vault lock** (Boss: "lock now, may need a redesign"): Ordinal members using Vault are moved to Luxury dark at their
  next load with a quiet note "Vault is reserved for paid plans". Enforced in the theme UI from the tier in
  `/_lb/me` (cosmetic, client side is fine for themes).
- Promotion issues a new certificate (new code, the old one is marked superseded, not void). Ordinal to Cardinal issues the
  first one. Expiry does not void a certificate: the verify page says "lapsed" until the plan is renewed.

## 6. Ceremony (`/auth/welcome`, six steps, about two minutes)
Picked in the artifact: invitation card, sign step, serif engrave reveal (seal version as a maybe), letter and charter
pages. Fixes from Boss's notes are included.
1. **Invitation** (invited members only; members approved from a request see a short "Welcome" card, existing members a short "Welcome to Limitless 1.0" card).
2. **Number** (new members, invited or from a request): typed field, next free pre-filled, live availability, "yours for good, never reissued".
3. **Charter:** the charter text (scrollable, version shown), "Full legal name, as it will appear on your signed charter and any certificate"
   (required, 2 to 80 characters, letters, spaces, hyphens, apostrophes, full stops), the name appears in Pinyon Script
   as it is written, tick "I have read the Charter and the full Rules, version <v>", Sign. Why the name is collected and
   who sees it (the member and the Director only) is stated right under the field.
4. **Reveal:** engraved serif numerals (`Nº 0047`), stroke draw then fill, hairline rule, soft ice glow, about 1.5 s, and a
   soft chime (Web Audio, synthesised, no audio file; muted when the system is muted). Reduced motion: a 150 ms fade.
5. **Certificate:** Cardinal and above: the certificate on screen, "Download PDF" (screen and print versions) and the verification code. Ordinal: the member card only, with one line that certificates begin at Cardinal.
6. **Tour:** three steps (themes, start page shortcuts, membership page). Skippable. Replaces the old tutorial
   (`startTutorial`, `#tutorialOverlay`), which is removed.
- Progress can resume: the gate stores the step reached; reloading returns to it.
- On Sign the gate writes the signature and sets the state to good standing; the app opens at the start page.
- Existing members on their first 1.0 visit: steps 1 (short), 3, 4, 5, 6. Their number is already assigned.

## 7. Certificate PDF
- **Generated in the gate** (Boss's pick), never in the browser, with `pdf-lib` (MIT, new dependency) and the embedded
  fonts Pinyon Script and Cormorant Garamond (OFL, self-hosted, licenses in the repo) plus Space Grotesk for small caps.
  QR codes with `qrcode` (MIT, decided 2026-11-14).
- **US Letter**, portrait (Boss is in Chicago; A4 can be added later). Three pages:
  1. Certificate, layout A (centred classic): Orbit mark, "Limitless Browser · Gamble Limited Ltd.", "Certificate of
     Membership", "This is to certify that", the name in script, admission text with the date in words (no nominator line), `Nº 047 · CARDINAL` (tier as issued), Director signature line (left), tier seal (centre), guilloche border. Prime and
     Executive only: **QR small in the bottom right corner**, clear of text, seal and border, verification code under it
     (Boss's note: "make it small in the corner"). Cardinal prints the code as text, no QR. Number shown as `Nº 0047 · CARDINAL`.
  2. Personal letter from the Director, dated, "Dear <first name>", signed "James Thiessen", with "Director of Gamble
     Limited Ltd." under the signature. The same signature block is used on page 1 and on the notices.
  3. The signed charter: all Articles, the member's name in script as signature, the date, the charter version.
- **Two variants:** midnight paper with ice foil (screen) and cream with ink and blue foil (print). Cardinal is silver
  classic, Prime crimson classic, Executive gold classic (Design Room III picks).
- **Verification code:** `LMT-<number>-<4 chars>` where the 4 chars come from HMAC-SHA256(certificate id, server key),
  base32 without look-alike letters. The QR encodes the public HALL verify URL for the code.
- **Verify page:** **public, on HALL** (decided 2026-11-14; never the name or the browser address). Shows genuine, lapsed,
  superseded or void, number, tier, admitted date. Distinct look per tier (Cardinal card, Prime framed record, Executive
  ceremonial page). The gate serves the status to HALL through one ungated, rate-limited nginx route
(`/_lb/verify/<code>`, JSON: status, number, tier, admitted date, never a name); HALL fetches it server side. It joins the
ungated list in `ACCESS-CONTROL.md`. The old members-only `/verify/` is dropped.
- Re-issue (admin) voids the old code and issues a new one; removal voids it.
- Stored: the certificate row (code, version, issued, voided). The PDF is generated on request and not stored.

## 8. Nominations (REMOVED 2026-11-14)
Members no longer nominate: any GLL ID can ask for Ordinal access (3.5) and then ask to buy a plan. Only Boss invites, and an
Executive invitation is written fully custom per person. No `nominations` table, no `NOMINATIONS` flag, no allowance, no member API.

## 9. Data model (gate SQLite, `node:sqlite`, new migration)
New tables (all timestamps ms since epoch, all with indexes on the lookup columns):
- `members(sub PK, number UNIQUE, tier, standing, standing_until, admitted_at, welcome_step,
  name_ct, name_iv, signed_at, charter_version, removed_at, purge_after, paid_until, executive_flag, trial_used_at,
  topup_gb_left, last_free_theme)` (`invited_by_number` dropped: only Boss invites)
- `plans(tier PK, limits_json, updated_at)` (live knobs, `ADMIN.md`), `settings(key PK, value)` (`plans_open`, Executive block range)
- `numbers_reserved(number PK)`, `numbers_retired(number PK, retired_at)`
- `invites(id PK, token_hash UNIQUE, login_name, email, note, invited_by_number, created_at, expires_at,
  redeemed_at, redeemed_sub, revoked_at)`
- `standing_events(id PK, sub, kind, article, note, until, created_at)`: kinds `warn`, `suspend`, `lift`, `remove`,
  `promote`, `demote`, `grant`, `void`, `trial`
- `purchases(id PK, sub, kind plan|upgrade|renewal|topup, tier, amount, paid_on, how_paid, receipt_note, snapshot_json,
  topup_gb, voided_at, void_reason, refund_amount, created_at)`: the receipt log, snapshot = price and limits at purchase
- `access_requests(id PK, sub, reason, created_at, decided_at, decision, retry_after)`: `reason` is cleared at decision
- `certificates(code PK, sub, number, tier, issued_at, superseded_at, voided_at)`
- `notices(id PK, body, starts_at, ends_at, created_at)` (broadcast bulletin)
- `reports(id PK, sub, category, hostname, timings_json, device_class, note, created_at)`
- `perf_daily(day, device_class, metric, p50, p90, n)` (anonymous aggregates, no sub)
**Encryption:** `name_ct` is AES-256-GCM (node:crypto) with a key from `MEMBER_DATA_KEY` in `deploy/gate.env`
(gitignored, 32 random bytes, base64). Backups (`homelab-ops` dumps and the gate's daily backup) therefore hold ciphertext
only. **The key must be backed up separately by Boss** (password manager); losing it loses every stored name (members
would re-sign). Decrypted only to render the certificate, to show the member their own name (`/_lb/me`), and to show Boss
in admin. Never logged.
**Retention:** name and signature kept while a member, and for 1 year after removal (`purge_after`), then deleted by the
gate's hourly sweep; the certificate then reads VOID with no name. Standing events: membership + 1 year. Purchases (payment records): 7 years. Access request reasons: deleted at the decision. Invites (contain a third person's email): deleted 30 days after redeemed, expired, declined or revoked. Reports:
90 days. `perf_daily`: 30 days. Audit: 90 days (unchanged).
**Privacy policy:** every row above needs a line in the Limitless privacy text (HALL legal v2, source in the vault
`Projects/Gamble Limited/Legal Drafts/addenda/limitless-browser.md`), including that the legal name of members aged 13 to
17 is collected and why. Boss pre-approved Claude's text for this release (2026-11-10); the change is live before or
with 1.0.

## 10. Migration (part of the Major gate)
1. Deploy with `MEMBERSHIP=off` first in the rehearsal: tables created, nothing enforced.
2. Migration script `scripts/membership-migrate.ts` (gate): reads owner API `list`, assigns 0000 to `OWNER_SUB`, then 0100
   upward by `approvedAt` (skipping primes and reserved numbers), all tier Ordinal except Boss (Executive), state `welcome`. Dry run prints the plan; `--apply`
   writes it. Idempotent.
3. Boss grants any paid plan in admin (after recording the cash, `purchases`) before or after switching on.
4. `MEMBERSHIP=on`: every member meets the ceremony on their next visit.
Rehearsed on the throwaway stack with seeded mock users (never real data). The release record carries the commands.

## 11. API (gate)
Member-facing (session required, under `/_lb/`, gated by nginx):
- `GET /_lb/me` -> `{number, tier, standing, standingUntil, name, admittedAt, charterVersion,
  lineBusy, notices[], plan: {paidUntil, limits, used, trialAvailable, topupGbLeft}, receipts[]}` (name only for the member themself)
- `POST /_lb/relay-token` (1.0, S4): short-lived signed token for the VPS relay; refused (no token) for Ordinal, a cap hit,
  suspension, removal or an unsigned charter, and the app then uses public relays or the notice page
- `GET /_lb/me/certificate.pdf?variant=screen|print`
- `POST /_lb/reports` (`ADMIN.md` 8); `POST /_lb/perf` (daily medians, opt-out honoured)
Ceremony (`/auth/welcome*`): `GET` page, `GET number?n=`, `POST number`, `POST sign`, `POST step`.
Admin routes: `ADMIN.md` 9.
All writes: same-origin check, JSON body, rate limited; admin writes need step-up (unchanged rule).

## 12. Tests (in addition to `TESTING.md`)
Gate (vitest): number claim race (two transactions), reserved and retired refusal, invite token single use and expiry,
wrong account after redeem, removal voids certificate and retires number, suspension lifts at end date, encryption
round trip and wrong-key failure, purge sweep, `MEMBERSHIP=off` behaviour.
Stack (rehearsal): full invite -> redeem -> sign-in -> ceremony -> certificate -> verify; existing member ceremony;
suspend and remove while a socket is open (closed within 2 s); invite refused for a non-kmlhs.org email.

Last verified: 2026-11-14
