# Limitless 1.0: admin panel

Slice S7 (wave 4). Extends `limitless://admin` (0.2.0, `ACCESS-CONTROL.md` 11). Unchanged rules: owner only
(`OWNER_SUB`), every write needs step-up (login name + password, 10 minutes), same-origin JSON, all data rendered with
`textContent`, `ADMIN_PANEL=off` kills every route. **Totals only: the panel never shows which sites anyone visits.**
All picks in the artifact were favourites: members and profile, invites and nominations, live and 30 days, health hops.

## 0. Existing panel fixes (2026-11-11, branch `slice/1.0-adminfix`)
- **Cause of "my password does not work":** with legal v2 on, GATE's direct login refuses an account that has not accepted
  `LEGAL_VERSION` with `403 LEGAL_ACCEPTANCE_REQUIRED` (`gll-id/apps/server/src/routes/direct.ts:289`). Step-up never sent
  `acceptedLegal` and showed every refusal as one message, so a right password looked wrong and no write could be saved.
- **Now:** `POST step-up {login, password, acceptedLegal?}` answers a safe code: `legal_required`, `wrong_password`,
  `not_owner`, `access_denied`, `suspended`, `rate_limited` (429), `gate_unavailable` (503), else `stepup_failed`. The dialog
  shows each reason; on `legal_required` it adds the sign-in page's acceptance checkbox (same wording and HALL links), keeps
  the password, and resends with `acceptedLegal: true`. Cancelling the dialog tells the owner nothing was changed.
- **Known, not fixed:** the per-user "Connections" box accepts 0 but the API needs 1 to 256 (shows "That value is not
  valid"); the subtitle "Changes are unlocked" is not cleared when the 10 minutes run out (the next write re-asks).

## 1. Layout
Sections become: Members, Queue, Usage, Health, Notices, Reports, Audit, Switches. Desktop: list on the left, detail on
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

## 4. Queue (invites and nominations)
- "Create invite": login name, email (optional, kmlhs.org only), note. Shows the link, Copy, the formal text to paste,
  and Send email from gamblelimitedsupport@taps-holdings.org (optional, the click is Boss's approval for that email).
  Non-kmlhs.org emails are refused (`MEMBERSHIP.md` 3.1).
- Open invites: created, expires, opened or not, Copy link, Revoke.
- Nominations: from (number), for (login name / email), note, Approve (creates the invite) or Decline (quiet).
- History: redeemed invites with the resulting number.

## 5. Usage (live and 30 days)
- Live tiles refreshed every 10 s: online now (members with an open socket), sockets, streams, current total bandwidth
  vs. `TOTAL_UPLINK_MBPS`, fair share active yes/no.
- 30-day charts: daily active members, bandwidth per day, median page shown (all and Chromebook), cap hits.
- Top users by bandwidth (numbers only, totals).
- Existing 80 % warnings and per-user limits stay.
- Charts drawn as inline SVG from the existing `usage` table and `perf_daily`; no chart library.

## 6. Health
- Relay (home, and any second relay), GLL ID, gate, DNS cache container, version and sha (existing).
- **Where the time goes:** median page shown split by hop (tunnel and edge, gate, relay and DNS, website, rewrite and
  render) for the last 24 h and 30 days, from `RELAY.md` 2.2. Home upload/download from the last speed measurement.

## 7. Notices
Create, schedule (start, end), edit and delete broadcast notices (engraved bulletin on members' start pages). Plain text,
up to 200 characters.

## 8. Reports (Report a problem)
- Members send from the menu: category (Slow, Broken site, Looks wrong, Account, Other), note (500 characters), timings
  and device class (automatic), hostname only if they tick "Include the site's address" (domain only, never the full URL).
- Admin list: newest first, filter by category, mark done. Kept 90 days. `REPORTS=off` hides the button.

## 9. API additions (gate, under `/_lb/admin/api/`, owner only)
`GET members?filter=&q=`, `GET members/:sub`, `POST members/:sub/{tier,warn,suspend,lift,remove,number,reissue,signout}`,
`GET invites`, `POST invites`, `POST invites/:id/{revoke,email}`, `GET nominations`, `POST nominations/:id/{approve,decline}`,
`GET usage/live`, `GET usage/30d`, `GET perf`, `GET hops`, `GET/POST/DELETE notices`, `GET reports`, `POST reports/:id/done`,
`GET audit` (exists; the 1.0 panel adds the viewer with filters by action and date), `GET/POST reserved`.

## 10. Tests
`tests/e2e/admin.spec.js` extended (mocked routes, all themes, 1366x768 and 2560x1440 screenshots);
`tests/stack/admin.spec.js` extended (warn, suspend with an open socket, remove, invite create and revoke, nomination
approve, sign out everywhere, step-up required on each write, non-owner gets 404 on every new route).

Last verified: 2026-11-11
