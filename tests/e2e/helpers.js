const { expect } = require('@playwright/test');

/** Load the app shell from the static server and dismiss the first-run overlays. Returns the page error list. */
async function boot(page, { init, arg, tourTimeout = 12000 } = {}) {
  const errors = [];
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

module.exports = { boot };
