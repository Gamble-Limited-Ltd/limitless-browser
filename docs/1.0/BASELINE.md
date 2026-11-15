# Limitless 1.0: baseline (0.2.3, c88ce5e)

T0 measurement from `docs/1.0/TESTING.md` section 2. All numbers are medians. Raw files (not committed, `test-results/` is
ignored): `speed-c88ce5e-chromium.json`, `speed-c88ce5e-chromebook.json`.

- **Date:** 2026-11-10 (chromium run started 15:43 Chicago, chromebook run about 16:20 to 17:00).
- **Machine:** Gamble VM, Debian 13, kernel 6.12.113, 8 vCPU Intel Xeon E5-2670 @ 2.60 GHz, 19 GiB RAM, other GLL
  containers running as usual (not a quiet machine). Playwright 1.64.0, chromium-1248.
- **Build under test:** commit `c88ce5e` (0.2.3) checked out in a separate worktree; only the harness files of this branch
  (`tests/lib`, `tests/fixtures`, `tests/stack/speed*`, `playwright.stack.config.js`, `deploy/rehearsal/*`) were copied over it.
  The gate image was built from the current `~/limitless-gate` checkout (the rehearsal always does that), not from the
  gate that was current at 0.2.3. The relay is the pinned epoxy build with the test-only fixture config.
- **Method:** fresh browser context per rep, signed in as the mock user, address bar navigation. `cold` = first load in that
  context, `warm` = same URL again (response cache in IndexedDB). 7 reps on fixture pages and boot, 3 reps on public sites.
  `chromebook` project = 1366x768, 4x CPU throttle, 10 Mbit/s down, 5 Mbit/s up, 40 ms RTT; `chromium` = unthrottled.
  Throttling applies to the browser only, so server-side delays (the slow fixture) are real time.
- **Columns:** `shown` = overlay hidden (page visible), `load` = iframe load event, both in ms from the start of the
  navigation. `KB` = bytes that crossed the browser's network (HTTP encoded size plus WebSocket frames) during the load.
  Long tasks are counted while the page is scrolled for 1.5 s.

## Fixture pages (these are the gate)
| Page | Project | cold shown | cold load | cold KB | warm shown | warm load | warm KB |
|---|---|---|---|---|---|---|---|
| fx-news (60 img, 12 js, 4 css) | chromium | 1126 | 1575 | 753 | 225 | 682 | 17 |
| fx-news | chromebook | 3829 | 7262 | 753 | 692 | 4213 | 17 |
| fx-app (24 ES modules) | chromium | 756 | 872 | 161 | 246 | 347 | 0 |
| fx-app | chromebook | 2627 | 3188 | 161 | 776 | 1245 | 0 |
| fx-slow (5 s image, 2 s script) | chromium | 7347 | 7405 | 23 | 128 | 197 | 1 |
| fx-slow | chromebook | 8417 | 8823 | 22 | 452 | 792 | 1 |
| fx-article (long text) | chromium | 237 | 416 | 67 | 153 | 260 | 63 |
| fx-article | chromebook | 1124 | 1503 | 67 | 563 | 954 | 63 |
| fx-frames (3 iframes) | chromium | 401 | 771 | 13 | 199 | 482 | 5 |
| fx-frames | chromebook | 1501 | 2677 | 14 | 534 | 1564 | 5 |

First-byte medians (cold / warm): fx-news 252 / 118 ms (chromium), 1035 / 411 ms (chromebook).

Observations that set the 1.0 targets:
- **Slow image:** 0.2.3 shows the page only after the slow resources finish (fx-slow cold shown 7.3 s unthrottled, 8.4 s on
  the Chromebook profile, against a 5 s image). Target: shown before the image finishes.
- **Transfer size:** fx-news is 753 KB over the wire for about 740 KB of content, so nothing is compressed on the way to the
  browser today (the target is 40 % smaller cold).
- **Warm heavy page:** fx-news warm shown is 692 ms and load 4.2 s on the Chromebook profile (target: shown at least 40 %
  faster, so under about 415 ms).
- Long tasks while scrolling: none on any fixture page (so no scroll jank signal to improve on the fixtures).

## Boot (7 reps)
| Project | cold: splash hidden | cold: start page interactive | repeat (reload): splash hidden | repeat: interactive |
|---|---|---|---|---|
| chromium | 1460 | 1460 | 909 | 909 |
| chromebook | 5697 | 5697 | 3848 | 3848 |

Cold = the sign-in landing page in a fresh context (nothing cached), repeat = `page.reload()`. In 0.2.3 the splash hides in
the same 20 ms poll as the start page becoming interactive, so the two columns are equal. Target from section 6: repeat
open, start page interactive, under 1.0 s on the Chromebook profile (today 3848 ms).

## In-page timings, fx-news (last rep, app's own functions)
| Project | DOMParser on the news HTML (17.5 KB) | `LB_rewrite.sync` over the 12 scripts (295 KB) |
|---|---|---|
| chromium | 1 ms | 121 ms |
| chromebook | 4 ms | 680 ms |

## Public sites (reported, not gated; 3 reps, internet noise)
| Site | chromium cold shown / load (KB) | chromium warm shown / load | chromebook cold shown / load (KB) | chromebook warm shown / load |
|---|---|---|---|---|
| example | 524 / 625 (15) | 138 / 203 | 1897 / 2292 (15) | 396 / 677 |
| wikipedia | 2582 / 3698 (874) | 1185 / 1816 | 6810 / 10219 (634) | 2700 / 6318 |
| mdn | 2264 / 3102 (1274) | 682 / 1440 | 6865 / 11198 (1270) | 1854 / 5259 |
| npr-text | 618 / 800 (19) | 138 / 214 | 1339 / 1736 (19) | 398 / 700 |
| hacker-news | 1207 / 1339 (24) | 232 / 408 | 2444 / 3317 (24) | 520 / 1107 |
| sqlite-docs | 974 / 1117 (44) | 51 / 225 | 2207 / 2598 (43) | 108 / 745 |
| python-docs | 902 / 1338 (101) | 177 / 377 | 2640 / 4170 (101) | 620 / 1804 |

Wikipedia is the only page with long tasks while scrolling: chromium 1 task / 52 ms cold; chromebook 5 tasks / 657 ms cold
and 10 tasks / 1106 ms warm.

## Home link (2026-11-10, 15:07 to 15:42 Chicago, not a quiet hour)
Measured from the VM with curl against Cloudflare's speed endpoints, no personal data (`RELAY.md` 2.1).
- **Download:** 104 Mbit/s median (104.1, 113.5, 101.6; 25 MB bodies, the 100 MB request is refused with HTTP 403 now).
- **Upload:** 21 Mbit/s median (21.8, 21.2 and 2.5 Mbit/s; the 2.5 looks like an outlier, three more runs gave 22.2, 22.2
  and 22.1 Mbit/s, bodies of 25 MB, one TCP stream).
- **Latency to Cloudflare:** TCP connect 30 ms median (27 to 32 ms, 7 samples); time to first byte on an empty download
  154 ms median (TLS and request included).
- **Meaning:** the home upload is about 21 Mbit/s for one stream, below one member's 50 Mbit/s cap, so two or three members
  streaming at once already fill it. `TOTAL_UPLINK_MBPS` in `RELAY.md` 3.5 would be 21 x 0.85 = about 18 on this evidence;
  a multi-stream test could show a higher ceiling.

## S2 candidate (startup slice, branch `slice/1.0-s2`, 2026-11-10)
Same machine and harness as above, measured with the S2 code against `c88ce5e` re-run the same evening (`tests/stack/boot-size.spec.js`, 7 reps each, fresh contexts; fixture pages with
`npm run test:speed`, `LB_SPEED_PUBLIC_REPS=0`). Other sessions shared the VM (rehearsal runs were serialised with `flock /tmp/limitless-rehearsal.lock`).
`cold` = the load after Continue at the mock GATE (nothing cached); `repeat` = reload right after; `warm worker` = reload after the service worker installed. KB = bytes on the wire.

| Project | Build | cold: interactive (ms) | cold KB | repeat: interactive (ms) | repeat KB | warm worker: interactive (ms) | warm KB |
|---|---|---|---|---|---|---|---|
| chromium | c88ce5e | 1528 | 2565 | 965 | 1376 | 872 | 1376 |
| chromium | S2 | 1058 | 1042 | 608 | 3 | 1004 | 1 |
| chromebook | c88ce5e | 5352 | 2565 | 3703 | 1376 | 3830 | 1376 |
| chromebook | S2 | 4028 | 1042 | 2701 | 3 | 2813 | 1 |

- **Cold transfer:** 2565 KB to 1042 KB, 59 % smaller (target: at least 40 %). `index.html` is 268 KB brotli (was about 978 KB); the libcurl WASM is 536 KB brotli.
- **Repeat open, start page interactive, Chromebook profile:** 3703 ms to 2701 ms (27 % faster). **Target under 1.0 s: not met.** The time left is script parse and run of the 1 MB main script under 4x CPU (about 1.2 s of it in an
  unthrottled-network 4x-CPU profile) plus revalidation round trips. In an experiment (not shipped, not committed) moving that one script to an external file so V8 can code-cache it cut splash from about 1360 ms to about 1040 ms at 4x CPU;
  it touches the code S1 is editing, so it is best done as a mechanical step after S1 merges. Lazy subsystems (3.4) were not built (see SPEED.md S2 notes).
- **Service worker:** the warm-worker reload is not faster than the HTTP-cache repeat, because page loads are deliberately network first (the gate answers every open). Its value is offline-safe precache and fewer revalidations of theme files.
- **Fixture pages, Chromebook profile, S2 vs c88ce5e (`scripts/speed-compare.mjs`):** no page metric is slower than 10 % and 100 ms except fx-frames cold firstBytes (818 to 923 ms, +12.8 %, 5 ms over the gate; cold dom the same row; other fx-frames metrics are equal or faster).
  This is inside the run-to-run spread seen elsewhere in the table (fx-slow cold firstBytes +8 %, fx-article cold firstBytes -12 %); S2 does not touch `go()`. Chromium project: gate passed. The service worker is registered 8 s after load (so its precache does not compete with the first page).


## Real-site suite (S3, 2026-11-10 to 11-11)
`tests/stack/sites.spec.js` (TESTING 6a), chromebook profile, 3 reps per site, fresh context each, 2 workers, mock GATE, rehearsal relay on the Gamble VM's home line. A rep **loads** when the page is shown, no error card appears, and the site's selector is in the proxied frame or the frame holds 400+ characters of text without bot-check wording. Files: `docs/1.0/baseline/sites-c88ce5e.json` (0.2.3), `sites-798dcb0.json` (release/1.0.0 before S3), `sites-s3.json` (S3 head). Shown/load medians are over reps that loaded.

**Read this with care.** The VM is shared and was busy (load 8 to 14 during the runs); an earlier pass with 3 workers drove load past 30 and the gate timed out (504), so those numbers were discarded. Differences of a few points are noise. 0.2.3 and release missed 2 sites each (test timeout), S3 ran 41 of 42; amazon, mdn, walmart, duolingo are not in every column. One-worker spot checks of wikipedia, mdn, python-docs on release loaded 3/3, so the "hang" and "timeout" rows below are mostly load and heavy sites, not a regression.

| Build | Sites | Reps | Loaded | Success rate | Median shown (ms) | Median load (ms) |
|---|---|---|---|---|---|---|
| 0.2.3 | 40 | 120 | 80 | 67 % | 12248 | 23063 |
| release | 40 | 120 | 79 | 66 % | 10043 | 20182 |
| S3 | 41 | 123 | 81 | 66 % | 9051 | 19859 |

Failures by category (reps that did not load; site x reps):

| Category | 0.2.3 | release | S3 |
|---|---|---|---|
| connect | amazon x1, github x1 | quizlet x2 | amazon x1 |
| csp | etsy x3 | etsy x3 | etsy x3 |
| script | duolingo x1, google-docs x1, google-signin x1, khanacademy x3, tumblr x3 | google-docs x1, khanacademy x3, tumblr x3 | khanacademy x3 |
| render | amazon x2, ebay x1, google-docs x2, google-signin x2, imdb x3, microsoft-signin x1, pinterest x2, twitch x1, youtube x1 | google-docs x2, google-signin x3, imdb x3, pinterest x3, twitch x1 | amazon x1, google-docs x3, google-signin x3, imdb x3, pinterest x3, stackoverflow x3, tumblr x3 |
| timeout | discord x3, kahoot x3, youtube x2 | discord x3, kahoot x3, quizlet x1, youtube x3 | discord x3, kahoot x3, spotify x1, w3schools x1, youtube x3 |
| hang | github x1, quizlet x1 | github x3, w3schools x2 | amazon x1, github x3, w3schools x1 |
| harness | stackoverflow x1 | stackoverflow x2 | - |

Per site (loaded reps / reps, median shown ms):

| Site | Group | 0.2.3 | release | S3 |
|---|---|---|---|---|
| amazon | shopping | 0/3 | - | 0/3 |
| apnews | news | 3/3 (18882) | 3/3 (20080) | 3/3 (21084) |
| bbc | news | 3/3 (14085) | 3/3 (12961) | 3/3 (12190) |
| bing | search | 3/3 (2590) | 3/3 (2932) | 3/3 (3213) |
| britannica | reference | 3/3 (8744) | 3/3 (6583) | 3/3 (6716) |
| canvas-login | school | 3/3 (1446) | 3/3 (1550) | 3/3 (1612) |
| cnn | news | 3/3 (1849) | 3/3 (1818) | 3/3 (1708) |
| desmos | school | 3/3 (8005) | 3/3 (29138) | 3/3 (28643) |
| discord | social | 0/3 | 0/3 | 0/3 |
| duckduckgo | search | 3/3 (12306) | 3/3 (12371) | 3/3 (12743) |
| duolingo | school | 2/3 (12401) | - | 3/3 (9234) |
| ebay | shopping | 2/3 (20465) | 3/3 (32890) | - |
| etsy | shopping | 0/3 | 0/3 | 0/3 |
| github | docs | 1/3 (16002) | 0/3 | 0/3 |
| google | search | 3/3 (6880) | 3/3 (5321) | 3/3 (5766) |
| google-classroom | school | 3/3 (12543) | 3/3 (12628) | 3/3 (12827) |
| google-docs | school | 0/3 | 0/3 | 0/3 |
| google-drive | school | 3/3 (25541) | 3/3 (17330) | 3/3 (15172) |
| google-signin | school | 0/3 | 0/3 | 0/3 |
| guardian | news | 3/3 (11264) | 3/3 (8309) | 3/3 (8285) |
| imdb | other | 0/3 | 0/3 | 0/3 |
| kahoot | school | 0/3 | 0/3 | 0/3 |
| khanacademy | school | 0/3 | 0/3 | 0/3 |
| mdn | docs | - | 3/3 (6247) | 3/3 (6296) |
| merriam-webster | reference | 3/3 (12635) | 3/3 (13281) | 3/3 (12615) |
| microsoft-signin | school | 2/3 (2105) | 3/3 (2299) | 3/3 (2742) |
| npr | news | 3/3 (21253) | 3/3 (10043) | 3/3 (11482) |
| pinterest | social | 1/3 (13025) | 0/3 | 0/3 |
| python-docs | docs | 3/3 (2561) | 3/3 (2900) | 3/3 (2939) |
| quizlet | school | 2/3 (15550) | 0/3 | 3/3 (12383) |
| reddit | social | 3/3 (3866) | 3/3 (3342) | 3/3 (3418) |
| spotify | other | 3/3 (35440) | 3/3 (36812) | 2/3 (38626) |
| stackoverflow | docs | 2/3 (12983) | 1/3 (14778) | 0/3 |
| tumblr | social | 0/3 | 0/3 | 0/3 |
| twitch | video | 2/3 (20481) | 2/3 (20325) | 3/3 (19664) |
| vimeo | video | 3/3 (26764) | 3/3 (20186) | 3/3 (20387) |
| w3schools | docs | 3/3 (10748) | 1/3 (23148) | 1/3 (9051) |
| walmart | shopping | - | 3/3 (37693) | 3/3 (31180) |
| weather | news | 3/3 (6799) | 3/3 (6605) | 3/3 (7181) |
| wikihow | reference | 3/3 (15959) | 3/3 (8828) | 3/3 (8588) |
| wikipedia | reference | 3/3 (8617) | 3/3 (7645) | 3/3 (7375) |
| youtube | video | 0/3 | 0/3 | 0/3 |

### What the numbers say
- Success rate: 0.2.3 67 %, release 66 %, S3 66 % (80, 79 and 81 loaded reps). No change within noise: the S3 features speed up repeat visits, they do not fix sites that fail on first load.
- Median shown (loaded reps): 12.2 s, 10.0 s, 9.1 s. Median load: 23.1 s, 20.2 s, 19.9 s. The shown time is dominated by the heavy sites (news, social, Desmos, Quizlet) on the 4x CPU, 10 Mbit profile.
- Fixed in the client (S3): `window.postMessage` with a fake or "null" target origin threw or dropped the message in proxied frames (Microsoft sign-in "Invalid target origin 'null'"); test `tests/e2e/s3-sites.spec.js`. Microsoft sign-in did not show in the final S3 column as a failure.
- Not fixed, cause in the client or the page and needs more work: Tumblr (React hydration error #418, the injected head nodes change the document before hydration), Khan Academy (bot check "Client Challenge"), Google sign-in and Google Docs (page text renders, the email field never appears within 12 s), IMDb, Pinterest, Etsy (CSP refusal of a script, `x3`), OneTrust cookie banners throw `hasAttribute` of null in Duolingo and NPR (the script looks up its own `<script src>` which we replace with a data: URL).
- For S4 (server and relay side): `connect` (error code 7, could not connect) on Amazon, GitHub, Quizlet; `ERR_SSL`/error 35 on Reddit's tracker host; Guardian "missing ) after argument list" in one bundle (looks truncated in transit); Cloudflare and Akamai bot checks on Khan Academy, Merriam-Webster, Britannica from a datacenter-looking address; timeouts on Discord, Kahoot, YouTube (never shown in 45 s in every column, same in 0.2.3).
- Not verified: Discord, Kahoot, YouTube, Google Classroom/Docs "not shown in 45 s". Nobody has looked at why; first suspect is the 12 s per-script wait stacking over many scripts at 4x CPU.


## S3 speed targets (fixtures, chromebook profile, medians of 7, one run on 2026-11-10)
Measured with the S3 code **before** the last two changes (page-cache lookup moved beside the fetch, stores opened when idle); the raw JSON was not kept and it was not re-measured after, because the coordinator ended the test runs. The machine was shared and busy.

| Metric | 0.2.3 | S3 | Target | Met |
|---|---|---|---|---|
| fx-news warm shown (ms) | 692 | 682 | -40 % (about 415) | No. The fixture HTML is `no-cache` without a validator, so every visit still fetches it; the page cache needs explicit freshness. A `fx-news-fresh` fixture (same page, `max-age=300`) was added but not measured. |
| fx-news cold shown / warm load (ms) | 3829 / 4213 | 2884 / 1574 | report | Better |
| fx-slow cold shown (ms) | 8417 | 3480 | before the 5 s image | Yes |
| Repeat open, start page interactive (ms) | 3848 | 2046 | under 1000 | No (-47 %) |
| Cold transfer fx-news (KB) | 753 | 521 | -40 % | No for this page (-31 %); the S2 boot-size run showed -59 % for the app shell |
| Back | full reload | under 150 ms in `s3-back.spec.js` on a quiet run | under 150 ms | Yes in the test (one loaded run read 259 ms) |
| Regression gate (10 % and 100 ms) | | cold firstBytes of fx-article and fx-frames +34 % | none | Failed in that run; the likely cause (the page-cache store being created before the first fetch) was changed afterwards and not re-measured. Re-run `npm run test:speed` and `speed-compare` before release. |

## Caveats
- Chromium and chromebook runs were back to back on a shared VM; fixture medians of 7 are reasonably stable, public ones
  (3 reps) are not. Compare with `node scripts/speed-compare.mjs`, which gates only on fixture pages and boot.
- Boot measures the app on the mock GATE sign-in path, not the real GLL ID.
- The `chromium` and `chromebook` public-site numbers include the VM's own internet path.

## Test speed-up and first quick run (2026-11-12, `slice/1.0-testspeed`, release/1.0.0 plus test changes)
- **e2e (`npm test`, 137 tests):** 140 s wall before, 114 s after (`fullyParallel`, `page.clock`, no fixed wait); VM load average was 6 to 9 from other agents, so both numbers are inflated.
- **Quick speed run (`npm run test:speed:quick`, chromebook, fixtures, 3 reps):** 10.4 min of tests (plus the first image build, about 8 min on a cold Rust cache; quick wall 18.7 min). Old equivalent: about 35 to 40 min per project.
- **Quick run vs 0.2.3 (`speed-compare.mjs`, medians of 3, loaded VM):** fx-slow cold shown 8354 to 3259 ms (-61 %), fx-article, fx-frames, fx-app cold unchanged within noise, warm shown 12 to 28 % faster on slow, article, app; fx-news cold rx 770 KB to 533 KB (-31 %). The tool flagged 9 regressions, all on fx-news and fx-app first-byte/dom/shown, which were the first pages after boot under load. Re-running only those two: fx-news cold shown 2961 ms (0.2.3: 3656, so faster), but then fx-app was the slow one (6239 ms), i.e. noise from a busy VM, not a code effect. Treat quick-run gates as advisory until run on a quiet machine; the release gate is the full run.
- **Boot (3 reps):** cold 3659 ms, repeat 2119 ms (0.2.3: 5697 and 3848 ms).
- **Real-site smoke list (12 sites):** not completed (stopped on Boss's wrap-up request). Resume: `flock /tmp/limitless-rehearsal.lock npm run test:sites:smoke`.
- **Full release-gate set** (`scripts/speed-nightly.sh`) was not run: estimated about 2 h (speed about 1 h, 42 sites at 1 worker about 1 h). No timer is scheduled.

Last verified: 2026-11-10
