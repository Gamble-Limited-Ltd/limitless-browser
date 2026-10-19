const { test, expect } = require('@playwright/test');

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/index.html');
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  // The relay notice shows on the static test server (no /wisp/); dismiss it if it has appeared.
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
  // The first-run tour covers the page once the proxy core is ready; skip it (the choice is remembered).
  const skip = page.locator('#tutorialOverlay button', { hasText: 'Skip tour' });
  try { await skip.waitFor({ state: 'visible', timeout: 12000 }); await skip.click(); } catch (_) {}
  await expect(page.locator('#tutorialOverlay')).toBeHidden();
  if (await no.isVisible().catch(() => false)) await no.click();
  return errors;
}

test.describe('start page', () => {
  test.use({ colorScheme: 'dark', locale: 'en-GB' });

  test('renders mark, wordmark, greeting, clock, search and the footer stamp', async ({ page }) => {
    const errors = await boot(page);
    const nt = page.locator('#newtab');
    await expect(nt).toHaveClass(/active/);
    await expect(nt.locator('.nt-brand svg.lb-mk')).toBeVisible();
    await expect(nt.locator('.nt-brand .lb-word')).toHaveText('Limitless Browser');
    await expect(page.locator('#ntDate')).toHaveText(/^Good (morning|afternoon|evening), \w+ \d{1,2} \w+$/);
    await expect(page.locator('#ntTimeText')).toHaveText(/^\d{1,2}:\d{2}$/);
    const search = page.locator('#ntSearch');
    await expect(search).toHaveAttribute('placeholder', 'Search the web or type an address');
    await expect(page.locator('#ntSearchBtn')).toHaveText('Enter');
    await expect(nt.locator('.nt-foot-l')).toHaveText('Private browsing proxy');
    // Dark mode shows the dark stamp only.
    await expect(nt.locator('.nt-foot-r img.lb-stamp-d')).toBeVisible();
    await expect(nt.locator('.nt-foot-r img.lb-stamp-l')).toBeHidden();
    // The search field has focus on load, and the engine selector is a keyboard-reachable control.
    await page.locator('#home').click();
    await expect(search).toBeFocused();
    await expect(page.locator('#ntEngine')).toHaveAttribute('tabindex', '0');
    // The leftover buttons are gone (GitHub) or hidden (wallpaper).
    await expect(page.locator('#ntGithubBtn')).toHaveCount(0);
    await expect(page.locator('#ntWallpaperBtn')).toBeHidden();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('light mode shows the light stamp', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await boot(page);
    await expect(page.locator('#newtab .nt-foot-r img.lb-stamp-l')).toBeVisible();
    await expect(page.locator('#newtab .nt-foot-r img.lb-stamp-d')).toBeHidden();
  });

  test('typing a query and pressing Enter navigates away from the start page', async ({ page }) => {
    const errors = await boot(page);
    await page.locator('#ntSearch').fill('example.com');
    await page.locator('#ntSearch').press('Enter');
    await expect(page.locator('#newtab')).not.toHaveClass(/active/);
    await expect(page.locator('#url')).not.toHaveValue('limitless://newtab');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('adding a shortcut shows a tile, and it can be removed', async ({ page }) => {
    const errors = await boot(page);
    await expect(page.locator('#ntFavorites .nt-fav-box')).toHaveCount(0);
    await page.locator('#ntFavAddBtn').click();
    await page.locator('#favoriteUrlInput').fill('https://example.org/');
    await page.locator('#favoriteNameInput').fill('Example');
    await page.locator('#addFavoriteSave').click();
    const tile = page.locator('#ntFavorites .nt-fav-box');
    await expect(tile).toHaveCount(1);
    await expect(page.locator('#ntFavorites .nt-fav-title').first()).toHaveText('Example');
    // Tiles are real links, reachable by Tab.
    await expect(tile).toHaveAttribute('href', '#');
    await tile.hover();
    await page.locator('#ntFavorites .nt-fav-delete').click();
    await expect(tile).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('responsive: no horizontal overflow at 760px wide', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 700 });
    await boot(page);
    const over = await page.evaluate(() => { const c = document.querySelector('#newtab .nt-content'); return c.scrollWidth - c.clientWidth; });
    expect(over).toBeLessThanOrEqual(0);
  });
});
