# 06: Bot checks and sign-in walls (spec, 2026-11-19)

Area code **BC**. Old ids merged here: SPEED-NEXT C (B1 to B5), J (J1 to J5), NATIVE-SPEED-PLAN Phase 7, `docs/1.1/BOTCHECK.md`.
Research: `docs/1.3/research/botcheck-2026-11-19.md` (Sonnet, sources inside), and the 2026-11-18 job
(`~/gll-planning/reports/limitless-speed/2026-11-18_overnight/E-research/BOTCHECK.md`).

## 0. Rules for every item (unchanged, repo rule)
- **Honest paths only.** No CAPTCHA solving (by code or by service), no IP rotation, no residential proxies, no fingerprint spoofing (TLS,
  HTTP/2, canvas or anything that is not the member's own browser), nothing that defeats a site's security on purpose. Filter-evasion or
  detection-evasion features need Boss's explicit decision (`CLAUDE.md`).
- **Home egress is dropped** (Boss, 2026-11-19; was B4 and Phase 7.4). Not planned, not to be proposed again without Boss raising it.
- The honest goals: let the real person pass a check that can work inside Limitless, keep that pass for its natural life, keep our relay's
  address clean, measure, and say plainly when a site cannot work here.

## 1. What the research settled (2026-11-19)
- Turnstile, reCAPTCHA and hCaptcha bind a sitekey to a list of hostnames and the site's server checks the hostname the widget ran on
  (Turnstile error 110200 on an unlisted host). Inside Limitless the widget runs in our app origin, so an **embedded widget** on a site's
  form (login, sign-up, comment) is expected to fail by design. This is the site's security working; we do not work around it.
- A **Cloudflare interstitial** ("Just a moment", managed challenge) is served by the site's own origin and its script talks to that
  origin; whether it can complete through the rewriter is not known. Measure before promising (BC-4).
- `cf_clearance` lives 30 minutes by default (15 to 45 recommended) and is "time-bound and behavior-bound" (Cloudflare docs). Binding to IP
  and User-Agent is claimed only by scraper blogs: plan for it. Our paid relay has one stable egress address and the app sends the
  member's real UA (1.1 request hygiene), so a member's own cookie stays valid for its life. It must never be shared between members or
  stored on the VPS.
- Private Access Tokens need Apple device attestation; nothing to do for Chromebooks.
- A Chrome User-Agent with curl's TLS fingerprint (libcurl.js) is described as a bot signal by blogs only; vendors do not document it.
  Matching Chrome's TLS would be spoofing (excluded). See decision BC-D1.
- Google blocks sign-in in embedded or intercepted browsers by policy (Google OAuth policies, "disallowed_useragent"; Google Account help
  answer 7675428). The 1.2.2 card (J5) is the honest answer; the old plan to trace `K[z] is not a function` is dropped.
- Data-centre addresses get more checks (our 2026-11-16 probe: VPS 20 of 48 front pages challenged, home 6 of 48). Hygiene alone does
  not change that.

## 2. Status of what exists
| id | item | old ids | status |
|---|---|---|---|
| BC-1 | Human-check detector, real interstitials only (`features.botCard`) | 1.1 Part A | shipped 1.1.0, on |
| BC-2 | Request hygiene: the member's real UA, client hints, Accept, order (`features.reqHygiene`) | 1.1 Part B, J4 | shipped 1.1.0, on |
| BC-3 | Google sign-in card with "Open outside Limitless" (`features.googleSignin`) | J5, B5, 7.2 | in 1.2.2 (record ready, waits on Boss's deploy), on |
| BC-3b | YouTube blocked card (`features.ytBlock`) | K2 | in 1.2.2, on |

---

## BC-4 Challenge experiment, then the right card per site (was J1, B1, 7.1)
- **Status:** planned. **Likely time:** 3 h experiment, then 3 to 5 h for the card work. **Tiers:** all.
- **Why:** today a challenge shows the generic Human Check card. Members need to know whether trying again can work.
- **Step 1, experiment (no product change):** three fixture pages in `tests/fixtures/sites/` and three real public test pages:
  1. a page that embeds a Turnstile widget with Cloudflare's published **test sitekeys** (always-pass, always-fail, interactive), served
     by the fixtures container: record what the widget does inside Limitless (renders, error code, token returned or not);
  2. the same for hCaptcha's and reCAPTCHA's published test keys;
  3. a real site behind a Cloudflare managed challenge, reached from the VPS (`lbtest`, spec 01 MS-4): does the interstitial finish after a
     human click, and does the next load carry `cf_clearance`?
  Output: `docs/1.3/BOTCHECK-RESULTS.md` with one row per case: renders yes/no, error, completes yes/no, clearance kept yes/no, date.
  Rules: test keys only for widgets; on real sites one load, one human click by Boss at most, never automated clicks.
- **Step 2, cards (`features.challengeCards`, default off until the experiment is written up):**
  1. `LB_botCheck` returns a kind: `interstitial` (Cloudflare managed, AWS WAF), `widget` (Turnstile, hCaptcha, reCAPTCHA in the page),
     `hard` (DataDome, PerimeterX, Akamai, Imperva block pages).
  2. `interstitial` that the experiment showed can complete: the page is shown as is, with a slim bar "This site is checking that you are
     a person. Complete it below." (no card over it).
  3. `widget` and `hard`, or an interstitial that cannot complete: the card says the site's check cannot run inside Limitless, with "Try
     again" and "Open outside Limitless" (same matcher-checked `window.open` as BC-3).
  4. The card never says Limitless will fix it, never names the vendor to the member, never offers a workaround.
- **State:** none new; the per-site verdict is not stored on the device.
- **Edge cases:** a login page that embeds a widget but works without it (the detector already ignores long pages; keep that); a site that
  mixes an interstitial with a widget (treat as `widget`).
- **Tests:** `tests/e2e/botcheck.spec.js` gets the kinds (10 true positives, 9 false positives today; add 3 per kind); fixture
  experiment script `tests/stack/challenge.spec.js` (stack, opt-in `LB_CHALLENGE=1`).
- **Measured by:** BC-7 table: share of challenged loads that end shown after one human action.
- **Rollback:** `LB_FEATURE_CHALLENGECARDS=false`.

## BC-5 Keep the member's own pass (was J2, B1 second half)
- **Status:** planned (check first; it may already work). **Likely time:** 2 h. **Tiers:** all.
- **Rules:**
  1. Clearance cookies (`cf_clearance`, `__cf_bm`, `datadome`, `_px*`, `ak_bmsc`) are ordinary cookies in the member's device cookie jar
     (`saveCookieJar`), kept until their own expiry, never longer.
  2. They are never sent to another member, never copied to the VPS, never put in a shared cache key (spec 04 rules already refuse
     requests with cookies).
  3. A member on public relays gets a different egress address per relay, so their clearance may fail; the router's per-site sticky
     relay (multi-relay `site` mode) keeps one relay per host where it is on. No new rotation of any kind.
- **Tests:** e2e with a stub site that sets `cf_clearance` (Max-Age 1800) on the second load: the third load sends it; after 1801 s
  (fake clock) it is gone; a second browser context (another member) never sees it.
- **Rollback:** none needed (no new code if the check passes; otherwise a jar fix behind `features.keepPass`).

## BC-6 Clean relay reputation (was J3)
- **Status:** partly existing. **Likely time:** 1 h of docs plus Boss steps.
- **Rules and steps:**
  1. Reverse DNS of the VPS address set to `relay.taps-holdings.org` with a matching forward record (**Boss step** in the RackNerd panel;
     rollback = set it back). **Done 2026-11-19:** Boss set it; checked the same day, 1.1.1.1 and 8.8.8.8 answer `relay.taps-holdings.org`
     for `107.173.50.59` and the forward record points back (forward-confirmed).
  2. No abuse page (Boss, 2026-11-19: reverse DNS only).
  3. Per-member limits already exist (gate token buckets, socket cap 8, data caps, abuse throttle); add one counter: requests per minute
     per member over 600 sustained for 5 minutes raises the existing abuse alert (no automatic block beyond today's throttle).
  4. Free (Ordinal) traffic never uses the VPS (already true: no relay token for Ordinal).
- **Tests:** gate unit test for the counter threshold.
- **Not done (needs spending or is not honest):** a second address, residential egress, rotating addresses.

## BC-7 Measure challenges per site and vantage (was B2, T3)
- **Status:** planned. **Likely time:** 2 h (uses TS-7 in spec 08 and MS-4 in spec 01).
- **Rules:** weekly, 1 load per site from each vantage (rehearsal home, VPS through `lbtest`), the 42-site list plus the 10 official sites;
  verdict by `LB_botCheck`; table `docs/1.3/BOTCHECK-SITES.md` with columns site, home, VPS, kind, works after one human action
  (from BC-4), date. Data use is under 1 GB a month (inside the 50 GB test budget).
- **Exit:** the table exists and is less than 8 days old at each Minor release.

## BC-8 Private search page (was B3, 7.3)
- **Status:** later, only if spec 04's CPU budget (SV-0) leaves room; a privacy line is needed (Boss). **Likely time:** 5 to 8 h.
- **What:** SearXNG (AGPL, fine next to an AGPL app) on the VPS, reachable only through the gate for paid members, limiter off for
  gate-authenticated requests only (its public limiter allows 4 JSON calls per IP per hour). Results render in a `limitless://search` page.
- **Risks:** upstream engines can challenge the VPS too; 2 GB RAM box; the VPS sees queries (privacy line).
- **Exit to start:** SV-0 says at least 0.25 vCPU and 256 MB are free at the evening peak.

## BC-9 Site status hints (new, brainstorm F1)
- **Status:** planned. **Likely time:** 3 h. **Tiers:** all.
- **Rules:**
  1. At release time `scripts/build-site-status.mjs` writes `sites-status.json` into the build from the latest BC-7 table and the sites
     suite: `{site, status: works|slow|human-check|cannot-work-here, reason}` for listed sites only (registrable domain).
  2. When the address bar's host matches, a quiet line under the suggestions says, for example, "Google sign-in does not work in
     Limitless" or "This site usually asks you to prove you are a person". The error and Human Check cards reuse the same reason line.
  3. Wording is plain and never suggests a workaround. No hint for `works`.
  4. The file is static and gated like the rest of the app; no lookup is sent anywhere.
- **Tests:** e2e: typing a listed host shows the hint; an unlisted host shows nothing; the card shows the reason.

## Decisions for Boss (also in the master plan)
- **BC-D1 (answered 2026-11-19: keep the real UA) TLS mismatch:** keep sending the member's real User-Agent with libcurl's TLS (today, recommended) and say in the privacy and
  help text that some sites may still check; or add a truthful " Limitless" suffix to the UA (honest, but likely more checks). Matching
  Chrome's TLS is spoofing and is not an option.
- **BC-D2 (answered 2026-11-19: no abuse page).**
- **BC-D3 (answered 2026-11-19: yes) Reverse DNS** step in the RackNerd panel (BC-6 step 1), Boss does it.

Last verified: 2026-11-19
