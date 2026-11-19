# 07: Video (spec, 2026-11-19)

Area code **VD**. Old ids merged here: SPEED-NEXT I1 to I3, M-N5, NATIVE-SPEED-PLAN Phase 6. Research: `docs/1.3/research/media-2026-11-18.md`.

## 0. Facts
- **YouTube is blocked on every tier** (Boss, 2026-11-18; 1.2.2): the app refuses youtube.com, youtu.be, youtube-nocookie.com,
  googlevideo.com and ytimg.com before any request, and the VPS gate refuses them. All YouTube-specific work is dropped (I3's YouTube
  part, YouTube thumbnails through the image lane). Embeds of YouTube on other sites show the blocked card too, including school sites
  that embed YouTube.
- Other video sites (Twitch, Vimeo, news players, school video hosts) stay, under the gate's video cap and `videoSock`.
- Our transport hands each media response to the frame only when it is complete; the 2026-11 capture fetched 43.7 MB of YouTube media
  to append 2.9 MB (15x). Whether the waste comes from aborted requests that still downloaded is a hypothesis to prove with a byte count
  after abort, on a non-YouTube player now.

## VD-1 Stream media bodies to the frame (was I1, M-N5, Phase 6)
- **Status:** planned. **Likely time:** 12 to 20 h over 3 releases. **Tiers:** all. Saves VPS data as well as start time.
- **Step 1, measure (2 h):** a fixture page with an MSE player (hls.js or a plain MSE loop, licence-checked) fed by the fixtures server;
  count bytes read by libcurl against bytes appended, with and without the player aborting.
- **Step 2, stream (`features.mediaStream`, default false):** media and Range requests (`noBodyCap` path) hand the body to the frame in 64
  KB chunks through the existing runtime `stream` message as a `ReadableStream`; when the frame aborts (the player cancels), the read stops,
  the libcurl request is aborted and the queue slot is freed. The response cache is skipped for these (as today for Range).
- **Step 3:** `doFetch` forwards the player's own `Range` and returns a real 206; the 206-slicing fallback stays for servers that ignore
  Range. Deadlines: no body deadline for media (unchanged); the Ordinal speed cap paces per chunk (like Downloads).
- **Tests:** e2e with the fixture player: first `appendBuffer` before the response ends; an abort stops the read within 1 chunk; bytes read
  under 1.5x bytes appended on a seek-heavy script; switch off = today's behaviour.
- **Exit:** video start time on the fixture at least 40 percent earlier; bytes read per minute of playback at least 50 percent lower.
- **Rollback:** `LB_FEATURE_MEDIASTREAM=false`.

## VD-2 Quality at the shown size (was I3, non-YouTube part)
- **Status:** planned, after VD-1. **Likely time:** 2 h.
- **Rules:** for `<video>` with several sources, pick the largest source not above the player's on-screen height times DPR, capped by the
  plan's `videoMaxP` (existing `videoCap` logic); on a device with 4 GB or less (`navigator.deviceMemory`), start at 480p.

## VD-3 Posters through the image lane
- Part of spec 04 SV-2 coverage (`<video poster>`).

## Dropped
- Executive relay buffering of video (I3): low hit rate (few members watch the same video), the VPS would count the data twice on the
  meter, and token-bound media URLs break caching. Not planned.
- Any YouTube work (blocked on every tier).

Last verified: 2026-11-19
