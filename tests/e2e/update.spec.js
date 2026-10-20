const { test, expect } = require('@playwright/test');

const OWN = 'aaaaaaa';
const NEWER = 'bbbbbbb';

async function boot(page, { sha = OWN, version = { version: '0.1.1', sha: NEWER, security: false }, status = 200 } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((s) => { window.LB_BUILD_SHA = s; }, sha);
  await page.route('**/version.json*', (r) => status === 200
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(version) })
    : r.fulfill({ status, body: 'nope' }));
  await page.goto('/index.html');
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
  const skip = page.locator('#tutorialOverlay button', { hasText: 'Skip tour' });
  try { await skip.waitFor({ state: 'visible', timeout: 12000 }); await skip.click(); } catch (_) {}
  await expect(page.locator('#tutorialOverlay')).toBeHidden();
  if (await no.isVisible().catch(() => false)) await no.click();
  return errors;
}
const check = (page) => page.evaluate(() => window.LB_checkForUpdate());

test.describe('update notice', () => {
  test('same sha: no banner, no pill', async ({ page }) => {
    await boot(page, { version: { version: '0.1.0', sha: OWN, security: false } });
    expect(await check(page)).toBeNull();
    await expect(page.locator('#lbUpdateBanner')).toHaveCount(0);
    await expect(page.locator('#lbUpdatePill')).toHaveCount(0);
  });

  test('dev build or missing version.json: silently skipped', async ({ page }) => {
    await boot(page, { sha: 'dev' });
    expect(await check(page)).toBeNull();
    await expect(page.locator('#lbUpdateBanner')).toHaveCount(0);
    const p2 = await page.context().newPage();
    const errors = await boot(p2, { status: 404 });
    expect(await check(p2)).toBeNull();
    await expect(p2.locator('#lbUpdateBanner')).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('different sha: banner with Reload and What\'s new; dismiss leaves a pill; never reloads by itself', async ({ page }) => {
    const errors = await boot(page);
    await page.evaluate(() => { window.__noReload = 'still here'; });
    const info = await check(page);
    expect(info.sha).toBe(NEWER);
    const banner = page.locator('#lbUpdateBanner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Update available');
    await expect(banner).not.toContainText('Security');
    await expect(page.locator('#lbUpdateReload')).toHaveText('Reload');
    await expect(page.locator('#lbUpdateWhatsNew')).toHaveText("What's new");
    await expect(page.locator('#lbUpdatePill')).toBeHidden();

    await page.locator('#lbUpdateDismiss').click();
    await expect(banner).toBeHidden();
    await expect(page.locator('#lbUpdatePill')).toBeVisible();
    // A later check of the same build does not bring the banner back.
    await check(page);
    await expect(banner).toBeHidden();

    // Clicking the pill shows the banner again.
    await page.locator('#lbUpdatePill').click();
    await expect(banner).toBeVisible();
    await page.locator('#lbUpdateDismiss').click();

    // Never reloads by itself, including across the 3 s startup check and a visibility change.
    await page.waitForTimeout(4500);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__noReload)).toBe('still here');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('security true: security wording', async ({ page }) => {
    await boot(page, { version: { version: '0.1.1', sha: NEWER, security: true } });
    await check(page);
    await expect(page.locator('#lbUpdateBanner')).toContainText('Security update');
  });

  test('What\'s new link opens the change log page', async ({ page }) => {
    const errors = await boot(page);
    await check(page);
    await page.locator('#lbUpdateWhatsNew').click();
    await expect(page.locator('#url')).toHaveValue('limitless://whats-new');
    const wn = page.locator('#lbWhatsNew');
    await expect(wn).toBeVisible();
    await expect(wn.locator('h1')).toHaveText('Changelog');
    await expect(wn.locator('h2').first()).toContainText(/^\d+\.\d+\.\d+/);
    await expect(wn.locator('li').first()).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('About has What\'s new, Privacy and Terms (once each)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { document.getElementById('settingsBtn').click(); document.querySelector('.settings-nav-item[data-section="about"]').click(); });
    const about = page.locator('#lbAboutInfo');
    await expect(about.locator('a[href="/legal/privacy.html"]')).toHaveCount(1);
    await expect(about.locator('a[href="/legal/terms.html"]')).toHaveCount(1);
    await expect(about.locator('a[target="_blank"][href="/legal/privacy.html"]')).toHaveAttribute('rel', /noopener/);
    await expect(about.locator('#lbAboutWhatsNew')).toHaveCount(1);
  });
});

test('the change log renderer escapes everything outside its small subset', async ({ page }) => {
  await page.route('**/CHANGELOG.md', (r) => r.fulfill({
    contentType: 'text/markdown; charset=utf-8',
    body: '# T\n\n<img src=x onerror="window.__pwn=1"> <script>window.__pwn=2</script>\n\n- [bad](javascript:alert(1)) and [ok](https://example.com)\n',
  }));
  await boot(page);
  await page.fill('#url', 'limitless://whats-new');
  await page.press('#url', 'Enter');
  const wn = page.locator('#lbWhatsNew');
  await expect(wn.locator('h1')).toHaveText('T');
  await expect(wn.locator('img, script')).toHaveCount(0);
  await expect(wn.locator('p').first()).toContainText('<img src=x');
  await expect(wn.locator('a')).toHaveCount(1);
  await expect(wn.locator('a')).toHaveText('ok');
  await expect(wn.locator('li')).toContainText('[bad](javascript:alert(1))');
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
});
