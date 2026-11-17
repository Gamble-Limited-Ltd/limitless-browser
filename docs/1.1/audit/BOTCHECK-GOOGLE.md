# Bot checks and Google sign-in: audit (2026-11-16, read-only)

Scope rule: nothing here proposes solving challenges, solver services, IP rotation, residential proxies or a faked TLS/browser fingerprint (docs/1.1/PLAN.md, 2026-11-16).
Method: system curl from the VM ("home") and over `ssh limitless-relay` ("vps"), code reading of `app/main.js`, web search. No code, config, server or DNS touched.

## 1. Google sign-in

### What Google returns (evidence)
- `curl https://accounts.google.com/ServiceLogin?hl=en` with a Chrome UA, from home and from the VPS: 302 to `/v3/signin/identifier`, then 200, about 1.245 MB, contains `identifierId` (the email field) and no "not secure" or `disallowed_useragent` text. Same with a WebView-style UA (`; wv`): 200 and the same page size. A `__Host-GAPS` cookie (Secure, HttpOnly, Path=/) is set.
- So at the HTML level Google does NOT refuse the VPS address or the proxy path. The block, if any, comes later (JS-side checks after the email is entered, or the page not running). The 1.0 baseline agrees: google-signin renders page text but "the email field never appears within 12 s" (docs/1.0/BASELINE.md lines 126, 153, 182): the page fails in our runtime, before any policy decision.
- Response headers: `Content-Security-Policy: require-trusted-types-for 'script'` plus a nonce CSP. Trusted Types enforcement is a likely failure point for our script/HTML rewriting (we inject and rewrite scripts; any `innerHTML`/`document.write`/`data:` swap that is not a TrustedType throws). Not tested in a browser here: needs a Chromebook or headless Chrome run.

### Google policy (cannot honestly get past)
- Google blocks sign-in from embedded frameworks/webviews and "browsers not supported", error "This browser or app may not be secure" / 403 `disallowed_useragent`. Sources: https://developers.googleblog.com/2020/08/guidance-for-our-effort-to-block-less-secure-browser-and-apps.html , https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/ , https://support.google.com/accounts/answer/7675428 (lists browsers embedded in another app, JS off, automated control).
- Google judges this with UA plus JS-side environment checks. A page whose real origin is `blob:null` inside a sandboxed iframe, with a faked `location`, replaced `window.open`, and a wrapped `document.cookie` is exactly what such checks are built to catch. Making those checks pass by pretending to be something else is fingerprint spoofing: out of scope.

### Breakage we cause (fixable honestly, or at least name-able)
From `app/main.js`:
1. Page runs in an opaque-origin sandboxed frame (`blob:null`, comment near line 6497; sandbox handling line 11099). `crypto.subtle`, `isSecureContext`, WebAuthn (`navigator.credentials`, none referenced in main.js), passkeys, FedCM (no `IdentityCredential`) and third-party-cookie APIs are absent or behave differently. Google sign-in uses WebAuthn/passkey probes, `crypto.subtle` and `Storage Access` paths. Effect: scripts throw or sign-in stalls. Cause: our design.
2. `window.open` is replaced (line 8036): it navigates the same tab to the URL and returns a dummy object (`postMessage` is a no-op, `closed:false`, no `opener`). "Sign in with Google" on third-party sites opens a popup at accounts.google.com/gsi and then calls `window.opener.postMessage` back, or uses a GIS iframe plus `postMessage` to the parent origin. With our dummy, the opener is gone, the credential message never arrives. The same applies to One Tap (iframe at accounts.google.com/gsi/iframe, needs third-party cookies) and FedCM (needs `navigator.credentials.get({identity})`). All three break by construction.
3. Cookies: the jar (`updateCookie`, line 2727) keeps name, value, domain, path, expiry, HttpOnly. It ignores `Secure`, `SameSite` and `Partitioned`, which is lenient (more cookies sent, not fewer), and it stores `__Host-`/`__Secure-` cookies like any other, so prefixes are not the cause. But the page-visible `document.cookie` is a flat Map keyed by name only (line 6487), per origin, so two same-name cookies with different paths or domains collide in the page copy (the real jar is fine). Cookies are keyed to the real site origin, not the proxy, so Google receives its own cookies; that part is good. Minor risk, not a likely root cause.
4. Request side: Google gets a Chrome UA and now sec-ch-ua hints (1.1 hygiene) but libcurl.js's TLS handshake is not Chrome's (section 2). Google does look at this for sign-in risk, but the HTML was served fine to curl, so this is secondary.

### Verdict
(a) Fixable and ours: popup/opener/postMessage emulation for third-party "Sign in with Google" (a real same-origin app window or tab as `window.open` target with a message bridge), and any Trusted Types or sandbox breakage that stops the identifier page from rendering. Needs a real browser trace (open question; I could not run Chrome here) to say which of these is the actual failure for the direct accounts.google.com page.
(b) Policy, not fixable honestly: Google may still show "browser or app may not be secure" for a proxy-in-iframe environment even after (a). Treat full Google account sign-in on accounts.google.com as "best effort, may stay unsupported" and say so in the app; do not promise it.
Honest member path: sign in on the member's own browser outside Limitless (Google account sessions do not carry over, so this only helps sites with their own login).

## 2. Bot checks

### Measured (probe-challenges.mjs, 15 sites x 2 reps, 1.1 "new" headers, curl TLS, raw 2026-11-16)
| Site | home | VPS |
|---|---|---|
| steampowered, discord, khanacademy, kahoot, coolmath, twitch, roblox, spotify, pinterest | ok | ok |
| reddit | ok | blocked (403/429, no challenge page) |
| quizlet, canva, chatgpt, medium | ok | challenge |
| etsy | challenge | challenge |
Totals: home 28 ok / 2 challenge; VPS 18 ok / 10 challenge / 2 blocked. So the datacenter address is the dominant factor for 6 of the 15 (reddit, quizlet, canva, chatgpt, medium plus etsy on both). Khan, Discord, Kahoot, Twitch were clean with curl even from the VPS, yet the 1.0 baseline shows Khan "Client Challenge", Discord/Kahoot timeouts: those come from libcurl.js's TLS/H2 behaviour or our page runtime, not the IP (curl uses OpenSSL with curl's own fingerprint, which passes where libcurl.js does not). Etsy challenges even from home: a header/TLS issue.

### VPS reputation (read-only lookups)
- DNSBL for 107.173.50.59 on zen.spamhaus.org, b.barracudacentral.org, bl.spamcop.net: no listing (empty answers).
- PTR: `107-173-50-59-host.colocrossing.com.` (generic hosting default; not forward-confirmed to relay.taps-holdings.org).
- IPv6: none (`ip -6 addr` shows 0 global). Fine, nothing to fix.
- The range is RackNerd/ColoCrossing hosting: ASN class "datacenter" is itself scored by Cloudflare/Akamai/DataDome regardless of cleanliness.

### TLS ClientHello versus Chrome (partly unverified)
libcurl.js README confirms: libcurl compiled to WebAssembly, TLS up to 1.3, HTTP/2 via nghttp2, Brotli and gzip (https://github.com/ading2210/libcurl.js). The README gives no ClientHello. From general knowledge of mbedTLS (treat as unverified until captured with a local TLS listener or tls.peet.ws style echo): fixed extension order (Chrome 110+ shuffles), no GREASE values in cipher/extension/group/version lists, a much shorter cipher list without Chrome's exact order, no `compress_certificate`, no `application_settings` (ALPS), no `signed_certificate_timestamp` or `status_request` pattern identical to Chrome, different supported_groups (no X25519MLKEM768), no ECH. HTTP/2 SETTINGS and pseudo-header order from nghttp2 also differ from Chrome. Fingerprinting background and the point that TLS/H2 is one factor beside IP quality and JS: https://curl-cffi.readthedocs.io/en/stable/faq.html , https://scrapfly.io/blog/posts/ja3-ja4-tls-fingerprinting-guide-to-detection-and-evasion . Cloudflare/Akamai add the mismatch (Chrome UA + non-Chrome JA3/JA4) to the score, which raises challenge odds even from a clean IP. Fixing it means changing the ClientHello: out of scope (spoofing). Honest alternative: none inside libcurl.js; only avoiding the proxy for such hosts.

## 3. Home-IP egress: volume estimate (look-into only)
- Gate data: only per-plan daily site totals (`site_usage`, registrable domain, bytes) exist, in memory on the VPS and in the gate's DB (limitless-gate/CLAUDE.md lines 52, 126). No usable copy on this VM (only the code graph db), and prod is not to be queried, so these are page-weight estimates, not measurements. Boss can read the real top-10 in the owner `usage` route and replace these numbers.
- Assumptions: an active member loads 60 pages/day on challenge-prone hosts; HTML+JSON API per page 0.3 to 0.5 MB compressed (no images, video, JS bundles that are cacheable go with them if they share the host: add up to 2x).
- Challenge-prone hosts only (HTML/API): about 20 to 30 MB per member per day, so 0.2 to 0.3 GB/day per 10 members (up to 0.6 GB with first-party JS/CSS).
- All traffic: 0.5 to 1.5 GB per member per day without video, 5 to 15 GB/day per 10; with video, 30 GB or more.
- Home upload 21 Mbit/s is about 9.4 GB/hour (~225 GB/day) in theory. The selective option fits easily; all-traffic via home would also fit on average but video peaks would saturate it and starve the owner's own line. Home download side is unmeasured.
- Risk: abuse reports and Cloudflare/Google reputation hits land on the home ISP and the owner's own browsing IP, and a flagged home IP hurts the family connection. Needs Boss decision and an explicit allowlist; routing must be decided by the relay (host list) with no per-member destination logging (gate rule).

## Options, ranked

| # | Option | Class | Effect | Cost |
|---|---|---|---|---|
| 1 | Capture real libcurl.js ClientHello and an H2 fingerprint once, and a real-Chromebook trace of accounts.google.com in the app (console errors, Trusted Types, sandbox) to find the actual breakage | ALLOWED | Turns guesses above into facts; picks the right fix | 1 to 2 h, needs Boss's Chromebook or a headless Chrome |
| 2 | Real popup/opener bridge for `window.open` (new app window, relay `postMessage` with origin checks) so "Sign in with Google/Discord/etc." on third-party sites works | ALLOWED | Fixes the most common login on school sites (Kahoot, Quizlet, Canva, Khan) | Medium-large, S-size slice, security review (origin checks) |
| 3 | Make Trusted Types / sandbox quirks not break our runtime on strict-CSP pages (Google, Gmail) | ALLOWED | May let accounts.google.com render; still subject to Google policy | Medium, depends on trace from #1 |
| 4 | Honest message in the app: "Google account sign-in may not work here"; link to open the site's own non-Google login | ALLOWED | Cuts support noise, no code risk | Tiny |
| 5 | Set PTR of 107.173.50.59 to relay.taps-holdings.org (forward-confirmed), keep abuse@ contact, keep abuse low | ALLOWED (Boss does it in the RackNerd panel, already in BOTCHECK.md) | Small: removes "generic hosting hostname" tell; will not change datacenter ASN scoring | Minutes |
| 6 | Let the member solve a challenge in the page (no auto-solve): make the Human Check card open the challenge page cleanly in the frame/tab, keep the Cloudflare cookie (`cf_clearance`) in the jar for the site | ALLOWED | Cloudflare clearance cookie is valid for hours; removes repeat challenges. Works only if the interactive widget can run in our frame (also needs Trusted-Types fixes) | Medium |
| 7 | Home-line egress for a short allowlist of hosts (reddit, quizlet, canva, chatgpt, medium, etsy) | NEEDS BOSS DECISION (owner asked to evaluate; look-into only) | Clears the six IP-gated hosts above; ~0.2 to 0.6 GB/day per 10 members; abuse reports go to home ISP, owner's IP reputation at stake | Medium: second egress path, home-host availability, monitoring, ToS review |
| 8 | Home-line egress for all traffic | NEEDS BOSS DECISION, not recommended | Maximum pass rate; but 5 to 15+ GB/day per 10 members, video saturation of 21 Mbit/s, full abuse exposure | High |
| 9 | Privacy Pass / Private Access Tokens (https://blog.cloudflare.com/privacy-pass-standard/ ) | ALLOWED in principle, no effect | PATs need an attester on the user's own device (Apple/iCloud, some Chrome paths); tokens are bound to the browser doing the request, not to our WASM TLS. Not applicable inside libcurl.js | Research only |
| 10 | Matching Chrome's JA3/JA4, H2 SETTINGS, GREASE; rotating egress IPs; residential proxies; solver services; auto-clicking challenges | OUT OF SCOPE | n/a | n/a |

Caveats: Google page checked with curl only (no browser), so the exact failure in-app is unproven; libcurl.js ClientHello details are from general mbedTLS knowledge, not captured; data volumes are estimates; curl's TLS is not the app's.
