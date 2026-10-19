# Self-hosting on the GLL VM and keeping it fast (draft)

Decisions (Boss, 2026-10-15): Docker nginx container, prod on `127.0.0.1:8580`, public subdomain of
`taps-holdings.org`, speed work covers compression/caching, splitting `index.html`, self-hosting CDN assets,
and our own WISP relay. Updated 2026-10-18: host is **`limitless.taps-holdings.org`**, baked pinned image,
epoxy-server relay, staged hybrid frontend. Stage plan: `PLAN.md` stages 5 and 7, slice A.

## 1. Hosting plan
- Compose project `limitless-browser`: an nginx container on `127.0.0.1:8580`, the check service and the relay
  on an internal network only. `deploy/docker-compose.yml`, `deploy/nginx.conf`, `deploy.sh`, same pattern
  as `~/gll-site`. Touch only this project's containers; never other projects' containers or DBs.
- **Baked, pinned image (decided):** `deploy.sh` builds an image per git sha with files precompressed at build
  (brotli + gzip). Rollback is redeploying the previous sha (`./deploy.sh <sha>`).
- Public access: Cloudflare Tunnel route `limitless.taps-holdings.org` to `127.0.0.1:8580`. Boss runs the DNS
  and tunnel steps (exact commands pasted into chat at stage 7).
- Restart policy `unless-stopped`.
- Smoke check after deploy: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8580/legal/` is 200 and
  `/` without a session is a redirect or the sign-in page (never the app).
- AGPL s13: the served app links to the GLL source repo. Check before the first public deploy.
- Headers: COOP/COEP only if libcurl.js/WASM needs them (test); CSP only after testing, since the proxy
  injects scripts.
- **Updates:** each build writes `version.json` (version, sha, date, optional `security: true`). The app polls
  it and shows "Update available, reload" with a What's new link from `CHANGELOG.md`. It never reloads itself.
- Release procedure (lanes, watch periods) applies from `0.1.1`; `0.1.0` is the launch.

- **Invite only (2026-10-17):** this host is never public ungated. nginx applies `auth_request` to every
  location except `/legal/` and the auth paths; see `ACCESS-CONTROL.md`. The tunnel route must not be switched
  on before that works. Cache rules below apply only after the auth check; the invite page is `no-store`.

## 2. Speed work (in rough order of payoff per effort)
1. **Compression and caching (launch).** Precompressed brotli/gzip for html/js/css/wasm/svg via `gzip_static`
   and the brotli module (or precompressed files served with the right headers). `index.html` (3.8 MB) should
   drop to roughly a quarter. `index.html` and `version.json`: `no-cache` + ETag. Hashed assets: long
   `immutable`. HTTP/2 at Cloudflare.
2. **Self-host third-party assets (launch, decided). Done 2026-10-19.** Fonts (JetBrains Mono, Space Grotesk)
   in `fonts/` with `fonts/fonts.css` (`font-display: swap`), Font Awesome **6.7.2 Free** (chosen over 6.5.1) in
   `vendor/fontawesome/6.7.2/`, PDF.js 4.2.67 in `vendor/pdfjs/4.2.67/`, iso-639-1 2.1.11 in
   `vendor/iso-639-1/2.1.11/`; each library's license file sits next to it. `index.html` and the Patcher use
   relative paths; documents the app generates (error page, PDF viewer, viewers) use absolute URLs built from
   the page URL, since `blob:`/`srcdoc:` documents cannot resolve relative paths. Still to do: list the licenses in `NOTICE`.
   Removing the Discord client, new-tab widgets, AI and translate (`PLAN.md`) also removes their third-party calls.
3. **Own WISP relay (launch, decided: epoxy-server).** See 2b.
4. **Frontend: staged hybrid (decided).**
   - Step 1 (launch): keep the single `index.html` through trim and rebrand, so upstream cherry-picks stay easy
     while the file changes most. Compression covers most of the transfer cost.
   - Step 2 (slice A): move vendored libs (libcurl.js WASM, acorn, PDF.js) to separate hashed files with
     long-lived caching. They rarely change upstream, so this costs little merge pain.
   - Step 3 (only if editing pain warrants it): move app code to `src/` modules with an esbuild script that
     builds `dist/`. Since upstream fixes are cherry-picked by hand anyway, this mainly costs build setup.
   - Lazy-load the PDF viewer, inspector and extension system on first use once step 2 or 3 is done.
   - `svg/` is being removed, so there are no copies to keep in sync.
5. **Small wins.** `preconnect` to the relay, `font-display: swap`, avoid layout-blocking work at load, drop
   unused `data:` images.
Measure before/after (transfer size, load time, time to interactive) and record numbers in the decision log.

## 2b. Own WISP relay
- WISP multiplexes many TCP/UDP streams over one WebSocket. libcurl.js opens `wss://limitless.taps-holdings.org/wisp/`;
  the relay makes the real outbound connections. It sees destination hosts and ports, not decrypted HTTPS.
- **Software (decided): epoxy-server** (Rust, Mercury Workshop). Check its license and its limit options before adoption.
- **Where (decided): this VM**, own container, reachable only through nginx `/wisp/` (with `Upgrade`/`Connection`
  headers, long read timeouts, keepalive pings for Cloudflare's WebSocket idle timeout).
- **Must-have safety (SSRF):** this VM runs other projects' databases and containers. The relay must not reach
  loopback, RFC1918, link-local/metadata (169.254.0.0/16), the Docker bridge or other projects' networks. Own
  container network with egress rules denying those ranges; block SMTP, IRC and torrent ports; Origin check;
  per-user caps (`ACCESS-CONTROL.md` section 5).
- **Logging (decided: abuse-only).** No routine destination or content logs. Only counters and events for
  rate-limit hits, blocked targets and abuse reports, with short retention. Stated in the in-app privacy page.
- **Third-party fallback (decided 2026-10-18):** the 15 built-in third-party relays stay in the code, off by
  default. The app checks our relay; if it is unreachable it shows a notice that the fallback relays are not run
  by Gamble Limited Ltd. (our caps, logging policy and privacy page do not cover them) with a link to switch them
  on. The Discord client's separate relay list goes with the Discord client.
- Later option: separate VM, Boss's 2nd PC, or a second relay region.

## 3. Order of work
`PLAN.md` section 5: prep, design, trim, rebrand, start page, hosting (local only), gate, launch. Slice A after launch.

## 4. Open items
- Cap numbers and enforcement point.
- Brotli: decided, precompressed trees (section 5).
- Cloudflare's terms for relaying arbitrary traffic.

## 5. What is built (stage 5, 2026-10-19)
Files: `deploy/docker-compose.yml` (+ `docker-compose.dev.yml`, `dev-up.sh`, `dev/stub-gate.conf.template`), `deploy/web/` (Dockerfile,
`nginx.conf`, `snippets/`, `errors/`), `deploy/relay/` (Dockerfile, `config.toml`, `egress-rules.sh`), `deploy.sh`,
`scripts/build-static.sh`, `scripts/gen-themes.py`, `scripts/fetch-fonts.py`, `theme/`, `legal/`, `favicon.svg`.
- **Networks** (fixed subnets): `lb_internal` (internal, web and gate, 10.88.80.0/24), `lb_relay` (internal, gate and relay, .81),
  `lb_egress` (relay only, .82), `lb_gate_out` (gate only, for GLL ID over HTTPS, .83), `lb_edge` (web only, .84: Docker cannot publish a
  port from an internal-only network). Only `web` publishes a port, `127.0.0.1:8580`.
- **nginx** fails closed: `auth_request /_gate/check` at server level, switched off only for `/legal/`, `/theme/`, `/favicon.svg`, `/auth/`.
  401 gives the gate's sign-in page for HTML requests, 403 the invite page, otherwise the bare status. If the gate is down the answer is
  a 5xx with a static page (verified: the app is never served). No access logs (privacy page says so; Boss to confirm). Real IP from
  `CF-Connecting-IP` only for peers in 127.0.0.1 / Docker ranges.
- **Compression decision:** no brotli module in the official nginx image. `build-static.sh` writes `dist/` (raw + `.gz`, `gzip_static`) and
  `dist-br/` (same names, brotli q11, from the `brotli` CLI or Node's zlib). nginx chooses the root from `Accept-Encoding` and adds
  `Content-Encoding: br` by extension (html, js, mjs, css, wasm, svg, json). Measured index.html (3,634,079 B): gzip 1,196,734 B (33%), br 978,191 B (27%).
- **Caching:** index.html, patcher.html, version.json, themes.css: `no-cache` + ETag. `vendor/`: 1 year immutable (versioned paths).
  `fonts/`, `theme/fonts/`: 1 year (names not versioned, so not immutable).
- **Relay:** epoxy-server 2.0.0, MercuryWorkshop/epoxy-tls commit `0c11678d72a636c3a4bc723db87e03e7b888eaf9` (2026-03-21), built unmodified
  with a dated nightly (`nightly-2026-03-20`), `speed-limit` feature, distroless `cc-debian12:nonroot`, read-only rootfs, cap_drop ALL, image 47 MB.
  **License: AGPL-3.0** (`server/LICENSE`; copied into the image). We run it unmodified in its own container and link to our source; if we ever patch it,
  the patch must be published. Options used (`deploy/relay/config.toml`): `allow_non_global=false` (blocks 0/8, RFC1918, CGNAT, link-local, reserved,
  IPv6 ULA, checked on the resolved address), `allow_loopback=false`, `allow_multicast=false`, `resolve_ipv6=false`, `allow_udp=false`,
  `block_ports` for SMTP (25, 465, 587), IRC (6660-6669, 6697), torrent (6881-6889, 6969), public `dns_servers`, `log_level=warn`.
  epoxy-server has no per-user limits (only per-connection `read_limit`/`write_limit`, left unlimited), so caps stay in the gate as planned.
- **Egress rules:** container-level only so far (internal networks, own egress bridge, public DNS, no capabilities). Host-level rules are
  written in `deploy/relay/egress-rules.sh` (dry run by default) and are NOT applied; Boss reviews and runs `sudo deploy/relay/egress-rules.sh --apply`.
- **Local test results:** see the stage 5 report in the session log; stub gate verified for 401, 403, 200, gate-down, br and gzip.
- **Client IP:** nginx overwrites `X-Real-IP` and `X-Forwarded-For` with `$remote_addr` (after `CF-Connecting-IP` is resolved) on `/auth/`,
  `/_gate/check` and `/wisp/`, never `$proxy_add_x_forwarded_for`, because the gate trusts them. Only nginx can reach the gate (internal networks).
- **GLL ID outage:** `/_gate/check` may answer 401 with `X-LB-Reason: unavailable`; nginx then shows `/auth/unavailable` instead of `/auth/signin`
  (verified with the stub).
- **Bandwidth cap is not enforced per user yet.** Neither the gate nor epoxy-server meters it. Stopgap on `/wisp/`: `limit_rate 781250` (bytes/s)
  per connection = 6.25 Mbit/s; with the gate's 8-sockets-per-user cap that is at most 50 Mbit/s per user, download direction only (nginx `limit_rate`
  does not throttle client uploads), and untested on upgraded WebSocket connections. A real per-user meter in the gate is still open.
- **Gate image:** compose has a `/healthz` healthcheck (needs `wget` in the gate image, otherwise change it) and an optional `GATE_BACKCHANNEL_URL` in `deploy/gate.env`.
