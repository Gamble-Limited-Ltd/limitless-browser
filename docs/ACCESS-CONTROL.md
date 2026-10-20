# Limitless Browser access control (draft)

Status: planning only. Invite only decided by Boss 2026-10-17; details decided 2026-10-18. Nothing is built here.
GATE side checked 2026-10-18 (read-only): GATE v1 is live since 2026-10-17 and already provides what this
needs. Stage plan: `PLAN.md` stage 6.

## 1. Goal
Limitless Browser is **invite only**. Sign-in through GLL ID (GATE) is required. Only users Boss approves can
use the tool. Everyone else, signed in or not, sees an "invite only" page and is never sent the app or the relay.

## 2. Decisions
| Topic | Decision |
|---|---|
| Enforcement | Server-side at the nginx container on `127.0.0.1:8580` via `auth_request`. Client-side JS checks are only for UX, never protection. |
| Scope of the check | Every location (`index.html`, assets, Patcher, `/wisp/` WebSocket upgrade) except `/legal/` (static privacy and terms, no app code) and the auth callback paths. HTML routes get the invite or sign-in page; assets and `/wisp/` get 401/403. |
| Check service | Small **proprietary** service, Node 24 + Hono (GATE's stack), own private repo (proposal `limitless-gate`) and container. Talks to GATE only over HTTP, never embeds Limitless or GATE code, so it is not AGPL. |
| Sign-in | GATE OIDC redirect flow (auth code + PKCE) **and** GATE direct sign-in (`/oidc/direct/*`, see `~/gll-id/docs/DIRECT-SIGNIN.md`), the way HT does it, so users can sign in from a Limitless page. |
| Session | Own Limitless session cookie, `__Host-` prefixed, HttpOnly, Secure, SameSite=Lax, host `limitless.taps-holdings.org`. Lifetime 7 days, then a fresh GATE sign-in. |
| Allowlist | GATE per-app access for client `limitless-browser` (`OAuthClient.requiresApproval`, `AppAccess` rows). Keyed by GATE account id (an email change keeps the approval). Boss approves in GATE's `/admin` Apps page or `./manage.sh apps approve limitless-browser <loginName|email>`. |
| Email rule | Follow GATE as is: kmlhs.org accounts plus owner-approved exceptions. GATE also denies suspended and unverified accounts; all of those see the invite page. |
| Revocation | Access re-checked with `POST /oidc/access-check` at most every 60 s per session (GATE's threat model says cache at most 60 s). Open `/wisp/` connections are cut within about 60 s. |
| Unapproved users | Plain invite-only page: "Limitless Browser is invite only.", the signed-in email, sign-out and switch-account buttons, GLL stamp. No request form, no waitlist. |
| Approved users inviting others | No. |

## 3. Request flow
1. Request to `https://limitless.taps-holdings.org/`. nginx `auth_request` asks the check service.
2. No Limitless session: sign-in page offering GATE redirect sign-in or direct sign-in.
   - Redirect: check service starts OIDC at `id.taps-holdings.org/oidc/authorize` (state, nonce, PKCE S256).
     GATE needs a "Continue" click (no silent `prompt=none` sign-in in GATE v1). Callback exchanges the code
     at `/oidc/token`, verifies the ES256 id token against GATE's JWKS, stores `sub`, sets the Limitless cookie.
   - Direct: check service calls GATE's direct sign-in API server to server with its client credentials.
   - GATE returns `error=access_denied` for unapproved users at sign-in: the callback shows the invite page.
3. Valid session: the check service calls `/oidc/access-check` (`client_secret_basic`, body `{sub}`) when its
   60 s cache entry is stale. `allowed: false` shows the invite page (`no-store`) and ends the session.
4. Approved: the app is served. `/wisp/` handshakes are checked the same way. The check service tracks open
   relay sessions per user so a revoked user's connections are closed at the next 60 s check, and relay
   connections have a maximum lifetime after which the client reconnects through the check.
5. GATE access tokens last 5 min and GATE v1 issues no refresh tokens, so the check service never relies on
   GATE tokens after sign-in; it relies on its own session plus `access-check`.

## 4. GATE side (what exists, what Boss runs)
Already in GATE v1: `requiresApproval` per client, `AppAccess` table, owner admin UI and CLIs, `access-check`,
direct sign-in contract. To do, by Boss (exact commands pasted into chat at stage 6):
- Register the client: `./manage.sh clients add limitless-browser --name "Limitless Browser" --redirect https://limitless.taps-holdings.org/auth/callback --post-logout https://limitless.taps-holdings.org/`
  then switch on approval and direct sign-in for it (exact flags to be confirmed against `~/gll-id` at the time).
- Approve the first users.
- If anything in `~/gll-id` itself must change (docs naming the new host, enabling direct sign-in for this
  client), that is a separate edit needing Boss's OK each time.

## 5. Abuse limits (decided: conservative)
- Per-user caps, proposal: 64 concurrent relay streams, about 50 Mbit/s, 20 GB/day soft cap; SMTP, IRC and
  common torrent ports blocked; per-IP handshake rate limit on the check service and `/wisp/`.
- Boss's account: near-unlimited caps.
- Owner kill switch per user in the check service (instant, separate from GATE revocation).
- How caps are enforced depends on epoxy-server's options (check at build); fallback is a small wrapper or
  nginx limits keyed by the user id header the check service returns.

## 6. Changes to this repo (when work starts)
- `deploy/nginx.conf` with `auth_request` on every location except `/legal/` and the auth paths, the invite
  page and sign-in page in the Limitless look with the GLL stamp.
- Landing and invite copy stays neutral ("private browsing proxy") and does not name or imply affiliation with
  GUST or Nautilus Labs beyond the factual credit in About and `NOTICE`.
- AGPL s13: approved users get the source link in the app. The invite page and `/legal/` serve no AGPL code.

## 7. Privacy note
Signing in ties usage to an identity. Relay logging stays abuse-only (see `HOSTING-AND-PERFORMANCE.md`): no
destination or content logs keyed to accounts. Usage counters for caps are per user (bytes and stream counts
only) with short retention. The check service logs auth outcomes (allowed/denied counts). The in-app privacy
page states all of this.

## 8. Open items
- Exact cap numbers and enforcement point (section 5). Abuse contact address.
- Whether the check service (`limitless-gate`, confirmed 2026-10-19) later also hosts sync and admin APIs (`PLAN.md` section 4).
- Exact GATE flags for approval and direct sign-in on this client.

## 9. Build contract (2026-10-19, stage 5/6)
Fixed so the nginx config (`deploy/`, this repo) and the check service (`~/limitless-gate`, private) can be
built in parallel.
- Compose project `limitless-browser`, internal network `lb_internal`. Services: `web` (nginx, the only one
  published, `127.0.0.1:8580`), `lbgate` (check service, `lbgate:8080`; not `gate`, which on `gll_gate` means GLL ID), `relay` (epoxy-server, `relay:4000`, internal
  only, own egress-filtered network). Never reachable from other projects' networks.
- `GET /_gate/check` (nginx `auth_request`, internal): `200` with headers `X-LB-User` (GATE sub) and `X-LB-Email`
  when approved, `401` when there is no valid session, `403` when signed in but not approved. nginx maps 401 to
  the sign-in page and 403 to the invite page for HTML requests, and returns the bare status for assets.
- Public routes proxied to `gate` without the check: `/auth/login` (start OIDC), `/auth/callback`,
  `/auth/direct` (POST, direct sign-in), `/auth/logout` (POST), `/auth/signin` (sign-in page), `/auth/invite`,
  `/auth/ended`, `/auth/unavailable`. Pages are server-rendered HTML in the theme look and use `/theme/` assets.
- Ungated static paths: `/legal/` (privacy, terms), `/theme/` (theme CSS, fonts, marks, stamp: no app code),
  `/favicon.svg`.
- `/wisp/` is proxied to `gate`, which checks the session, then pipes the WebSocket to `relay`. The gate counts
  open sockets and bytes per user, parses WISP CONNECT frames to cap streams (64) and refuse blocked ports, cuts
  sockets within 60 s of revocation and after a maximum lifetime (1 h; the client reconnects).
- `version.json` is gated like the app and served `no-cache`.

## 10. As built (2026-10-19, `~/limitless-gate` 7c787d1)
- All GATE endpoints are under `/oidc/` (`/oidc/authorize`, `/oidc/token`, `/oidc/jwks`, `/oidc/access-check`,
  `/oidc/direct/login`, `/oidc/logout`). Client auth is `client_secret_basic` only. Id tokens ES256, 5 min.
- GATE redirects after logout only with an `id_token_hint`, which the gate does not keep, so "Switch account" ends
  the Limitless session and restarts sign-in with `prompt=login`; GATE's own session is left alone.
- A revoked session is kept, marked denied, until its 7-day end (the invite page needs the email); it grants
  nothing. If Boss approves the person later, the next check lets them in without a new sign-in.
- GATE unreachable: new sign-ins fail closed (unavailable page); existing sessions get at most 5 minutes of grace
  since the last good check, then `/_gate/check` returns 401 with `X-LB-Reason: unavailable`.
- WISP refusals: blocked ports CLOSE 0x48, cap refusals 0x49, malformed CONNECT 0x41. Per-user bandwidth is
  enforced by the gate (0.1.1): 50 Mbit/s per user and direction across all sockets, owner exempt, kill switch
  `BANDWIDTH_MBPS=0` (`HOSTING-AND-PERFORMANCE.md` section 5).
- Boss's GATE commands (stage 6/7): `./manage.sh clients add limitless-browser --name "Limitless Browser"
  --redirect https://limitless.taps-holdings.org/auth/callback --post-logout https://limitless.taps-holdings.org/
  --requires-approval`, then `./manage.sh clients direct limitless-browser on`, then
  `./manage.sh apps approve limitless-browser <loginName|email>`.
- GATE back channel (2026-10-19): while `id.taps-holdings.org` is behind Cloudflare Access, server-to-server calls
  from the public host are blocked, so the gate joins GATE's private network `gll_gate` and uses
  `GATE_BACKCHANNEL_URL=http://gate:3301` (as the games do). `deploy.sh` adds `deploy/docker-compose.gllgate.yml`
  when `deploy/gate.env` sets that variable. Browsers still sign in at the public issuer (Boss passes Access).

## 11. Admin panel (0.2.0, built 2026-10-21)
- **Who:** only the owner (`OWNER_SUB` in `deploy/gate.env`). Everyone else gets 404 on `/_lb/admin/api/*`, also when `ADMIN_PANEL=off`.
  nginx still applies `auth_request` first, so without a session the answer is 401.
- **Step-up:** reading is allowed with the owner session. Any change needs the owner to type login name and password again (POST `step-up`,
  which uses GLL ID direct sign-in and checks that the account is the owner); it unlocks changes for 10 minutes. Changes also need our Origin and
  a JSON body.
- **Owner API:** approvals are listed, approved and revoked through GLL ID's owner API (`~/gll-id/docs/OWNER-API.md`, per-client flag, `actor` =
  `OWNER_SUB`). If it is off or unreachable, the panel lists users from the check service's own sessions and usage, read only, and says so.
  Revoke also adds a kill row, deletes the person's sessions and closes their sockets at once, so it does not wait for the 60 s access-check cache;
  approve lifts an earlier kill. Granting access stays a manual decision: nothing is approved automatically and nobody is notified.
- **Per-user limits:** bandwidth (Mbit/s), bytes per day and open sockets can be overridden for one user (empty = default, 0 = no limit for the first
  two). They apply to new sockets and new streams, and to bandwidth at once.
- **Maintenance:** non-owners get 401 with `X-LB-Reason: maintenance` from `/_gate/check`, nginx shows `/auth/maintenance`, their sockets close, new
  sockets and new sign-ins are refused. The owner is unaffected. **Paused sign-ins:** the callback and direct sign-in refuse non-owners; existing
  sessions keep working.
- **Privacy:** the audit table (`admin_audit`, 90 days) holds time, action and account ids only, never emails, names or destinations. Usage per day
  is now kept 30 days (was 14) so the panel can show a month; the privacy page still needs a retention figure, which Boss decides.
- **Kill switches:** `ADMIN_PANEL=off`; `./manage.sh clients owner-api limitless-browser off` (GLL ID).
