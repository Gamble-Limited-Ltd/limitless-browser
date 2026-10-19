const { test, expect } = require('@playwright/test');

const KEY = 'limitless:theme:v1';
const THEMES = ['luxury', 'fancy', 'minimal', 'soft', 'retro', 'ledger', 'mono', 'vault'];
// --lb-bg per docs/DESIGN.md section 1.
const BG = {
  'luxury/dark': '#070a10', 'luxury/light': '#eeece6',
  'fancy/dark': '#0e1230', 'ledger/dark': '#0b0912', 'ledger/light': '#f0e8d0',
  'minimal/light': '#fcfcfd', 'vault/dark': '#000000',
};

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
const attrs = (page) => page.evaluate(() => {
  const r = document.documentElement;
  return { theme: r.getAttribute('data-lb-theme'), mode: r.getAttribute('data-lb-mode'), mark: r.getAttribute('data-lb-mark') };
});
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const bgOf = (page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lb-bg').trim().toLowerCase());
async function openAppearance(page) {
  // Right after a reload the app may still be wiring its buttons, so retry until the section shows.
  await expect(async () => {
    await page.evaluate(() => {
      const n = document.getElementById('lbRelayNo'); if (n) n.click();
      document.getElementById('settingsBtn').click();
      document.querySelector('.settings-nav-item[data-section="appearance"]').click();
    });
    await expect(page.locator('#lbThemeGrid')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20000 });
}

test.describe('dark system', () => {
  test.use({ colorScheme: 'dark' });
  test('default is luxury, mode auto resolves to dark, tokens match the spec', async ({ page }) => {
    const errors = await boot(page);
    expect(await attrs(page)).toEqual({ theme: 'luxury', mode: 'dark', mark: 'orbit' });
    expect(await bgOf(page)).toBe(BG['luxury/dark']);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('every theme in the grid applies, persists across reload, and Vault forces dark', async ({ page }) => {
    const errors = await boot(page);
    await openAppearance(page);
    for (const id of THEMES) {
      await page.locator(`#lbThemeCard .lb-tcard[data-theme="${id}"]`).click();
      const a = await attrs(page);
      expect(a.theme).toBe(id);
      expect(a.mode).toBe('dark');
      expect((await saved(page)).theme).toBe(id);
      await expect(page.locator(`#lbThemeCard .lb-tcard[data-theme="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
      await page.reload();
      await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
      expect((await attrs(page)).theme).toBe(id);
      await openAppearance(page);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('light system', () => {
  test.use({ colorScheme: 'light' });
  test('auto follows the system, explicit mode wins, Vault is dark only', async ({ page }) => {
    const errors = await boot(page);
    expect((await attrs(page)).mode).toBe('light');
    expect(await bgOf(page)).toBe(BG['luxury/light']);
    await openAppearance(page);

    await page.locator('#lbModeSeg button[data-mode="dark"]').click();
    expect((await attrs(page)).mode).toBe('dark');
    expect((await saved(page)).mode).toBe('dark');
    await page.locator('#lbModeSeg button[data-mode="auto"]').click();
    expect((await attrs(page)).mode).toBe('light');

    // Computed tokens for other themes and modes.
    await page.locator('#lbThemeCard .lb-tcard[data-theme="minimal"]').click();
    expect(await bgOf(page)).toBe(BG['minimal/light']);
    await page.locator('#lbThemeCard .lb-tcard[data-theme="ledger"]').click();
    expect(await bgOf(page)).toBe(BG['ledger/light']);
    await page.locator('#lbModeSeg button[data-mode="dark"]').click();
    expect(await bgOf(page)).toBe(BG['ledger/dark']);
    await page.locator('#lbModeSeg button[data-mode="auto"]').click();
    expect(await bgOf(page)).toBe(BG['ledger/light']);

    // Vault: dark only, Light is disabled and explained.
    await page.locator('#lbThemeCard .lb-tcard[data-theme="vault"]').click();
    expect(await attrs(page)).toMatchObject({ theme: 'vault', mode: 'dark' });
    expect(await bgOf(page)).toBe(BG['vault/dark']);
    await expect(page.locator('#lbModeSeg button[data-mode="light"]')).toBeDisabled();
    await expect(page.locator('#lbModeNote')).toHaveText('Vault is dark only.');
    // Leaving Vault restores light in auto.
    await page.locator('#lbThemeCard .lb-tcard[data-theme="luxury"]').click();
    expect((await attrs(page)).mode).toBe('light');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('mark picker applies, persists and the favicon stays Orbit', async ({ page }) => {
    const errors = await boot(page);
    await openAppearance(page);
    await page.locator('#lbMarkGrid .lb-mcard[data-mark="lens"]').click();
    expect((await attrs(page)).mark).toBe('lens');
    expect((await saved(page)).mark).toBe('lens');
    await page.reload();
    await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
    expect((await attrs(page)).mark).toBe('lens');
    expect(await page.locator('link[rel="icon"]').getAttribute('href')).toBe('favicon.svg');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test('theme drawer opens from the toolbar, switches theme, closes on Escape and outside click', async ({ page }) => {
  const errors = await boot(page);
  const drawer = page.locator('#lbThemeDrawer');
  await page.locator('#lbThemeBtn').click({ force: true });
  await expect(drawer).toBeVisible();
  await drawer.locator('.lb-drow[data-theme="soft"]').click();
  expect((await attrs(page)).theme).toBe('soft');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await page.locator('#lbThemeBtn').click({ force: true });
  await expect(drawer).toBeVisible();
  await page.mouse.click(300, 400);
  await expect(drawer).toBeHidden();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('relay notice is themed, and Not now dismisses it', async ({ page }) => {
  await page.goto('/index.html');
  const notice = page.locator('#lbRelayNotice');
  await expect(notice).toBeVisible({ timeout: 30000 });
  await expect(notice.locator('.lb-tag')).toHaveText('Relay notice');
  await expect(notice.locator('h3')).toHaveText('Our relay is not reachable right now.');
  expect(await notice.locator('.lb-notice').evaluate((e) => e.getBoundingClientRect().width)).toBe(380);
  await page.locator('#lbRelayNo').click();
  await expect(notice).toHaveCount(0);
});
