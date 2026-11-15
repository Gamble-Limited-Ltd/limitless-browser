# Limitless 0.3.0: release notes for the release record

Built on branch slice/0.3-relayoff. Plain facts for the release record; Boss runs every deploy step.

## 1. What this slice changed
- Our home relay is off. Compose: `relay` and `dns` are under `profiles: ["relay"]`, the gate's dependency on `relay` is `required: false`, `RELAY_URL` and the `lb_relay` network stay. Nothing is deleted, so the file works with the live 0.2.3 deploy and with 0.3.0 (rotation recreates `lbgate` from the working tree at 06:00).
- nginx answers `410` on `/wisp/` in prod. Mechanism: `deploy/web/wisp.sh` (a docker-entrypoint script, like `legal-v2.sh`) writes `/tmp/wisp.conf` at container start: `return 410;` by default, or an include of `snippets/wisp-proxy.conf` when the container has `WISP_RELAY=1`. Only the rehearsal compose file sets `WISP_RELAY=1`, so the stack tests keep a working relay. The prod compose file must never set it. Chosen over a second nginx.conf because there is one config to review and the prod default is the safe one.
- Client: one switch `features.ownRelay` (build: `LB_FEATURE_OWNRELAY`, default false in 0.3.0). Off: public relays only, our `/wisp/` is not a candidate, no startup probe, no relay notice, a saved `limitless:relay-fallback:v1` = `0` is ignored (key kept for 1.0), Settings > Connection shows "Public relays (until 1.0)" disabled. `LB_FEATURE_OWNSOCKETS` defaults to 0 (router and sharding inert). 1.0 flips both back (`LB_FEATURE_OWNRELAY=true LB_FEATURE_OWNSOCKETS=4`) and removes the profile and the 410.
- `pageCache` and `warm` build defaults are false (moved to 1.1).
- With our relay off the boot no longer holds the page for the 25 s relay benchmark; it runs behind the first page.
- Boot access check (SPEED 3.5), fail closed: no libcurl session until `version.json` answers 200 (401 goes to `/auth/signin`, 403 to `/auth/invite`, network error or 5xx shows "Cannot reach Limitless", no browsing). A 404 (plain static dev server, tests) is treated as "no gate here"; prod always has `version.json`.

## 2. Public relay probe (REVIEW 2 item 5)
Script: `node scripts/probe-relays.mjs` (WISP handshake: socket opens and the first frame is CONTINUE; 3 tries each; sends the production Origin header because some relays refuse others). Run 2026-11-15 (UTC) from the Gamble VM.

Alive (kept in the pool, median ms to the CONTINUE frame): motor-cycle-part.org 187, definitelyscience.com 256, lichology.com 264, mages.io 304 (also the fallback), wisp.mercurywork.shop 319, wisp.terbiumon.top 331, anura.pro 347.

Dropped as dead or refusing our origin: area.forwardersoft.com, truf.the-nest.at, thoughts.forwardersoft.com, english.algebra.teacher.vocabulary.homework.forwardersoft.com (DNS does not resolve), nebulaproxy.io (timeout), invisiproxy.com (answers without Origin, refuses the production Origin).

Only the handshake is probed, not a fetch through the relay. Re-run before the speed gate and update this list if the picture changed.

## 3. Host steps Boss runs (not run by Claude)
Section filled in with the exact commands at the end of the slice; see below.
