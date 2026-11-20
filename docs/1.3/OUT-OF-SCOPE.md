# What Limitless cannot route (TL-4, spec 05)

Goal of spec 05: nothing a proxied page asks for leaves the member's browser except through our relay or a public relay. This note lists
what no page code asks for, so Limitless cannot and does not try to route it. Each item is also a case the leak zoo does NOT test, because
no proxied page can trigger it (`tests/e2e/leakzoo-cases.js` covers everything a page can do).

## Out of scope
1. **The tab favicon of the Limitless app itself.** The browser asks for `/favicon.svg` on our own origin. It is our file, not a page's
   request. (A favicon a proxied page sets is in scope: leak zoo case `link-icon-js`.)
2. **Extensions installed in the member's Chrome.** They run outside the page and make their own requests (including to the page's hosts).
   Limitless sees none of it and cannot stop it.
3. **DNS prefetch and preconnect outside the page.** Chrome may resolve or connect to hosts on its own (network predictor, omnibox). Lockdown
   (`features.lockdown`) blocks the page-level hints (`dns-prefetch`, `preconnect`; leak zoo case `link-dns-prefetch`), but the browser's own
   lookups for the app origin and our relay hosts happen as for any site.
4. **Everything below the page:** the member's DNS resolver, school or ISP filters seeing our relay and public relay hosts, and the relay
   operator seeing the destination hostnames of connections it carries.

## Wording rule
The line "nothing loads outside Limitless" may be used only when TL-1 release B (lockdown and rwGaps on) and TL-3 (SW lane on) have shipped
and the leak zoo has no open case (`KNOWN_LEAKS` empty). Until then use the narrower claim in the privacy text. Boss approves the exact words,
HALL and legal text are not changed from here.

Proposed help-text line (for Boss to approve, not shipped): "Pages you open load through Limitless. Your browser's own tab icon for this
app, extensions you installed in Chrome and Chrome's own DNS lookups are not part of the page and are not routed through Limitless."

Last verified: 2026-11-20
