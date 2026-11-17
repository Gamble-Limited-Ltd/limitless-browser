// @ts-check
// 1.1 WP4 (docs/1.1/DESIGN-GAPS.md 5, 10, 11): plans page layout and request track, error card hop line, ceremony tier colour and reveal.
const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

const DAY = 86400000;
const catalog = {
  ordinal: { priceUsdYear: 0, tabs: 4, weeklyGb: 0, monthlyGb: 0, speedMbps: 3, downloadMbPerFile: 10, dailyMinutes: 240, downloadsPerDay: 10, videoMaxP: 480, loadNowPerDay: 0 },
  cardinal: { priceUsdYear: 15, tabs: 15, weeklyGb: 12, monthlyGb: 0, speedMbps: 15, downloadMbPerFile: 100, dailyMinutes: 0, downloadsPerDay: 0, videoMaxP: 720, loadNowPerDay: 0 },
  prime: { priceUsdYear: 35, tabs: 25, weeklyGb: 0, monthlyGb: 100, speedMbps: 30, downloadMbPerFile: 1024, dailyMinutes: 0, downloadsPerDay: 0, videoMaxP: 1080, loadNowPerDay: 0 },
};
const baseMe = (plan = {}) => ({
  membership: 'on', number: '0047', name: 'Alex Morgan', tier: 'ordinal', standing: 'good', busy: false, receipts: [],
  plan: { tier: 'ordinal', paidUntil: null, plansOpen: true, trialAvailable: false, trial: null, catalog, cap: { over: false, usedGb: 0, capGb: 0, period: null, topupGbLeft: 0 }, fallback: null, loadNowLeft: 0, request: null, topupGbLeft: 0, ...plan },
});
async function plans(page, me) {
  const posts = [];
  await page.route('**/_lb/me', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me) }));
  await page.route(/\/_lb\/plan-request$/, async (r) => { posts.push(r.request().postDataJSON()); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  const errors = await boot(page);
  await page.evaluate(() => window.LB_go('limitless://plans'));
  await expect(page.locator('#lbPlans .lb-pl-card')).toHaveCount(3);
  return { posts, errors };
}

test.describe('plans page', () => {
  test('three columns with marks, Cardinal raised and flagged, ticks, and the comparison table', async ({ page }) => {
    const { errors } = await plans(page, baseMe());
    const cards = page.locator('#lbPlans .lb-pl-card');
    await expect(cards.nth(1)).toHaveAttribute('data-tier', 'cardinal');
    await expect(cards.nth(1)).toHaveClass(/feat/);
    await expect(cards.nth(1)).toContainText('First step up');
    for (let i = 0; i < 3; i++) await expect(cards.nth(i).locator('svg.lb-tier-mark')).toHaveCount(1);
    await expect(cards.nth(2).locator('li svg.lb-i')).not.toHaveCount(0);
    const t = page.locator('#lbPlansTable');
    await expect(t.locator('thead th')).toHaveCount(4);
    await expect(t).toContainText('Public relays');
    await expect(t).toContainText('Open tabs');
    await expect(t.locator('tr.sec')).toHaveCount(4);
    expect(await t.locator('tbody th').first().evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
    expect(errors).toEqual([]);
  });

  test('no prices anywhere while plans are closed; paid buttons say so and are disabled', async ({ page }) => {
    await plans(page, baseMe({ plansOpen: false }));
    await expect(page.locator('#lbPlans')).not.toContainText('$');
    await expect(page.locator('.lb-pl-card[data-tier="cardinal"] .lb-pl-go')).toBeDisabled();
    await expect(page.locator('.lb-pl-card[data-tier="cardinal"]')).toContainText('Not open for sale yet');
  });

  test('prices show when plans are open', async ({ page }) => {
    await plans(page, baseMe());
    await expect(page.locator('.lb-pl-card[data-tier="cardinal"]')).toContainText('$15 per year');
    await expect(page.locator('.lb-pl-card[data-tier="cardinal"] .lb-pl-go')).toHaveText('Ask for Cardinal');
  });

  test('what each step adds lists only the new things', async ({ page }) => {
    await plans(page, baseMe());
    const add = page.locator('#lbPlansAdds .lb-pl-add');
    await expect(add).toHaveCount(3);
    await expect(add.nth(1)).toContainText('Everything in Ordinal, plus');
    await expect(add.nth(1)).toContainText('Our own relay');
    await expect(add.nth(1)).toContainText('15 open tabs');
    await expect(add.nth(1)).not.toContainText('Video up to 480p');
    await expect(add.nth(2)).toContainText('Everything in Cardinal, plus');
    await expect(add.nth(2)).toContainText('25 open tabs');
  });

  test('four steps above the form and tier tiles that drive the same select and body', async ({ page }) => {
    const { posts } = await plans(page, baseMe());
    await expect(page.locator('#lbPlansSteps > div')).toHaveCount(4);
    await expect(page.locator('#lbPlansRequest')).toContainText('Alex Morgan');
    await expect(page.locator('#lbPlansRequest')).toContainText('No. 0047');
    await expect(page.locator('#lbPlansTier')).toHaveValue('cardinal');
    await page.locator('#lbPlansRequest .lb-pl-tile[data-tier="prime"]').click();
    await expect(page.locator('#lbPlansTier')).toHaveValue('prime');
    await page.locator('#lbPlansNote').fill('school');
    await page.locator('#lbPlansAllowed').check();
    await page.locator('#lbPlansRequest button[type=submit]').click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toEqual({ tier: 'prime', note: 'school', allowed: true });
  });

  test('a card button picks that plan in the form', async ({ page }) => {
    await plans(page, baseMe());
    await page.locator('.lb-pl-card[data-tier="prime"] .lb-pl-go').click();
    await expect(page.locator('#lbPlansTier')).toHaveValue('prime');
  });

  for (const [status, now, done, label] of [
    ['open', 'Seen', ['Sent'], null],
    ['waiting_cash', 'Waiting for cash', ['Sent', 'Seen'], null],
    ['approved', 'Active', ['Sent', 'Seen', 'Waiting for cash'], null],
    ['declined', null, ['Sent', 'Seen'], 'Not accepted'],
  ]) {
    test(`request track: ${status}`, async ({ page }) => {
      await plans(page, baseMe({ request: { status, tier: 'cardinal', retryAfter: null, decidedAt: status === 'open' ? null : Date.now() - DAY } }));
      const tr = page.locator('#lbPlansTrack');
      await expect(tr.locator('.st')).toHaveCount(4);
      if (now) await expect(tr.locator('.st.now')).toContainText(now);
      for (const d of done) await expect(tr.locator('.st.done', { hasText: d })).toHaveCount(1);
      if (label) await expect(tr.locator('.st.no')).toContainText(label);
    });
  }
  test('no request: no track', async ({ page }) => {
    await plans(page, baseMe());
    await expect(page.locator('#lbPlansTrack')).toHaveCount(0);
  });
});

const O = 'https://wp4.test';
const SETUP = `
  window.E6 = 'Request failed with error code 6: Could not resolve host';
  window.E28 = 'Request failed with error code 28: Timeout was reached';
  window.__script = {};
  window.LB_net.curl = { active_requests: 0, close() {}, set_connections() {}, async fetch(url) { const r = window.__script[url] || {}; if (r.fail) throw new Error(r.fail); return { status: 200, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) }; } };
  window.LB_swapSession = async () => window.LB_net.curl;
`;
test.describe('error card hop line', () => {
  test('LB_errHop picks the failing hop', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      dns: LB_errHop('DNS Resolution Failed', {}), timeout: LB_errHop('Connection Timeout', { lbCat: 'timeout' }),
      drop: LB_errHop('Network Error', { lbDrop: true }), tls: LB_errHop('SSL/TLS Error', {}), intr: LB_errHop('Connection Interrupted', {}),
    }));
    expect(r).toEqual({ dns: 'site', timeout: 'site', drop: 'relay', tls: 'site', intr: 'relay' });
    await page.context().setOffline(true);
    expect(await page.evaluate(() => LB_errHop('Connection Timeout', {}))).toBe('you');
  });
  test('a timeout card names the host and the wait, shows the hops and the pill buttons', async ({ page }) => {
    await boot(page);
    await page.evaluate(SETUP);
    await page.evaluate((o) => { __script[o + '/slow'] = { fail: E28 }; LB_go(o + '/slow'); }, O);
    const f = page.frameLocator('#frame');
    await expect(f.locator('h1')).toHaveText('This site is not answering', { timeout: 4000 });
    await expect(f.locator('.cause')).toContainText('wp4.test did not respond within 10 seconds');
    await expect(f.locator('.hops span')).toHaveCount(3);
    await expect(f.locator('.hops .x')).toHaveCount(1);
    await expect(f.locator('.hops span').nth(2)).toContainText('wp4.test');
    await expect(f.locator('.hops span').nth(2).locator('i')).toHaveClass(/x/);
    await expect(f.locator('#retry')).toHaveText('Try again');
    await expect(f.locator('#report')).toHaveText('Report a problem');
  });
  test('a dns failure puts the red dot on the site, not the relay', async ({ page }) => {
    await boot(page);
    await page.evaluate(SETUP);
    await page.evaluate((o) => { __script[o + '/nx'] = { fail: E6 }; LB_go(o + '/nx'); }, O);
    const f = page.frameLocator('#frame');
    await expect(f.locator('h1')).toHaveText('We could not find this site', { timeout: 4000 });
    await expect(f.locator('.hops span').nth(2).locator('i')).toHaveClass(/x/);
    await expect(f.locator('.hops span').nth(1).locator('i')).not.toHaveClass(/x/);
  });
});

const ART = [{ title: 'Article 1.', body: 'Be decent.' }];
async function cer(page, st, url = '/theme/ceremony/') {
  const state = { kind: 'approved', step: 4, number: '0047', suggested: '0047', signed: true, tier: 'ordinal', name: 'Alex Morgan', charter: ART, charterVersion: 'x', certificateCode: null, ...st };
  await page.route('**/auth/welcome/state', (r) => r.fulfill({ json: state }));
  await page.route('**/auth/welcome/step', (r) => r.fulfill({ status: 200, body: '' }));
  await page.goto(url);
}
test.describe('ceremony', () => {
  test('the tier colour runs through the page: data-tier on the wrapper and tier tokens', async ({ page }) => {
    await cer(page, { tier: 'executive', number: '0010' });
    await expect(page.locator('#cw')).toHaveAttribute('data-tier', 'executive');
    const tc = await page.locator('#cw').evaluate((e) => getComputedStyle(e).getPropertyValue('--tc').trim().toLowerCase());
    expect(tc).toBe('#d4a531');
  });
  test('serif reveal: tier word above the number, tier hairline, four digits', async ({ page }) => {
    await cer(page, { tier: 'prime', number: '0101' });
    await expect(page.locator('.reveal svg text.lbl')).toHaveText('PRIME');
    await expect(page.locator('.reveal svg text.num')).toHaveText('Nº 0101');
    await expect(page.locator('.reveal .rule')).toHaveCount(1);
  });
  test('seal variant is selectable with ?reveal=seal', async ({ page }) => {
    await cer(page, { tier: 'prime', number: '0101' }, '/theme/ceremony/?reveal=seal');
    await expect(page.locator('.reveal svg.seal')).toHaveCount(1);
    await expect(page.locator('.reveal svg.seal')).toContainText('0101');
    await expect(page.locator('.reveal svg.seal')).toContainText('PRIME');
  });
  test('step 5: Ordinal gets the foil card', async ({ page }) => {
    await cer(page, { step: 5 });
    await expect(page.locator('.lb-mc-card')).toContainText('Alex Morgan');
    await expect(page.locator('.lb-mc-card')).toContainText('No. 0047');
    await expect(page.locator('.lb-mc-card')).toContainText('Ordinal');
  });
  test('step 5 certificate: paper, title, name in script, Director line', async ({ page }) => {
    await cer(page, { step: 5, tier: 'cardinal', number: '0101', certificateCode: 'ABCD-1234' });
    const c = page.locator('.cert');
    await expect(c).toHaveAttribute('data-tier', 'cardinal');
    await expect(c).toContainText('Certificate of Membership');
    await expect(c).toContainText('Nº 0101');
    await expect(c.locator('.nm')).toHaveText('Alex Morgan');
    await expect(c).toContainText('James Thiessen, Director of Gamble Limited Ltd.');
    await expect(c).toContainText('Verification code ABCD-1234');
  });
  test('welcome step shows the envelope with the first name', async ({ page }) => {
    await cer(page, { kind: 'invited', step: 0, number: null, signed: false, name: 'Alex Morgan' });
    await expect(page.locator('.envelope')).toHaveCount(1);
    await expect(page.locator('.envelope .letter')).toContainText('Alex');
  });
});
