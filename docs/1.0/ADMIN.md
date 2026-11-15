# Limitless 1.0: admin panel

Slice S7 (wave 4). Extends `limitless://admin` (0.2.0, `ACCESS-CONTROL.md` 11). Unchanged rules: owner only
(`OWNER_SUB`), every write needs step-up (login name + password, 10 minutes), same-origin JSON, all data rendered with
`textContent`, `ADMIN_PANEL=off` kills every route. **Totals only: the panel never shows which sites anyone visits.**
All picks in the artifact were favourites: members and profile, invites, live and 30 days, health hops.

> **2026-11-13 (with `PLAN.md` D2b):** add a **Plans** section (round two `admin-limits`): per plan, live within a minute,
> max speed, weekly / monthly data caps, tab cap, daily time (Ordinal), stored in a gate `plans` table; and per member
> paid-until, amount (0 allowed after a confirm), receipt note. Trials, top-ups, voids with refunds, Executive flag and the
> transfer brake (`admin-transfer`) are in 1.0 (D2b answered, slice S9).

> **Status 2026-11-15: built on `slice/1.0-admin` (both repos), not merged, not deployed.** Built: Members (search, filter chips, profile with
> standing history, sessions, 30-day usage, plan and purchases, re-issue certificate, assign number, warn, suspend, lift, remove, sign out everywhere,
> set plan, per-user limits), Invites (create with link, Copy, own message text, open and history with the resulting number, Revoke), live tiles and
> 30-day SVG charts (active members, data per day, top ten by number), per-hop timing, plan knobs and the "Plans open for sale" switch (ships OFF,
> needs a second click), Notices, Reports (intake `POST /_lb/report`, 90 days, `REPORTS=off`), Audit viewer (action and date filters), VPS link age
> in Health. **Not built (decisions needed):** Send email from the panel (the invite link is copy only, per MEMBERSHIP.md 3.1), median page shown and
> cap-hit charts (the client sends no timing totals yet), a current total Mbit/s tile, session device class (sessions store none), the Queue for plan and
> Executive number requests and the S9 routes (S9), list-left and detail-right layout (the panel is one column of cards; the member detail opens
> under the list). Route names follow the S5 API under `membership/` (`members/:sub`, `standing`, `signout`, `certificate/reissue`, `assign-number`).

## 1. Layout
Sections become: Members, Queue (access requests, plan requests, invites, Executive number requests), Plans, Usage,
Health, Notices, Reports, Audit, Switches (adds "Plans open for sale", default OFF). Filter chips in Members add Executive.
"Invited by" and "people they invited" (section 3) are dropped: only Boss invites (nominations removed 2026-11-14).
**0.3.0 note:** our relay is off, so Usage and Health relay rows read "Public relays (our relay returns with 1.0)" instead of
"down"; done in the admin script from a `features.ownRelay=false` flag in `version.json`, no gate change. Desktop: list on the left, detail on
the right (as in the artifact). Below 1100 px the detail opens over the list. Fits 1366x768.

## 2. Members
- Table: number (serif numerals), name (decrypted, owner only), tier, standing pill, last seen. Sorted by number.
- Search (number, name, login name) and filter chips: All, Prime, Cardinal, Ordinal, Warned or suspended, Removed,
  Ceremony not done.
- Data: gate `members` + owner API `list` (approved accounts without a member row show as "Ceremony not done").
  If the owner API is off or unreachable, the list is read-only from local data and says so (as today).

## 3. Member profile
- Header: number, name, tier mark, standing.
- Identity and lineage: login name, admitted date, invited by (number, links to that profile), people they invited
  (numbers), charter version signed and when.
- Standing history: dated events from `standing_events` with Article and note.
- Usage: bytes and sessions over 30 days (existing `usage` table), current sockets and streams.
- Sessions: active sessions (device class, started, last active). **Sign out everywhere** deletes them and closes sockets
  (the revoke path without revoking access).
- Actions (step-up): Promote / Demote, Warn (Article + note), Suspend (7, 14, 30 days, indefinite + Article + note),
  Lift suspension, Remove (second click to confirm, Article + note), Assign reserved number, Re-issue certificate,
  per-user limits (existing overrides).
- Every action writes `admin_audit` (time, action, account id; never names or destinations) and a `standing_events` row
  where it applies.

## 4. Queue (invites)
- "Create invite": login name, email (optional, kmlhs.org only), note. Shows the link, Copy, a free-text message box (Boss types the text per invite, no template),
  and Send email from gamblelimitedsupport@taps-holdings.org (optional, the click is Boss's approval for that email).
  Non-kmlhs.org emails are refused (`MEMBERSHIP.md` 3.1).
- Open invites: created, expires, opened or not, Copy link, Revoke.
- History: redeemed invites with the resulting number.

## 5. Usage (live and 30 days)
- Live tiles refreshed every 10 s: online now (members with an open socket), sockets, streams, current total bandwidth
  vs. `TOTAL_UPLINK_MBPS`, fair share active yes/no.
- 30-day charts: daily active members, bandwidth per day, median page shown (all and Chromebook), cap hits.
- Top users by bandwidth (numbers only, totals).
- Existing 80 % warnings and per-user limits stay.
- Charts drawn as inline SVG from the existing `usage` table and `perf_daily`; no chart library.

## 6. Health
- Relay (the VPS, from its relay-mode gate), GLL ID, gate, DNS cache on the VPS, version and sha (existing), month transfer vs 5 TB and the brake stage.
- **Where the time goes:** median page shown split by hop (VPS relay and DNS, website, rewrite and render; app files: tunnel
  and edge, gate) for the last 24 h and 30 days, from `RELAY.md` 2.2. VPS throughput from the last measurement.

## 7. Notices
Create, schedule (start, end), edit and delete broadcast notices (engraved bulletin on members' start pages). Plain text,
up to 200 characters.

## 8. Reports (Report a problem)
- Members send from the menu: category (Slow, Broken site, Looks wrong, Account, Other), note (500 characters), timings
  and device class (automatic), hostname only if they tick "Include the site's address" (domain only, never the full URL).
- Admin list: newest first, filter by category, mark done. Kept 90 days. `REPORTS=off` hides the button.

## 9. API additions (gate, under `/_lb/admin/api/`, owner only)
`GET members?filter=&q=`, `GET members/:sub`, `POST members/:sub/{tier,warn,suspend,lift,remove,number,reissue,signout}`,
`GET invites`, `POST invites`, `POST invites/:id/{revoke,email}`,
`GET usage/live`, `GET usage/30d`, `GET perf`, `GET hops`, `GET/POST/DELETE notices`, `GET reports`, `POST reports/:id/done`,
`GET audit` (exists; the 1.0 panel adds the viewer with filters by action and date), `GET/POST reserved`,
S9: `GET/POST plans`, `GET/POST settings` (`plans_open`, Executive block), `GET requests`, `POST requests/:id/{approve,decline}`,
`POST members/:sub/{grant,purchase,topup,void,trial,executive}`, `GET transfer`.

## 10. Tests
`tests/e2e/admin.spec.js` extended (mocked routes, all themes, 1366x768 and 2560x1440 screenshots);
`tests/stack/admin.spec.js` extended (warn, suspend with an open socket, remove, invite create and revoke, sign out everywhere, step-up required on each write, non-owner gets 404 on every new route).

## Numbers and knobs (2026-11-14)
Admin edits: the reserved set, the Executive block (default 0010 to 0099), and requests from Executives for reserved numbers (queue). Placeholder
plan knobs are listed in `PAID-TIERS-PLAN.md` section 11. Report a problem has a "bot check" category.

Last verified: 2026-11-14
