// 1.1 WP3 (docs/1.1/DESIGN-GAPS.md 6 and 7): free-tier limits and theme-following notices.
const { test, expect } = require('@playwright/test');
const { me, bootMember, refreshMe } = require('./helpers-ui');

const PAID = { paidUntil: Date.now() + 200 * 864e5 };
const CAT = { ordinal: { tabs: 4, dailyMinutes: 240 }, cardinal: { tabs: 15, dailyMinutes: 0 }, prime: { tabs: 25, dailyMinutes: 0 }, executive: { tabs: 50, dailyMinutes: 0 } };

test('plans line: a thin bar and the time left, a Plans link only while plans are open, none for paid members', async ({ page }) => {
  let answer = me({}, { limits: { dailyMinutes: 240 } });
  await bootMember(page, () => answer);
  await page.evaluate(() => window.LBUI.dayTime.add(110 * 60000));
  const line = page.locator('.lb-planline');
  await expect(line.locator('.lb-bar')).toBeVisible();
  await expect(line).toContainText('2 h 10 m left today');
  await expect(line.locator('a')).toHaveCount(0);
  await expect(line).toHaveAttribute('title', /Ordinal: 4 tabs, 4 hours a day/);
  await page.evaluate(() => window.LBUI.dayTime.add(60000));   // the bar and text follow the tick without repainting the page
  await expect(line).toContainText('2 h 9 m left today');
  answer = me({}, { plansOpen: true });
  await refreshMe(page);
  await expect(page.locator('.lb-planline a')).toHaveText('Plans');
  answer = me({ tier: 'cardinal' }, { tier: 'cardinal', ...PAID, plansOpen: true });
  await refreshMe(page);
  await expect(page.locator('.lb-planline')).toHaveCount(0);
});

test('day finished: on the start page, search dimmed and inert, no overlay, settings stay open', async ({ page }) => {
  await bootMember(page, me({}, { limits: { dailyMinutes: 60 }, plansOpen: true }));
  await page.evaluate(() => window.LBUI.dayTime.add(61 * 60000));
  const done = page.locator('#lbDayDone');
  await expect(done).toContainText('Search is paused until midnight');
  await expect(done).toContainText('About 1 hour used today');
  await expect(done.locator('a')).toHaveText('Plans');
  expect(await page.evaluate(() => !!document.getElementById('lbDayDone').closest('.nt-content'))).toBe(true);
  expect(await page.evaluate(() => document.querySelector('.nt-search').inert)).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.nt-search')).opacity)).toBe('0.45');
  await page.locator('#lbMenuBtn').click();
  await expect(page.locator('#lbMenu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.setItem('limitless:daytime:v1', JSON.stringify({ day: '2000-1-1', ms: 0 })));
  await page.evaluate(() => window.LBUI.dayTime.check());
  await expect(done).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('.nt-search').inert)).toBe(false);
});

test('day finished while a page is open: the tab goes back to the start page once', async ({ page }) => {
  await bootMember(page, me({}, { limits: { dailyMinutes: 60 } }));
  await page.evaluate(() => { document.getElementById('newtab').classList.remove('active'); window.__home = 0; window.LB_home = () => { window.__home++; }; });
  await page.evaluate(() => window.LBUI.dayTime.add(61 * 60000));
  await page.evaluate(() => window.LBUI.dayTime.add(1000));
  expect(await page.evaluate(() => window.__home)).toBe(1);
});

test('fifteen minutes left: a toast with a clock, the midnight line and OK, once a day', async ({ page }) => {
  await bootMember(page, me({}, { limits: { dailyMinutes: 60 } }));
  await page.evaluate(() => window.LBUI.dayTime.add(46 * 60000));
  const t = page.locator('#lbDayNote');
  await expect(t).toHaveClass(/lb-toast/);
  await expect(t).toContainText('15 minutes left today');
  await expect(t).toContainText('Free time starts again at midnight.');
  expect(await t.evaluate((n) => getComputedStyle(n).position)).toBe('fixed');
  await t.getByRole('button', { name: 'OK' }).click();
  await expect(t).toHaveCount(0);
  await page.evaluate(() => window.LBUI.dayTime.add(1000));
  await expect(t).toHaveCount(0);
});

test('Cardinal at the cap: the staircase with the tiers above, See the plans only while plans are open', async ({ page }) => {
  let answer = me({ tier: 'cardinal' }, { tier: 'cardinal', ...PAID, limits: { tabs: 2, dailyMinutes: 0 }, catalog: CAT, plansOpen: false });
  await bootMember(page, () => answer);
  await page.locator('#newTab').click(); await page.locator('#newTab').click();
  const d = page.locator('#lbCapDlg');
  await expect(d).toBeVisible();
  await expect(page.locator('#lbCapT')).toHaveText('That is all your tabs');
  await expect(d.locator('.lb-step')).toHaveCount(0);
  await expect(d.getByRole('button', { name: 'See the plans' })).toHaveCount(0);
  await d.getByRole('button', { name: 'Back to my tabs' }).click();
  await expect(d).toHaveCount(0);
  answer = me({ tier: 'cardinal' }, { tier: 'cardinal', ...PAID, limits: { tabs: 2, dailyMinutes: 0 }, catalog: CAT, plansOpen: true });
  await refreshMe(page);
  await page.locator('#newTab').click();
  await expect(d.locator('.lb-step')).toHaveCount(2);
  await expect(d.locator('.lb-step').nth(0)).toContainText('You now');
  await expect(d.locator('.lb-step').nth(0)).toContainText('2 tabs');
  await expect(d.locator('.lb-step').nth(1)).toContainText('Prime');
  await expect(d.locator('.lb-step').nth(1)).toContainText('25 tabs, no daily limit');
  await d.getByRole('button', { name: 'See the plans' }).click();
  await expect(page.locator('#lbPlans')).toBeVisible();
});

test('the staircase for Ordinal lists Cardinal and Prime (dialog helper; the fifth tab itself still redirects)', async ({ page }) => {
  await bootMember(page, me({}, { catalog: CAT, plansOpen: true }));
  await page.evaluate(() => window.LBUI.capDialog());
  const d = page.locator('#lbCapDlg');
  await expect(page.locator('#lbCapT')).toHaveText('Four tabs is the free limit');
  await expect(d.locator('.lb-step')).toHaveCount(3);
  await expect(d.locator('.lb-step').nth(0)).toContainText('4 tabs, about 4 h a day');
  await expect(d.locator('.lb-step').nth(1)).toContainText('15 tabs, no daily limit');
});

test('Prime at the cap: the joke line, the number, no steps and no plans link', async ({ page }) => {
  await bootMember(page, me({ tier: 'prime' }, { tier: 'prime', ...PAID, limits: { tabs: 2, dailyMinutes: 0 }, catalog: CAT, plansOpen: true }));
  await page.locator('#newTab').click(); await page.locator('#newTab').click();
  const d = page.locator('#lbCapDlg');
  await expect(page.locator('#lbCapT')).toHaveText('Why are you using so many tabs!?');
  await expect(d).toContainText('No. 0047');
  await expect(d.locator('.lb-step')).toHaveCount(0);
  await expect(d.getByRole('button', { name: 'See the plans' })).toHaveCount(0);
  await expect(d.locator('.lb-pl')).toHaveCount(0);
});

test('notices follow the theme: a day count, the tier mark, a stronger border in the last 3 days, a trial notice', async ({ page }) => {
  await bootMember(page, me({ tier: 'cardinal' }, { tier: 'cardinal', paidUntil: Date.now() + 2.5 * 864e5 }));
  const n = page.locator('.lb-expiry');
  await expect(n).toHaveClass(/lb-nt/);
  await expect(n.locator('.lb-nt-n')).toHaveText('3');
  await expect(n).toHaveAttribute('data-level', 'soon');
  await expect(n.locator('svg.lb-mk')).toHaveCount(1);
  await page.evaluate(() => { window.LB_member.plan.paidUntil = Date.now() + 40 * 864e5; window.LB_member.plan.trial = { tier: 'prime', endsAt: Date.now() + 21 * 36e5 - 1000 }; document.dispatchEvent(new CustomEvent('lb-member')); });
  await expect(page.locator('.lb-expiry[data-kind="trial"]')).toContainText('Your Prime trial ends in 21 hours');
});

test('plan ended by the Director: a ledger with only what the gate says, shown once', async ({ page }) => {
  const ended = { tier: 'prime', reason: 'Account shared', fault: false, endedAt: Date.UTC(2026, 10, 20, 12), paid: null, refund: null, paidUntil: Date.UTC(2027, 5, 18, 12) };
  let answer = me({}, { endedNotice: ended });
  await bootMember(page, () => answer);
  const d = page.locator('#lbPlanEnded');
  await expect(d).toBeVisible();
  await expect(d.locator('.lb-nt-stamp')).toHaveText('Plan ended');
  await expect(d.locator('h2')).toHaveText('Your Prime plan has ended');
  await expect(d).toContainText('20 November 2026');
  await expect(d.locator('.lb-led')).toContainText('Account shared');
  await expect(d.locator('.lb-led')).toContainText('18 June 2027');
  await expect(d.locator('.lb-led')).not.toContainText('Refund');
  await expect(d.locator('.lb-nt-sig')).toHaveText('The Director');
  await d.getByRole('button', { name: 'OK' }).click();
  await expect(d).toHaveCount(0);
  await refreshMe(page);
  await expect(d).toHaveCount(0);
  answer = me({}, { endedNotice: { ...ended, tier: 'cardinal', fault: true, endedAt: Date.UTC(2026, 10, 21, 12), paid: '$15 for 12 months', refund: '$11.25 for 9 months' } });
  await refreshMe(page);
  await expect(d.locator('.lb-nt-stamp')).toHaveText('Ended in error');
  await expect(d.locator('h2')).toHaveText('Your Cardinal plan was ended by mistake');
  await expect(d.locator('.lb-led')).toContainText('$11.25 for 9 months');
  await expect(d.locator('.lb-led')).toContainText('$15 for 12 months');
});
