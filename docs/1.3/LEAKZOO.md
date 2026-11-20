# Leak zoo (TL-6, spec 05)

`tests/e2e/leakzoo.spec.js` (cases in `tests/e2e/leakzoo-cases.js`): 65 pages, one way each of loading something outside Limitless. Every
URL is on `leak.fixture`. The stub libcurl answers what comes through the proxy path; `context.route` and `routeWebSocket` see only what
reaches the real network, so any hit is a direct load. Run: `LB_E2E_PORT=8641 npx playwright test tests/e2e/leakzoo.spec.js --project=chromium`
(about 100 s, also part of `npm test`). Each test attaches a `leak` annotation `direct=<urls|none> proxied=<n>` (see the JSON reporter).

**Baseline rule:** a leaking case is listed in `KNOWN_LEAKS` with the item that closes it and runs as `test.fail()`. A case that leaks and is
not listed fails the suite (new leak). A listed case that stops leaking fails the suite until its line is deleted. Set
`LB_LEAKZOO_FEATURES='{"lockdown":true,"rwGaps":true}'` to run with switches on (no expected-fail then: failures are leaks that remain).

## Result, main 1.2.5 (`cec4d6f`), switches off: 34 of 65 leak
- TL-1B (closed by lockdown and rwGaps): img-srcset-attr, audio-new, script-setattr-src, css-setproperty, css-style-prop, css-style-textnode,
  css-style-textcontent, css-style-import-js, css-static-style, css-static-import, css-style-attr, css-link-href-before-rel, fontface,
  static-input-image, body-background, svg-image-href, svg-image-xlink, object-data, embed-src, document-write.
- TL-2 (rewriter gaps): link-preload-imagesrcset, innerhtml-img, innerhtml-img-srcset, insertadjacenthtml, contextual-fragment,
  template-content, domparser-adopt, css-insertrule, css-replacesync.
- TL-3 (frames, workers, navigation): iframe-srcdoc-img, worker-importscripts, worker-fetch, sharedworker-importscripts, meta-refresh.

With `lockdown` and `rwGaps` on, 64 of 65 are clean (blocked or routed). Left: **meta-refresh** (a navigation, which `default-src` does not govern).
`img-srcset-attr` and the other rwGaps cases are routed, the rest are blocked (lockdown counts them in `cspBlocked`).

## Clean today (31): they reach the proxy or are dropped
Routed through the proxy: img-new, img-setattr, img-srcset-prop, picture-source-srcset, audio-src, video-src, video-source-child,
video-poster-attr, video-poster-js, track-src, static-img, css-cssText, css-link-stylesheet, script-src-js, dynamic-import, fetch, xhr,
sendbeacon, eventsource, iframe-src, form-post, location-assign, window-open (23).
Inconclusive, the browser made no request at all, so they prove nothing about routing (8): link-preload-js, link-preload-static,
link-modulepreload, link-prefetch (the runtime drops them, 1.2 direct-loads note), link-dns-prefetch, link-icon-js, anchor-ping, websocket
(WebSocket goes through the wisp path, not the stub).

Not covered by the zoo: the cases in `OUT-OF-SCOPE.md` (TL-4) and anything needing a real network peer (real WebSocket server, real SSE).
