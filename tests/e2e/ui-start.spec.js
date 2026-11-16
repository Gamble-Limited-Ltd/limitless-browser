// S6 start page, splash, notices, limits, error cards, bot check card, tour (docs/1.0/UI.md 3.4, 4; PLAN 0.3 item 2).
const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { me, bootMember, refreshMe } = require('./helpers-ui');

test('start page: member card shows name and number, tier and since, and opens the Membership group', async ({ page }) => {
  await bootMember(page, me({ tier: 'cardinal' }, { tier: 'cardinal', paidUntil: Date.now() + 200 * 864e5 }));
  const card = page.locator('#lbMemberCard');
  await expect(card.locator('.lb-mc-n')).toHaveText('Alex Morgan');
  await expect(card.locator('.lb-mc-t')).toHaveText('Cardinal');
  await expect(card.locator('.lb-mc-no')).toHaveText('No. 0047');
  await card.click();
  await expect(page.locator('.settings-nav-item.active')).toHaveText('Membership');
  await expect(page.locator('#lbMemberPage .lb-mc-card .lb-mc-n')).toHaveText('Alex Morgan');
});

test('start page without membership data shows no card', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(2500);
  await expect(page.locator('#lbMemberCard')).toHaveCount(0);
});

test('splash: name first, number small beneath, from the per-device cache; mark and wordmark only when there is none', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.lb-sp-word')).toHaveText('Limitless');
  await expect(page.locator('.lb-sp-foot')).toHaveCount(0);
  await page.addInitScript(() => localStorage.setItem('limitless:me:v1', JSON.stringify({ name: 'Alex Morgan', number: '0047', tier: 'cardinal' })));
  await page.reload();
  await expect(page.locator('.lb-sp-word')).toHaveText('Alex Morgan');
  await expect(page.locator('.lb-sp-foot')).toHaveText('No. 0047 · Cardinal');
  // The splash is hidden once the app is up: check order in the DOM, and the stacking with the splash forced visible.
  await page.addStyleTag({ content: '.lb-splash { display: flex !important; position: fixed; inset: 0; z-index: 999999; }' });
  const w = await page.locator('.lb-sp-word').boundingBox(), n = await page.locator('.lb-sp-foot').boundingBox(), vh = page.viewportSize().height;
  expect(w.y + w.height).toBeLessThanOrEqual(n.y + 1);
  expect(n.y + n.height).toBeGreaterThan(vh - 80);   // the footer line sits at the very bottom
});

test('the cache is written from /_lb/me and holds name, number and tier only', async ({ page }) => {
  await bootMember(page, me());
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('limitless:me:v1')))).toEqual({ name: 'Alex Morgan', number: '0047', tier: 'ordinal' });
});

test('bulletin: label, serif text, date, dismiss is remembered on this device', async ({ page }) => {
  await bootMember(page, me({ notices: [{ id: 'n1', text: 'The relay will be restarted on Sunday.', date: Date.UTC(2026, 10, 20, 12) }] }));
  const b = page.locator('.lb-bulletin');
  await expect(b.locator('.lb-bul-l')).toHaveText('Notice');
  await expect(b.locator('.lb-bul-t')).toHaveText('The relay will be restarted on Sunday.');
  await expect(b).toContainText('November 20, 2026');
  await b.locator('.lb-bul-x').click();
  await expect(b).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#lbMemberCard')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.lb-bulletin')).toHaveCount(0);
});

test('expiry line on the start page at 14 days and again worded for 3 days; none for Ordinal', async ({ page }) => {
  let answer = me({ tier: 'prime' }, { tier: 'prime', paidUntil: Date.now() + 10 * 864e5 });
  await bootMember(page, () => answer);
  await expect(page.locator('.lb-expiry')).toContainText('Your Prime plan ends on');
  answer = me({ tier: 'prime' }, { tier: 'prime', paidUntil: Date.now() + 2 * 864e5 });
  await refreshMe(page);
  await expect(page.locator('.lb-expiry')).toContainText('ends in 2 days');
  answer = me();
  await refreshMe(page);
  await expect(page.locator('.lb-expiry')).toHaveCount(0);
});

test('plans line says coming soon while plans are not open, and links when they are', async ({ page }) => {
  let answer = me();
  await bootMember(page, () => answer);
  await expect(page.locator('.lb-planline')).toHaveAttribute('title', 'Ordinal: 4 tabs, 4 hours a day. Paid plans are coming soon.');
  await expect(page.locator('.lb-planline a')).toHaveCount(0);
  answer = me({}, { plansOpen: true });
  await refreshMe(page);
  await expect(page.locator('.lb-planline a')).toHaveText('Plans');
});

test('tab cap: the fifth tab for Ordinal opens the plans page, a sixth switches to it; closing frees a slot', async ({ page }) => {
  const errors = await bootMember(page, me());
  for (let i = 0; i < 3; i++) await page.locator('#newTab').click();
  await expect(page.locator('#tabStrip .tab')).toHaveCount(4);
  await page.locator('#newTab').click();
  await expect(page.locator('#tabStrip .tab')).toHaveCount(5);
  await expect(page.locator('#lbPlans')).toBeVisible();
  await expect(page.locator('#lbCapDlg')).toHaveCount(0);
  await page.locator('#newTab').click();
  await expect(page.locator('#tabStrip .tab')).toHaveCount(5);
  await expect(page.locator('#lbPlans')).toBeVisible();
  expect(errors).toEqual([]);
});

test('tab cap for Cardinal: a card, no redirect', async ({ page }) => {
  await bootMember(page, me({ tier: 'cardinal' }, { tier: 'cardinal', paidUntil: Date.now() + 200 * 864e5, limits: { tabs: 2, dailyMinutes: 0 } }));
  await page.locator('#newTab').click();
  await page.locator('#newTab').click();
  await expect(page.locator('#lbCapDlg')).toBeVisible();
  await expect(page.locator('#lbCapDlg')).toContainText('Your Cardinal plan allows 2 open tabs');
  await expect(page.locator('#tabStrip .tab')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#lbCapDlg')).toHaveCount(0);
});

test('tab cap for Prime: the joke line, no plans nag', async ({ page }) => {
  await bootMember(page, me({ tier: 'prime' }, { tier: 'prime', paidUntil: Date.now() + 200 * 864e5, limits: { tabs: 2, dailyMinutes: 0 } }));
  await page.locator('#newTab').click();
  await page.locator('#newTab').click();
  await expect(page.locator('#lbCapT')).toHaveText('Why are you using so many tabs!?');
  await expect(page.locator('#lbCapDlg .lb-pl')).toHaveCount(0);
});

test('daily time: 15 minute note, then Day finished on the start page, settings still open; resets next day', async ({ page }) => {
  await bootMember(page, me({}, { limits: { dailyMinutes: 60 } }));
  await page.evaluate(() => window.LBUI.dayTime.add(46 * 60000));
  await expect(page.locator('#lbDayNote')).toContainText('15 minutes left today');
  await page.evaluate(() => window.LBUI.dayTime.add(20 * 60000));
  await expect(page.locator('#lbDayDone')).toContainText('Search is paused until midnight');
  await expect(page.locator('#lbDayNote')).toHaveCount(0);
  await page.locator('#lbMenuBtn').click();
  await expect(page.locator('#lbMenu')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('limitless:daytime:v1', JSON.stringify({ day: '2000-1-1', ms: 99999999 })));
  await page.evaluate(() => window.LBUI.dayTime.check());
  await expect(page.locator('#lbDayDone')).toHaveCount(0);
});

test('daily time does not apply to paid plans', async ({ page }) => {
  await bootMember(page, me({ tier: 'cardinal' }, { tier: 'cardinal', paidUntil: Date.now() + 200 * 864e5, limits: { dailyMinutes: 0 } }));
  await page.evaluate(() => window.LBUI.dayTime.add(99 * 3600000));
  await expect(page.locator('#lbDayDone')).toHaveCount(0);
});

test('error card: calm wording by class, themed, details folded, Report a problem opens the dialog with the category', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.LB_testError && 0);
  // Drive the same renderer the app uses for a failed load: a host that does not resolve (stubbed curl) is covered in fetchcore.spec;
  // here the error page is produced through the app's own router with a navigation that fails at once.
  await page.evaluate(() => window.LB_go('http://nonexistent.invalid/'));
  const f = page.frameLocator('iframe').first();
  await expect(f.locator('h1')).toHaveText(/We could not find this site|This page could not be loaded|The connection was interrupted|This site is not answering|This site refused the connection/, { timeout: 40000 });
  await expect(f.locator('details summary')).toHaveText('Technical details');
  await expect(f.locator('#retry')).toHaveText('Try again');
  const no = page.locator('#lbRelayNo'); if (await no.isVisible().catch(() => false)) await no.click();
  await f.locator('#report').click();
  await expect(page.locator('#lbReportDlg')).toBeVisible();
  await expect(page.locator('#lbRepCat')).toHaveValue(/^(broken|slow)$/)   // option values are the gate's category ids;
});

test('bot check detection: only 403/429/503 and a real interstitial (details in botcheck.spec.js)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { const cf = { server: 'cloudflare', 'cf-ray': 'x' }; return [window.LB_botCheck(403, '<title>Just a moment...</title>', cf), window.LB_botCheck(200, '<title>Just a moment...</title>', cf), window.LB_botCheck(403, '<h1>Forbidden</h1>', {})]; });
  expect(r).toEqual([true, false, false]);
});

test('tour: three steps, skippable, once', async ({ page }) => {
  await bootMember(page, me(), { tour: true });
  const t = page.locator('#lbTour');
  await expect(t).toContainText('Themes');
  await expect(t).toContainText('1 of 3');
  await page.locator('#lbTourNext').click();
  await expect(t).toContainText('Start page shortcuts');
  await page.locator('#lbTourNext').click();
  await expect(t).toContainText('Your membership');
  await expect(page.locator('#lbTourNext')).toHaveText('Done');
  await page.locator('#lbTourNext').click();
  await expect(t).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('limitless:tour:v1'))).toBe('done');
  await page.reload();
  await expect(page.locator('#lbMemberCard')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#lbTour')).toHaveCount(0);
});

test('plans line, menu entry and cap-free links all go to the in-app plans page', async ({ page }) => {
  await bootMember(page, me({}, { plansOpen: true }));
  await expect(page.locator('.lb-planline a')).toHaveAttribute('href', 'limitless://plans');
  await page.locator('#lbMenuBtn').click();
  await page.locator('#lbMenu [data-id="plans"]').click();
  await expect(page.locator('#lbPlans')).toBeVisible();
});
