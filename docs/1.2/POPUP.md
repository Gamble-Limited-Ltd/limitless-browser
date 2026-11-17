# Popup bridge and Trusted Types (1.2, speed audit item 8)

Plan: `docs/1.1/SPEED-AUDIT.md` section 6 and `docs/1.1/audit/BOTCHECK-GOOGLE.md` section 1. Status: built, NOT deployed.
Switch: `features.popupBridge` (build `LB_FEATURE_POPUPBRIDGE`, default true; the full `npm test` passes with it on). Off restores the old
`window.open` (navigate the same tab, dummy handle). Tests: `tests/e2e/popup.spec.js`, `tests/e2e/trustedtypes.spec.js`.

## Reproduction (before the change)
A local fixture plays "Sign in with Google" without any real account: the site page calls `window.open('https://idp.test/auth')`, the
popup page calls `window.opener.postMessage({credential}, 'https://site.test')` and `window.close()`. On 1.1 the popup replaced the opener's
tab and the handle had no `opener`, no relayed messages and `closed` stayed false: the popup test failed (tab count 1, no message). The
Trusted Types fixture adds a `require-trusted-types-for 'script'` CSP meta from the page's script: the next `innerHTML` or script write threw
`TypeError` (both fixtures failed before the fix).

## What was built
- **Popup**: `window.open(url, target, features)` in the frame runtime returns a handle (`closed`, `close()`, `focus()`, `postMessage()`,
  `location.href/assign/replace` for the `about:blank` then navigate pattern) and asks the app (`popen`) for a second proxied tab. The app has one
  live document frame, so the opener's iframe is PARKED (hidden, still running) and the popup gets a fresh iframe that `frame` points to
  (`frame` is now `let`). The popup's runtime gets `window.opener` (a handle with `postMessage`) and a working `window.close()`.
  `postMessage` both ways is relayed by the app (`lbPopupMsg`): the event's `origin` is the real URL origin of the sender's tab (never the sender's claim),
  the target origin (`'*'`, an exact origin, `'/'`) is enforced and a mismatch is dropped silently as a browser does, `event.source` is the other
  handle. Ending the popup (window.close in either window, the popup tab's close button, closing the opener tab, or switching to any other tab)
  removes the popup frame and tab, puts the parked frame back with its live page (no reload) and tells the opener (`closed` becomes true).
- **Parked opener**: only fetch and storage traffic (`LB_PARK_OK`) from the hidden frame is served; navigations, titles and context menus from it are
  ignored so it cannot steer the active tab.
- **Not bridged on purpose**: `noopener` and `_self/_parent/_top` keep the old path; a second concurrent popup is refused (the opener sees
  `closed`); a tab-cap refusal does the same.
- **Trusted Types**: the document never receives the site's CSP (headers do not reach a blob document, and parse-time `<meta http-equiv>` CSPs
  were already stripped in `go()`), so enforcement could only start when the page's own script added a CSP meta. The runtime now keeps those metas
  inert (`setAttribute('http-equiv', CSP)` and the `httpEquiv` setter store `data-lb-http-equiv` instead; markup-inserted ones are removed by
  `processEl`). No Trusted Types policy is created or faked.

## Honest limits (what is left)
- The opener and popup are never both visible; the popup is a tab. Features such as `width/height/left/top` are ignored.
- One popup at a time; the popup ends when the member leaves the pair.
- Not the same as Google's own login: `accounts.google.com` can still show "This browser or app may not be secure" (embedded-browser policy), and
  WebAuthn/passkeys, FedCM, One Tap iframes and `crypto.subtle` in the opaque-origin document are unchanged. Label it best effort. No fingerprint
  changes, no challenge handling, no UA tricks were added (BOTCHECK standing line).
- The Trusted Types hypothesis from the audit (Google's header breaks our rewriting) was not confirmed: the header never reaches the document.
  Whether Google's own page works in the frame needs a real browser trace on a Chromebook.
