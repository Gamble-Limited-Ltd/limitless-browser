# Games and school sites audit (2026-11-16 to 2026-11-17)

Scope: 30 game and school URLs through the full rehearsal stack, Chromebook profile (1366x768, 4x CPU, 10/5 Mbit, 40 ms RTT), 2 reps per site in fresh contexts. Everything below is labelled MEASURED (a number from a run) or GUESS (reasoning, not yet tested). Companion to `docs/1.1/SPEED-AUDIT.md`; item numbers (1, 2, 2b, 2c, 2d, 8, 9) refer to its section 0.

## 1. Method and machine load

- Harness: `tests/stack/sites-games.spec.js` plus its list `tests/stack/sites-games.json` (new files; `real-sites.json`, `sites.spec.js` untouched) and a private config `playwright.stack.games.config.js` (the shared config's `testMatch` does not match `sites-games`). Run as `LB_GAMES=1 LB_GAMES_REPS=2 flock /tmp/limitless-rehearsal.lock deploy/rehearsal/run.sh -c playwright.stack.games.config.js --project=chromebook --workers=1 tests/stack/sites-games.spec.js`, in batches of 8 to 11 sites, each batch its own lock hold and its own stack build.
- Per load it records: shown and load marks (`__lbPerf`), every libcurl request (the prototype `fetch` is wrapped in the page: URL, status, ms, decoded bytes, wire bytes, error text mapped to the libcurl class), `LB_botCheck` verdicts (wrapped, with a vendor guess), long tasks (`PerformanceObserver`, parent window; the frame sees the same main thread), `usedJSHeapSize`, the fetch queue (`LB_queueState()` sampled every 200 ms: peak and mean queued), console errors, page errors, CSP refusals. In the frame (injected before page scripts): `getContext`, `WebAssembly.*`, `AudioContext` state, pointer lock, fullscreen, `getGamepads`, `Worker`, `SharedArrayBuffer`, `WebAssembly.Memory({shared})`, and the page WebSocket bridge messages. For games the harness clicks the frame centre and presses Space after 6 s (a user gesture), then reads everything after 12 s of dwell.
- "loaded" = shown, no error card, and the site selector exists, or 400+ chars of text without bot wording (same rule as `sites.spec.js`). It is a weak test: Gimkit, Wayground and Canvas pass or fail on selectors while showing an error or 404 page (see 4).
- Machine: Gamble VM, 8 vCPU, shared with 4 other agents queueing on the same flock. Load average at batch starts: 2.9 to 6.0 (1 min), see the run log in 8. Each batch ran after the previous agent released the lock, so most runs had a quiet machine but not an idle one. Relay: the rehearsal relay egresses from the home line, NOT the VPS. Timings are therefore home-IP timings; bot results from the VPS are in section 3.
- Reproducibility: numbers are medians of 2 reps (n is small; rep spread is shown by the two values where it matters). The first batch (16 Nov 19:27 to 21:16, no long-task or heap probes) and the instrumented rerun (16 Nov 22:31 to 17 Nov 03:08) agree within normal run noise on shown and load time (for example roblox-home 25.2 s vs 23.3 s shown). The tables use the instrumented rerun. Long tasks include the app's own boot: the 3-request Canvas page (a 503 from the site) shows about 4 s of long tasks, so subtract about 4 s as the floor.
- Not done: no real sign-in, no CAPTCHA, no real game round. Page WebSockets for games that open them only after Play are therefore not exercised (see 6).

## 2. Results

| site | loaded | shown s | load s | requests | MB | queue peak / mean | long tasks total s / max s | heap MB | bot check | failure kind |
|---|---|---|---|---|---|---|---|---|---|---|
| roblox-home | 2/2 | 23.3 | 59.1 | 290 | 24.0 | 177 / 29.4 | 37.9 / 2.4 | 174 | 200 | ok |
| roblox-game | 2/2 | 27.3 | 69.9 | 571 | 24.1 | 214 / 61.8 | 56.0 / 5.5 | 300 | 200 | ok |
| roblox-login | 2/2 | 32.0 | 70.4 | 518 | 25.6 | 197 / 46.9 | 52.7 / 4.5 | 282 | 200 | ok |
| kahoot-join | 0/2 | - | - | 282 | 12.5 | 1366 / 824.6 | 33.9 / 24.4 | 544 | 200 | timeout |
| kahoot-create | 0/2 | - | - | 1351 | 17.4 | 1352 / 602.8 | 8.4 / 1.2 | 82 | 200 | timeout |
| blooket | 2/2 | 5.9 | 8.3 | 55 | 6.6 | 0 / 0 | 17.3 / 5.7 | 39 | 200 (cloudflare) | ok |
| blooket-join | 2/2 | 5.4 | 8.2 | 56 | 2.0 | 3 / 0.1 | 8.5 / 1.0 | 42 | 200 (cloudflare) | ok |
| gimkit-join | 2/2 | 20.6 | 29.9 | 76 | 19.4 | 31 / 1.5 | 18.6 / 4.4 | 50 | 200 (cloudflare) | ok |
| wayground-join | 0/2 | 33.8 | 58.0 | 607 | 17.8 | 284 / 53.3 | 44.8 / 11.9 | 93 | 200 | render |
| poki-home | 2/2 | 9.6 | 18.8 | 298 | 20.4 | 132 / 61.6 | 17.9 / 1.5 | 50 | 200 (cloudflare) | ok |
| poki-game | 2/2 | 9.8 | 20.1 | 384 | 24.1 | 127 / 40.5 | 20.3 / 1.6 | 70 | 200 (cloudflare) | ok |
| crazygames-home | 1/2 | 24.4 | 34.4 | 885 | 10.9 | 667 / 167 | 30.3 / 3.0 | 104 | 200 (cloudflare) | ok |
| crazygames-game | 2/2 | 10.2 | 15.2 | 286 | 5.2 | 121 / 14.3 | 20.6 / 1.0 | 70 | 404 (cloudflare) | ok |
| 1v1-lol | 2/2 | 10.8 | 16.0 | 399 | 7.4 | 128 / 31.1 | 18.8 / 1.7 | 88 | 200 (cloudflare) | ok |
| slither | 2/2 | 3.1 | 12.0 | 35 | 1.2 | 0 / 0 | 26.5 / 7.3 | 49 | 200 (cloudflare) | ok |
| krunker | 2/2 | 17.9 | 28.9 | 363 | 8.1 | 274 / 42.4 | 17.5 / 2.3 | 121 | 200 (cloudflare) | ok |
| agar | 2/2 | 18.0 | 43.7 | 92 | 9.3 | 5 / 0.1 | 46.1 / 6.7 | 90 | 200 | ok |
| scratch-player | 0/2 | - | - | 49 | 22.9 | 17 / 9.3 | 66.6 / 59.6 | 1197 | 200 | timeout |
| desmos | 2/2 | 28.9 | 36.5 | 16 | 5.9 | 0 / 0 | 31.9 / 20.5 | 63 | 200 | ok |
| khan-lesson | 0/2 | 2.3 | 3.0 | 11 | 0.1 | 0 / 0 | 5.1 / 1.1 | 27 | 200 | script |
| quizlet-home | 2/2 | 10.4 | 16.7 | 132 | 8.1 | 28 / 0.8 | 23.2 / 4.5 | 54 | 200 (cloudflare) | ok |
| quizlet-set | 2/2 | 11.8 | 23.2 | 244 | 9.6 | 83 / 4 | 22.9 / 3.9 | 55 | 200 (cloudflare) | ok |
| prodigy | 2/2 | 11.8 | 31.8 | 108 | 6.5 | 24 / 1.6 | 28.3 / 5.3 | 159 | 200 (cloudflare) | ok |
| ixl | 1/2 | 19.3 | 34.5 | 302 | 19.8 | 168 / 26.5 | 21.1 / 3.2 | 93 | 200 (cloudflare) | ok |
| google-classroom | 2/2 | 11.0 | 22.2 | 207 | 12.2 | 128 / 29.2 | 18.3 / 1.6 | 76 | 200 | ok |
| canvas-login | 0/2 | 1.7 | 2.4 | 3 | 0.0 | 0 / 0 | 4.0 / 0.9 | 20 | 503 | render |
| geoguessr | 2/2 | 8.1 | 18.2 | 68 | 6.1 | 8 / 0.2 | 19.4 / 2.2 | 44 | 200 (cloudflare) | ok |
| chess-com | 0/2 | - | - | - | 0.0 | - | - / - | - | none seen | hang |
| lichess | 2/2 | 9.7 | 15.3 | 152 | 3.4 | 70 / 4.5 | 10.9 / 1.1 | 56 | 200 (cloudflare) | ok |
| wordle | 2/2 | 15.8 | 22.9 | 304 | 8.8 | 220 / 33.6 | 23.1 / 1.4 | 99 | 200 | ok |

Key: shown/load = `__lbPerf` marks in seconds after the navigation started; requests and MB are libcurl requests made by the app for this page (decoded bytes); queue = requests waiting in the app's fetch queue (peak / mean of the samples) and is the best available proxy for queue wait; long tasks are total / longest main-thread task; heap is `usedJSHeapSize` of the whole renderer after 12 s dwell (parent plus frame share one heap).

Game runtime features (games only; canvas count includes nested game iframes where they were read, see the last column):

| site | canvas / WebGL | wasm | page WS opened / msgs | audio | pointer lock, fullscreen, gamepad | threads (Worker / SAB) | top-frame only? |
|---|---|---|---|---|---|---|---|
| poki-game | 0 / webgl,2d,webgl2,off-2d | 0 | 0 / 0 | none | 0, 0, 0 | 0 / 0 | no (nested frames read) |
| crazygames-game | 0 / 2d | 0 | 0 / 0 | none | 0, 0, 1 | 0 / 0 | no (nested frames read) |
| 1v1-lol | 0 / none | 0 | 0 / 0 | none | 0, 0, 1 | 0 / 0 | no (nested frames read) |
| slither | 7 / 2d | 0 | 6 / 0 | none | 0, 0, 0 | 0 / 0 | no (nested frames read) |
| krunker | 4 / none | 0 | 0 / 0 | none | 0, 0, 0 | 1 / 0 | no (nested frames read) |
| agar | 1 / 2d | 0 | 0 / 0 | none | 0, 0, 0 | 0 / 0 | no (nested frames read) |
| scratch-player | 0 / none | 0 | 0 / 0 | none | 0, 0, 0 | 0 / 0 | yes (nested not read) |
| desmos | 1 / 2d,off-2d | 0 | 0 / 0 | none | 0, 0, 0 | 1 / 0 | yes (nested not read) |
| lichess | 0 / none | 0 | 1 / 136 | running | 0, 0, 0 | 0 / 0 | no (nested frames read) |

Child-frame reads: Poki's game frame shows its real contexts in the table; CrazyGames and 1v1 show none because the game frame never loaded (section 6). Common to every game: `crossOriginIsolated` is false and `SharedArrayBuffer` is undefined in the frame on every page (the blob frame has no COOP/COEP and our nginx sends none). Pointer lock was never requested without a click and fullscreen was never requested; audio contexts only exist on Wayground (running) and Lichess (running); every other site created none before the gesture.

### 2b. Likely cause per site (mapped to SPEED-AUDIT and section 4)

Cause strength: MEASURED = the number or error is in the data; GUESS = inferred.

| Site | Likely cause | SPEED-AUDIT item | New |
|---|---|---|---|
| roblox-home, game, login | 23 to 32 s to show, 290 to 570 requests, queue peak 177 to 214, 38 to 56 s of long tasks, 24 MB (MEASURED). Many small images and scripts through one queue on a 4x CPU; libcurl on the main thread (GUESS for the share) | 2c fetch queue, 2b CSS, C1 libcurl Worker | O6: `realtime.roblox.com` socket opens, 0 messages (MEASURED); cause GUESS |
| kahoot-join, kahoot-create | Never shown in 45 s: base64-inlined fonts (O1), queue 1366 and 1352, 8 to 10 abort-class failures at 20 to 25 s, a 22 to 25 s main-thread task and 0.5 GB heap on join (MEASURED) | 2b, 2c | Remaining 20 s task after O1 emulation (section 5) |
| blooket, blooket-join | Loads in 5.4 to 5.9 s (best of the school sites); 8.5 to 17 s of long tasks include the app's own 4 s boot floor | none | O9 (CF JSD script on our origin); Blooket VPS 403 |
| gimkit-join | Font Awesome Pro svg/eot/ttf alternates, 18.9 MB of 19.4 MB (MEASURED) | 2b | O5 module specifier; "An error" text on the loaded page |
| wayground-join | 1.16 MB CSS plus 12 fonts inlined, 607 requests, queue 284, 11.9 s task (MEASURED); page then shows its own 404 view because a dynamic script's SRI blocks it | 2b, 2c | O4 |
| poki-home, poki-game | 20 to 24 MB, 298 to 384 requests mostly ads and trackers; shown in 9.6 to 9.8 s (MEASURED) | 2c | O3 (null body) |
| crazygames-home | 885 requests, queue peak 667, 24 s shown, 1 of 2 reps loaded (MEASURED) | 2c | O5 ChunkLoadError |
| crazygames-game, 1v1-lol | Portal page shows in 10 to 11 s (5 to 7 MB), but the game iframe stays `about:blank` and no canvas is ever created (MEASURED) | 2c | N1: nested game iframe never starts (section 6) |
| slither | Fast page (3.1 s shown, 1.2 MB) but a 7.3 s task from a 224 KB game script (GUESS: rewrite) and every server socket fails (MEASURED) | 1, 2 rewriter | IPv6 literal servers through the relay |
| krunker | 17.9 s shown, 363 requests, queue peak 274, heap 121 MB, one Worker (MEASURED); VPS 403 | 2c, 9 | none |
| agar | 17 aborts at 10 s, 2 resets, 1 TLS error, 43.7 s load, 4.6 MB script, 7 s task (MEASURED); VPS 403 | 1, 2, 2c, 9 | O11 |
| scratch-player | 18.4 MB `projects.bundle.js`, 60 s task, 1.0 to 1.4 GB heap, page froze in rep 2 (MEASURED) | 1, 2, 7 | none, but the worst case seen |
| desmos | One 5.3 MB script, 16 requests, 28.9 s shown, 20.5 s task (MEASURED) | 1, 2 | none |
| khan-lesson | Fastly Client Challenge page, null-body error, 10 s `fastly/logo` timeout (MEASURED) | 9 | O3, O10 |
| quizlet-home, quizlet-set | 48 fonts (0.85 MB), 8 to 10 MB, 11 to 12 s shown (MEASURED); Cloudflare | 2b, 9 | O9, O3 |
| prodigy | Module specifier error, 31.8 s load, 159 MB heap (MEASURED) | 2b | O5 |
| ixl | 19.8 MB, 302 requests, queue 168, 1 of 2 reps loaded (MEASURED; the failed rep had no probe data, cause unknown) | 2c | none |
| google-classroom | 12 MB; external `<use>` sprites blocked (MEASURED); the sign-in popup flow was not tested (landing only) | 8 not exercised | O8 |
| canvas-login | Site returns 503 (MEASURED) | none | none |
| geoguessr | 8.1 s shown, webgl2 works (MEASURED) | none | none |
| chess-com | The main thread froze past 120 s in both reps; no result (MEASURED); the same class as SPEED-AUDIT 2d (Steam), the script that freezes it is not identified | 2d | none; needs a CPU profile |
| lichess | Loads, socket works: 1 socket, 136 messages in 12 s, audio running (MEASURED, 2 reps); 9.7 s shown | none | none |
| wordle | 15.8 s shown, 304 requests, queue 220, 48 fonts 1.5 MB (MEASURED) | 2b, 2c | none |

## 3. Bot checks and blocks

MEASURED, system curl, 2 reps, 1.1 header set (`scripts/probe-challenges.mjs`, home = Gamble VM, vps = `ssh limitless-relay`) plus a status pass (`curl -w`, one rep, same UA):

home/new: n=50, ok 36, challenge 2, blocked 2, error 10; vps/new: n=50, ok 30, challenge 4, blocked 8, error 8. ("error" in the probe script means a bare redirect with no body: Slither, Classroom, Prodigy front pages answer 301/302, and 1v1.lol does not resolve; the status pass shows the real codes. The old-header-set lines are identical to the new ones.)

| host | home, 1.1 headers (2 reps) | vps, 1.1 headers (2 reps) | status pass home | status pass vps |
|---|---|---|---|---|
| www.roblox.com | ok, ok | ok, ok | 200 71353B | 200 71353B |
| kahoot.it | ok, ok | ok, ok | 200 7195B | 200 7195B |
| create.kahoot.it | ok, ok | ok, ok | 200 9870B | 200 9870B |
| www.blooket.com | ok, ok | challenge, challenge | 200 23528B | 403 5566B |
| play.blooket.com | error, error | error, error | 200 24067B | 403 5579B |
| www.gimkit.com | ok, ok | ok, ok | 200 4281B | 200 4281B |
| wayground.com | ok, ok | ok, ok | 200 5790B | 202 0B |
| poki.com | ok, ok | ok, ok | 200 422729B | 200 422746B |
| www.crazygames.com | ok, ok | ok, ok | 200 296688B | 200 296707B |
| 1v1.lol | error, error | error, error | 000 0B | 000 0B |
| slither.io | error, error | error, error | 302 143B | 302 143B |
| krunker.io | ok, ok | blocked, blocked | 200 45390B | 403 55779B |
| agar.io | ok, ok | blocked, blocked | 200 8573B | 403 919B |
| scratch.mit.edu | ok, ok | ok, ok | 200 1502B | 200 1502B |
| www.desmos.com | ok, ok | ok, ok | 200 11136B | 200 11136B |
| www.khanacademy.org | ok, ok | ok, ok | 200 3038B | 200 3038B |
| quizlet.com | ok, ok | challenge, challenge | 403 160464B | 403 160485B |
| www.prodigygame.com | error, error | blocked, blocked | 200 233766B | 403 520B |
| www.ixl.com | ok, ok | ok, ok | 200 259044B | 200 259173B |
| classroom.google.com | error, error | error, error | 302 0B | 302 0B |
| canvas.instructure.com | blocked, blocked | blocked, blocked | 503 35027B | 503 35027B |
| www.geoguessr.com | ok, ok | ok, ok | 200 294468B | 200 294470B |
| www.chess.com | ok, ok | ok, ok | 200 109010B | 200 109060B |
| lichess.org | ok, ok | ok, ok | 200 33332B | 200 33695B |
| www.nytimes.com | challenge, challenge | ok, ok | 200 153198B | 200 153198B |

What the in-app load saw (home egress): every site returned 200 for the document (after one 301, the `http`/`www` canonicalisation), so `LB_botCheck` returned false everywhere. The two exceptions that are bot-related: **Khan Academy** shows a Fastly "Client Challenge" page (title "Client Challenge | is verifying your browser") that `LB_botCheck` does not know (HTTP 200, no Cloudflare marker): the member sees a half-working challenge page, not our Human Check card. **Quizlet** answers 403 with a 160 KB Cloudflare challenge document to plain curl from both vantages, yet the in-app load got 200 and the real page (the app's request hygiene headers pass where bare curl does not). The Blooket and Quizlet loads also request Cloudflare's `/cdn-cgi/challenge-platform/scripts/jsd/main.js` on OUR origin (404 plus MIME refusal in the console; section 4, item N5).

VPS vantage is clearly worse than home: Blooket, Krunker, Agar and Prodigy answer 403 (curl status pass) or challenge from the VPS and 200 from home; Wayground answered 202 empty. This is SPEED-AUDIT item 9 (home egress for challenge-prone hosts): the school/game list needs it more than the generic list did. Canvas (503) and Quizlet (403) fail from both vantages: site policy against curl, not an IP effect. 1v1.lol has no DNS A record any more (NXDOMAIN-like NOERROR/empty from 1.1.1.1 and the VM resolver), so it was replaced by the CrazyGames page for the game of the same name.

HARD LINE respected: nothing here proposes solving a challenge, a solver service, IP rotation, residential egress or a spoofed TLS/JA3 fingerprint. The only bot-related fixes below let the member's own browser run a site's own challenge script to completion and recognise more vendor pages.

## 4. Failure causes, by kind

### 4.1 Ours (fixable in this repo)

| # | Symptom | Sites | Evidence (MEASURED) | Code |
|---|---|---|---|---|
| O1 | Page not shown for 45 s: the CSS stage fetches and base64-inlines EVERY `url()` font and image of every stylesheet, all legacy formats included (eot, svg, ttf, woff, woff2, and every unicode-range subset), and `go()` waits for all of it before it builds the page. This is SPEED-AUDIT item 2b, now with numbers | Kahoot join and create (never shown, 1366 queued requests, 280 and 1351 requests, 12.5 and 17.4 MB), Gimkit (20 s shown, 19.4 MB of which 18.9 MB are Font Awesome Pro svg/eot/ttf alternates), Wayground (1.2 MB css, 12 font requests), Quizlet (48 fonts, 0.85 MB), Wordle (48 fonts, 1.5 MB), Prodigy, CrazyGames | A/B at the fetch layer (section 5): dropping legacy formats and non-Latin subsets takes Gimkit join from 19.3 s to 7.4 s shown (-62 %), 28.5 s to 11.3 s load, 19.9 MB to 2.7 MB, longest long task 4.1 s to 1.1 s | `app/main.js:10686-10721` (`rewriteCssUrls`: every `url()` of the sheet goes into `todo`, `queueFetch` per font with `PRIORITY.font`), awaited at `11063` (`_cssP`); inline `<style>` copy of the loop at about `10795` |
| O2 | A single main-thread task of 20 to 60 s while rewriting one huge script (SPEED-AUDIT items 1 and 2, the rewriter fallback). Scratch's `projects.bundle.js` is 18.4 MB; its player never showed in 45 s (rep 1 later showed at 15 s after a 59.6 s task, rep 2 froze the page for the whole 170 s: the main thread did not answer a probe at 120 s) and held 1.0 to 1.4 GB of heap. Desmos is one 5.3 MB script: 16 requests only, yet 28.9 s shown and a 20.5 s task. Agar (4.6 MB `agario.js`) 6.7 s task, 43.7 s load | Scratch, Desmos, Agar, Slither (7.3 s), Wayground (11.9 s) | long-task columns above; Scratch heap 1197 MB | `rewriteJsAsync` / worker fallback (SPEED-AUDIT 1 and 2), not changed here |
| O3 | `new Response(arr, {status})` with a body for status 204, 205 or 304 throws "Response with null body status cannot have body". Every tracker pixel, beacon or `204` answer rejects the page's fetch, so analytics and challenge scripts error. 6 per load on Poki | Poki home and game (6 per rep each), Quizlet set, Khan (the Fastly challenge cannot complete) | console text "Failed to construct 'Response': Response with null body status cannot have body" on 4 sites | frame fetch shim, `app/main.js:6962` (and the stream branch at `6950`) |
| O4 | Dynamic scripts keep `integrity`: a script injected by the page is swapped to a rewritten `data:` URL but its SRI attribute stays, so the browser blocks it ("Failed to find a valid digest ... data:text/javascript"). Static scripts strip it (`10977`, `11037`, `11055`); the dynamic path does not | Wayground (join page rendered its own 404 view: "404 Uh oh! This road ends here"; the harness called 1 of 2 reps loaded, a false positive) | console error text quoted above | `proxyDynamicScript` / `orderedScriptSwap`, `app/main.js:7213-7240`; comment at `7211` states `type=module` and `setAttribute('src')` injection "stay direct-load" |
| O5 | Relative `import()` and module specifiers inside rewritten module graphs fail: "Failed to resolve module specifier /assets/App-Bo8IqMNZ.js. Invalid relative url or base scheme isn't hierarchical" (Gimkit) and "./dist/chunk-J7NTLVPZ.js" (Prodigy). The ESM rewrite is three regexes, not an AST, so a specifier the regexes miss resolves against a `data:` base | Gimkit (app shows "An error ..." text), Prodigy (`addEventListener of undefined` follows), CrazyGames home ("ChunkLoadError", "Unexpected token <": a chunk URL answered with HTML) | console text | `_esmPatterns`, `app/main.js:10836-10841`; fix idea: use the already vendored acorn to rewrite `import()` with non-literal arguments too |
| O6 | Page WebSocket bridge sends no `Origin`, `Cookie`, `User-Agent` or `Accept-Language`: `new libcurl.WebSocket(url, protocols)` is called with no options, and libcurl.js takes request headers only from `options.headers` | every game with a real multiplayer socket (Slither, Agar, Krunker, Roblox realtime, Lichess worked, so it is server-dependent) | Roblox opens `wss://realtime.roblox.com/` and gets no messages in 12 s dwell, 2 of 2 reps. GUESS: the missing Origin is the reason; NOT yet tested with a header | `app/main.js:6177`; libcurl `CurlWebSocket` takes `options.headers` at `index.html:7795` and `7843` |
| O7 | WebSocket data is base64: every binary frame is base64-encoded in the parent, `postMessage`d as a string, decoded in the frame, and the other direction the same (+33 % bytes plus two CPU passes on a 4x slowed CPU), and the frame class lacks `bufferedAmount` accounting | all multiplayer games (latency), GUESS as to size of the effect; not measured because no game opened a data socket (O6) | code only | `app/main.js:6188-6194` (to frame), `7008-7014` (to parent), `6685-6693` (frame receive) |
| O8 | `<use href="https://.../icons.svg">` external SVG sprites are blocked ("Unsafe attempt to load URL ... from frame with URL blob:"): icons missing on Google for Education pages | Google Classroom landing | console error x2 | proxied attribute list in the frame runtime (not rewritten: no `use` handling); not located to a line, GUESS |
| O9 | Cloudflare bot-detection script `/cdn-cgi/challenge-platform/scripts/jsd/main.js` is requested relative to the proxy origin (our nginx, 404 plus MIME refusal): CF never gets its own telemetry from the page, which can lower the trust score and add challenges on the next request | Blooket, Quizlet (seen); GUESS: every Cloudflare site that injects the JSD script (Blooket and Quizlet: 2 refusals in the 2 reps each) | console "Refused to execute script from http://127.0.0.1:8590/cdn-cgi/challenge-platform/..." | same `setAttribute('src')` direct-load gap as O4 |
| O10 | Fastly "Client Challenge" (Khan) not recognised as a challenge and its own script cannot finish (O3, font CORS error, `fastly/logo` timeout at 10 s) | Khan | title text, console errors | `LB_botCheck`, `app/ui.js:452` (add vendor), O3 |
| O11 | 10 s "connect" deadline aborts large first-party scripts under load: Agar `agario.core.js` and `bundle_end.js` abort at 10.08 s, 17 aborts and 2 resets and 1 TLS error in one load, 43.7 s load, no playable game | Agar, Gimkit (8 aborts, the font alternates), Kahoot (8 to 10 aborts, 20 to 25 s waits in the queue), Scratch (22 aborts) | `failClass` in the data | deadlines: `LB_deadlines`, `runQueue`, `app/main.js:5612-5650`; SPEED-AUDIT item 2c (fetch queue) |

### 4.2 Site policy

| Site | What | Evidence |
|---|---|---|
| Canvas (instructure.com `/login/canvas`) | The Free-for-Teacher host returns 503 plus a "Canvas Lite is live" notice for everyone, also to curl from home and the VPS | status pass; the in-app page is the notice, 3 requests |
| Quizlet | 403 to bare curl from both vantages (Cloudflare managed challenge); passes with the app's request hygiene headers | probe, in-app 200 |
| Khan Academy | Fastly JS challenge on the first visit | page title |
| Blooket, Krunker, Agar, Prodigy, Wayground (VPS only) | Datacenter IP is challenged or 403 from the VPS, 200 from home | probe and status pass |
| 1v1.lol | Domain has no A record now | dig |
| Roblox | Game launch is a native app; the website itself loads, sign-in needs the member's own credentials (not tested) | n/a |

### 4.3 Platform limits (cannot be fixed inside a blob iframe)

- COOP/COEP and `SharedArrayBuffer`: the frame is never cross-origin isolated, so Unity and Godot threaded builds and any `WebAssembly.Memory({shared:true})` user cannot run. No game in this list asked for it (sabNew 0, shared memory 0 on all 8 games), so it did not cost a result today, but Unity WebGL 2023+ multithreaded and Godot 4 default web exports will fail. GUESS for those two engines (not in the list).
- Pointer lock and fullscreen: allowed by the sandbox attributes (`allow-pointer-lock`, `allow="fullscreen"`, `index.html:6677`) but `allow-orientation-lock`, `allow-presentation` and `allow-top-navigation` are missing; not exercised today (no real round).
- Nested portal game iframes become `data:` documents (`proxyIframe`, `app/main.js:7305`, with a 20 s timeout and a 12 s fetch timeout in `buildProxiedIframeHtml`, `8617`): opaque origin, no real `localStorage`, so games that persist saves in the portal's frame depend on the shim. Portal ads that detect a `data:` origin refuse to start.
- Roblox game play needs the desktop client (not a web proxy matter).

## 5. Measured experiment: what removing O1 buys

Fetch-layer emulation (no source change, worktree untouched): `LB_GAMES_FONTLITE=1` makes the page's fetch answer an empty 200 for font files with a legacy extension (eot, svg, ttf, otf) and for woff/woff2 files whose name carries a non-Latin subset word. `rewriteCssUrls` keeps the absolute `url()` when the body is empty, which is what the real fix would do. A/B in one lock hold, same stack, 2 reps, base first (runs `games-fl-base` and `games-fl-lite` in `test-results/`; run log in section 8):

| site | variant | shown s (rep1 / rep2) | load s | requests | MB | font MB | font requests skipped | longest task s | outcome |
|---|---|---|---|---|---|---|---|---|---|
| gimkit-join | base | 19.3 / 20.0 | 28.5 / 28.8 | 76 / 76 | 19.4 / 19.4 | 18.5 / 18.5 | 0 / 0 | 4.1 / 4.1 | shown / shown |
| gimkit-join | font-lite | 7.7 / 7.4 | 11.6 / 11.3 | 50 / 50 | 2.6 / 2.6 | 1.7 / 1.7 | 47 / 47 | 1.0 / 1.2 | shown / shown |
| kahoot-join | base | - / - | - / - | 270 / 295 | 12.3 / 12.7 | 2.9 / 3.3 | 0 / 0 | 21.9 / 25.5 | timeout / timeout |
| kahoot-join | font-lite | - / - | - / - | 231 / 145 | 12.4 / 10.8 | 3.0 / 1.4 | 365 / 144 | 22.7 / 19.6 | timeout / timeout |
| kahoot-create | base | - / - | - / - | 1250 / 1382 | 16.2 / 17.8 | 15.5 / 17.1 | 0 / 0 | 1.3 / 1.2 | timeout / timeout |
| kahoot-create | font-lite | - / - | - / - | 439 / 439 | 7.9 / 7.9 | 7.2 / 7.2 | 1393 / 1485 | 1.9 / 1.8 | timeout / timeout |

Reading: Gimkit join is the clean win (shown -62 %, load -60 %, bytes -86 %). Kahoot still never shows within 45 s even with 365 and 1393 font requests skipped: a 19 to 22 s main-thread task remains in `kahoot-join` (GUESS: parsing or serialising the multi-megabyte stylesheet text with base64 data URIs and the 614 KB `fonts.css`; needs a CPU profile, `tests/stack/profile.spec.js` is the other agent's tool), and `kahoot-create` is down from 1250 to 439 requests but not enough. So O1 alone is not the whole Kahoot fix; it must be paired with "do not inline fonts at all, leave them as lazy absolute URLs the runtime serves on demand".

## 6. Games: what we know and do not know

- MEASURED: canvas and WebGL contexts are created on Poki (webgl), Blooket (webgl2 + 2d), Geoguessr (webgl2), Wordle (webgl, 2d), CrazyGames game (2d), Slither (2d x 7), Agar (2d), Desmos (2d + offscreen 2d). Audio contexts: none created before a gesture except Lichess and Wayground (running).
- MEASURED: Slither opens 6 page WebSockets to IPv6 literal servers (`ws://[2604:...]/ptc`) and gets 25 `error` events, 0 messages, both reps. The relay path has no IPv6 egress in the rehearsal (GUESS for the cause: needs a check on the VPS relay and on the member's connection; many school networks are IPv4 only, so the game would hand them IPv4 servers in the real case). It is a rehearsal artefact until proven on the VPS.
- MEASURED: Lichess lobby socket works through the bridge (1 open, 93 messages in 12 s, 150 requests, shown 9.7 s, load 15.6 s, single smoke run, Chromebook profile). So the bridge itself is sound; the failures above are about the handshake headers (O6) and about getting the game script to run (O2, O5).
- NOT MEASURED: any real gameplay frame rate, input latency, or bridge round-trip. Roblox, Krunker, Agar, Slither need Play to open the game socket; the harness clicked the frame centre but the games' menus need real nick entry and server selection. A follow-up would drive each game's own Play flow.
- MEASURED (second pass reading child frames, `games-n2-nested`, 2 reps each): Poki's game frame (a `data:` document) reached 2d x3, webgl x2 and webgl2 x2 contexts, so a WebGL game starts inside the nested frame. The CrazyGames game page and the 1v1.lol page created NO canvas context in any child frame and their game frames were still `about:blank` after 12 s of dwell: the game iframe is swapped to `about:blank` when `proxyIframe` times out (20 s, `app/main.js:7312`) or the 12 s portal fetch times out (`app/main.js:8622`) or the answer is not HTML. In the run data the portal page showed in 10 to 11 s and the game never started (MEASURED); the cause inside that frame is not identified (GUESS: the 12 s `buildProxiedIframeHtml` timeout under queue pressure, queue peak 121 to 128). This is a real, game-class failure, not a harness gap.
- MEASURED: Krunker's frames show 4 top-frame canvases and 1 Worker but no WebGL context was created in 12 s (the menu runs on 2d/DOM; WebGL starts after Play, not exercised). Agar created one 2d canvas and no socket before Play.
- MEASURED: Lichess, second pass: 1 page socket opened, 136 messages in 12 s dwell, audio context running (the first pass was 93 messages), shown 9.7 s, so socket plus audio both work through the bridge.

## 7. Ranked list: new fixes and speedups

Effect is measured only where stated. Effort: S = hours, M = a day or two, L = a week.

| Rank | Fix | Effect | Effort | Risk | Basis |
|---|---|---|---|---|---|
| 1 | O1: stop inlining fonts and CSS images as base64; keep the absolute `url()` for fonts (lazy via the runtime or the service worker lane, item 2e), at minimum skip legacy formats and non-Latin subsets and cap images | Gimkit join shown 19.3 s to 7.4 s, 19.9 MB to 2.7 MB (MEASURED, fetch-layer emulation); Kahoot create 1250 to 439 requests (MEASURED), the rest GUESS | S for the skip rules, M for lazy fonts | low: missing font falls back to system | measured |
| 2 | O2: cap or skip the rewrite of scripts over about 2 MB and never fall back to the main thread (SPEED-AUDIT 1 and 2), plus yield | removes 20 to 60 s freezes on Scratch, Desmos, Chess.com (probe hung 120 s in both reps), Agar | M | medium: unrewritten script may read `location` wrong | measured long tasks; the fix effect is GUESS |
| 3 | O3: pass `null` body for 101/204/205/304 in the frame fetch shim | clears tracker and challenge errors on Poki, Khan, Quizlet set; lets the Khan challenge finish | S (1 line) | none | measured errors |
| 4 | O4: remove `integrity` on every proxied dynamic script and route `setAttribute('src')` the same way as `.src` | Wayground join page, Cloudflare JSD on every CF site | S to M | low | measured errors |
| 5 | O5: AST rewrite of `import()` / `import` specifiers (reuse acorn) | Gimkit, Prodigy, CrazyGames chunks | M | medium | measured errors |
| 6 | O6: pass `{headers:{Origin: page origin, 'User-Agent': ..., 'Accept-Language': ...}}` to `libcurl.WebSocket` (the member's own browser headers, nothing spoofed) and the cookies for that origin | GUESS: Roblox realtime and multiplayer games start getting messages; first step is a one-site test | S | low | partly guess |
| 7 | Home egress for the school/game challenge list (SPEED-AUDIT 9): Blooket, Krunker, Agar, Prodigy, Wayground | VPS 403/challenge to home 200 (MEASURED by probe) | M | Boss decision | measured |
| 8 | Add Fastly "Client Challenge" and Cloudflare `cf-mitigated` text to `LB_botCheck` so the member gets the honest card or can run the challenge | UX clarity on Khan | S | low | measured |
| 9 | Fetch queue priority (SPEED-AUDIT 2c): scripts and CSS before images and fonts, images by viewport; Roblox peaks at 214 queued with 60 s load, CrazyGames home at 667 | Roblox load 60 s, CrazyGames home 34 s | M | medium | measured queue, fix GUESS |
| 10 | WebSocket bridge: transfer `ArrayBuffer` instead of base64 and a binary fast path (O7) | GUESS, +33 % bytes and two passes per frame | M | low | guess |
| 11 | Cache game WASM/asset bundles: the response cache already stores 200 responses with `max-age`; add a size-aware "immutable hashed asset" rule (long `max-age` or name with a content hash) so repeat visits skip 5 to 25 MB (Roblox 24 MB, Poki 24 MB, Krunker 8 MB, Agar 9 MB per load, all CLEARED because each rep starts cold) | repeat load GUESS 50 to 80 % bytes saved; first load unchanged | M | low | bytes measured, saving guess |
| 12 | Streaming large assets: hand the frame a stream for `.wasm`, `.unityweb`, `.data` and large `.js` instead of one `ArrayBuffer` copy per request (`r.buf.slice(0)` at `8761`), to cut peak heap on Chromebooks (Scratch 1.0 to 1.4 GB) | heap and a copy per asset | M | medium | heap measured, saving guess |
| 13 | `<use href>` external sprites (O8) | icons on Google for Education | S | low | measured error |
| 14 | Sandbox: add `allow-presentation allow-orientation-lock` to the frame (`index.html:6677`), test fullscreen/pointer lock on a real round | games that request orientation lock | S | security review | guess |
| 3b | N1: find why the CrazyGames and 1v1 game iframes stay `about:blank` (iframe fetch timeouts 12 s and 20 s, `app/main.js:8622`, `7312`; scale them with the queue, fall back to a real load of the portal's `data:` build) | the two most-played portal games do not start today (MEASURED), Poki's does | M | medium | measured, cause GUESS |
| 15 | Harness: add Play-flow drivers per game, record bridge round-trip and frame rate | closes the "NOT MEASURED" items in section 6 | M | none | n/a |

## 8. Run log and artefacts

```
n1 start 22:31:31 load 2.94 2.59 7.57
n1 end 23:18:52 rc=0 load 3.95 6.00 5.61
n2 start 23:18:52 load 3.95 6.00 5.61
n2 end 00:45:15 rc=0 load 2.98 3.73 3.86
n3 start 00:45:15 load 2.98 3.73 3.86
n3 end 01:43:56 rc=0 load 3.18 4.16 3.99
flbase start 01:43:56 load 3.18 4.16 3.99
flbase end 02:25:35 rc=0 load 2.92 3.61 4.11
fllite start 02:25:35 load 2.92 3.61 4.11
fllite end 02:42:25 rc=0 load 4.63 5.31 4.70
ALLDONE
d1 start 02:42:29
d1 end 03:08:30 rc=0
ALLDONE2
g1 start 03:08:59
g1 end 03:48:53 rc=0
ALLDONE3
```
First pass (before the instrumentation was added), `games-batches.log`:
```
batch 1 start 19:27:46 load 3.61 3.51 4.52
batch 1 end 20:31:08 rc=0 load 5.96 7.41 6.97
batch 2 start 20:31:08 load 5.96 7.41 6.97
batch 2 end 21:16:30 rc=0 load 3.35 3.41 3.93
batch 3 start 21:16:30 load 3.35 3.41 3.93
```
- Raw per-site JSON (requests, failure examples, bot verdicts, long tasks, heap, nested frames): `test-results/games-audit/` (first pass, no long-task probes), `test-results/games-n1/` (instrumented, tables above), `test-results/games-n1-diag/` (Chess.com and Scratch 120 s watchdog), `test-results/games-n2-nested/` (nested game frames), `test-results/games-fl-base/` and `games-fl-lite/` (font experiment). Scratch notes and logs are under the session scratchpad.
- Not committed (task rule). New files: `tests/stack/sites-games.spec.js`, `tests/stack/sites-games.json`, `playwright.stack.games.config.js`, this document.
