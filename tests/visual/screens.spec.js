// Visual and layout suite (docs/1.0/TESTING.md section 3). Full matrix (every theme, both modes, 1366x768 and 2560x1440) for the start
// page, the menu and the settings groups: layout and contrast checks everywhere, screenshots for Luxury dark, one light theme and Cardinal.
const { test, expect } = require('@playwright/test');
const { boot } = require('../e2e/helpers');
const { me, bootMember } = require('../e2e/helpers-ui');
const { checkLayout, checkContrast } = require('./layout');

const COMBOS = [];
for (const t of ['luxury', 'fancy', 'minimal', 'soft', 'retro', 'ledger', 'mono']) for (const m of ['dark', 'light']) COMBOS.push([t, m]);
for (const t of ['vault', 'ink', 'garnet', 'gilt', 'onyx']) COMBOS.push([t, 'dark']);
COMBOS.push(['silver', 'dark'], ['silver', 'light']);
const SIZES = [[1366, 768], [2560, 1440]];
const SHOT = new Set(['luxury/dark', 'soft/light', 'ink/dark']);
const GROUPS = ['search', 'appearance', 'privacy', 'connection', 'membership', 'about'];
const MEMBER = me({ tier: 'executive', certificateCode: 'ABCD-1234', notices: [{ id: 'n1', text: 'The relay will be restarted on Sunday evening.', date: Date.UTC(2026, 10, 20, 12) }] }, { tier: 'executive', plansOpen: false });

for (const [theme, mode] of COMBOS) for (const [w, h] of SIZES) {
  test(`${theme}/${mode} ${w}x${h}: start page, menu and settings`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(([t, m]) => localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: t, mode: m, mark: 'orbit' })), [theme, mode]);
    await bootMember(page, MEMBER);
    const key = `${theme}/${mode}`, tag = `${theme}-${mode}-${w}`;
    await expect(page.locator('#lbMemberCard')).toBeVisible();
    await page.evaluate(() => document.getElementById('ntTimeText').textContent = '10:30');   // the clock would change every snapshot
    expect(await checkLayout(page), 'start page layout').toEqual([]);
    expect(await checkContrast(page, '.lb-startm'), 'start page contrast').toEqual([]);
    if (SHOT.has(key)) await expect(page).toHaveScreenshot(`start-${tag}.png`, { mask: [page.locator('#ntDate'), page.locator('#ntFavorites')] });
    await page.locator('#lbMenuBtn').click();
    expect(await checkLayout(page), 'menu layout').toEqual([]);
    expect(await checkContrast(page, '#lbMenu'), 'menu contrast').toEqual([]);
    if (SHOT.has(key)) await expect(page).toHaveScreenshot(`menu-${tag}.png`, { mask: [page.locator('#ntDate'), page.locator('#ntFavorites')] });
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.getElementById('settingsBtn').click());
    for (const g of GROUPS) {
      await page.evaluate((s) => document.querySelector('.settings-nav-item[data-section="' + s + '"]').click(), g);
      await expect(page.locator('.settings-nav-item.active')).toHaveAttribute('data-section', g);
      expect(await checkLayout(page), `settings ${g} layout`).toEqual([]);
      if (g === 'membership') expect(await checkContrast(page, '#lbMemberPage'), 'membership contrast').toEqual([]);
      if (SHOT.has(key) && (g === 'search' || g === 'membership')) await expect(page).toHaveScreenshot(`settings-${g}-${tag}.png`);
    }
  });
}

// Other screens in three themes: error card, notice (dialog), vertical tabs.
for (const [theme, mode] of [['luxury', 'dark'], ['soft', 'light'], ['ink', 'dark']]) for (const [w, h] of SIZES) {
  test(`${theme}/${mode} ${w}x${h}: vertical tabs and the cap dialog`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(([t, m]) => { localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: t, mode: m, mark: 'orbit' })); localStorage.setItem('limitless:tablayout:v1', 'side'); }, [theme, mode]);
    await bootMember(page, me({ tier: 'cardinal' }, { tier: 'cardinal', limits: { tabs: 1 } }));
    await page.evaluate(() => document.getElementById('ntTimeText').textContent = '10:30');
    await page.locator('#newTab').click();
    await expect(page.locator('#lbCapDlg')).toBeVisible();
    expect(await checkLayout(page), 'layout').toEqual([]);
    expect(await checkContrast(page, '#lbCapDlg'), 'contrast').toEqual([]);
    await expect(page).toHaveScreenshot(`side-cap-${theme}-${mode}-${w}.png`, { mask: [page.locator('#ntDate'), page.locator('#ntFavorites')] });
  });
}
