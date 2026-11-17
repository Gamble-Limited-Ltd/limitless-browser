# Limitless: social, media, shopping and app site audit (2026-11-16)

Scope: 30 front pages or pages (YouTube home, watch and Shorts, TikTok, Instagram, X, Twitch, Spotify, SoundCloud, Pinterest, Tumblr, Discord, ChatGPT, Gemini, Canva, Google Docs, Drive, Gmail, Amazon, eBay, Walmart, Wikipedia, ESPN, CNN, BBC, IMDb, Netflix, Duolingo, Character.ai, Crunchyroll). Branch `audit/speed-2026-11-16`, app sha at HEAD of the worktree. Related: `docs/1.1/SPEED-AUDIT.md` (item numbers below are its section 0 numbers), `docs/1.1/BOTCHECK.md`, `docs/1.1/audit/PROFILE-RESULTS.md`.

Labels: **[M]** measured in this audit, **[C]** read from code (file:line in `app/main.js` unless said), **[G]** guess, not proven.
Hard line kept: nothing here proposes CAPTCHA solving, solver services, IP rotation, residential proxies or a faked TLS or browser fingerprint. Where a site rejects the libcurl.js TLS or HTTP fingerprint, the honest answer is "this site does not work through us", with a clear card, not a disguise.

## 1. Method and machine load

- Harness: `tests/stack/sites-media.spec.js` plus `tests/stack/sites-media.json` plus `playwright.stack.media.config.js` (new files; `real-sites.json`, `sites.spec.js` untouched). Run: `LB_MEDIA=1 LB_MEDIA_REPS=2 LB_MEDIA_SHA=<tag> LB_MEDIA_ONLY=a,b flock /tmp/limitless-rehearsal.lock deploy/rehearsal/run.sh -c playwright.stack.media.config.js --project=chromebook --workers=1 --trace off tests/stack/sites-media.spec.js`. Sizes are MiB (1048576 bytes). Raw JSON per site and rep: `test-results/sites-media-b1 ... b7/<site>.json`; a later batch replaces an earlier one for the same site (the table says which batch each row is from through its load column; b1 to b3 predate the long task and queue counters).
- Profile: Playwright Chromium 1.64 (bundled build, no proprietary codecs), `chromebook` project: 1366x768, 4x CPU throttle, 10 Mbit/s down, 5 up, 40 ms RTT (`tests/lib/profile.js`). Cold: fresh browser and context per rep, mock GATE sign-in, no sign-in to any real account, no cookies carried between reps.
- 2 reps per site, run one after another (`--workers=1`). Each rep launches its own browser so a wedged renderer cannot take the run down; caps 150 s (300 s for video and slow sites), partial data is kept on a hang.
- Egress: the rehearsal relay leaves from the home line (about 104 to 118 Mbit/s down per SPEED-AUDIT 1.1), not from the VPS. Numbers are therefore "member behind our protocol, home egress". The VPS vantage was probed separately (section 4).
- Machine: 8 CPU VM, shared with other agents and production containers, load average at start of each rep is in the table's last column (range 2.0 to 9.0 over the whole run). The same site moved a lot with load: YouTube home was shown at 12.0 s at load 2.7 and at 47.5 to 51.9 s at load 4 to 8 (b1 vs b2). Treat single numbers as "this load"; the ratios between sites and the byte counts are stable, the wall times are not. For advertising, quote only reps taken at load average under 4 and say so.
- What is counted: every libcurl fetch (wrapping `LB_net.curl.fetch`, so image, script, CSS, font and XHR requests all appear; requests the blocklist drops never reach it and are not counted), body bytes from the `LB_siteBytes` hook (`doFetch`, 6063), failure class from the libcurl error code (`lbClassify`, 5677), console and page errors, frame `__perr`, CSP refusals, service worker and Trusted Types console lines, `PerformanceObserver` long tasks in the frame (b4 onwards), `LB_queueState()` sampled every 250 ms (queued and in flight, b4 onwards), JS heap from `performance.memory` (coarse: top page and frame share one heap, so one number; it is a size bucket, not an exact figure).
- Harness limits: (1) bundled Chromium has no H.264 or AAC: TikTok and Twitch video cannot play here whatever the app does (TikTok showed `DEMUXER_ERROR_NO_SUPPORTED_STREAMS`), so those two are not judged on playback. VP9, AV1 and Opus (YouTube) are fine. (2) No Widevine: Netflix DRM is confirmed absent here, which says nothing about a real Chromebook. (3) Media starts after a click when autoplay is blocked: the harness clicks after 6 s and records `clicked`.

## 2. Results

Batch status: b1 to b4 complete (every site measured at least twice). b5 to b7 re-run the earlier sites with the long task and queue counters; the tables below are regenerated from the newest batch per site automatically when they finish, the prose cites b2 and b4 figures, which stay valid as the 'earlier run' record.

Reading the table. "Loaded" = shown, no error card, selector or at least 400 characters of non-challenge text. "Shown" is the `__lbPerf` shown mark (first paint of the page in the frame), "load" the load mark, medians of loaded reps, seconds, at the load average listed. MB is total body bytes; img, js, media and font are the type split (the rest is html, css, json, other). Frame long tasks are summed milliseconds and count over the whole rep, including the 4.5 s scroll phase. Queue is the highest number of requests waiting / in flight at once (24 is the cap, `MAX_CONCURRENT`, 2817).

| Site | Loaded (fail class) | Shown / load s (median of loaded) | Reqs | MB total (by type) | Frame long tasks | Queue max queued/fetching | Failed reqs by class, HTTP 4xx | CSP/console err/page err/SW-TT | Bot check, vendor markers | Load avg per rep |
|---|---|---|---|---|---|---|---|---|---|---|
| yt-home | 2/2 | 48.3 / 62.8 | 148 | 17.0 (img 0.0, js 9.6, media 0.0, font 2.5) | 13461ms/23 | 87/24 | - 4xx:2 | 0/14/0/0 | none - | 3.0,3.2 |
| yt-watch | 2/2 | 51.5 / 69.4 | 303 | 34.3 (img 0.4, js 12.3, media 130.8, font 2.7) | 33185ms/131 | 90/24 | abort:2 4xx:2 | 0/74/0/0 | none - | 2.9,3.8 |
| yt-shorts | 2/2 | 50.7 / 69.2 | 188 | 22.7 (img 0.2, js 12.4, media 1.4, font 2.4) | 27982ms/71 | 90/24 | - 4xx:8 | 0/27/0/0 | none - | 2.7,3.4 |
| tiktok | 2/2 | 10.2 / 22.4 | 246 | 18.7 (img 0.0, js 16.2, media 0.2, font 1.6) | 37339ms/154 | 61/24 | other:1 4xx:1 | 0/5/0/1 | none - | 4.4,3.2 |
| instagram | 2/2 | 17.6 / 26.4 | 135 | 12.5 (img 0.9, js 3.0, media 0, font 6.2) | 12971ms/34 | 72/24 | - 4xx:1 | 0/2/0/0 | none - | 3.9,4.3 |
| x | 0/2 (timeout) | - / - | 3 | 0.0 (img 0.0, js 0, media 0, font 0) | top 2514ms/16 | 0/2 | - 4xx:1 | 0/1/0/0 | none - | 2.2,2.4 |
| twitch | 0/2 (render) | - / - | 295 | 14.6 (img 3.0, js 9.9, media 0, font 1.1) | 83405ms/95 | 117/24 | abort:2 4xx:0 | 0/2/4/0 | none kasada | 2.1,2.1 |
| spotify | 0/2 (script) | - / - | 123 | 11.5 (img 0.0, js 8.5, media 0, font 1.9) | 15306ms/44 | 25/24 | - 4xx:0 | 0/2/0/0 | none recaptcha | 3.4,4.0 |
| soundcloud | 2/2 | 10.3 / 14.5 | 237 | 11.1 (img 0.5, js 10.0, media 0, font 0) | 40355ms/171 | 35/24 | abort:1 curl1:1 4xx:3 | 2/72/0/0 | none datadome | 3.6,3.5 |
| pinterest | 2/2 | 9.3 / 13.7 | 101 | 11.5 (img 0.7, js 9.4, media 0, font 0.1) | 7242ms/24 | 28/24 | - 4xx:0 | 0/2/0/0 | none recaptcha | 5.3,6.2 |
| tumblr | 0/2 (interstitial) | - / - | 6 | 0.2 (img 0.0, js 0.2, media 0, font 0) | 1563ms/5 | 0/3 | - 4xx:2 | 0/1/0/0 | INTERSTITIAL - | 4.1,5.4 |
| discord | 2/2 | 29.3 / 35.1 | 715 | 7.6 (img 0.5, js 0.7, media 0, font 3.3) | 5614ms/17 | 287/24 | - 4xx:0 | 1/3/0/0 | none - | 5.2,5.5 |
| chatgpt | 2/2 | 6.0 / 12.9 | 51 | 1.7 (img 0.1, js 0.6, media 0, font 0) | 21701ms/26 | 0/13 | - 4xx:1 | 0/5/0/0 | none - | 5.1,4.8 |
| gemini | 0/2 (render) | - / - | 129 | 15.2 (img 0.0, js 67.0, media 0, font 5.4) | 72422ms/49 | 61/24 | abort:2 4xx:0 | 0/3/0/0 | none - | 3.3,4.2 |
| canva | 2/2 | 8.2 / 14.5 | 97 | 5.2 (img 0.8, js 2.8, media 0.0, font 0.9) | 12327ms/38 | 30/24 | other:1 4xx:0 | 1/5/1/0 | none - | 4.4,5.2 |
| gdocs | 2/2 | 10.1 / 14.0 | 48 | 6.0 (img 0.0, js 20.2, media 0, font 1.4) | 17655ms/26 | 4/24 | - 4xx:0 | 0/1/1/0 | none - | 4.4,3.9 |
| gdrive | 2/2 | 15.2 / - | 272 | 7.1 (img 2.2, js 0.8, media 0, font 2.6) | 44579ms/60 | 99/24 | abort:18 4xx:0 | 0/2/26/0 | none - | 3.1,3.1 |
| gmail | 2/2 | 14.7 / 22.2 | 230 | 9.4 (img 5.6, js 0.3, media 0, font 2.5) | 4513ms/26 | 104/24 | - 4xx:0 | 0/2/1/0 | none - | 3.5,3.9 |
| amazon | 0/2 (render) | - / - | 6 | 0.1 (img 0.1, js 0, media 0, font 0) | 1533ms/7 | 0/3 | - 4xx:1 | 0/1/0/0 | none - | 3.6,3.5 |
| ebay | 0/2 (render) | - / - | 3 | 0.0 (img 0.0, js 0, media 0, font 0) | 1399ms/4 | 0/2 | - 4xx:1 | 0/1/0/0 | none - | 3.8,3.3 |
| walmart | 2/2 | 26.5 / 34.4 | 175 | 7.7 (img 0.3, js 6.2, media 0, font 0.2) | 32424ms/52 | 104/24 | - 4xx:0 | 0/1/0/0 | none perimeterx | 8.1,4.7 |
| wikipedia | 2/2 | 6.1 / 18.6 | 95 | 4.4 (img 1.3, js 1.1, media 0.4, font 0) | 10772ms/36 | 8/24 | abort:3 4xx:0 | 0/1/3/0 | none hcaptcha | 3.8,5.5 |
| espn | 2/2 | 13.2 / 23.0 | 282 | 12.9 (img 6.0, js 4.0, media 0, font 0.5) | 16020ms/53 | 117/24 | reset:1 4xx:0 | 0/5/0/0 | none akamai | 3.8,5.3 |
| cnn | 2/2 | 37.5 / 62.5 | 85 | 20.2 (img 1.8, js 0.7, media 0, font 1.8) | 28487ms/80 | 267/24 | abort:23 other:1 4xx:8 | 0/5/12/0 | none arkose | 7.3,5.6 |
| bbc | 2/2 | 11.1 / 17.0 | 177 | 6.6 (img 1.5, js 3.2, media 0, font 1.2) | 13821ms/34 | 435/24 | abort:22 other:1 4xx:1 | 0/1/27/0 | none - | 5.2,3.9 |
| imdb | 0/2 (render) | - / - | 6 | 0.7 (img 0.0, js 0.7, media 0, font 0) | 2712ms/5 | 0/2 | - 4xx:0 | 0/1/0/0 | none aws-waf | 5.9,4.4 |
| netflix | 2/2 | 14.5 / 22.6 | 93 | 8.8 (img 0.9, js 5.4, media 0, font 1.5) | 18212ms/45 | 5/24 | - 4xx:0 | 2/13/0/0 | none recaptcha | 3.5,2.9 |
| duolingo | 2/2 | 7.8 / 14.1 | 190 | 9.4 (img 0.3, js 3.5, media 0, font 1.0) | 18609ms/69 | 53/24 | abort:2 4xx:2 | 0/8/3/0 | none recaptcha | 3.4,2.9 |
| characterai | 2/2 | 11.5 / 17.5 | 109 | 12.2 (img 0.8, js 5.8, media 0.3, font 6.1) | 17780ms/43 | 45/24 | - 4xx:0 | 0/46/0/0 | none recaptcha | 4.0,3.5 |
| crunchyroll | 2/2 | 4.2 / 6.7 | 78 | 3.7 (img 0.2, js 2.3, media 0, font 0.0) | 10327ms/25 | 2/24 | - 4xx:7 | 1/14/2/0 | none - | 3.0,3.5 |


Notes on rows:
- `amazon`: the ASIN I picked returns a real "Page Not Found" (404) to everyone, a dead test URL, not a failure of the app. Needs a live product URL; not re-measured.
- `gdocs`: `docs.google.com/document/` redirects to the Workspace landing page; I had no public document URL, so "load" there is the landing, not the editor. `gdrive` and `gmail` are landing pages too (Workspace marketing pages).
- `x`: see 3.1. `twitch`: 3.2. `spotify`: 3.3. `tumblr`, `imdb`, `ebay`: 5.
- A rep marked `harness` (CNN rep 2) was "Target crashed" in `page.evaluate`: the renderer died, see 3.10.

### 2.1 Video and audio

| Site | MediaSource | First frame | Quality | Stalls (15 s window) | Segments |
|---|---|---|---|---|---|
| yt-watch rep 1 (b6) | yes (2 buffers, 20 appends, 3.4 MB) | none | 854x480 | 0 | 22 reqs, median 8.1 MB, max 8.1 MB, headers median 1078 ms |
| yt-watch rep 2 (b6) | yes (2 buffers, 0 appends, 0.0 MB) | none | - | 0 | 9 reqs, median 2.7 MB, max 8.1 MB, headers median 1610 ms |
| yt-shorts rep 1 (b6) | yes (2 buffers, 7 appends, 0.5 MB) | 71.5 s | 320x240 | 0 | 6 reqs, median 0.0 MB, max 0.5 MB, headers median 1898 ms |
| yt-shorts rep 2 (b6) | yes (2 buffers, 7 appends, 0.5 MB) | 72.3 s | 320x240 | 0 | 2 reqs, median 0.5 MB, max 0.5 MB, headers median 2766 ms |
| tiktok rep 1 (b6) | no | none | - | 0 | 1 reqs, median 0.2 MB, max 0.2 MB, headers median 835 ms ; error@32878[4:PipelineStatus::DEMUXER_ERROR_NO_SUPPORTED_STREAMS: FFmpegDe] |
| tiktok rep 2 (b6) | no | none | - | 0 | 1 reqs, median 0.2 MB, max 0.2 MB, headers median 3077 ms ; error@33545[4:PipelineStatus::DEMUXER_ERROR_NO_SUPPORTED_STREAMS: FFmpegDe] |
| twitch rep 1 (b6) | no | none | - | 0 | none |
| twitch rep 2 (b6) | no | none | - | 0 | none |
| soundcloud rep 1 (b5) | no | none | - | 0 | none |
| soundcloud rep 2 (b5) | no | none | - | 0 | none |

All first-frame times are wall time from pressing Enter to the first `playing` event; they include the page load and, where the page does not autoplay, the click. They are therefore dominated by the page load (YouTube 50 to 65 s at load 4 to 8), not by the video pipeline itself. Quality is capped by the member plan (`limits.videoMaxP`, `videoCap`, `app/ui.js` 639 to 672); the rehearsal mock user is on a low plan, so 480p and 240p here say "the cap works", not "this is what the line can do".

Real measurements for YouTube watch (b2, rep 2): MediaSource used (2 SourceBuffers), 18 `appendBuffer` calls and 2.9 MB appended, 12 `videoplayback` fetches of median 3.9 MB (max 5.4 MB), median 2.5 s to response headers, 43.7 MB (MiB, as everywhere in this document) of media bytes fetched in total, 568 frames in 17.4 s with 3 dropped, no `waiting` events after first frame. So the transport sustains 480p without stalls once it starts, and it fetched roughly 15 times what had been appended at the moment of the snapshot (see 3.6, this is the finding to chase).

## 3. The failures, with cause

Ownership key: **ours** = fixable in our code; **site** = the site's policy or protection; **platform** = browser or device limit.

### 3.1 X (x.com): blank page forever, no card. Ours (UX) plus site policy
[M] Both reps: `GET https://x.com/NASA` returns 403 with an empty body after about 1.2 to 1.5 s (`firstBytes` mark). Nothing else is requested (3 requests, 0 bytes). The status text ends at "Ready", the queue is idle, `shown` is never set, the frame is blank. Same IP, system curl with the same header set gets 200 and 29 KB (home and VPS) [M], so the refusal is about the client: libcurl.js's TLS or HTTP/2 handshake (not the headers; the app sends the 1.1 Chromium set: `sec-ch-ua*`, `Sec-Fetch-*`, `Upgrade-Insecure-Requests`, `Accept-Language`).
[C] `go()` only logs the status of the top-level document (10285 to 10287) and continues with the empty body; `LB_botCheck` (`app/ui.js` 452) looks only at 403, 429 or 503 pages that contain a vendor marker, an empty 403 matches nothing (`ui.js` 452 to 475).
Verdict: the block itself is **site policy** (fingerprint of the client we cannot honestly change). The blank page is **ours**: an empty or tiny 4xx/5xx document should end in an error card ("X refused this connection: its protection rejects our connection type") instead of a silent blank tab that sits at "Ready" for ever.

### 3.2 Twitch: shell only, no player or chat. Ours (blocklist substring) plus WebRTC setting
[M] Shown at 16.3 to 17.3 s, then text length 40 ("Skip to... Browse Log In Sign Up"), no `<video>`. Console: `ChunkLoadError: Loading chunk 77043 failed (https://assets.twitch.tv/assets/features.ads.components.client-side-video-ads.instream-and-vertical-video-a...)`, `Uncaught TypeError: Cannot read properties of undefined (reading 'startsWith')`, `NotSupportedError: WebRTC is blocked by Limitless` (x2), and the chat WebSocket `wss://irc-ws.chat.twitch.tv/` fails with libcurl error 52 (empty reply). Kasada markers are present in the page.
[C] The first page of a session uses the old substring list: `shouldSkip` (2992 to 3001) tests `full.includes(d)` for entries such as `'ads.'`, `'analytics.'`, `'tracking.'`, `'telemetry.'` (2842 onwards) against the whole URL, so `.../features.ads.components...js` is answered with an empty body and the app chunk "fails". The big HaGeZi list only takes over after the page has loaded and the queue was idle for 3 s (`loadWhenIdle`, 2976 to 2981). I ran the old list against 50 sample URLs (script in my notes): it also wrongly blocks `www.threads.net`, any host ending in `ads.` such as `uploads.` and `downloads.`, and `analytics.twitter.com`. [M]
[C] WebRTC: `makeProxyScript` stubs `RTCPeerConnection` unless the member turns the block off (`limitless:webrtc:block:v1`, 8214 to 8220); Twitch low latency and Discord voice need it.
Verdict: the chunk loss is **ours**, a one line class of bug (match hosts, not full URLs, and apply the big list from the first request or ship a small compact one in `index.html`). WebRTC is a **design choice** (leak prevention). Kasada and the chat socket are **site policy**, [G] not the cause of the blank shell. Playback itself cannot be judged here (no H.264, 1).

### 3.3 Spotify: blank page, "Failed to find a valid digest in the integrity attribute". Ours
[M] Both reps: shown only at 31.9 to 32.1 s (the slowest "shown" of any site that finishes), and the player never renders (text 106 characters, `RESLOAD-FAIL ... recaptcha__en.js`). Console: `Failed to find a valid digest in the 'integrity' attribute for resource 'data:text/javascript;charset=utf-8;base64,...'`. 45 script requests, 8.8 MB.
[C] Dynamic scripts are swapped to a `data:` URL by the `.src` setter and `orderedScriptSwap` (about 7203 to 7270) but, unlike the parse-time paths (10977, 11037, 11055) and CSS (7346), nothing removes the `integrity` attribute there, so the browser refuses the rewritten body. The code comment at 7203 also says `setAttribute('src')` and module scripts stay direct-load.
Verdict: **ours**, a two line fix (`node.removeAttribute('integrity')` before the swap). Likely also hits other SRI-using sites that inject scripts (Google properties, Cloudflare). [G] that this alone makes Spotify render; there may be more behind it.

### 3.4 YouTube (home, watch, Shorts): works, slow to start, large. Ours (rewriter, queue) plus platform
[M] All three loaded in 2/2 reps in the final batch. Shown at 47 to 64 s (load 4 to 8), at 12 s on a quiet machine (b1, one rep of home). The page pulls 17 to 25 MB, of which 9.4 to 12.4 MB is JavaScript in only 6 to 8 files, plus 2.0 to 3.7 MB of CSS. In the first run (b1, 45 s limit) 5 of 6 reps timed out before "shown", which is why the cap was raised to 100 s for video sites.
[M] Six `videoplayback` requests per page fail with libcurl 35 (SSL connect error) against one `rr1---sn-...googlevideo.com` node in two of three runs (yt-home and yt-shorts, b2): a transient TLS failure to a CDN node, retried by the player. Not systematic, but it costs seconds.
[M] `GET`-with-body bug: `Failed to construct 'Request': Request with GET/HEAD method cannot have body` for `youtube.com/api/timedtext` (Shorts) and for TikTok's `tiktok/popup/dispatch/v1`: a fetch whose method is GET carries a body down to libcurl.js. [C] runtime `window.fetch` wrapper (6925 to 6955) copies `init.body` and `Request.body` without dropping it for GET and HEAD; `doFetch` passes it on (5901). Ours, trivial.
Cause of the slowness [C], mapped to SPEED-AUDIT: 10 to 12 MB of script goes through the AST rewriter on a 4x slowed CPU: items 1, 2 and 4 (join, no main-thread fallback, faster parser). [G] This is the biggest single term; the other agent's `profile.spec.js` is the place to prove it.
Platform: autoplay is blocked inside our iframe until a click, so the first frame needs a member click, as on any browser without a gesture. [C] `allow` has `autoplay` (`index.html` 6677) but the top page never had a gesture in the test.

### 3.5 TikTok: page loads, video does not play here. Platform (harness) plus ours (service worker)
[M] Loaded in 2/2 at 11.7 s shown (load 4), 248 requests, 18.8 MB of which 16.2 MB is JavaScript in 186 files. The only `<video>` errors with `DEMUXER_ERROR_NO_SUPPORTED_STREAMS` after a 198 KB fetch: H.264 in an MP4 in a Chromium with no proprietary codecs, so it is a harness limit [G] and probably works on a real Chromebook (not proven).
[M] Console: `ServiceWorker register failed: ReferenceError: workbox is not defined`. [C] The SW shim runs the worker script in a function scope where `importScripts` is a synchronous shim limited to 25 loads (8538 to 8552) but the scope object advertises `importScripts: null` (8515), and TikTok's worker calls it at the top. Ours; harmless for TikTok (it does not need the worker to render) but it is the "service worker errors" class.
[M] Also the same GET-with-body failure as 3.4.

### 3.6 YouTube video transport: whole responses, 15x fetched vs appended. Ours (new)
[C] `doFetch` always reads the full body (`await resp.arrayBuffer()`, 6020 to 6035) and only then answers the frame, so nothing reaches `SourceBuffer.appendBuffer` until a whole `videoplayback` response (about 4 to 5 MB each in the 480p run) is complete. Only `text/event-stream` and the `stream` message are streamed (6942 to 6950); `fetch()` bodies are not.
[M] 43.7 MB of media bytes were fetched in the 17 s after first frame while 2.9 MB had been appended. [G] The player requests large look-ahead ranges that the app delivers whole and late; a streaming `fetch` (ReadableStream chunks of 64 KB per WISP frame, `max_message_size = 65536` in `deploy/relay/config.toml`) would let MSE start on the first chunk and let the player cancel what it no longer needs (an aborted request today still downloads to the end before the answer is dropped; [G]).
Also [C] `buf` is copied once more by `r.buf.slice(0)` (8758) for the transfer, doubling peak memory for a 5 MB segment.

### 3.7 Discord login: blank page. Ours? (cause not proven)
[M] Shown at 27 s, text length 0, 715 requests (251 scripts, 325 CSS files, 88 images, 7.6 MB), page errors `RESLOAD-FAIL` for `web.*.js` and several chunk files. No libcurl failures and no 4xx, so the bytes arrived. [G] The scripts load as `blob:` URLs and fail to execute or exceed the 10 s first byte or 30 s body deadline under 24 parallel requests (`LB_deadlines`, 5700). I did not prove which; the b7 queue counters will show whether waiting is the cause. Also seen on Discord, Canva and Crunchyroll: `Refused to execute script from 'http://127.0.0.1:8590/cdn-cgi/challenge-platform/scripts/jsd/main.js'`: Cloudflare's injected snippet sets the script `src` with `setAttribute`, which stays direct-load (comment at 7203), resolves against our origin and asks our own server. Ours: the site's bot-score script can never run, and the member's browser makes a request to us that tells nobody anything useful. Fix: resolve `setAttribute('src')` against the page base too (proxy it, or drop `/cdn-cgi/` paths).

### 3.8 Gemini: blank after 58 MB of script. Unproven (probably ours, rewriter)
[M] Both reps: shown at 17.6 to 18.5 s, text length 0, 12 script requests that add up to 58.3 MB while the unique bytes of the whole page are 15.1 MB: the same script URLs were fetched about four times in one load (the table's "MB total" counts each URL once, the type split counts every request). Google Docs shows the same pattern (js 19.9 MB over 11 requests, 6.0 MB unique). Heap 69 to 141 MB. A CORS failure for `gstatic.com/gemini/spark/glow_mask.svg` (an image loaded with `crossorigin`): [C] images go through `fetchBlob` and are served as blob URLs without CORS headers, so a `crossorigin=anonymous` image from another host is refused (7077 to 7135).
[G] Two suspects for the repeat: the pipeline kick-off (`_pf`) and the later `qjs` or retry path asking again for a script that is not cacheable (`no-store` or `private`), or a retry after the 10 s first-byte deadline; I did not trace it. If it is a repeat, it is the cheapest big win on these pages (up to 4x less script download and rewrite work). [G] The blank page itself: 15 MB of script through the rewriter is the likely blocker (items 1, 2, 4). Not proven.

### 3.9 IMDb and Tumblr: challenge pages. Site policy
[M] IMDb: empty document, vendor marker AWS WAF; system curl gets 200 from home but 403 from the VPS (probe, section 4). Tumblr (`staff.tumblr.com`): 403 "Checking your browser... Javascript required", a self-hosted proof of work (`X-Hashcash` header on `/__challenge`), second request also 403. In both cases `LB_botCheck` did not show its card because a 200 or a small page with no known vendor marker does not match; Tumblr shows the site's own challenge page, which a real browser would solve by itself. [G] that it fails here because the challenge POST is rejected for the same fingerprint reason as X. eBay: Akamai 403 "Error Page" in-app and from system curl (home and VPS), so not specific to us. Honest fix for all three: recognise the page, show our plain card with "this site's protection blocks our connection" and a link to open it in a normal tab. No solving.

### 3.10 Walmart, ESPN, BBC, CNN: loaded, heavy, queue and CPU bound. Ours
[M] Walmart: shown 26.2 to 26.9 s, a single 9.6 to 20.4 s main-thread long task, 25.7 to 32.4 s of long tasks in total, 104 requests waiting at once. ESPN: 117 waiting, average 29 to 30. BBC: **435** waiting, average 48 to 62, 177 requests. CNN: rep 1 shown at 41.6 s; rep 2 "Target crashed" (renderer out of memory under 4x throttle; the whole browser tab died) [M]. All four have PerimeterX or Akamai markers but loaded, so the bot layer is not the problem here from a home IP.
[C] The queue cap of 24 (`MAX_CONCURRENT`, 2817) plus image pre-warm (first 24 images, `lazyPrefetch`) means a page with hundreds of third-party requests (ads, trackers that are not on the list, images) sits in a long queue; priority has only six classes and media shares `other` with XHR (`getPriority`, 3151). [G] Ad and tracker requests that the HaGeZi list would have dropped are still fetched on the first page of a session (3.2), which is exactly the BBC, ESPN and CNN case.

### 3.11 Instagram, Twitch, Spotify, Duolingo, Character.ai: font and CSS base64 inlining. Ours (new, not in SPEED-AUDIT)
[M] Font requests per page: Duolingo 60, Character.ai 55 to 57, Instagram 75 (6.2 MB of 12.0 MB total, 52 %), Spotify 46 (1.9 MB), Twitch 38 (1.1 MB), Netflix 27. [C] `rewriteCssUrls` (10686 to 10724) fetches every `url()` of every `@font-face` and every CSS image before the page is shown, awaited by `_cssStage`, at `PRIORITY.font`, and base64-inlines each one through a `FileReader`. A normal browser would load only the one face per `unicode-range` the page uses. Not in SPEED-AUDIT (its item 7 is memory, item 6 images); a new item (N1 below).

### 3.12 Google properties (Drive, Gmail landing): works, noisy. Ours plus site
[M] Drive and Gmail landings loaded 2/2 (shown 14.6 to 15.0 s). Drive: 55 and 31 page errors, `failed to load https://www.youtube.com/iframe_api?trustedtypes=1&origin=https://workspace.google.com ... due to timeout`, `ssl.google-analytics.com/ga.js` blocked. [C] Trusted Types: the frame strips CSP (10357 to 10372, replaced by `frame-src blob: data: about:`) so `trustedTypes` policies still exist in sites that create them; the YouTube iframe API load times out because the nested frame source must be proxied (SPEED-AUDIT item 8 covers the popup and Trusted Types work). The in-app Google sign-in popup was not tested (no sign-in allowed).

## 4. Bot checks: in-app vs plain curl from home and from the VPS

`scripts/probe-challenges.mjs --reps=2` (system curl, 1.1 header set, home line vs `ssh limitless-relay`), 28 hosts. Only GET `/`; `redirect*` is a 30x answer the probe script reports as `error` (its verdict function treats an empty-body HTTP/2 redirect as no status: docs.google.com, drive.google.com and en.wikipedia.org). Totals: home 48 ok, 2 blocked (eBay), 0 challenge; VPS 38 ok, 6 challenge, 6 blocked, 56 requests each.

| Host (front page, GET /) | Home, 1.1 headers | VPS, 1.1 headers | VPS, old headers |
|---|---|---|---|
| www.youtube.com | ok,ok | ok,ok | ok,ok |
| www.tiktok.com | ok,ok | ok,ok | ok,ok |
| www.instagram.com | ok,ok | ok,ok | ok,ok |
| x.com | ok,ok | ok,ok | ok,ok |
| www.twitch.tv | ok,ok | ok,ok | ok,ok |
| open.spotify.com | ok,ok | ok,ok | ok,ok |
| soundcloud.com | ok,ok | ok,ok | ok,ok |
| www.pinterest.com | ok,ok | ok,ok | ok,ok |
| www.tumblr.com | ok,ok | ok,ok | ok,ok |
| discord.com | ok,ok | ok,ok | ok,ok |
| chatgpt.com | ok,ok | challenge,challenge | ok,ok |
| gemini.google.com | ok,ok | ok,ok | ok,ok |
| www.canva.com | ok,ok | challenge,challenge | challenge,challenge |
| docs.google.com | redirect*,redirect* | redirect*,redirect* | redirect*,redirect* |
| drive.google.com | redirect*,redirect* | redirect*,redirect* | redirect*,redirect* |
| www.google.com | ok,ok | ok,ok | ok,ok |
| www.amazon.com | ok,ok | ok,ok | ok,ok |
| www.ebay.com | blocked,blocked | blocked,blocked | blocked,blocked |
| www.walmart.com | ok,ok | ok,ok | ok,ok |
| en.wikipedia.org | redirect*,redirect* | redirect*,redirect* | redirect*,redirect* |
| www.espn.com | ok,ok | ok,ok | ok,ok |
| www.cnn.com | ok,ok | ok,ok | ok,ok |
| www.bbc.com | ok,ok | ok,ok | ok,ok |
| www.imdb.com | ok,ok | blocked,blocked | blocked,blocked |
| www.netflix.com | ok,ok | ok,ok | ok,ok |
| www.duolingo.com | ok,ok | ok,ok | ok,ok |
| character.ai | ok,ok | challenge,challenge | challenge,challenge |
| www.crunchyroll.com | ok,ok | blocked,blocked | blocked,blocked |

Reading it against the in-app loads:
- VPS challenges that the home line does not get (chatgpt.com, www.canva.com, character.ai) and VPS blocks (imdb, crunchyroll): in-app loads here ran from home egress, so all of those loaded (ChatGPT 2/2, Canva 2/2, Character.ai 2/2, Crunchyroll 2/2) except IMDb. This matches SPEED-AUDIT item 9 (home egress for challenge-prone hosts): the datacenter address is the variable for those four hosts, not our headers (old and new header sets give the same result from the VPS except one extra ChatGPT challenge with the new set).
- Sites that fail in-app but pass curl from both vantages (X, Tumblr, IMDb from home): the client fingerprint is the variable. This is the group where only the member's own browser would pass, and where our job is an honest card, not a workaround.
- eBay blocks curl from both vantages and the app: site policy for non-browser clients.
- Page-level verdicts in the app: `LB_botCheck` fired on none of the 30 pages (no "Human Check" card was shown). Tumblr and X would have been the candidates; see 3.1 and 3.9. `LB_botCheck` runs only on the top-level HTML of a 403, 429 or 503 (`ui.js` 452 to 455), so challenges delivered as 200, as 202 (AWS WAF), or inside sub-requests are never flagged.

## 5. Cross-cutting causes (ranked by how many sites they touch)

1. [M] Script weight through the rewriter on a slow CPU (YouTube 10 to 12 MB JS, Gemini 15 MB unique, TikTok 16 MB, Spotify 9 MB, Twitch 10 MB, Pinterest 10 MB): SPEED-AUDIT items 1, 2, 4. Long tasks of 10 to 32 s total per rep and 4 to 20 s single tasks (Walmart) are in the table for b4+ sites.
2. [M] CSS and font base64 inlining of every face: 3.11 (new).
3. [M] Fetch queue length with unfiltered ad and tracker traffic on the first page: 3.10, 3.2 (queue up to 435).
4. [M] Whole-body responses for media: 3.6 (new).
5. [M] Silent dead ends (empty 4xx, challenge pages with 200): 3.1, 3.9 (new).
6. [M] Integrity attribute on dynamic scripts: 3.3 (new).
7. [M] Blocklist substring false positives: 3.2 (new).
8. [M] GET with a body: 3.4 (new).
9. [C] Eager `<video>` and `<audio>` loading: the `src` setter (7077 onward) fetches the whole file through `fetchBlob` the moment `src` is set, ignoring `preload="none"` and the viewport; Wikipedia's Cat article starts 12 media fetches (3 audio files `Aborted` after the 10 s first-byte deadline, `upload.wikimedia.org` transcodes on demand) [M]. Only Data saver turns this off. Ours (new). Also: a whole progressive MP4 must finish inside `req()`'s 45 s timeout (6830) or fail [C].

## 6. Media-specific speedup ideas

Real numbers first, ideas second.
- Video segments: stream `fetch` and XHR bodies to the frame in 64 KB steps (3.6). Expected [G]: first appended byte moves from "last byte of a 4 MB segment" to "first 64 KB", about 2.5 s at the measured headers latency plus the transfer time at 10 Mbit/s (3.3 s for 4 MB), and aborted requests stop costing bytes. Needs a streaming reply message like the existing `stream` type (6945) and a Range-aware path in `doFetch`.
- Segment parallelism: `videoplayback` shares the `other` priority class with API calls (`getPriority`, 3151): give media its own lane with a small cap (4 to 6) so the 24 slots are not all video during page work, and the reverse.
- `<video>` and `<audio>` with `preload=none` or off screen: do not fetch until play or near the viewport (5. item 9); Data saver already sets `preload="none"` (CLAUDE.md "Faster browsing"), make it the default for audio and for `video` off screen.
- Image heavy feeds: Pinterest and Instagram ended with 12 to 40 images on first load and 14 to 33 more requests in the three scroll screens [M]. The blob cache `blobs` holds up to 500 entries with no byte limit (6895 to 6920) and the response cache holds the same bytes again (96 MB), plus the transfer copy; an infinite scroll can hold the same image three times. [G] Cap `blobs` by bytes (for example 48 MB) and revoke on eviction (it already revokes, but only at 500 entries).
- Infinite scroll memory: JS heap bucket after load, from `performance.memory`: Spotify 368 to 468 MB, YouTube watch 98 to 415 MB, Gemini 69 to 141 MB, TikTok 73 to 117 MB, Pinterest 61 MB, Wikipedia 38 to 40 MB, ChatGPT 21 to 25 MB [M]. SPEED-AUDIT 1.4 / item 7 (deviceMemory budget) covers the caches; Spotify and YouTube are the cases to test on a 4 GB device. CNN's renderer crash (3.10) is the same family [G].
- Poster and thumbnail grids: `lazyImg` and `lazyPrefetch` exist; the remaining cost is the per image `libcurl` request on the main thread (SPEED-AUDIT C1, item 5). SPEED-AUDIT item 6 (native image lane for paid plans) is the larger lever for feeds.

## 7. Ranked list of new speedups and fixes

All items are not in `SPEED-AUDIT.md` unless a number is given. Effect and risk are my estimates; the measured base is in the section quoted.

| # | Fix | Effect | Effort | Risk | Evidence |
|---|---|---|---|---|---|
| N1 | Stop base64-inlining every `@font-face` face: fetch only the first (woff2) source per face, skip `unicode-range` faces until used, or leave font URLs to a lazy loader | Instagram 6.2 of 12.0 MB (52 %) and 75 requests gone, Duolingo 60 and Character.ai 55 requests, Spotify 1.9 MB; faster "shown" on all CSS-heavy sites | small to medium (10686 to 10724) | low to medium: wrong face choice shows a fallback font | 3.11 [M] |
| N2 | Treat only host names as blocklist matches (never `full.includes` of `ads.`, `analytics.`), and load the big list before the first page (compact form, SPEED-AUDIT 1.4) | Twitch app chunk loads again; removes false blocks on threads.net, uploads./downloads. hosts; fewer ad requests on the first page (BBC queue 435) | small | low | 3.2 [M] |
| N3 | Remove `integrity` on dynamic scripts in the `.src` swap (about 7228 to 7262) | Spotify (and other SRI sites that inject scripts) can run | 2 lines | very low | 3.3 [M] |
| N4 | Error card for empty or tiny 4xx/5xx top-level documents, and for known challenge pages answered 200 or 202 (AWS WAF, hashcash), with a plain "open in a normal tab" link; never any solving | X, IMDb, Tumblr stop looking broken or hung (X waits for ever today) | small (10285 to 10334, `ui.js` 452) | low | 3.1, 3.9 [M] |
| N5 | Stream response bodies to the frame (chunks) for media and for any `fetch` the page reads incrementally; give media a separate queue lane | Video first byte at the first chunk instead of the last byte of a 4 to 5.4 MB response; stops 15x over-fetch from showing as stalls under load | large (frame runtime, `runQueue`, message type) | medium | 3.6 [M]/[G] |
| N6 | Do not set `src` of `<video>` and `<audio>` until play or near the viewport; honour `preload` | Wikipedia 12 media fetches and 3 aborts; every article or feed with embedded players | small to medium (7077 to 7135) | low | 5, item 9 [M]/[C] |
| N7 | Drop the body for GET and HEAD in the runtime `fetch` and in `doFetch` | YouTube timedtext (captions) and TikTok dispatch calls stop failing | 2 lines | very low | 3.4 [M] |
| N8 | Proxy `setAttribute('src')` script injection (or at least resolve it against the page base), and make the service worker shim's `importScripts` advertise itself | Cloudflare detection scripts stop hitting our own origin; TikTok's worker registers | medium | medium (ordering, SRI) | 3.5, 3.7 [M]/[C] |
| N10 | Find and remove repeated fetches of the same script URL in one page load (log URL, caller and stage in `queueFetch`; dedupe uncacheable GETs for the length of the navigation) | Gemini 58.3 MB counted for 15.1 MB unique, Google Docs 19.9 for 6.0: up to 4x less script download and rewrite on those pages [M that it happens, G for the cause] | small to medium once traced | low | 3.8 |
| N9 | Cap the `blobs` map by bytes and avoid the extra `slice(0)` copy when the buffer is not shared (cache owns a copy already) | lower peak memory on Pinterest, Instagram, YouTube segments; fewer renderer crashes (CNN) | small | low | 3.10, 6 [M]/[G] |
| 1 to 2, 4 | Rewriter fixes: one join, no main-thread fallback, faster parser (SPEED-AUDIT) | YouTube, Gemini, TikTok, Spotify, Pinterest: the largest single time term on slow CPUs [G until `profile.spec.js` proves the share] | per SPEED-AUDIT | per SPEED-AUDIT | 3.4, 3.8 |
| 5 | libcurl in a Worker (SPEED-AUDIT C1) | Walmart style 9 to 20 s single long tasks [M] are mostly rewrite and parse, so this is second to 1, 2, 4 | large | medium | table |
| 9 | Home egress for challenge-prone hosts (Boss's decision) | ChatGPT, Canva, Character.ai, IMDb, Crunchyroll are challenged or blocked from the VPS and clean from home | medium | policy | section 4 [M] |

## 8. What I did not measure

- Real playback with H.264 (TikTok, Twitch), Widevine DRM (Netflix, only that the landing loads, 2/2, and `ae.nflximg.net` is refused by the frame-src CSP), Google sign-in popup, any signed-in page, a public Google Doc (none supplied), a live Amazon product (the chosen ASIN is dead).
- Wall times at a fixed machine load: the VM was shared; only byte counts and request counts are stable across reps.
- Effect of any fix: nothing was changed in app code (the worktree is shared with other sessions), so every "effect" above is an estimate from the measured shares.
- Cause for Discord (3.7), Gemini (3.8) and the Spotify render after N3.
