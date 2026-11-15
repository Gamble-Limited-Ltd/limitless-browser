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

## 3. Rollback stub (REVIEW 2 item 7)
- `c88ce5e` (0.2.3) has no `sw.js`. Its nginx (`git show c88ce5e:deploy/web/nginx.conf`) has no `/sw.js` location, so the catch-all `location /` serves it: gated, `Cache-Control: no-cache`, `Content-Type: application/javascript`, brotli through the br tree. Checked 2026-11-15 with that nginx.conf and a build of `c88ce5e` in a throwaway nginx container (stub gate, no compose project touched): plain and `Accept-Encoding: br` both answered 200 with the stub bytes. A signed-out browser gets the sign-in answer instead of the stub, so a member's worker is replaced the next time they open Limitless signed in (the update check sends the session cookie).
- `deploy.sh` (working tree) runs `scripts/inject-sw-stub.sh` after the archived build when `dist/sw.js` is missing. The archived `build-static.sh` of the old commit does the build; the stub is added to `dist/` (raw and gzip) and `dist-br/` (brotli bytes). Test: `tests/e2e/boot.spec.js` "rollback stub" installs the real worker, swaps `/sw.js` for the stub on a small test server, and the registration and `lb-shell-*` caches are gone after `update()`.
- Not rehearsed on the full compose stack: the rehearsal stack cannot be built from `c88ce5e` (its gate and relay differ), so the nginx half was rehearsed in isolation and the worker half in the browser test above.

## 4. Host steps Boss runs (not run by Claude)
Deploy (from the main checkout after the release branch is merged; follow the release record):
```
cd ~/Browser && ./deploy.sh <sha>
```
The compose file now keeps `relay` and `dns` out of `up`. The old containers keep running after the deploy until stopped once:
```
cd ~/Browser && docker compose -p limitless-browser -f deploy/docker-compose.yml --profile relay stop relay dns
~/gll-planning/rotation/rotate.sh check
```
Expect `preflight OK`. Then by hand: pause the Kuma relay monitor, update the vault Service Inventory (relay stopped), and check that a signed-in browser reaches a site through a public relay.

Rollback (0.2.3, brings the home relay back because the archived compose has no profile; the stub removes installed workers):
```
cd ~/Browser && ./deploy.sh c88ce5e
```
To start the home relay again without a rollback (for example to test): `docker compose -p limitless-browser -f deploy/docker-compose.yml --profile relay up -d relay dns`; nginx still answers 410 on `/wisp/`, so the web container needs a build with `WISP_RELAY=1` (rehearsal only).

## 5. Open points for the release record
- Both public relay tests (`pageCache`, `warm`) stay in code, off. Measure with the speed harness before the gate: `LB_FEATURE_*` flips need no code change.
- The rehearsal stack builds with `ownRelay` true (1.0 path); `LB_REHEARSAL_RELAYOFF=1 deploy/rehearsal/run.sh` builds the real 0.3.0 defaults.
