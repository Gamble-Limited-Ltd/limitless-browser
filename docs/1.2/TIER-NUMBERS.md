# Limitless 1.2.0 tier numbers (R2 overnight run, 2026-11-17 evening, Chicago time)

Rules from `docs/1.1/SPEED-AUDIT.md` 4b: every number is dated, names the device profile, the median and n. Anything not run says "not measured". Nothing here is a
published claim; it is raw material. All runs: this VM, rehearsal stack (`deploy/rehearsal/run.sh`), Playwright `chromebook` project (1366x768, 4x CPU, 10/5 Mbit/s, 40 ms RTT),
cells are `shown ms / load ms (n = runs that finished)`. Raw JSON stays in the run scratch folder (not committed). Dates are the JSON stamps (UTC); Chicago is six hours earlier.

## What "paid" and "Ordinal" mean in the rehearsal (read before the tables)
- **Cardinal (paid) here** = membership on (`LB_REHEARSAL_MEMBERSHIP=1`), alice finishes the ceremony and the owner grants her a Cardinal plan through the admin API
  (`grantRelayPlan` in `tests/stack/helpers-member.js`, fixed tonight: the owner must finish the ceremony first). The gate then issues a relay token and the browser uses the
  **VPS stand-in**: a plain `ws` relay on 127.0.0.1 inside this VM, egress from this VM's home address, uplink budget 18 Mbit/s. It is NOT the RackNerd box in Buffalo. No real VPS number exists.
- **Ordinal here** = membership on, alice finishes the ceremony and gets nothing (`LB_SPEED_TIER=ordinal`). The relay token is refused (403), so the app falls back to the public relay pool over the
  real internet, and the client 3 Mbit/s cap (`features.speedCap`, gate default `speedMbps` 3) applies. Whether the cap was active in each run was not read back from the page ("not measured"); it follows from the plan rules in CLAUDE.md.
- **Cannot run:** Ordinal on the fixture sites. Public relays are on the internet and cannot reach the fixtures at 10.89.85.10 (non-global address), so Ordinal against `fx-*` is impossible in this
  rehearsal. Ordinal was measured on five real public sites instead (below). Prime and Executive: not measured (their only differences are server limits, not speed).
- The public-site numbers depend on the internet and on public relays that sometimes do not answer (rows with n below 3 are real failures, listed). The fixture numbers are repeatable, the public ones are not.

## Tier table: public sites, 1.1.0 against 1.2.0, Ordinal against Cardinal (3 reps each, medians)
Runs: 1.2.0 Ordinal 2026-11-18 04:51 UTC, 1.2.0 Cardinal 2026-11-18 05:42 UTC, 1.1.0 Ordinal 2026-11-18 05:09 UTC, 1.1.0 Cardinal 2026-11-18 05:26 UTC. Builds: `release/1.2.0` tip at start of the run and `9bbe004` (1.1.0, temp worktree).

| site | phase | 1.1.0 Ordinal | 1.2.0 Ordinal | 1.1.0 Cardinal | 1.2.0 Cardinal |
|---|---|---|---|---|---|
| wikipedia | cold | 6206 / 9842 (n=3) | 5745 / 9280 (n=3) | 4623 / 7887 (n=3) | 4775 / 8051 (n=3) |
| wikipedia | warm | 5713 / 8725 (n=3) | 5323 / 9116 (n=3) | 2249 / 4951 (n=3) | 2454 / 5152 (n=3) |
| mdn | cold | 10186 / 14114 (n=3) | 9487 / 11557 (n=1) | 6360 / 10778 (n=3) | 5257 / 7487 (n=3) |
| mdn | warm | 5051 / 8285 (n=2) | failed (n=0) | 1896 / 5437 (n=3) | 1436 / 3352 (n=3) |
| hacker-news | cold | 2233 / 3067 (n=3) | 2713 / 3595 (n=2) | 2312 / 3130 (n=3) | 2308 / 3121 (n=3) |
| hacker-news | warm | 1070 / 1683 (n=3) | 1014 / 1799 (n=1) | 572 / 1203 (n=3) | 604 / 1275 (n=3) |
| sqlite-docs | cold | 2053 / 2522 (n=2) | 2057 / 2540 (n=3) | 1974 / 2461 (n=3) | 2114 / 2567 (n=3) |
| sqlite-docs | warm | 136 / 827 (n=2) | 137 / 771 (n=3) | 130 / 663 (n=3) | 127 / 681 (n=3) |
| python-docs | cold | 2648 / 4268 (n=3) | 2437 / 4080 (n=3) | 2573 / 4198 (n=3) | 2665 / 4097 (n=3) |
| python-docs | warm | 1067 / 2270 (n=3) | 1112 / 2266 (n=3) | 814 / 1881 (n=3) | 848 / 2157 (n=3) |

Failures behind the n values: `mdn` crashed the Chromium target ("Target crashed") in 3 of 3 reps on 1.2.0 Ordinal and 1 of 3 on 1.1.0 Ordinal (crash site: a `page.evaluate`, so some reps lose the warm visit and the cold one); on Cardinal it did not crash (3 of 3 reps finished on both versions).
Ordinal `hacker-news` and `sqlite.org` sometimes showed "This site is not answering" (public relay timeouts). Read: Cardinal (our relay) is faster than Ordinal on the heavy pages (wikipedia cold shown 4623 against 6206 ms on 1.1.0; warm 2249 against 5713 ms) and reliable where public relays are not. 1.2.0 against 1.1.0 inside Cardinal: `mdn` is faster on 1.2.0 (cold shown 5257 against 6360 ms, warm shown 1436 against 1896 ms, 657 against 1275 KB received, n=3), the other four pages are within the spread of 3 reps. Inside Ordinal the two versions are within the spread, except that 1.2.0 lost more `mdn` reps to the crash.

## Fixture sites, no membership (the speed gate setup: alice on our relay stand-in, so "paid-like"), 7 reps, medians
1.1.0 run 2026-11-18 00:51 UTC, 1.2.0 run 2026-11-18 01:32 UTC (R1, `release/1.2.0` with the compact blocklist). Fixtures are local, so this is the cleanest 1.1.0 against 1.2.0 comparison:

| site | phase | 1.1.0 (7 reps) | 1.2.0 (7 reps) |
|---|---|---|---|
| fx-news | cold | 2305 / 3179 (n=7) | 2404 / 3351 (n=7) |
| fx-news | warm | 604 / 1398 (n=7) | 511 / 1275 (n=7) |
| fx-news-fresh | cold | 2436 / 3498 (n=7) | 2365 / 3413 (n=7) |
| fx-news-fresh | warm | 193 / 1270 (n=7) | 194 / 1417 (n=7) |
| fx-app | cold | 2767 / 3458 (n=7) | 2988 / 3488 (n=7) |
| fx-app | warm | 813 / 1308 (n=7) | 927 / 1452 (n=7) |
| fx-slow | cold | 3379 / 3747 (n=7) | 3410 / 3808 (n=7) |
| fx-slow | warm | 382 / 825 (n=7) | 426 / 833 (n=7) |
| fx-article | cold | 1180 / 1677 (n=7) | 1138 / 1665 (n=7) |
| fx-article | warm | 420 / 749 (n=7) | 471 / 874 (n=7) |
| fx-frames | cold | 1539 / 2903 (n=7) | 1506 / 3060 (n=7) |
| fx-frames | warm | 575 / 1706 (n=7) | 645 / 1764 (n=7) |

Repeat runs on three warm rows (R2): see the bisect table in `docs/releases/1.2.0.md` (1.1.0 2026-11-18 04:00 UTC, 1.2.0 2026-11-18 03:47 UTC). Cardinal-with-membership on the fixtures: not measured (the relay path is the same as the table above; skipped for time).

## Real sites, 1.2.0 (R2 run not run for the suite), chromebook, through the VPS stand-in (this VM's home address)
Profile harness (`tests/stack/profile.spec.js`, n=2 reps each, 90 s cap), 1.2.0 only. 1.1.0 on these sites: not measured (time).

| site | shown ms (rep 1, rep 2) | load ms | longest long task ms | frozen page |
|---|---|---|---|---|
| Steam home | 14325, 15043 | 17320, 18743 | 1331, 1363 | no |
| Steam app 730 | 36520, 31900 | 40661, 36039 | 661, 619 | no |
| Reddit r/pics | 2492, 3529 | 12594, 12250 | 2827, 2496 | no |
| Kahoot (kahoot.it) | 23622, 26836 | 31091, 33554 | 5674, 5092 | no |
| Coolmath Games | 5015, 4916 | 8564, 8424 | 7865, 2592 | rep 1: 2 freezes, rep 2: none |
| Discord (discord.com) | 55585, 54682 | not finished | 2898, 3425 | no |
| YouTube home | 14523, 13581 | 22150, 21347 | 3636, 3946 | no |

Real-site suite (`tests/stack/sites.spec.js`, all 42 sites, 1 rep): 28 loaded, 14 did not. Of the six named sites: YouTube, Reddit, Kahoot loaded (shown 14204, 2352, 22964 ms; load 29804, 10897, 30701); Discord did not show within the suite's 45 s cap (the profile run shows it at about 55 s). Steam and Coolmath are not in `real-sites.json`; they are only in the profile table.

## Bot checks (human check card) over the real-sites list
**8 of 42 sites showed the Human Check card:** amazon, apnews, britannica, etsy, imdb, merriam-webster, quizlet, stackoverflow. None of the six named sites (Steam, Reddit, Kahoot, Coolmath, Discord, YouTube) did.
Read this plainly: this was measured from **this VM's home address**, one rep per site, through the VPS stand-in that exits from the same home address. It is NOT the address a paying member gets
from the real VPS in Buffalo (a data-centre address, more likely to be challenged), and not the address of an Ordinal member on a public relay. So 8 of 42 says nothing about how many checks paid members will see. The six other failures are not bot checks:
discord (45 s timeout), ebay (selector not found), khanacademy and tumblr (page script errors), google-docs and google-signin (see below).

## Google popup sign-in (best effort, described)
- The popup bridge itself works on the local fixture: `tests/e2e/popup.spec.js` 3 passed on 2026-11-17 21:44 (Chicago): `window.open` handle, real-origin `postMessage` both ways, closing the popup returns to the opener, switch off keeps the old behaviour.
- Real Google through the proxy (suite run above): `https://accounts.google.com/signin` renders "Sign in - Google Accounts / Use your Google Account / Email or phone" but never becomes interactive: the page script throws
  `K[z] is not a function` ("Error in protected function") and the email field the test waits for never appears. `docs.google.com` sign-in fails the same way. `google.com`, `drive.google.com`, `classroom.google.com` and `microsoft-signin` loaded.
  So Google's own sign-in page does not work in the frame yet, with or without the bridge. Not tried: a real account, a real third-party site whose button opens the Google popup (needs a real Google login, not available overnight).
  The cause is not located (it may be Trusted Types, a missing browser API in the blob document, or embedded-browser policy; POPUP.md lists these as unknown). Nothing was changed for it.

## Not measured
Prime and Executive speeds; the real VPS (Buffalo); Ordinal on fixtures (cannot run); 1.1.0 on the real sites and profile pages; the 3 Mbit/s cap read back from the page; Cardinal on the fixtures with membership on; more than 3 reps on public sites.
