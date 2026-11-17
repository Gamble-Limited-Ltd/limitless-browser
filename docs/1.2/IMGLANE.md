# Native image lane (1.2, speed audit item 6 / S1)

Plan: `docs/1.1/SPEED-AUDIT.md` sections 1.3, 4 (S1, capacity) and 4b (tiers). Status: built behind two switches, NOT deployed, NOT enabled.
Gate side: `~/limitless-gate` branch `slice/1.2-imglane` (`src/img/`, `GATE_MODE=img`).

## What it does
With the lane on, a paid member's `<img>` in the frame loads `https://<relay host>/i/<relay token>/<w|s>/<image url>` as a normal image
request. The VPS lane container fetches the image without cookies or Referer (own User-Agent `LimitlessImageLane/1`), keeps it in a disk
LRU cache (1 GB, 24 h), re-encodes JPEG/PNG of 30 KB or more to WebP quality 75 (sharp, never AVIF), and serves it with
`Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`, `nosniff` and a sandbox CSP. The browser then
decodes natively off the main thread; no libcurl, base64 or postMessage work per image. Any error (non-200, not an image, too big, over
rate, lane down) makes the image fall back to the normal libcurl path in the page runtime (`loadMedia`). Five failures in a row switch the
lane off for two minutes in that tab session. While the lane is on the `go()` image pre-warm is skipped (the browser loads them itself).

## Switches
- Build: `features.imgLane` (`LB_FEATURE_IMGLANE`, **default false**). The app's own fallback without `version.json` is also false, and only an
  explicit `true` turns it on.
- Member: Settings > Connection > "Faster images" (`limitless:imglane:v1`, off by default). The card shows only when the build has the lane and the
  plan is Cardinal or above.
- Server: the compose service `imglane` (`deploy/relay-vps/docker-compose.yml`) is `profiles: ["imglane"]`: a normal `up` never starts it, and the
  nginx `/i/` location resolves the service at request time, so the relay stack starts without it. Secrets file `imglane.env` (public token key only).

## Tiers (plan 4b, Boss decides)
| Plan | Lane | Re-encode |
|---|---|---|
| Ordinal | no (no relay token, so no lane) | no |
| Cardinal | pass-through plus shared cache | WebP only when the member has Data saver on (path mode `s`) |
| Prime, Executive | yes | WebP always (modes `w` and `s`) |
The server enforces the plan from the signed relay token (`plan` claim), not from what the app sends.

## Limits and safety
- CPU: container `cpus: 0.75` (the relay keeps 1.5 of the 2 vCPU), 2 parallel WebP encodes, 32 queued, then 503. Measured cost: about 13.5 ms of VPS CPU per
  image (SPEED-AUDIT 1.3), so one core is about 74 images a second. Per member: 300 images a minute (burst 150), then 429.
- Only public destinations. Hosts are resolved by the lane itself and every resolved address is checked against private, loopback, link-local, CGNAT,
  multicast, documentation and mapped ranges (`src/img/net.ts`); the connection uses that checked lookup, so a DNS answer cannot change between
  check and connect. IP literals, `localhost`, user:password URLs and ports other than 80 and 443 are refused, redirects (3 at most) are re-checked.
  The container sits only on the egress network whose host rules (`egress-rules.sh`) already reject private ranges: the same stance as the relay's
  `allow_non_global = false`.
- Size: 10 MB per image (`IMG_MAX_BYTES`), 50 megapixels decoded, 8 s to the first byte, 15 s in total. Only JPEG, PNG, WebP, AVIF and GIF are served
  (SVG is refused). Animated or unreadable images are served as they are.
- Aggregate only: counters `img_req img_hit img_webp img_pass img_bytes_in img_bytes_out img_refused img_rate img_err img_busy` printed every 10
  minutes. No URL, host, member or token is logged or stored; nginx on the VPS has `access_log off`. Cache file names are a SHA-256 of mode plus URL.
- Known limit: the lane URL contains the relay token (5 minutes), so the browser's own HTTP cache reuses an image for at most a token's life.
  The VPS cache is shared by every member and does not have this limit.
- Not done: `srcset` and CSS `url()` images still use the libcurl path; video posters too. Admin chart of the aggregates is not built (counters
  only). No real-stack rehearsal was run (not asked); the unit tests use a local origin and the e2e tests mock `/i/`.

## Privacy line for the legal text (DRAFT for Boss; legal pages change only with Boss)
Proposed wording for the Privacy page, section on the relay (needs Boss's approval and the HALL legal change before the lane is switched on):

> Faster images (optional, Cardinal plans and above, off until you turn it on). When you turn this on, Limitless loads the pictures of the pages you visit
> through its own image server instead of through your browser. That server can see the web address of each picture and the picture itself, and it
> keeps a copy for up to 24 hours so the next person gets it faster. It sends no cookies and does not know who asked, and we do not log or store which
> pictures you loaded: we only count totals. Everything else you do still travels encrypted to the site and our relay cannot read it.

## Boss actions to enable (not done)
1. Approve the privacy line and the HALL legal text change.
2. VPS: copy `deploy/relay-vps/imglane.env.example` to `imglane.env`, put the public token key in, `docker compose --profile imglane up -d imglane` (and
   re-create `tls` so nginx has the `/i/` location). Rollback: `docker compose --profile imglane stop imglane` (the app falls back by itself).
3. Build with `LB_FEATURE_IMGLANE=true` and a rehearsal run on the real pair first.
