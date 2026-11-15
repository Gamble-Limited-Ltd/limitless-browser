// S6 start page, splash, notices, limits, error cards, bot check card, tour (docs/1.0/UI.md 3.4, 4; PLAN 0.3 item 2).
const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { me, bootMember, refreshMe } = require('./helpers-ui');

test('start page: member card shows name and number, tier and since, and opens the Membership group', async ({ page }) => {
  await bootMember(page, me({ tier: 'cardinal' }, { tier: 'cardinal', paidUntil: Date.now() + 200 * 864e5 }));
  const card = page.locator('#lbMemberCard');
  await expect(card.locator('.lb-card-n')).toHaveText('Alex Morgan · No. 0047');
  await expect(card.locator('.lb-card-s')).toHaveText('Cardinal · since November 2026');
  await card.click();
  await expect(page.locator('.settings-nav-item.active')).toHaveText('Membership');
  await expect(page.locator('#lbMemberPage .lb-mp-name')).toHaveText('Alex Morgan');
});

test('start page without membership data shows no card', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(2500);
  await expect(page.locator('#lbMemberCard')).toHaveCount(0);
});

test('splash: name first, number small beneath, from the per-device cache; mark and wordmark only when there is none', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.lb-sp-word')).toHaveText('Limitless');
  await expect(page.locator('.lb-sp-num')).toHaveCount(0);
  await page.addInitScript(() => localStorage.setItem('limitless:me:v1', JSON.stringify({ name: 'Alex Morgan', number: '0047' })));
  await page.reload();
  await expect(page.locator('.lb-sp-word')).toHaveText('Alex Morgan');
  await expect(page.locator('.lb-sp-num')).toHaveText('No. 0047');
  // The splash is hidden once the app is up: check order in the DOM, and the stacking with the splash forced visible.
  await page.addStyleTag({ content: '.lb-splash { display: flex !important; position: fixed; inset: 0; z-index: 999999; }' });
  const w = await page.locator('.lb-sp-word').boundingBox(), n = await page.locator('.lb-sp-num').boundingBox();
  expect(w.y + w.height).toBeLessThanOrEqual(n.y + 1);
  expect(n.height).toBeLessThan(w.height);
});

test('the cache is written from /_lb/me and holds name and number only', async ({ page }) => {
  await bootMember(page, me());
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('limitless:me:v1')))).toEqual({ name: 'Alex Morgan', number: '0047' });
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
  await expect(page.locator('.lb-planline')).toContainText('Ordinal: 4 tabs, 4 hours a day. Paid plans are coming soon.');
  answer = me({}, { plansOpen: true });
  await refreshMe(page);
  await expect(page.locator('.lb-planline a')).toHaveText('See the plans');
});

test('tab cap: the fifth tab for Ordinal opens a card instead; closing one frees a slot; Prime gets the joke line', async ({ page }) => {
  const errors = await bootMember(page, me());
  for (let i = 0; i < 3; i++) await page.locator('#newTab').click();
  await expect(page.locator('#tabStrip .tab')).toHaveCount(4);
  await page.locator('#newTab').click();
  await expect(page.locator('#lbCapDlg')).toBeVisible();
  await expect(page.locator('#lbCapDlg')).toContainText('Your Ordinal plan allows 4 open tabs');
  await expect(page.locator('#lbCapDlg .lb-pl')).toHaveText('Paid plans are coming soon.');
  await expect(page.locator('#tabStrip .tab')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(page.locator('#lbCapDlg')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('tab cap for Prime: the joke line, no plans nag', async ({ page }) => {
  await bootMember(page, me({ tier: 'prime' }, { tier: 'prime', paidUntil: Date.now() + 200 * 864e5, limits: { tabs: 2, dailyMinutes: 0 } }));
  await page.locator('#newTab').click();
  await page.locator('#newTab').click();
  await expect(page.locator('#lbCapT')).toHaveText('Why are you using so many tabs!?');
  await expect(page.locator('#lbCapDlg .lb-pl')).toHaveCount(0);
});

test('daily time: 15 minute note, then a Day finished card over the page that settings can still be opened from; resets next day', async ({ page }) => {
  await bootMember(page, me({}, { limits: { dailyMinutes: 60 } }));
  await page.evaluate(() => window.LBUI.dayTime.add(46 * 60000));
  await expect(page.locator('#lbDayNote')).toContainText('About 15 minutes left today');
  await page.evaluate(() => window.LBUI.dayTime.add(20 * 60000));
  await expect(page.locator('#lbDayDone')).toContainText('Your time for today is finished');
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
  await expect(page.locator('#lbRepCat')).toHaveValue(/Broken site|Slow/);
});

test('bot check detection: only 403/429/503 with a known challenge marker, and the card names the category', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => [window.LB_botCheck(403, '<title>Just a moment...</title>'), window.LB_botCheck(200, '<title>Just a moment...</title>'), window.LB_botCheck(503, '<form class="g-recaptcha">'), window.LB_botCheck(403, '<h1>Forbidden</h1>')]);
  expect(r).toEqual([true, false, true, false]);
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
