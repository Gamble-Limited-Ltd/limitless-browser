// S6 settings in six groups, membership page, plan limits, expiry notices, tutorial removed (docs/1.0/UI.md 5, 6.4).
const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { me, bootMember, openSettings } = require('./helpers-ui');

const GROUPS = { search: ['search', 'homescreen', 'shortcuts', 'language'], appearance: ['appearance', 'skins'], privacy: ['privacy', 'cache', 'filesandmedia'], connection: ['connection', 'fallback'], membership: ['membership'], about: ['about'] };

test('settings opens on General and shows six groups; the tutorial is gone', async ({ page }) => {
  const errors = await boot(page);
  await openSettings(page);
  await expect(page.locator('.settings-nav-item')).toHaveText(['General', 'Appearance', 'Privacy and data', 'Connection', 'Membership', 'About']);
  await expect(page.locator('.settings-nav-item.active')).toHaveText('General');
  await expect(page.locator('.settings-section[data-section="search"]')).toBeVisible();
  await expect(page.locator('.settings-section[data-section="homescreen"]')).toBeVisible();
  await expect(page.locator('.settings-section[data-section="privacy"]')).toBeHidden();
  expect(await page.locator('#tutorialOverlay, #restartTutorialBtn, [data-section="tutorial"], [data-section="tutorial-page"]').count()).toBe(0);
  expect(errors).toEqual([]);
});

for (const [group, secs] of Object.entries(GROUPS)) {
  test(`group ${group} shows exactly its sections`, async ({ page }) => {
    await boot(page);
    await openSettings(page, group);
    for (const [g2, s2] of Object.entries(GROUPS)) for (const sec of s2) {
      const l = page.locator(`.settings-section[data-section="${sec}"]`);
      if (g2 === group) await expect(l, sec).toBeVisible(); else await expect(l, sec).toBeHidden();
    }
    await expect(page.locator('.settings-nav-item.active')).toHaveAttribute('data-section', group);
  });
}

test('a deep link to an old section opens its group', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.LB_go('limitless://settings/cache'));
  await expect(page.locator('.settings-section[data-section="privacy"]')).toBeVisible();
  await expect(page.locator('.settings-section[data-section="cache"]')).toBeVisible();
  await expect(page.locator('.settings-nav-item.active')).toHaveText('Privacy and data');
});

test('developer mode switch in General follows the menu', async ({ page }) => {
  await boot(page);
  await openSettings(page, 'search');
  await page.locator('#lbDevSwitch').click();
  await expect(page.locator('#devToggle')).toBeVisible();
  await expect(page.locator('#lbDevSwitch')).toHaveAttribute('aria-checked', 'true');
});

test('membership page: name before number, tier, plan limits, coming soon while plans are not open', async ({ page }) => {
  await bootMember(page, me());
  await openSettings(page, 'membership');
  const root = page.locator('#lbMemberPage');
  await expect(root.locator('.lb-mc-card .lb-mc-n')).toHaveText('Alex Morgan');
  await expect(root.locator('.lb-mc-card .lb-mc-no')).toHaveText('No. 0047');
  expect((await root.locator('.lb-mc-card .lb-mc-n').boundingBox()).y).toBeLessThan((await root.locator('.lb-mc-card .lb-mc-ft').boundingBox()).y);
  await expect(root).toContainText('Ordinal plan');
  await expect(root.locator('.lb-dl')).toContainText('Open tabs');
  await expect(root.locator('.lb-dl')).toContainText('4 hours');
  await expect(root.locator('.lb-pl')).toHaveText('Paid plans are coming soon.');
  await expect(root).toContainText('Certificates begin at the Cardinal plan');
});

test('plans open: the coming soon line becomes a link', async ({ page }) => {
  await bootMember(page, me({}, { plansOpen: true }));
  await openSettings(page, 'membership');
  await expect(page.locator('#lbMemberPage .lb-pl a')).toHaveText('See the plans');
});

test('Cardinal membership page shows paid-until, the expiry notice at 14 days, and the certificate links', async ({ page }) => {
  const soon = Date.now() + 10 * 864e5;
  await bootMember(page, me({ tier: 'cardinal', certificateCode: 'ABCD-1234' }, { tier: 'cardinal', paidUntil: soon, limits: { tabs: 15, dailyMinutes: 0, weeklyGb: 20 } }));
  await openSettings(page, 'membership');
  await expect(page.locator('#lbMemberPage .lb-warn')).toContainText('Your Cardinal plan ends on');
  await expect(page.locator('#lbMemberPage')).toContainText('Certificate code ABCD-1234');
  await expect(page.locator('#lbMemberPage a[href*="certificate.pdf?variant=print"]')).toBeVisible();
  await expect(page.locator('#lbMemberPage .lb-dl')).toContainText('20 GB');
});

test('expiry levels: none beyond 14 days, near at 14, soon at 3 or less, none for Executive or Ordinal', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const now = Date.UTC(2026, 11, 1), d = (n) => now + n * 864e5, m = (tier, paidUntil) => ({ plan: { tier, paidUntil } });
    const e = window.LBUI.expiry;
    return [e(m('prime', d(30)), now), e(m('prime', d(14)), now), e(m('prime', d(3)), now), e(m('prime', d(1)), now), e(m('executive', null), now), e(m('ordinal', null), now), e(m('prime', d(-1)), now)].map((x) => x && [x.days, x.level, x.text]);
  });
  expect(r[0]).toBe(null);
  expect(r[1].slice(0, 2)).toEqual([14, 'near']);
  expect(r[2].slice(0, 2)).toEqual([3, 'soon']);
  expect(r[2][2]).toBe('Your Prime plan ends in 3 days, on December 3, 2026.');
  expect(r[3][2]).toContain('ends in 1 day,');
  expect(r.slice(4)).toEqual([null, null, null]);
});

test('membership page limits: 0 downloads a day means any number; video and Load Now lines', async ({ page }) => {
  await bootMember(page, me({ tier: 'executive' }, { tier: 'executive', limits: { tabs: 50, dailyMinutes: 0, downloadMbPerFile: 2048, downloadsPerDay: 0, videoMaxP: 0, loadNowPerDay: 10 } }));
  await openSettings(page, 'membership');
  const dl = page.locator('#lbMemberPage .lb-dl');
  await expect(dl).toContainText('up to 2048 MB each, any number a day');
  await expect(dl).toContainText('Load Now');
  await expect(dl).toContainText('10 a day');
  await expect(dl).toContainText('No limit');
});
