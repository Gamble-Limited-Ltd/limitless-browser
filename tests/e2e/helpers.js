const { expect } = require('@playwright/test');

// The e2e server has no version.json. Since 0.3.0 the defaults are "our relay off, public relays on" (no page cache, no warm-up),
// which makes go() swap libcurl sessions and replaces the stubs most specs install. boot() therefore answers /version.json with the
// pre-0.3 feature set (the 1.0 path) at CONTEXT level, so a test's own page.route for version.json still wins.
// Pass { features: null } to get the real 0.3.0 defaults (no version.json at all).
const LEGACY_FEATURES = { ownRelay: true, ownSockets: 4, pageCache: true, warm: true };
const legacyVersion = (f) => (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 'dev', sha: 'dev', features: f }) });

/** Load the app shell from the static server and dismiss the first-run overlays. Returns the page error list. */
async function boot(page, { init, arg, tourTimeout = 12000, features = LEGACY_FEATURES } = {}) {
  const errors = [];
  if (features) await page.context().route('**/version.json*', legacyVersion(features));
  page.on('pageerror', (e) => errors.push(String(e)));
  if (init) await page.addInitScript(init, arg);
  await page.goto('/index.html');
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
  const skip = page.locator('#tutorialOverlay button', { hasText: 'Skip tour' });
  try { await skip.waitFor({ state: 'visible', timeout: tourTimeout }); await skip.click(); } catch (_) {}
  await expect(page.locator('#tutorialOverlay')).toBeHidden();
  if (await no.isVisible().catch(() => false)) await no.click();
  return errors;
}

module.exports = { boot, LEGACY_FEATURES };
