# Bot checks on the relay (1.1 slice `slice/1.1-botcheck`)

Decision: `docs/1.1/PLAN.md` (Boss, 2026-11-16). In scope: stop our own false alarms, and send what the user's real browser would send. Out of scope and
not built: solving or clicking CAPTCHAs or challenges, IP rotation, residential proxies, any fingerprint that is not the user's own browser's.

## Part A: the detector (`LB_botCheck(status, html, headers)`, `app/ui.js`, switch `features.botCard`)
Before: any 403/429/503 whose body contained `g-recaptcha`, `hcaptcha.com/1/api`, `cf-chl` and so on showed the "Human Check" card. Login and error
pages embed those. Now a challenge needs one of:
- header `cf-mitigated: challenge`;
- Cloudflare (`server: cloudflare` or `cf-ray`) and a body under 40 000 characters with the "Just a moment..." / "Attention Required! | Cloudflare" title or
  `cdn-cgi/challenge-platform/h/<x>/orchestrate`, `cf_chl_opt`, `cf-chl-` (the analytics `.../scripts/jsd/` snippet on ordinary Cloudflare pages does not count);
- a small body with a DataDome, PerimeterX (`px-captcha`, Press and Hold), Imperva (Incapsula incident ID) or Akamai (`Access Denied` plus `errors.edgesuite.net`) marker;
- a captcha widget (reCAPTCHA, hCaptcha, Turnstile) in a small body whose visible text is under 300 characters and asks to verify.
`call from go()` passes `r.headers`. `LB_FEATURE_BOTCARD=false` at build restores the old substring test. Test: `tests/e2e/botcheck.spec.js` (10 true
positives, 9 false positives incl. long login page, short 403 login, analytics snippet, 200 and 404 with challenge text).

## Part B: request hygiene (`features.reqHygiene`, build `LB_FEATURE_REQHYGIENE`, default true)
What the 1.0 app sent (`doFetch`, `app/main.js`) and what is wrong with it:

| Was | Problem | Now |
|---|---|---|
| UA = saved UA else a fixed "Windows NT 10.0 ... Chrome/148" | A Chromebook or Mac user presented as Windows; version not the real one | saved UA, else `navigator.userAgent` |
| no `sec-ch-ua*` | A Chrome UA without client hints is a classic bot tell | Chromium UA: `sec-ch-ua`, `-mobile`, `-platform` (real `userAgentData` while it agrees with the UA string, else derived); Firefox UA: none |
| no `Accept` on documents, so libcurl sent `*/*` | browsers send the long `text/html,...` list | Chromium or Firefox navigation `Accept`; `*/*` for scripts, `text/css,*/*;q=0.1`, image list (already there) |
| `Accept-Language: en-US,en;q=0.9` fixed | ignores the user's languages | from `navigator.languages` (Chromium q 0.9/0.8, Firefox 0.5/0.3) |
| `Origin` on every request, `Referer` equal to the target URL on the top-level load | no browser does either (self-referrer on a typed load, Origin on image GETs) | no `Referer` on the top-level load (`opts.__nav`, set in `go()`), `Origin` only for CORS or non-GET |
| no `Upgrade-Insecure-Requests` | present on every browser navigation | added on the top-level load |
| arbitrary order | order is a signal | Chromium or Firefox order (hints, UIR, UA, Accept, Sec-Fetch-*, Referer, Accept-Encoding, Accept-Language, Cookie) |
Checked with the real libcurl.js on a local server (`tests/e2e/reqhygiene.spec.js`): no duplicate headers, order kept, nothing naming Limitless, the relay or a proxy.
`Accept-Encoding` stays libcurl's `deflate, gzip, br` (the wasm has no zstd; setting it by hand would turn off decoding).
Not changed, on purpose: the TLS handshake (JA3/JA4) comes from libcurl.js in the browser and is not Chrome's; matching it would be fingerprint spoofing, and
the VPS sees only the WISP stream, so it cannot alter it. Skin UAs (Opera GX, Firefox) are the user's choice and are honoured (Opera gets no client hints).

## VPS side (read only, 2026-11-16; nothing changed)
- Egress: IPv4 only (`107.173.50.59`, no global IPv6 address; the relay also sets `resolve_ipv6 = false`). Nothing to fix.
- DNS: relay uses the unbound cache (10.88.81.53, DoT to 1.1.1.1 and 9.9.9.9). Fine.
- Kernel: `ip_default_ttl 64` (Linux). No change wanted.
- Reverse DNS: `107-173-50-59-host.colocrossing.com`, the provider default. It marks the address as a hosting range and does not match `relay.taps-holdings.org`.
  Setting the PTR to `relay.taps-holdings.org` (forward confirmed, honest) is done in the RackNerd client area, not on the VM. Boss action, optional, no rollback needed
  beyond setting it back.
- The address itself (RackNerd/ColoCrossing hosting range) is the main reason some sites challenge it. Fixing that needs another address, which is out of scope.
No VPS file or setting was changed by this slice, so no VPS backup or rollback applies.

## Measurement (`scripts/probe-challenges.mjs`)
`node scripts/probe-challenges.mjs --reps=3` (no credentials; plain front-page GETs with system curl from this machine "home" and over `ssh limitless-relay` "vps";
`old` = the 1.0 header set, `new` = the 1.1 set; verdict by the app's own `LB_botCheck`). curl's TLS is curl's, so rates are not the app's; read them as a comparison.

Run 2026-11-16 16:35 UTC, 16 sites x 3 reps = 48 requests per row (UA a Chrome 147 on Linux string; "error" = curl could not fetch, e.g. glassdoor, medium and stackoverflow reset curl's TLS, counted in every row):

| Vantage / headers | ok | challenge | blocked (403/429, no challenge page) | error |
|---|---|---|---|---|
| home / old | 27 | 9 | 3 | 9 |
| home / new | 33 | 6 | 0 | 9 |
| VPS / old | 19 | 20 | 6 | 3 |
| VPS / new | 19 | 20 | 6 | 3 |

Reading: the new header set cleared reddit (blocked) and indeed (challenge) from home; g2 and etsy still challenge from home. From the VPS the headers change nothing:
20 of 48 front pages are challenged (zillow, glassdoor, indeed, g2, etsy, medium, linkedin most reps) and reddit and ticketmaster are blocked outright, with either header set.
So the datacenter address is the dominant factor, as `docs/1.0/PLAN.md` predicted, and hygiene alone will not fix the VPS. Real users also go through libcurl's TLS handshake, which this curl test does not reproduce.
Raw run: `scripts/probe-challenges.mjs --reps=3` (about 8 minutes).

## Boss actions
- Deploy: nothing special; the switches default on. Kill switches at build: `LB_FEATURE_BOTCARD=false`, `LB_FEATURE_REQHYGIENE=false` (`./deploy.sh` with the variable set).
- Optional: set the PTR of 107.173.50.59 to `relay.taps-holdings.org` in the RackNerd panel (rollback: set it back to the default).
- Boss's Chromebook check (advisory): open a few login pages (they should not show Human Check) and a Cloudflare-protected site.

Last verified: 2026-11-16
