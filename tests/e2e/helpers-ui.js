// Shared by the S6 specs: a mocked /_lb/me (the gate fields are listed in docs/1.0/UI.md "Gate fields the UI reads").
const { boot } = require('./helpers');

const ME = {
  membership: 'on', busy: false, number: '0047', tier: 'ordinal', standing: 'good', standingUntil: null, name: 'Alex Morgan',
  admittedAt: Date.UTC(2026, 10, 20), charterVersion: 'draft-2026-11-15', certificateCode: null, notices: [], receipts: [],
  plan: { tier: 'ordinal', paidUntil: null, limits: { relay: false, tabs: 4, dailyMinutes: 240, weeklyGb: 0, monthlyGb: 0, speedMbps: 0, downloadMbPerFile: 10, downloadsPerDay: 10, weight: 1, priceUsdYear: null, topupGb: 0 },
    limitsVersion: 1, used: { todayBytes: 0, monthBytes: 0 }, trialAvailable: false, topupGbLeft: 0, lastFreeTheme: null, plansOpen: false },
};
const me = (over = {}, plan = {}) => ({ ...ME, ...over, plan: { ...ME.plan, ...plan, limits: { ...ME.plan.limits, ...(plan.limits || {}) } } });

/** Boot with a mocked /_lb/me. `get` may be a function returning the current answer (so a test can change it). */
async function bootMember(page, answer, opts = {}) {
  const get = typeof answer === 'function' ? answer : () => answer;
  await page.route('**/_lb/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(get()) }));
  if (!opts.tour) await page.addInitScript(() => { try { localStorage.setItem('limitless:tour:v1', 'done'); } catch (_) {} });
  const errors = await boot(page, opts);
  await page.waitForFunction(() => window.LB_member && window.LB_member.number, null, { timeout: 15000 });
  return errors;
}
async function refreshMe(page) { await page.evaluate(() => window.LB_meRefresh()); }
async function openSettings(page, section) {
  await expect_(async () => {
    await page.evaluate((s) => {
      const n = document.getElementById('lbRelayNo'); if (n) n.click();
      document.getElementById('settingsBtn').click();
      if (s) document.querySelector('.settings-nav-item[data-section="' + s + '"]').click();
    }, section);
  });
}
async function expect_(fn) { const { expect } = require('@playwright/test'); await expect(fn).toPass({ timeout: 20000 }); }

module.exports = { ME, me, bootMember, refreshMe, openSettings };
