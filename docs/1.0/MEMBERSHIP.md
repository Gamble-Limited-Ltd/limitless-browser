# Limitless 1.0: membership

Built in slice S5 (wave 3) in `~/limitless-gate` (proprietary) and the Browser repo, after design round 2 (`UI.md` 9).
Everything that decides access is enforced by the gate and nginx. The app only displays.

## 1. Concepts
- **Member:** a GLL ID account approved for Limitless (GATE per-app approval, client `limitless-browser`) that has a
  membership row in the gate. Boss (`OWNER_SUB`) is No. 000, tier Prime.
- **Number:** 000 to 999, unique, permanent. Retired numbers (removed members) are never reissued. A reserved set is
  assignable only by Boss.
- **Tier:** Ordinal (default), Cardinal, Prime. Promotion and demotion only by Boss.
- **Standing:** `good`, `warned`, `suspended` (with an end date or indefinite), `removed`.
- **Charter signature:** full legal name typed by the member, the charter version, the time. Required before browsing.
- **Certificate:** a PDF issued from the signature and membership data, with a verification code.

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
  Boss 2026-11-10). Email template in `UI.md` 6.6. No other automatic emails.

3.3 **Redeeming:**
1. Visitor opens the link. The gate shows the invitation card (ceremony step 1, design picked): inviter's number,
   "has put your name forward, and the Director has accepted", expiry date. If the token is unknown, used, revoked or
   expired: a calm "This invitation is no longer valid" page (no detail about why beyond expired vs. used).
2. "Accept invitation": the gate calls owner API `approve` with the invite's login name (actor `OWNER_SUB`), stores the
   returned `sub` on the invite, marks it redeemed, and redirects to sign-in.
3. Sign-in through GLL ID. After the callback, if the session `sub` equals the invite's `sub`, the member row is created
   (state `welcome`), then `/auth/welcome` runs the ceremony. If a different account signs in, it is treated like any
   other unapproved account (invite-only page); the invite stays bound to the named account.
- A leaked link is harmless beyond burning the invite: it can only approve the named account.
- Rate limits: the invite endpoints share the gate's existing auth rate limiter.

3.4 **No GATE change.** (An owner-API endpoint for email exceptions was considered; Boss chose kmlhs.org only.)

## 4. Numbers
- **Boss:** 000.
- **Existing members at migration:** numbered by GATE `approvedAt` (owner API `list`, oldest first) starting at 001.
  The reserved list does not apply to them (Boss, 2026-11-10): join order is their seniority.
- **New members:** choose at invite time, in ceremony step 2. A **typed** 3-digit field (design note from the picker:
  "type in a number, not select"), pre-filled with the next free number. Live check as they type
  (`GET /auth/welcome/number?n=048` -> `free | taken | reserved | invalid`), shown under the field. On Continue the gate
  re-checks and claims the number in one SQLite transaction (unique index), so two people cannot take the same number.
- **Reserved list:** **007, 100, 777** (Boss, 2026-11-10), editable in admin. Only Boss can assign a reserved number
  (admin: member profile > "Assign reserved number").
- **Retired:** a removed member's number moves to `numbers_retired` and is never offered again.
- Numbers are shown as three digits everywhere (`No. 047`), with `Nº` only on the certificate and the reveal.

## 5. Tiers (values confirmed by Boss, 2026-11-10)
| | Ordinal | Cardinal | Prime |
|---|---|---|---|
| Bandwidth | share of the total (no fixed Mbit/s perk; Boss 2026-11-10, home upload is about 21 Mbit/s) | same, larger share | same, largest share |
| Fair-share weight under load (`RELAY.md` 3.5) | 1 | 1.5 | 2 |
| Nominations per month | 1 | 2 | 3 |
| Themes | all except Vault and Prime | + Vault | + Vault + Prime theme |
| Mark (rings set, picked) | Orbit | Orbit + silver ring | Orbit in obsidian disc + fine ice ring |
| Seal | ice | silver | obsidian with ice edge |
| May show their certificate | no (personal) | no | yes |
| Immunity | none | none | partial, by severity (`RULES-DRAFT.md` 4) |
- Owner: unlimited, first under load, everything unlocked.
- **Vault lock** (Boss: "lock now, may need a redesign"): Ordinal members using Vault are moved to Luxury dark at their
  next load with a quiet note "Vault is reserved for Cardinal and Prime". Enforced in the theme UI from the tier in
  `/_lb/me` (cosmetic, client side is fine for themes).
- Promotion issues a new certificate (new code, the old one is marked superseded, not void).

## 6. Ceremony (`/auth/welcome`, six steps, about two minutes)
Picked in the artifact: invitation card, sign step, serif engrave reveal (seal version as a maybe), letter and charter
pages. Fixes from Boss's notes are included.
1. **Invitation** (new members only; existing members start at a short "Welcome to Limitless 1.0" card instead).
2. **Number** (new members only): typed field, next free pre-filled, live availability, "yours for good, never reissued".
3. **Charter:** the charter text (scrollable, version shown), "Full legal name, as it will appear on your certificate"
   (required, 2 to 80 characters, letters, spaces, hyphens, apostrophes, full stops), the name appears in Pinyon Script
   as it is written, tick "I have read the Charter and the full Rules, version <v>", Sign. Why the name is collected and
   who sees it (the member and the Director only) is stated right under the field.
4. **Reveal:** engraved serif numerals (`Nº 047`), stroke draw then fill, hairline rule, soft ice glow, about 1.5 s, and a
   soft chime (Web Audio, synthesised, no audio file; muted when the system is muted). Reduced motion: a 150 ms fade.
5. **Certificate:** the certificate shown on screen, "Download PDF" (screen and print versions), the verification code.
6. **Tour:** three steps (themes, start page shortcuts, membership page). Skippable. Replaces the old tutorial
   (`startTutorial`, `#tutorialOverlay`), which is removed.
- Progress can resume: the gate stores the step reached; reloading returns to it.
- On Sign the gate writes the signature and sets the state to good standing; the app opens at the start page.
- Existing members on their first 1.0 visit: steps 1 (short), 3, 4, 5, 6. Their number is already assigned.

## 7. Certificate PDF
- **Generated in the gate** (Boss's pick), never in the browser, with `pdf-lib` (MIT, new dependency) and the embedded
  fonts Pinyon Script and Cormorant Garamond (OFL, self-hosted, licenses in the repo) plus Space Grotesk for small caps.
  QR codes with a small MIT library or a minimal encoder written in the gate (decide in S5; no dependency for a few lines
  is the rule, but QR encoding is not a few lines).
- **US Letter**, portrait (Boss is in Chicago; A4 can be added later). Three pages:
  1. Certificate, layout A (centred classic): Orbit mark, "Limitless Browser · Gamble Limited Ltd.", "Certificate of
     Membership", "This is to certify that", the name in script, admission text with the date in words (no nominator line), `Nº 047 · ORDINAL`, Director signature line (left), tier seal (centre), **QR small in the bottom
     right corner** with the verification code under it (Boss's note: "make it small in the corner"). Guilloche border.
  2. Personal letter from the Director, dated, "Dear <first name>", signed "James Thiessen", with "Director of Gamble
     Limited Ltd." under the signature. The same signature block is used on page 1 and on the notices.
  3. The signed charter: all Articles, the member's name in script as signature, the date, the charter version.
- **Two variants:** midnight paper with ice foil (screen) and cream with ink and blue foil (print). Prime certificates
  use the Prime theme's palette (design round 2).
- **Verification code:** `LMT-<number>-<4 chars>` where the 4 chars come from HMAC-SHA256(certificate id, server key),
  base32 without look-alike letters. The QR encodes `https://limitless.taps-holdings.org/verify/<code>`.
- **Verify page** `/verify/<code>`: **members only** (gated by nginx like the app). Shows genuine / superseded / void,
  number, tier, admitted date. No name.
- Re-issue (admin) voids the old code and issues a new one; removal voids it.
- Stored: the certificate row (code, version, issued, voided). The PDF is generated on request and not stored.

## 8. Nominations (REMOVED 2026-11-14)
Members no longer nominate: any GLL ID can ask for Ordinal access (3.5) and then ask to buy a plan. Only Boss invites, and an
Executive invitation is written fully custom per person. No `nominations` table, no `NOMINATIONS` flag, no allowance, no member API.

## 9. Data model (gate SQLite, `node:sqlite`, new migration)
New tables (all timestamps ms since epoch, all with indexes on the lookup columns):
- `members(sub PK, number UNIQUE, tier, standing, standing_until, admitted_at, invited_by_number, welcome_step,
  name_ct, name_iv, signed_at, charter_version, removed_at, purge_after)`
- `numbers_reserved(number PK)`, `numbers_retired(number PK, retired_at)`
- `invites(id PK, token_hash UNIQUE, login_name, email, note, invited_by_number, created_at, expires_at,
  redeemed_at, redeemed_sub, revoked_at)`
- `standing_events(id PK, sub, kind, article, note, until, created_at)`: kinds `warn`, `suspend`, `lift`, `remove`,
  `promote`, `demote`, `immunity_used`
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
gate's hourly sweep; the certificate then reads VOID with no name. Standing events: membership + 1 year. Invites (contain a third person's email): deleted 30 days after redeemed, expired, declined or revoked. Reports:
90 days. `perf_daily`: 30 days. Audit: 90 days (unchanged).
**Privacy policy:** every row above needs a line in the Limitless privacy text (HALL legal v2, source in the vault
`Projects/Gamble Limited/Legal Drafts/addenda/limitless-browser.md`), including that the legal name of members aged 13 to
17 is collected and why. Boss pre-approved Claude's text for this release (2026-11-10); the change is live before or
with 1.0.

## 10. Migration (part of the Major gate)
1. Deploy with `MEMBERSHIP=off` first in the rehearsal: tables created, nothing enforced.
2. Migration script `scripts/membership-migrate.ts` (gate): reads owner API `list`, assigns 000 to `OWNER_SUB`, then 001
   upward by `approvedAt`, all tier Ordinal except Boss (Prime), state `welcome`. Dry run prints the plan; `--apply`
   writes it. Idempotent.
3. Boss promotes anyone to Cardinal or Prime in admin before or after switching on.
4. `MEMBERSHIP=on`: every member meets the ceremony on their next visit.
Rehearsed on the throwaway stack with seeded mock users (never real data). The release record carries the commands.

## 11. API (gate)
Member-facing (session required, under `/_lb/`, gated by nginx):
- `GET /_lb/me` -> `{number, tier, standing, standingUntil, name, admittedAt, charterVersion,
  lineBusy, notices[]}` (name only for the member themself)
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

Last verified: 2026-11-10
