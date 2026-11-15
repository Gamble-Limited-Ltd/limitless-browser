# Limitless 1.0: server path, relay and bandwidth

> **2026-11-13:** the paid-tiers draft moves the relay to a VPS (`PLAN.md` 0.2 D1). Under D1a: section 3.0 is settled
> (no `/wisp/` on Cloudflare), the home-upload numbers below stop being the ceiling, `TOTAL_UPLINK_MBPS` (3.5) comes from
> the VPS measurement, fair share and weights run in the gate instance on the VPS, and section 5 (exit IP) is moot.
> Sections 2.2, 3.1 to 3.4 and 8 apply either way (BBR and relay resources then apply on the VPS, not the home host).
>
> **2026-11-14 (newest, wins over everything below; `PLAN.md` 0.2b, `REVIEW-2026-11-14.md` 3):** the home relay is off from 0.3.0
> (public relays only) and never comes back. In 1.0 `/wisp/` goes straight to the VPS on its own DNS-only hostname, so it no longer
> passes nginx or the tunnel: **3.0 is closed** (no study needed), **3.1 nginx auth cache is dropped** (app files only would gain, and
> the 0.3.0 service worker already serves them), 3.2 and 3.3 run on the VPS, **3.4 is capped by the VPS (2 vCPU, 2 GB)**: give the
> relay about 1.5 CPU and 768 MB, never `cpus: 4`. 3.5 fair share runs in the VPS relay-mode gate with `TOTAL_UPLINK_MBPS` from the VPS
> measurement; weights Cardinal 1.5, Prime 2, Executive a reserved share, Ordinal not on our relay. Section 4 becomes "VPS, then
> public relays". Section 5 is moot (sites see the VPS IP). Section 6's 20 GiB daily cap is replaced by the per-plan caps
> (`PAID-TIERS-PLAN.md` 2); keep a high per-day abuse ceiling as an admin knob only.

Boss (2026-11-10): keep the enforcement in the gate; everything must stay free of new paid services (Boss pays for Proton
VPN for about 1.5 more years, which may be used); measure first; all recommended server tuning is in, each applied only
with Boss's go because it is a host or container config change.

## 1. The path today (read from the repo and the VM, 2026-11-10)
```
member browser
  -> Cloudflare edge (TLS, HTTP/2 to the member)
  -> cloudflared tunnel on the VM (systemd, token-managed: ingress rules live in the Cloudflare dashboard)
  -> nginx `web` on 127.0.0.1:8580 (auth_request /_gate/check on every gated request and on the WISP upgrade)
  -> gate `lbgate` (Node 24 + ws): checks the session, then pipes the WebSocket to the relay, parsing every WISP frame
     (usage bytes, stream caps, per-user token bucket 50 Mbit/s each way, 64 streams, 8 sockets, 20 GiB/day)
  -> relay `relay` (epoxy-server 2.0.0, Rust, 2 CPU, 512 MB, tcp_nodelay, DNS via 1.1.1.1 / 9.9.9.9, no UDP)
  -> the website
```
- Load now: gate 0.4 % CPU / 48 MB, relay 0 % / 20 MB, web 0.2 % / 8 MB (docker stats, 2026-11-10). The VM has 8 vCPU and
  19 GiB RAM. The software is not the bottleneck at today's load.
- **Every byte a member downloads crosses the home connection twice in effect:** website -> home (download side) and
  home -> Cloudflare -> member (upload side). The home **upload** rate is therefore the ceiling for all members together.
  It is not recorded anywhere in the vault (searched `Homelab/`), so it is measured in section 2.
- Sites members visit see the **home IP** (no egress VPN). Abuse reports would go to the home ISP.

## 2. Measure first (part of T0)
2.1 **Home upload and download.** From the VM, at a quiet hour, 3 runs against Cloudflare's speed endpoints
(download `https://speed.cloudflare.com/__down?bytes=100000000`, upload `POST https://speed.cloudflare.com/__up` with
25 MB bodies) using `curl -w` timings. Record median Mbit/s and latency in `HOSTING-AND-PERFORMANCE.md` and the vault
Service Inventory. No personal data is sent. Repeat monthly (one line in the Work Log).

2.2 **Per-hop timing** (built in S4, shown in admin Health, `ADMIN.md` 6):
- nginx adds `Server-Timing: gate;dur=<$upstream_response_time of the auth subrequest>, edge;desc=<cf-ray>` on app files
  and a `X-LB-T` timing header on the WISP upgrade response.
- The gate measures, per stream: CONNECT received -> first DATA from the relay (relay + DNS + TCP + TLS start to the site),
  and keeps only per-minute histograms in memory, exported as aggregate medians (no hostnames).
- The app records per navigation: request start -> first byte (via `__lbPerf`), rewrite time, `shown`, `load`, and
  posts **anonymous** medians per device class once a day if the member has not opted out (`MEMBERSHIP.md` 9 lists
  this in the privacy text). The split is: tunnel + edge (first byte of a gated static file minus gate time), gate,
  relay + DNS, website, rewrite + render.

## 3. S4: server tuning (wave 2, each item needs Boss's go when applied)

**3.0 Tunnel terms study (first S4 item, decided before 1.0 ships).** Cloudflare SSA 2.2.1(j) covers `/wisp/` on the
tunnel (`R1-WORKERS-RESULT.md` addendum; Boss accepted the risk for now on 2026-11-10). Think each alternative through
with cost, privacy (home IP exposure), the free-only rule, latency and effort: `/wisp/` off Cloudflare (port forward,
other free tunnels and their terms), a separate account and domain, written permission, Proton egress (section 5).
One page to Boss with a recommendation; any port, tunnel or DNS change needs Boss.
3.1 **nginx auth cache.** `proxy_cache` on `location = /_gate/check` keyed on the session cookie + host, 5 s validity,
only for 200 answers (never 401/403). Saves one gate round trip on every app file and every new WISP socket.
Revocation is unaffected in practice: revoke already deletes sessions and closes sockets at once (0.2.0), and the access
re-check interval is 60 s today, so 5 s of cached "allowed" adds nothing meaningful. Needs a `proxy_cache_path` in
`deploy/web/nginx.conf` (tmpfs, 10 MB). Test in the rehearsal: revoke still cuts the socket within 2 s.

3.2 **Relay DNS cache.** A small caching resolver container (`unbound`, pinned digest, read-only rootfs, cap_drop ALL)
on the relay's internal network; `dns_servers` in `deploy/relay/config.toml` points at it; it forwards to 1.1.1.1 and
9.9.9.9 over DNS-over-TLS. Positive cache up to 1 h (respecting TTLs), negative 60 s, prefetch on. Destination checks in
epoxy still run on the resolved address (DNS rebinding protection unchanged). Fallback: if the container is down, epoxy
cannot resolve, so it gets `restart: unless-stopped` and a Kuma monitor. Expected gain: 20 to 80 ms per new host.

3.3 **BBR congestion control** for the relay's outbound connections and the tunnel. The congestion control sysctl is
per network namespace on this kernel (6.12), so: load `tcp_bbr` on the host (`/etc/modules-load.d/bbr.conf`), set
`net.core.default_qdisc=fq` and `net.ipv4.tcp_congestion_control=bbr` on the host (helps cloudflared), and add
`sysctls: { net.ipv4.tcp_congestion_control: bbr }` to the relay service in `deploy/docker-compose.yml`. Expected gain:
better throughput to far or lossy sites and members on school Wi-Fi. Exact commands go to Boss in chat when S4 lands.

3.4 **Relay resources.** Raise the relay to `cpus: 4`, `mem_limit: 1g`; socket buffers via
`sysctls: net.ipv4.tcp_rmem/tcp_wmem` max 4 MiB in the relay namespace. The gate's `MAX_BUFFERED` (16 MiB) and
`BUF_HIGH` (1 MiB) stay; the load test (`TESTING.md` 5) checks they do not trip under 20 members.

3.5 **Fair share and priority** (gate, `FAIR_SHARE=on`).
- New config `TOTAL_UPLINK_MBPS` = measured home upload x 0.85 (from 2.1). When the sum of active members' demand is
  below it, nothing changes (each member keeps their own cap).
- When demand exceeds it: weighted max-min sharing across active members, recomputed every 250 ms on top of the existing
  per-user token buckets (`src/bandwidth.ts`). Weights: owner first (served before anyone, still under the total),
  Prime 2, Cardinal 1.5, Ordinal 1, warned 1, suspended 0 (no access anyway).
- Per-member caps by tier: **replaced 2026-11-10 (Boss)**. The home upload measured about 21 Mbit/s (`BASELINE.md`), so fixed
  50 / 75 / 100 Mbit/s perks cannot be met. Tiers get fair-share weights only (above) of the total (`TOTAL_UPLINK_MBPS` about 18);
  owner unlimited (as today). Per-user overrides in admin still win. Ways to raise the total get their own brainstorm later.
- Unit tests in `src/tests/bandwidth.test.ts`: two members share fairly, weights hold, owner first, caps unchanged when
  under the total.

3.6 **Data saver hint.** When fair share is active (line is full), the gate sets a flag the app reads from `/_lb/me`
and shows "The line is busy, Data saver helps" once per session. Never forces it.

3.7 **VPS relay (built 2026-11-15, branch `slice/1.0-relay`, not deployed; replaces the 2026-11-11 "relay box" ticket design).** `/wisp/` never touches Cloudflare or home: the app
reaches the VPS on its own DNS-only hostname (`deploy/relay-vps/`, placeholder `relay.taps-holdings.org`, TLS from Let's Encrypt on the VPS).
- **VPS stack** (compose project `limitless-relay-vps`): `tls` (nginx, no access log), `relaygate` (the lbgate image in `GATE_MODE=relay`: no members DB, no sign-in, no personal data),
  `relay` (epoxy, same image and config as `deploy/relay`), `dns` (unbound), `certbot` (HTTP-01). Egress rules: `deploy/relay-vps/egress-rules.sh`. Deploy: `deploy/relay-vps/deploy-vps.sh`.
- **Token** (`~/limitless-gate` `src/edge/token.ts`): Ed25519 JWT, 300 s, reusable until it expires, claims = opaque member id (HMAC of the GLL ID sub keyed with the private key, never the sub), plan, weight, limits version, plus
  effective limits (`bw`, `sk`, `cap`, `used`, `owner`). Sent as the WebSocket subprotocol `lbt.<token>`. Home issues it at `POST /_lb/relay-token` (session, Origin, rate limit, same allow rules as `/_gate/check`, 503 while the
  VPS is not polling, 403 for a killed member). ONE function, `relayClaimsFor(sub)`, decides plan and weight (defaults `ordinal`, weight 1; S5 wires membership).
- **Sync, no inbound port at home:** the VPS polls `POST /_lb/relay/sync` on the public home host every 1 s with the shared secret; body = byte counts, counters, live members; answer = kills, revocations, maintenance, limits.
  A kill or revoke closes the VPS socket (close code 4403) on the next poll: 0.95 s measured in the rehearsal (`tests/stack/relay.spec.js`), 0.46 s in the load-test stand-in. Home merges the byte counts into usage and admin Usage and Health
  (`relay: {vps: true}`). A home restart forgets the id map: live ids it cannot map are revoked and the app takes a new token.
- **Fails closed:** the VPS refuses sockets until its first good poll and again after `RELAY_STALE_S` (120 s) without one, so a revoke cannot be missed for long.
- **App** (`ownRelay` on, build `LB_FEATURE_OWNRELAY=true LB_FEATURE_OWNSOCKETS=4`; 0.3.0 defaults stay off): `LB_relayTok` caches the token and renews it when under 60 s are left (a 20 s timer renews under 100 s); libcurl's socket to our relay
  is opened on the VPS with the token (`LB_openRelaySocket`, one line in the libcurl glue). No token or a refused socket = VPS down: the socket falls back to the same-origin `/wisp/` (410 in production, so the usual failure path runs), `LB_relayStatus().ours` becomes `down`,
  the existing relay notice shows (consent for public relays), and the VPS is tried again after 20 s. Startup probe: token, then one handshake. Admin Health reads the VPS row.
- **Tests:** gate `src/tests/relay.test.ts`, `relay-token.test.ts`; app `tests/e2e/relaytoken.spec.js`; rehearsal `tests/stack/relay.spec.js` (VPS stand-in `vps` in `deploy/rehearsal`: token, several sockets, forged token, revoke time, byte counts at home, VPS stopped drill and recovery).
  Load test: `~/limitless-gate/scripts/relay-loadtest.ts` (20 members, JSON and Markdown report, own keys and fake home, never against the production instance); how to run it on the VPS: `S4-HOST-COMMANDS.md` 9.
- **Not decided (Boss):** final hostname, `TOTAL_UPLINK_MBPS` (placeholder 150, replace with the measured number), whether the VPS runs BBR, the monthly transfer budget stage numbers (`PAID-TIERS-PLAN.md` 1).

## 4. Relay choice in the app
- **Automatic by latency** (Boss's pick). At boot and after a relay failure the app measures each of our own relays
  (home `/wisp/`, and an off-site relay if one is ever added) with 3 WISP pings, picks the lowest median, and re-checks
  every 10 minutes. Members can pin one in Settings > Connection. With only the home relay this is a no-op.
- Heavy downloads and video prefer the relay with the most headroom (from `/_lb/me`) when there are two.
- Third-party relays stay off by default and are not part of "our relays" (unchanged behaviour, `limitless:relay-fallback:v1`).

## 5. Exit IP (open, Boss to decide)
| Option | What sites see | Speed | Notes |
|---|---|---|---|
| Home (today) | Home IP | Best | Abuse reports reach the home ISP. |
| Proton VPN egress | A Proton IP | Adds Proton hop latency; bounded by the Proton server's speed | A `gluetun`-style WireGuard container on `lb_egress`, relay routes through it, kill switch so a dropped tunnel never leaks the home IP. **Check Proton's terms first:** a personal plan may not allow serving other people. Ends when the subscription ends (~1.5 years). |
| Cloudflare egress | Cloudflare IPs | Depends on section 7 results | Only if the Workers prototype is kept. |
Recommendation: decide after 2.1 and the prototype. If chosen, Proton is the quickest to set up and is reversible.

## 6. Abuse and limits (unchanged unless noted)
- Port blocks and destination checks in the gate (`isBlockedPort`) and epoxy (`allow_non_global = false`, no UDP,
  no loopback) stay as they are. Host egress rules in `deploy/relay/egress-rules.sh` remain a separate Boss step.
- Daily cap 20 GiB per user stays (admin override per user).

## 7. R1: Cloudflare Workers relay prototype (DROPPED 2026-11-10, Cloudflare SSA 2.2.1(j); see R1-WORKERS-RESULT.md)
Goal: decide whether a free off-home relay is reasonable. Nothing here touches production.
- **Build:** a Worker implementing a minimal WISP v1 server over a WebSocket, opening TCP with `connect()` from
  `cloudflare:sockets`. Auth: the gate issues a short-lived signed token (HMAC-SHA256, 5 min, member sub + expiry); the
  Worker checks it before accepting the WebSocket. Deployed under a throwaway `*.workers.dev` name with Boss's account,
  only after Boss's OK (it is a new public endpoint).
- **Known limits to confirm against current Cloudflare docs at build time:**
  - Workers TCP sockets cannot connect to Cloudflare's own IP ranges, so sites behind Cloudflare (a large share of the
    web) would fail through it and need the home relay as fallback.
  - Free plan request and CPU-time limits: one WebSocket counts as one request, but CPU time per invocation is limited on
    the free plan; streaming bytes through JS costs CPU. Measure how long a socket survives under video load.
  - Cloudflare's terms on using Workers as a general proxy: read before deciding; if it looks like a breach, stop.
  - Sites would see Cloudflare egress IPs; some sites challenge or block them.
- **Measure:** the Chromebook-profile harness (fixture pages served from a public test host, plus the public speed
  sites) through the home relay vs. the Worker; median `shown`, failure rate, and which sites fail.
- **Report:** one page in `docs/1.0/R1-WORKERS-RESULT.md` with numbers and a recommendation. Then Boss decides.

## 8. Dependency review (S4)
- **libcurl.js 0.7.4 -> 0.7.5** (npm, published 2026-10-21). Read the changelog and diff of the JS glue; check for HTTP/2
  support (F-j in `SPEED.md`), WISP changes and anything that touches evasion. Take it in S2 (the WASM split) if clean;
  full e2e + rehearsal + speed harness before and after.
  **Decision 2026-11-14: taken for 0.3.0** (`slice/0.3-libcurl`). Checks: the vendored 0.7.4 WASM is byte-identical to the
  npm 0.7.4 build (sha256 `fe42bbcb...`); the inline glue equals npm 0.7.4 `libcurl.js` plus only our known edits (vendored
  `wasmBinaryFile` URL, streaming instantiate, data-URI helpers, `_libcurlReady`), all re-applied to 0.7.5. The 0.7.5 glue
  diff is only new Emscripten syscall stubs (`chmod`, `fchmod`, `fd_fdstat_get`), export wrappers and the version string;
  no change to the WISP client, `set_connections`, `HTTPSession`, `transport` or `load_wasm`; the URL list and the
  `fetch`/`XMLHttpRequest`/`WebSocket`/`navigator` use are identical (no new endpoint, no telemetry). Licence unchanged
  (LGPL v3, same text). HTTP/2: nghttp2 and ALPN `h2` were already in the 0.7.4 WASM; 0.7.5 only updates it, and the JS API
  still exposes no HTTP-version option, so nothing changes for our code. Reason: newer curl, nghttp2 and CA bundle, with
  the fix for compromised CA certificates. Full e2e, stack and `test:speed:quick` before and after (see the release record).
- **epoxy-tls**: pinned commit `0c11678` (epoxy-server 2.0.0); the `latest` tag now points at a newer commit
  (`9cde724`). Diff `server/` between them; take it if it is fixes or performance only; rebuild the relay image with a
  dated nightly as today; keep the config keys valid (`deny_unknown_fields`).
- **GUST upstream:** no new commits since `08515a7` (fetched 2026-11-10). Monthly check continues (slice F).
- Record each decision in `docs/PLAN.md` section 7 and the release record.

## 9. What changes where
| Item | Files | Applied by |
|---|---|---|
| Auth cache | `deploy/web/nginx.conf` | ships with the release (container config: Boss's go) |
| DNS cache | `deploy/docker-compose.yml`, new `deploy/dns/`, `deploy/relay/config.toml` | same |
| BBR | host sysctl + modules, compose `sysctls` | Boss runs the host part |
| Relay resources | `deploy/docker-compose.yml` | ships with the release |
| Fair share, tiers | `~/limitless-gate/src/bandwidth.ts`, `wisp.ts`, `config.ts` | ships with the release |
| Per-hop timing | nginx, gate, app | ships with the release |
| Rotation | none: Limitless is not rotated; `rotate.sh check` still runs after deploy | |
Update `HOSTING-AND-PERFORMANCE.md` and the vault Service Inventory (new DNS container, monitors) in the same commit.

Last verified: 2026-11-14
