// S6 paid themes (docs/1.0/UI.md 7, PAID-TIERS-PLAN: paid themes locked by plan, lapse falls back to the last free theme).
const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { me, bootMember, refreshMe, openSettings } = require('./helpers-ui');

const ALL = ['luxury', 'fancy', 'minimal', 'soft', 'retro', 'ledger', 'mono', 'vault', 'ink', 'silver', 'garnet', 'gilt', 'onyx', 'crplat'];
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('every theme and mode keeps 4.5:1 for text, muted text and text on the accent', async ({ page }) => {
  await boot(page);
  for (const id of ALL) {
    for (const mode of ['dark', 'light']) {
      const t = await page.evaluate(([i, m]) => {
        const r = document.documentElement; r.setAttribute('data-lb-theme', i); r.setAttribute('data-lb-mode', m);
        const cs = getComputedStyle(r); const g = (k) => cs.getPropertyValue('--lb-' + k).trim().toLowerCase();
        return { bg: g('bg'), surf: g('surf'), fg: g('fg'), mut: g('mut'), acc: g('acc'), on: g('on') };
      }, [id, mode]);
      expect(ratio(t.fg, t.bg), `${id}/${mode} fg/bg`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.mut, t.bg), `${id}/${mode} mut/bg`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.mut, t.surf), `${id}/${mode} mut/surf`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t.on, t.acc), `${id}/${mode} on/acc`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('Ordinal: Vault, Ink blue, Silver, Garnet, Gilt and Onyx are locked and a click changes nothing', async ({ page }) => {
  const errors = await bootMember(page, me());
  await openSettings(page, 'appearance');
  for (const id of ['vault', 'ink', 'silver', 'garnet', 'crplat', 'gilt', 'onyx']) {
    const tile = page.locator(`#lbThemeCard .lb-tcard[data-theme="${id}"]`);
    await expect(tile).toHaveAttribute('data-locked', '');
    await expect(tile).toHaveAttribute('aria-disabled', 'true');
    await tile.click({ force: true });   // aria-disabled looks disabled to Playwright; a person can still click it and gets the note
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-lb-theme'))).toBe('luxury');
  }
  await expect(page.locator('#lbLockNote')).toContainText('Onyx is part of the Executive plan');
  await page.locator('#lbThemeCard .lb-tcard[data-theme="vault"]').click({ force: true });
  await expect(page.locator('#lbLockNote')).toHaveText('Vault is reserved for paid plans.');
  await expect(page.locator('#lbThemeCard .lb-tcard[data-theme="ledger"]')).not.toHaveAttribute('data-locked', '');
  expect(errors).toEqual([]);
});

test('Ordinal with Vault saved from before is moved to the last free theme with a quiet note', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: 'vault', mode: 'auto', mark: 'orbit' })); localStorage.setItem('limitless:lastfree:v1', 'ledger'); });
  await bootMember(page, me());
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-lb-theme'))).toBe('ledger');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('limitless:theme:v1')).theme)).toBe('ledger');
  await openSettings(page, 'appearance');
  await expect(page.locator('#lbLockNote')).toHaveText('Vault is reserved for paid plans. Switched to Gilded Ledger.');
});

test('Cardinal unlocks Vault, Ink blue and Silver but not Garnet; Prime unlocks Garnet; Executive everything', async ({ page }) => {
  let answer = me({ tier: 'cardinal' }, { tier: 'cardinal', paidUntil: Date.now() + 90 * 864e5 });
  await bootMember(page, () => answer);
  await openSettings(page, 'appearance');
  const locked = async (id) => (await page.locator(`#lbThemeCard .lb-tcard[data-theme="${id}"]`).getAttribute('data-locked')) !== null;
  for (const id of ['vault', 'ink', 'silver']) expect(await locked(id), id).toBe(false);
  for (const id of ['garnet', 'crplat', 'gilt', 'onyx']) expect(await locked(id), id).toBe(true);
  await page.locator('#lbThemeCard .lb-tcard[data-theme="ink"]').click();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-lb-theme'))).toBe('ink');
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-lb-mode'))).toBe('dark');
  answer = me({ tier: 'prime' }, { tier: 'prime', paidUntil: Date.now() + 90 * 864e5 });
  await refreshMe(page);
  expect(await locked('garnet')).toBe(false);
  expect(await locked('crplat')).toBe(false);
  expect(await locked('gilt')).toBe(true);
  answer = me({ tier: 'executive' }, { tier: 'executive' });
  await refreshMe(page);
  for (const id of ALL) expect(await locked(id), id).toBe(false);
});

test('a lapsed plan falls back to the last free theme and a later renewal does not bring the paid theme back by itself', async ({ page }) => {
  let answer = me({ tier: 'prime' }, { tier: 'prime', paidUntil: Date.now() + 864e5 });
  await page.addInitScript(() => { if (!localStorage.getItem('limitless:theme:v1')) localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: 'fancy', mode: 'dark', mark: 'orbit' })); });
  await bootMember(page, () => answer);
  await openSettings(page, 'appearance');
  await page.locator('#lbThemeCard .lb-tcard[data-theme="garnet"]').click();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-lb-theme'))).toBe('garnet');
  // The gate now reports the effective plan as ordinal (paid_until passed).
  answer = me({ tier: 'prime' }, { tier: 'ordinal', paidUntil: Date.now() - 1000 });
  await refreshMe(page);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-lb-theme'))).toBe('fancy');
  await expect(page.locator('#lbLockNote')).toHaveText('Garnet needs the Prime plan. Switched to Fancy.');
  answer = me({ tier: 'prime' }, { tier: 'prime', paidUntil: Date.now() + 864e5 });
  await refreshMe(page);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-lb-theme'))).toBe('fancy');
});

test('without membership data nothing is locked (static server, old gate, membership off)', async ({ page }) => {
  await boot(page);
  await openSettings(page, 'appearance');
  await expect(page.locator('#lbThemeCard .lb-tcard[data-locked]')).toHaveCount(0);
  await page.locator('#lbThemeCard .lb-tcard[data-theme="gilt"]').click();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-lb-theme'))).toBe('gilt');
});

test('tier marks and the icon sprite exist', async ({ page }) => {
  await boot(page);
  for (const t of ['ordinal', 'cardinal', 'prime', 'executive']) expect(await page.locator(`#lb-mk-tier-${t}`).count()).toBe(1);
  const r = await page.request.get('/theme/icons.svg');
  expect(r.ok()).toBe(true);
  expect(((await r.text()).match(/<symbol /g) || []).length).toBeGreaterThanOrEqual(30);
});
