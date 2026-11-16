// 1.1 WP4 visual and layout checks (docs/1.1/DESIGN-GAPS.md 5, 10, 11, 14): plans page, error card, nginx error page, ceremony in each tier.
const { test, expect } = require('@playwright/test');
const { boot } = require('../e2e/helpers');
const { me, bootMember } = require('../e2e/helpers-ui');
const { checkLayout, checkContrast } = require('./layout');

const catalog = {
  ordinal: { priceUsdYear: 0, tabs: 4, weeklyGb: 0, monthlyGb: 0, speedMbps: 3, downloadMbPerFile: 10, dailyMinutes: 240, downloadsPerDay: 10, videoMaxP: 480, loadNowPerDay: 0 },
  cardinal: { priceUsdYear: 15, tabs: 15, weeklyGb: 12, monthlyGb: 0, speedMbps: 15, downloadMbPerFile: 100, dailyMinutes: 0, downloadsPerDay: 0, videoMaxP: 720, loadNowPerDay: 0 },
  prime: { priceUsdYear: 35, tabs: 25, weeklyGb: 0, monthlyGb: 100, speedMbps: 30, downloadMbPerFile: 1024, dailyMinutes: 0, downloadsPerDay: 0, videoMaxP: 1080, loadNowPerDay: 0 },
};
const SIZES = [[1366, 768], [2560, 1440]];

for (const [theme, mode] of [['luxury', 'dark'], ['soft', 'light'], ['garnet', 'dark'], ['onyx', 'dark']]) for (const [w, h] of SIZES) {
  test(`${theme}/${mode} ${w}x${h}: plans page`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(([t, m]) => localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: t, mode: m, mark: 'orbit' })), [theme, mode]);
    await bootMember(page, me({}, { plansOpen: true, catalog, tier: 'ordinal', request: { status: 'waiting_cash', tier: 'cardinal', decidedAt: Date.UTC(2026, 10, 15) } }));
    await page.evaluate(() => window.LB_go('limitless://plans'));
    await expect(page.locator('#lbPlans .lb-pl-card')).toHaveCount(3);
    await page.waitForTimeout(1200);
    expect(await checkLayout(page), 'plans layout').toEqual([]);
    expect(await checkContrast(page, '#lbPlans'), 'plans contrast').toEqual([]);
    if (theme === 'luxury' || (theme === 'soft' && w === 1366)) await expect(page).toHaveScreenshot(`plans-${theme}-${w}.png`);
  });
}
test('plans page at phone width has no horizontal page scroll and keeps the table in its own scroller', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootMember(page, me({}, { plansOpen: false, catalog }));
  await page.evaluate(() => window.LB_go('limitless://plans'));
  await expect(page.locator('#lbPlans .lb-pl-card')).toHaveCount(3);
  expect(await checkLayout(page), 'plans layout 390').toEqual([]);
});

for (const [theme, mode] of [['luxury', 'dark'], ['soft', 'light'], ['garnet', 'dark']]) for (const [w, h] of SIZES) {
  test(`${theme}/${mode} ${w}x${h}: error card`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(([t, m]) => localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: t, mode: m, mark: 'orbit' })), [theme, mode]);
    await boot(page);
    await page.evaluate(() => {
      window.LB_net.curl = { active_requests: 0, close() {}, set_connections() {}, async fetch() { throw new Error('Request failed with error code 28: Timeout was reached'); } };
      window.LB_swapSession = async () => window.LB_net.curl;
      window.LB_go('https://example.org/');
    });
    const f = page.frameLocator('#frame');
    await expect(f.locator('h1')).toHaveText('This site is not answering', { timeout: 6000 });
    await page.waitForTimeout(300);
    const frame = page.frames().find((x) => x !== page.mainFrame() && x.url() === 'about:srcdoc');
    expect(await checkLayout(frame), 'error layout').toEqual([]);
    expect(await checkContrast(frame, 'body'), 'error contrast').toEqual([]);
    if (theme === 'luxury' || theme === 'soft') await expect(page.locator('#frame')).toHaveScreenshot(`error-card-${theme}-${w}.png`);
  });
}

for (const [theme, mode] of [['luxury', 'dark'], ['soft', 'light']]) {
  test(`${theme}/${mode}: nginx unavailable page`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(([t, m]) => localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: t, mode: m, mark: 'orbit' })), [theme, mode]);
    await page.goto('/deploy/web/errors/unavailable.html');
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await checkLayout(page), 'unavailable layout').toEqual([]);
    expect(await checkContrast(page, 'body'), 'unavailable contrast').toEqual([]);
    await expect(page).toHaveScreenshot(`unavailable-${theme}-1366.png`);
  });
}

// Ceremony: each tier through the invitation, the reveal (both variants) and step 5.
const ART = [{ title: 'Article 1. Membership.', body: 'Membership of Limitless Browser is personal and by invitation.' }];
const TIERS = [['ordinal', '0047'], ['cardinal', '0101'], ['prime', '0107'], ['executive', '0010']];
for (const [tier, no] of TIERS) for (const [w, h] of [[1366, 768]]) {
  const st = { kind: 'invited', step: 4, number: no, signed: true, name: 'Alex Morgan', tier, suggested: no, charter: ART, charterVersion: 'x', certificateCode: tier === 'ordinal' ? null : 'ABCD-1234' };
  const open = async (page, over, q = '') => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(() => localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: 'luxury', mode: 'dark', mark: 'orbit' })));
    await page.route('**/auth/welcome/state', (r) => r.fulfill({ json: { ...st, ...over } }));
    await page.goto('/theme/ceremony/' + q);
    await page.waitForTimeout(500);
    expect(await checkLayout(page), 'ceremony layout').toEqual([]);
    expect(await checkContrast(page, '#cw'), 'ceremony contrast').toEqual([]);
  };
  test(`ceremony ${tier}: invitation`, async ({ page }) => { await open(page, { step: 0, number: null, signed: false }); await expect(page).toHaveScreenshot(`ceremony-${tier}-invitation-${w}.png`); });
  test(`ceremony ${tier}: reveal`, async ({ page }) => { await open(page, {}); await expect(page).toHaveScreenshot(`ceremony-${tier}-reveal-${w}.png`); });
  test(`ceremony ${tier}: reveal in the seal`, async ({ page }) => { await open(page, {}, '?reveal=seal'); if (tier === 'prime') await expect(page).toHaveScreenshot(`ceremony-${tier}-seal-${w}.png`); });
  test(`ceremony ${tier}: step 5`, async ({ page }) => { await open(page, { step: 5 }); await expect(page).toHaveScreenshot(`ceremony-${tier}-step5-${w}.png`); });
}
