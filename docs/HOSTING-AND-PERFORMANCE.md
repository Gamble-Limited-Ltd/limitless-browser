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
2. **Self-host third-party assets (launch, decided).** Fonts (JetBrains Mono, Space Grotesk), Font Awesome
   (upstream mixes 6.7.2 and 6.5.1: pick one), PDF.js 4.2.67, iso-639-1. Keep each license notice in `NOTICE`.
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
- Brotli in the nginx image (module vs precompressed files).
- Cloudflare's terms for relaying arbitrary traffic.
