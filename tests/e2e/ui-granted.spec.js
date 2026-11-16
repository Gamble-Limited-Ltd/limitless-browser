// 1.1 WP2 (docs/1.1/DESIGN-GAPS.md 3, 4, 10, 12): member card and strip, membership panel order, rail foot, splash foot, and the
// plan-granted moment ("the card turns over").
const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { me, bootMember, refreshMe, openSettings } = require('./helpers-ui');

const card = me({ tier: 'cardinal' }, { tier: 'cardinal', paidUntil: Date.now() + 200 * 864e5, limits: { tabs: 15, dailyMinutes: 0, weeklyGb: 20 }, cap: { usedGb: 11.4, capGb: 20 }, topupGbLeft: 5 });

test('member card: foil card in the panel and strip on the start page carry the tier hooks and four-digit number', async ({ page }) => {
  await bootMember(page, card);
  const strip = page.locator('#lbMemberCard');
  await expect(strip).toHaveAttribute('data-tier', 'cardinal');
  await expect(strip.locator('.lb-mc-n')).toHaveText('Alex Morgan');
  await expect(strip.locator('.lb-mc-t')).toHaveText('Cardinal');
  await expect(strip.locator('.lb-mc-no')).toHaveText('No. 0047');
  const tc = await strip.evaluate((e) => getComputedStyle(e).getPropertyValue('--tc').trim());
  expect(tc.length).toBeGreaterThan(3);
  await openSettings(page, 'membership');
  const c = page.locator('#lbMemberPage .lb-mc-card');
  await expect(c).toBeVisible();
  await expect(c.locator('.lb-mc-ft')).toContainText('No. 0047');
  await expect(c.locator('.lb-mc-ft')).toContainText('Since Nov 2026');
  const ar = await c.evaluate((e) => e.getBoundingClientRect().width / e.getBoundingClientRect().height);
  expect(ar).toBeGreaterThan(1.5); expect(ar).toBeLessThan(1.65);
});

test('membership panel: card first, then the summary, rows and the folded plan limits', async ({ page }) => {
  await bootMember(page, me({ tier: 'cardinal', certificateCode: 'ABCD-1234' }, { tier: 'cardinal', paidUntil: Date.now() + 200 * 864e5, trialAvailable: false, limits: { tabs: 15, dailyMinutes: 0, weeklyGb: 20 }, cap: { usedGb: 11.4, capGb: 20 }, topupGbLeft: 5 }));
  await openSettings(page, 'membership');
  const root = page.locator('#lbMemberPage');
  const ys = async (sel) => (await root.locator(sel).first().boundingBox()).y;
  expect(await ys('.lb-mc-card')).toBeLessThan(await ys('.lb-sum'));
  expect(await ys('.lb-sum')).toBeLessThan(await ys('.lb-rows'));
  const cells = root.locator('.lb-sum-c');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toContainText('11.4 of 20 GB');
  await expect(cells.nth(1)).toContainText('5 GB');
  await expect(cells.nth(2)).toContainText('days left');
  await expect(root.locator('.lb-row', { hasText: 'Paid until' })).toBeVisible();
  await expect(root.locator('.lb-row', { hasText: 'Standing' }).locator('.lb-pill')).toHaveText('Good standing');
  await expect(root.locator('.lb-row', { hasText: 'Certificate' })).toContainText('ABCD-1234');
  const incl = root.locator('details.lb-incl');
  await expect(incl).not.toHaveAttribute('open', '');
  await incl.locator('summary').click();
  await expect(incl.locator('.lb-dl')).toContainText('20 GB');
});

test('membership panel: Ordinal with plans open and a trial available gets the trial row', async ({ page }) => {
  let posted = 0;
  await page.route('**/_lb/trial', (r) => { posted++; r.fulfill({ json: { ok: true } }); });
  await bootMember(page, me({}, { plansOpen: true, trialAvailable: true }));
  await openSettings(page, 'membership');
  const row = page.locator('#lbMemberPage .lb-row', { hasText: 'Try Cardinal for 24 hours' });
  await expect(row).toBeVisible();
  await row.locator('button').click();
  await expect.poll(() => posted).toBe(1);
  await expect(page.locator('#lbMemberPage .lb-sum')).toHaveCount(0);
});

test('menu: header is the strip and Plans is the accent item only while plans are open', async ({ page }) => {
  await bootMember(page, me({ tier: 'prime' }, { tier: 'prime', plansOpen: true }));
  await page.locator('#lbMenuBtn').click();
  await expect(page.locator('#lbMenu .lb-mh[data-tier="prime"]')).toHaveCount(1);
  await expect(page.locator('#lbMenu [data-id="plans"]')).toHaveAttribute('data-accent', '1');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.LB_member.plan.plansOpen = false);
  await page.locator('#lbMenuBtn').click();
  await expect(page.locator('#lbMenu [data-id="plans"]')).not.toHaveAttribute('data-accent', '1');
});

test('markSvg: 20 px and below use the small Executive mark, larger sizes the full one', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => [
    LBUI.markSvg('executive').querySelector('use').getAttribute('href'),
    LBUI.markSvg('executive', 20).querySelector('use').getAttribute('href'),
    LBUI.markSvg('executive', 16).querySelector('use').getAttribute('href'),
    LBUI.markSvg('executive', 24).querySelector('use').getAttribute('href'),
    LBUI.markSvg('prime', 16).querySelector('use').getAttribute('href'),
  ]);
  expect(r).toEqual(['#lb-mk-tier-executive', '#lb-mk-tier-executive-sm', '#lb-mk-tier-executive-sm', '#lb-mk-tier-executive', '#lb-mk-tier-prime']);
});

test('vertical rail: the member strip sits at the foot of the rail', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('limitless:tablayout:v1', 'side'));
  await page.setViewportSize({ width: 1366, height: 768 });
  await bootMember(page, card);
  const foot = page.locator('.titlebar .lb-rail-me');
  await expect(foot).toBeVisible();
  await expect(foot.locator('.lb-mc-n')).toHaveText('Alex Morgan');
  const f = await foot.boundingBox(), tb = await page.locator('.titlebar').boundingBox();
  expect(f.y + f.height).toBeGreaterThan(tb.y + tb.height - 40);
  await page.evaluate(() => localStorage.setItem('limitless:tabrail:v1', 'min'));
  await page.locator('#lbRailToggle').click();
  await expect(foot.locator('.lb-mc-n')).toBeHidden();
});

test('splash: a footer line with number and tier sits at the bottom', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('limitless:me:v1', JSON.stringify({ name: 'Alex Morgan', number: '0047', tier: 'cardinal' })));
  await boot(page);
  await expect(page.locator('.lb-sp-foot')).toHaveText('No. 0047 · Cardinal');
});

const GRANT = (tier, over) => me({ tier }, { tier, paidUntil: Date.now() + 300 * 864e5, ...over });

test('granted moment: a tier that rises opens the card-turns-over dialog once; Later closes it and it does not return', async ({ page }) => {
  let ans = GRANT('ordinal', { paidUntil: null });
  await bootMember(page, () => ans);
  await expect(page.locator('#lbGranted')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('limitless:lasttier:v1'))).toBe('ordinal');
  ans = GRANT('cardinal');
  await refreshMe(page);
  const d = page.locator('#lbGranted');
  await expect(d).toBeVisible();
  await expect(d).toHaveAttribute('role', 'dialog');
  await expect(d.locator('h2')).toHaveText('You are now Cardinal');
  await expect(d.locator('.lb-gr-old')).toHaveAttribute('data-tier', 'ordinal');
  await expect(d.locator('.lb-gr-new')).toHaveAttribute('data-tier', 'cardinal');
  await expect(d).toContainText('From today until');
  await d.getByRole('button', { name: 'Later' }).click();
  await expect(d).toHaveCount(0);
  await refreshMe(page);
  await expect(page.locator('#lbGranted')).toHaveCount(0);
});

test('granted moment: See what is new opens Settings > Membership', async ({ page }) => {
  let ans = GRANT('ordinal', { paidUntil: null });
  await bootMember(page, () => ans);
  ans = GRANT('prime'); await refreshMe(page);
  await page.getByRole('button', { name: 'See what is new' }).click();
  await expect(page.locator('#lbGranted')).toHaveCount(0);
  await expect(page.locator('.settings-nav-item.active')).toHaveText('Membership');
});

test('granted moment: first load ever, same tier and a drop all stay silent', async ({ page }) => {
  let ans = GRANT('cardinal');
  await bootMember(page, () => ans);
  await expect(page.locator('#lbGranted')).toHaveCount(0);
  await refreshMe(page);
  await expect(page.locator('#lbGranted')).toHaveCount(0);
  ans = GRANT('ordinal', { paidUntil: null }); await refreshMe(page);
  await expect(page.locator('#lbGranted')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('limitless:lasttier:v1'))).toBe('ordinal');
});

test('granted moment: the gate field plan.grantedAt triggers it, also for a renewal at the same tier', async ({ page }) => {
  let ans = GRANT('cardinal', { grantedAt: 1000 });
  await bootMember(page, () => ans);
  await expect(page.locator('#lbGranted')).toHaveCount(0);
  ans = GRANT('cardinal', { grantedAt: 2000 }); await refreshMe(page);
  await expect(page.locator('#lbGranted')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('limitless:lastgrant:v1'))).toBe('2000');
});

test('granted moment: reduced motion shows the new card at once, without the flip', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let ans = GRANT('ordinal', { paidUntil: null });
  await bootMember(page, () => ans);
  ans = GRANT('executive'); await refreshMe(page);
  const d = page.locator('#lbGranted');
  await expect(d).toBeVisible();
  const an = await d.locator('.lb-gr-new').evaluate((e) => getComputedStyle(e).animationName);
  expect(an).toBe('none');
  await expect(d.locator('.lb-gr-old')).toBeHidden();
});
