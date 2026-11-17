// Visual and layout suite (docs/1.0/TESTING.md section 3). Full matrix (every theme, both modes, 1366x768 and 2560x1440) for the start
// page, the menu and the settings groups: layout and contrast checks everywhere, screenshots for Luxury dark, one light theme and Cardinal.
const { test, expect } = require('@playwright/test');
const { boot } = require('../e2e/helpers');
const { me, bootMember } = require('../e2e/helpers-ui');
const { checkLayout, checkContrast } = require('./layout');

const COMBOS = [];
for (const t of ['luxury', 'fancy', 'minimal', 'soft', 'retro', 'ledger', 'mono']) for (const m of ['dark', 'light']) COMBOS.push([t, m]);
for (const t of ['vault', 'ink', 'garnet', 'crplat', 'gilt', 'onyx']) COMBOS.push([t, 'dark']);
COMBOS.push(['silver', 'dark'], ['silver', 'light']);
const SIZES = [[1366, 768], [2560, 1440]];
const SHOT = new Set(['luxury/dark', 'soft/light', 'ink/dark', 'garnet/dark', 'gilt/dark', 'onyx/dark']);   // 1.1 WP2: garnet, gilt, onyx start and menu (DESIGN-GAPS 14); settings shots stay with the first three
const GROUPS = ['search', 'appearance', 'privacy', 'connection', 'membership', 'about'];
const MEMBER = me({ tier: 'executive', certificateCode: 'ABCD-1234', notices: [{ id: 'n1', text: 'The relay will be restarted on Sunday evening.', date: Date.UTC(2026, 10, 20, 12) }] }, { tier: 'executive', plansOpen: false, cap: { usedGb: 6.2, capGb: 12, period: 'week' }, download: { usedGb: 1.5, capGb: 10 } });

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
      if (SHOT.has(key) && !/garnet|gilt|onyx/.test(key) && (g === 'search' || g === 'membership')) await expect(page).toHaveScreenshot(`settings-${g}-${tag}.png`);
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

// Welcome ceremony (served by nginx at /auth/welcome, here from its static path) with a mocked gate: every resume point in three themes.
const ART = Array.from({ length: 12 }, (_, i) => ({ title: `Article ${i + 1}. Membership.`, body: 'Membership of Limitless Browser is personal and by invitation. The Member shall hold one membership only and shall not share the sign-in or session with anyone.' }));
const CER = [
  ['welcome', { kind: 'invited', step: 0, number: null }],
  ['number', { kind: 'approved', step: 1, number: null }],
  ['charter', { kind: 'approved', step: 2, number: '0047' }],
  ['reveal', { kind: 'approved', step: 4, number: '0047', signed: true, name: 'Alex Morgan' }],
  ['certificate', { kind: 'approved', step: 5, number: '0101', signed: true, name: 'Alex Morgan', tier: 'prime', certificateCode: 'ABCD-1234' }],
  ['tour', { kind: 'approved', step: 6, number: '0047', signed: true, name: 'Alex Morgan' }],
];
for (const [theme, mode] of [['luxury', 'dark'], ['soft', 'light'], ['ink', 'dark']]) for (const [w, h] of SIZES) for (const [step, st] of CER) {
  test(`${theme}/${mode} ${w}x${h}: ceremony ${step}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(([t, m]) => localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: t, mode: m, mark: 'orbit' })), [theme, mode]);
    const state = { kind: 'approved', step: 0, number: null, suggested: '0047', signed: false, tier: 'ordinal', name: null, charter: ART, charterVersion: 'draft-2026-11-15', certificateCode: null, ...st };
    await page.route('**/auth/welcome/state', (r) => r.fulfill({ json: state }));
    await page.goto('/theme/ceremony/');
    await expect(page.locator('#cwStep h1, #cwStep .reveal')).toBeVisible();
    await page.waitForTimeout(400);
    expect(await checkLayout(page), 'ceremony layout').toEqual([]);
    expect(await checkContrast(page, '#cw'), 'ceremony contrast').toEqual([]);
    if (theme === 'luxury') await expect(page).toHaveScreenshot(`ceremony-${step}-${w}.png`);
  });
}

// 1.1 WP2: the member card in the four tiers (foil card and strip), and the plan-granted moment (static under reduced motion).
for (const [w, h] of SIZES) {
  test(`member cards in four tiers ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await bootMember(page, MEMBER);
    await page.evaluate(() => {
      const m = window.LB_member, host = document.createElement('div'); host.id = 'cardSheet';
      host.style.cssText = 'position:fixed;inset:0;z-index:200000;background:#05070b;display:grid;grid-template-columns:repeat(4,300px);gap:24px;justify-content:center;align-content:center';
      for (const t of ['ordinal', 'cardinal', 'prime', 'executive']) { const c = document.createElement('div'); c.style.cssText = 'display:grid;gap:16px'; c.append(LBUI.memberCard(m, 'card', { tier: t }), LBUI.memberCard(m, 'strip', { tier: t })); host.appendChild(c); }
      document.body.appendChild(host);
    });
    expect(await checkContrast(page, '#cardSheet'), 'card contrast').toEqual([]);
    if (w === 1366) await expect(page.locator('#cardSheet')).toHaveScreenshot('cards-four-tiers-1366.png');
  });
}
test('plan granted moment 1366x768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  let ans = me({ tier: 'ordinal' }, { tier: 'ordinal' });
  await bootMember(page, () => ans);
  ans = me({ tier: 'cardinal' }, { tier: 'cardinal', paidUntil: Date.UTC(2027, 10, 14) });
  await page.evaluate(() => window.LB_meRefresh());
  await expect(page.locator('#lbGranted')).toBeVisible();
  await page.evaluate(() => document.getElementById('ntTimeText').textContent = '10:30');
  expect(await checkContrast(page, '#lbGranted'), 'granted contrast').toEqual([]);
  await expect(page).toHaveScreenshot('granted-cardinal-1366.png', { mask: [page.locator('#ntDate'), page.locator('#ntFavorites')] });
});

// 1.1 WP3: free-tier limits and notices (DESIGN-GAPS 6, 7). 1366x768, in the member's own theme.
const WP3_CAT = { ordinal: { tabs: 4, dailyMinutes: 240 }, cardinal: { tabs: 15, dailyMinutes: 0 }, prime: { tabs: 25, dailyMinutes: 0 }, executive: { tabs: 50, dailyMinutes: 0 } };
const MASK = (page) => [page.locator('#ntDate'), page.locator('#ntFavorites')];
async function wp3Boot(page, theme, mode, answer) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(([t, m]) => localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: t, mode: m, mark: 'orbit' })), [theme, mode]);
  await bootMember(page, answer);
  await page.evaluate(() => document.getElementById('ntTimeText').textContent = '10:30');
}
for (const [theme, mode] of [['luxury', 'dark'], ['soft', 'light'], ['ink', 'dark']]) {
  test(`${theme}/${mode}: plans line, day finished and the fifteen minute toast`, async ({ page }) => {
    await wp3Boot(page, theme, mode, me({}, { plansOpen: true, limits: { dailyMinutes: 240 } }));
    await page.evaluate(() => LBUI.dayTime.add(110 * 60000));
    await expect(page.locator('.lb-planline .lb-bar')).toBeVisible();
    expect(await checkLayout(page), 'plans line layout').toEqual([]);
    expect(await checkContrast(page, '.lb-startm'), 'plans line contrast').toEqual([]);
    await expect(page).toHaveScreenshot(`wp3-planline-${theme}-${mode}.png`, { mask: MASK(page) });
    await page.evaluate(() => LBUI.dayTime.add(115 * 60000));
    await expect(page.locator('#lbDayNote')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await checkContrast(page, '#lbDayNote'), 'toast contrast').toEqual([]);
    await expect(page).toHaveScreenshot(`wp3-toast-${theme}-${mode}.png`, { mask: MASK(page) });
    await page.evaluate(() => LBUI.dayTime.add(20 * 60000));
    await expect(page.locator('#lbDayDone')).toBeVisible();
    expect(await checkLayout(page), 'day finished layout').toEqual([]);
    expect(await checkContrast(page, '#lbDayDone'), 'day finished contrast').toEqual([]);
    await expect(page).toHaveScreenshot(`wp3-dayfinished-${theme}-${mode}.png`, { mask: MASK(page) });
  });
  test(`${theme}/${mode}: plan notices, the broadcast line and the staircase`, async ({ page }) => {
    const paid = { tier: 'cardinal', paidUntil: Date.now() + 2.5 * 864e5, plansOpen: true, catalog: WP3_CAT, limits: { tabs: 1, dailyMinutes: 0 }, trial: { tier: 'prime', endsAt: Date.now() + 21 * 36e5 - 1000 } };
    await wp3Boot(page, theme, mode, me({ tier: 'cardinal', notices: [{ id: 'n1', text: 'Maintenance on Saturday from 02:00 to 02:30. Limitless is unavailable for those thirty minutes.', date: Date.UTC(2026, 10, 14, 12) }] }, paid));
    await expect(page.locator('.lb-expiry').first()).toBeVisible();
    expect(await checkLayout(page), 'notices layout').toEqual([]);
    expect(await checkContrast(page, '.lb-startm'), 'notices contrast').toEqual([]);
    await expect(page).toHaveScreenshot(`wp3-notices-${theme}-${mode}.png`, { mask: MASK(page) });
    await page.locator('#newTab').click();
    await expect(page.locator('#lbCapDlg .lb-step')).toHaveCount(2);
    await page.waitForTimeout(350);
    expect(await checkLayout(page), 'staircase layout').toEqual([]);
    expect(await checkContrast(page, '#lbCapDlg'), 'staircase contrast').toEqual([]);
    await expect(page).toHaveScreenshot(`wp3-staircase-${theme}-${mode}.png`, { mask: MASK(page) });
  });
}
test('ink/dark: Ordinal staircase, Prime out of tabs, plan ended and the Director forms', async ({ page }) => {
  await wp3Boot(page, 'ink', 'dark', me({}, { plansOpen: true, catalog: WP3_CAT }));
  await page.evaluate(() => LBUI.capDialog());
  expect(await checkContrast(page, '#lbCapDlg'), 'ordinal staircase contrast').toEqual([]);
  await expect(page).toHaveScreenshot('wp3-staircase-ordinal-ink-dark.png', { mask: MASK(page) });
  await page.evaluate(() => { window.LB_member = { ...window.LB_member, plan: { ...window.LB_member.plan, tier: 'prime', limits: { ...window.LB_member.plan.limits, tabs: 25 } } }; LBUI.capDialog(); });
  expect(await checkContrast(page, '#lbCapDlg'), 'prime out contrast').toEqual([]);
  await expect(page).toHaveScreenshot('wp3-prime-out-ink-dark.png', { mask: MASK(page) });
  await page.evaluate(() => document.getElementById('lbCapDlg').remove());
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-lb-theme', 'ink');
    const mk = (id, o, ok) => { const d = LBUI.el('div', 'lb-dlg'); d.id = id; const c = LBUI.el('div', 'lb-dlg-card'); c.appendChild(LBUI.directorNotice(o).card); d.appendChild(c); document.body.appendChild(d); };
    mk('wpEnded', { kind: 'plan', stamp: 'Plan ended', title: 'Your Prime plan has ended', text: 'Your plan ended on 20 November 2026. You are on Ordinal now.', rows: [['Plan', 'Prime, paid until 18 June 2027'], ['Reason', 'Account shared']], sig: true });
  });
  expect(await checkContrast(page, '#wpEnded'), 'plan ended contrast').toEqual([]);
  await expect(page).toHaveScreenshot('wp3-planended-ink-dark.png', { mask: MASK(page) });
  await page.evaluate(() => {
    document.getElementById('wpEnded').remove();
    const mk = (id, o) => { const d = LBUI.el('div', 'lb-dlg'); d.id = id; const c = LBUI.el('div', 'lb-dlg-card'); c.appendChild(LBUI.directorNotice(o).card); d.appendChild(c); document.body.appendChild(d); };
    mk('wpForm', { kind: 'formal', stamp: 'Membership ended', title: 'Your membership has ended', text: 'Under Article II of the Membership Rules, the membership of No. 0031 ended on 10 November 2026. The number is retired and the certificate is void.', rows: [['Member', 'No. 0031'], ['Effective', '2026-11-10'], ['Rule', 'Article II, Confidentiality']] });
  });
  expect(await checkContrast(page, '#wpForm'), 'formal notice contrast').toEqual([]);
  await expect(page).toHaveScreenshot('wp3-formal-ink-dark.png', { mask: MASK(page) });
});

// 1.1 WP5: admin members master-detail, the void side sheet and the plan limits grid (DESIGN-GAPS 13). Mocked owner API, ink/dark, 1366x768.
test('admin: members master-detail, void sheet and plan limits', async ({ page }) => {
  const DAY = 86400000, now = Date.now(), J = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const PL = (o) => ({ relay: true, tabs: 15, dailyMinutes: 0, weeklyGb: 20, monthlyGb: 0, speedMbps: 20, downloadMbPerFile: 25, downloadsPerDay: 0, weight: 1.5, priceUsdYear: 15, topupGb: 25, ...o });
  const M = (sub, number, plan, name, o = {}) => ({ sub, number, tier: plan, plan, standing: 'good', signed: true, loginName: name.toLowerCase(), name, lastSeen: null, paidUntil: null, memberId: 'm_' + sub, ...o });
  const members = [M('s1', '0001', 'executive', 'Director'), M('s2', '0102', 'cardinal', 'Alex Morgan', { paidUntil: now + 13.5 * DAY }), M('s3', '0103', 'prime', 'Sam Rivera', { paidUntil: now + 200 * DAY }), M('s4', '0104', 'ordinal', 'Jo Park', { standing: 'warned' })];
  await page.route('**/_lb/admin/api/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/_lb/admin/api/', '');
    if (path === 'whoami') return route.fulfill(J({ owner: true, version: 'abc1234', stepup: true }));
    if (path === 'membership/members') return route.fulfill(J({ members }));
    if (path === 'membership/members/s2') return route.fulfill(J({ member: { ...members[1], admittedAt: now - 40 * DAY, charterVersion: 'v1', signedAt: now - 40 * DAY, standingUntil: null }, name: 'Alex Morgan', loginName: 'alex', events: [], receipts: [{ id: 11, kind: 'plan', tier: 'cardinal', amount: 15, paidOn: now - 100 * DAY, howPaid: 'cash', paidUntil: now + 265 * DAY, voided: false }], certificateCode: 'LMT-0102', sessions: [], usage: { sockets: 0, streams: 0, days: [] } }));
    if (path === 'membership/plans') return route.fulfill(J({ plansOpen: false, knobs: { slowStageMbps: 5, primeSeats: 40, execReservePct: 20, execBlock: '' }, plans: { ordinal: PL({ relay: false, tabs: 4, priceUsdYear: 0, weight: 0 }), cardinal: PL({}), prime: PL({ tabs: 25, priceUsdYear: 40 }), executive: PL({ tabs: 50, priceUsdYear: null }) } }));
    if (path === 'membership/transfer') return route.fulfill(J({ stage: 'ok', fraction: 0.42, usedMeterGb: 2100, meterGb: 5000 }));
    if (path === 'membership/invites') return route.fulfill(J({ invites: [] }));
    if (path === 'membership/requests') return route.fulfill(J({ requests: [], primeSeatsLeft: 3 }));
    if (path === 'membership/outbox') return route.fulfill(J({ mail: [] }));
    return route.fulfill({ status: path.startsWith('membership/') ? 200 : 404, contentType: 'application/json', body: '{}' });
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: 'ink', mode: 'dark', mark: 'orbit' })));
  await boot(page);
  await page.evaluate(() => window.LB_go('limitless://admin'));
  const m = page.locator('#lbAdmMembers');
  await m.getByRole('button', { name: 'Alex Morgan' }).click();
  await expect(page.locator('#lbAdmProfile')).toContainText('LMT-0102');
  await m.evaluate((e) => e.scrollIntoView());
  await expect(page).toHaveScreenshot('admin-members-1366.png', { mask: [page.locator('#lbAdmin .lb-adm-toast')] });
  await m.getByRole('button', { name: 'Void plan' }).click();
  await expect(page.locator('#lbAdmSheet')).toBeVisible();
  await expect(page).toHaveScreenshot('admin-void-1366.png', { mask: [page.locator('#lbAdmVoidWhich')] });
  await page.keyboard.press('Escape');
  const pl = page.locator('#lbAdmPlans');
  await pl.evaluate((e) => e.scrollIntoView());
  await expect(page).toHaveScreenshot('admin-limits-1366.png');
});
