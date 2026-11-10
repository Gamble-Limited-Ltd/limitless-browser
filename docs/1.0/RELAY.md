# Limitless 1.0: server path, relay and bandwidth

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
- Per-member caps by tier (confirmed by Boss 2026-11-10, `MEMBERSHIP.md` 5): Ordinal 50 Mbit/s, Cardinal 75, Prime 100; owner
  unlimited (as today). Per-user overrides in admin still win.
- Unit tests in `src/tests/bandwidth.test.ts`: two members share fairly, weights hold, owner first, caps unchanged when
  under the total.

3.6 **Data saver hint.** When fair share is active (line is full), the gate sets a flag the app reads from `/_lb/me`
and shows "The line is busy, Data saver helps" once per session. Never forces it.

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

Last verified: 2026-11-10
