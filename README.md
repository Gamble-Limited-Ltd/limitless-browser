# Limitless Browser

A private browsing proxy by Gamble Limited Ltd.

Limitless Browser runs a full browser-style interface in a web page: tabs, bookmarks, history, a built-in PDF, image, video and text viewer, and request and DOM developer tools. Page requests go through libcurl.js (a WebAssembly build of libcurl) and a WISP relay, and pages are rendered in a sandboxed frame.

## Access

Limitless Browser is invite only. Sign in with GLL ID; only approved users can use it. Everyone else sees an "invite only" page. The public host is `limitless.taps-holdings.org`.

## Running locally

There is no build step. Serve the repo root as static files and open it:

```sh
python3 -m http.server 8000
```

Then browse to `http://127.0.0.1:8000/index.html`. Local runs do not enforce the sign-in; that check lives in the hosted deployment.

## Tests

```sh
npm install
npm test
```

This runs a Playwright smoke test (`tests/e2e`) against a local static server.

## Credits

Based on [GUST](https://github.com/nautilus-os/GUST) by Nautilus Labs (lanefiedler, dinguschan, x8rr/hvtrs and other contributors: CompactAI, jaysyrk, xor, dinguschan-owo, Jacob). Modified by Gamble Limited Ltd. This project is not affiliated with or endorsed by Nautilus Labs.

Built on [libcurl.js](https://github.com/ading2210/libcurl.js) by ading2210, the WISP protocol by [Mercury Workshop](https://github.com/MercuryWorkshop), and [PDF.js](https://github.com/mozilla/pdf.js) by Mozilla. Full third-party list with licenses: `NOTICE`.

## License

GNU Affero General Public License v3.0 (see `LICENSE`). Modification notice, third-party licenses and trademark notes are in `NOTICE`. Source: https://github.com/Gamble-Limited-Ltd/limitless-browser
