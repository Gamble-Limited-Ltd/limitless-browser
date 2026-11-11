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

## Caveats
- Chromium and chromebook runs were back to back on a shared VM; fixture medians of 7 are reasonably stable, public ones
  (3 reps) are not. Compare with `node scripts/speed-compare.mjs`, which gates only on fixture pages and boot.
- Boot measures the app on the mock GATE sign-in path, not the real GLL ID.
- The `chromium` and `chromebook` public-site numbers include the VM's own internet path.

Last verified: 2026-11-10
