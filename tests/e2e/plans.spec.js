// @ts-check
// S9 (docs/1.0/PAID-TIERS-PLAN.md 10c): plans page, account panel, request form, trial button, expiry and fallback notices.
// The gate is mocked at /_lb/*; every decision stays the gate's, the app only shows and asks.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { boot } = require('./helpers');

const DAY = 86400000;
const catalog = {
  ordinal: { priceUsdYear: 0, tabs: 4, weeklyGb: 0, monthlyGb: 0, speedMbps: 3, downloadMbPerFile: 10, dailyMinutes: 240, downloadsPerDay: 10, videoMaxP: 480, loadNowPerDay: 0 },
  cardinal: { priceUsdYear: 15, tabs: 15, weeklyGb: 12, monthlyGb: 0, speedMbps: 15, downloadMbPerFile: 100, dailyMinutes: 0, downloadsPerDay: 0, videoMaxP: 720, loadNowPerDay: 0 },
  prime: { priceUsdYear: 35, tabs: 25, weeklyGb: 0, monthlyGb: 100, speedMbps: 30, downloadMbPerFile: 1024, dailyMinutes: 0, downloadsPerDay: 0, videoMaxP: 1080, loadNowPerDay: 0 },
};
const baseMe = (plan = {}, extra = {}) => ({
  membership: 'on', number: '0102', tier: 'ordinal', standing: 'good', busy: false, receipts: [],
  plan: { tier: 'ordinal', paidUntil: null, plansOpen: true, trialAvailable: false, trial: null, catalog, cap: { over: false, usedGb: 0, capGb: 0, period: null, topupGbLeft: 0 }, fallback: null, loadNowLeft: 0, request: null, topupGbLeft: 0, ...plan },
  ...extra,
});

async function mock(page, meFn) {
  const posts = [];
  await page.route('**/_lb/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(meFn()) }));
  await page.route(/\/_lb\/(trial|plan-request)$/, async (route) => {
    const req = route.request();
    posts.push({ path: new URL(req.url()).pathname, body: req.postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  return posts;
}
const openPlans = async (page) => {
  await page.evaluate(() => window.LB_go('limitless://plans'));
  await expect(page.locator('#lbPlans')).toBeVisible();
};

test('plans page shows three plans with typical limits and the invitation footnote, and no payment fields', async ({ page }) => {
  await mock(page, () => baseMe());
  const errors = await boot(page);
  await openPlans(page);
  await expect(page.locator('.lb-pl-card')).toHaveCount(3);
  await expect(page.locator('.lb-pl-card[data-tier="cardinal"]')).toContainText('$15 per year');
  await expect(page.locator('.lb-pl-card[data-tier="prime"]')).toContainText('100 GB per month');
  await expect(page.locator('#lbPlans')).toContainText('Typical limits');
  await expect(page.locator('#lbPlans')).toContainText('Further plans are granted by invitation.');
  await expect(page.locator('#lbPlans')).toContainText('never ask for card details');
  expect(await page.locator('#lbPlans input[autocomplete^="cc-"], #lbPlans input[name*="card" i]').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('plans page cards show the 1.1 catalog fields: Ordinal 4 hours, 3 Mbit/s, 10 downloads a day, video cap; files in GB', async ({ page }) => {
  await mock(page, () => baseMe());
  await boot(page);
  await openPlans(page);
  const o = page.locator('.lb-pl-card[data-tier="ordinal"]');
  await expect(o).toContainText('About 4 hours a day');
  await expect(o).toContainText('Speed limited to 3 Mbit/s in the app');
  await expect(o).toContainText('Downloads up to 10 MB per file, 10 a day');
  await expect(o).toContainText('Video up to 480p');
  await expect(page.locator('.lb-pl-card[data-tier="cardinal"]')).toContainText('Downloads up to 100 MB per file');
  await expect(page.locator('.lb-pl-card[data-tier="cardinal"]')).toContainText('Video up to 720p');
  await expect(page.locator('.lb-pl-card[data-tier="prime"]')).toContainText('Downloads up to 1 GB per file');
});

test('request form: needs a reason and the tick box, then posts and shows the waiting line', async ({ page }) => {
  let me = baseMe();
  const posts = await mock(page, () => me);
  await boot(page);
  await openPlans(page);
  await page.locator('#lbPlansRequest button[type=submit]').click();
  await expect(page.locator('#lbPlansMsg')).toContainText('say why');
  await page.locator('#lbPlansNote').fill('I use it for school');
  await page.locator('#lbPlansRequest button[type=submit]').click();
  await expect(page.locator('#lbPlansMsg')).toContainText('tick the box');
  expect(posts).toHaveLength(0);
  await page.locator('#lbPlansAllowed').check();
  await page.locator('#lbPlansTier').selectOption('prime');
  me = baseMe({ request: { status: 'open', tier: 'prime', retryAfter: null } });
  await page.locator('#lbPlansRequest button[type=submit]').click();
  await expect(page.locator('#lbPlansAccount')).toContainText('waiting for an answer');
  expect(posts).toEqual([{ path: '/_lb/plan-request', body: { tier: 'prime', note: 'I use it for school', allowed: true } }]);
});

test('plans not open: the page still informs, but there is no form and no trial button', async ({ page }) => {
  await mock(page, () => baseMe({ plansOpen: false, trialAvailable: true }));
  await boot(page);
  await openPlans(page);
  await expect(page.locator('.lb-pl-card')).toHaveCount(3);
  await expect(page.locator('#lbPlansRequest')).toContainText('not open for requests yet');
  await expect(page.locator('#lbPlansNote')).toHaveCount(0);
  await expect(page.locator('#lbPlansTrial')).toHaveCount(0);
});

const NOTE = 'Plans are not on sale yet. Prices, data amounts and benefits can still change before they open. Estimated speeds will be added when they are ready.';

test('plans closed with catalog prices: cards and table show prices and amounts, note on top, buttons stay closed', async ({ page }) => {
  const posts = await mock(page, () => baseMe({ plansOpen: false, catalog: { ...catalog, cardinal: { ...catalog.cardinal, priceUsdYear: 15, weeklyGb: 10 }, prime: { ...catalog.prime, priceUsdYear: 25, weeklyGb: 20, monthlyGb: 0 } } }));
  await boot(page);
  await openPlans(page);
  await expect(page.locator('#lbPlansNotice')).toHaveText(NOTE);
  const c = page.locator('.lb-pl-card[data-tier="cardinal"]'), p = page.locator('.lb-pl-card[data-tier="prime"]');
  await expect(c).toContainText('$15 per year');
  await expect(c).toContainText('10 GB per week');
  await expect(p).toContainText('$25 per year');
  await expect(p).toContainText('20 GB per week');
  await expect(page.locator('#lbPlans')).not.toContainText('Not open for sale yet');
  for (const card of [c, p]) { await expect(card.locator('.lb-pl-go')).toHaveText('Not open yet'); await expect(card.locator('.lb-pl-go')).toBeDisabled(); }
  const row = page.locator('#lbPlansTable tr', { has: page.locator('th[scope=row]', { hasText: 'Price' }) });
  await expect(row).toContainText('Free');
  await expect(row).toContainText('$15 per year');
  await expect(row).toContainText('$25 per year');
  await expect(page.locator('#lbPlansRequest')).toContainText('not open for requests yet');
  await expect(page.locator('#lbPlansNote')).toHaveCount(0);
  await expect(page.locator('#lbPlans')).not.toContainText(/estimate(?!d speeds will)/i);
  expect(posts).toEqual([]);
});

test('plans closed and the catalog has no price for a tier: nothing is shown for it', async ({ page }) => {
  await mock(page, () => baseMe({ plansOpen: false, catalog: { ...catalog, cardinal: { ...catalog.cardinal, priceUsdYear: null }, prime: { ...catalog.prime, priceUsdYear: undefined } } }));
  await boot(page);
  await openPlans(page);
  await expect(page.locator('#lbPlansNotice')).toHaveText(NOTE);
  for (const t of ['cardinal', 'prime']) {
    await expect(page.locator('.lb-pl-card[data-tier="' + t + '"] .lb-pl-pr')).toHaveText('');
    await expect(page.locator('.lb-pl-card[data-tier="' + t + '"]')).not.toContainText('$');
  }
  await expect(page.locator('#lbPlans')).not.toContainText('Not open for sale yet');
  await expect(page.locator('#lbPlansTable')).not.toContainText('$');
});

test('plans open: no closed-state note, no extra price row, prices on the cards as before', async ({ page }) => {
  await mock(page, () => baseMe());
  await boot(page);
  await openPlans(page);
  await expect(page.locator('#lbPlansNotice')).toHaveCount(0);
  await expect(page.locator('#lbPlansTable th[scope=row]', { hasText: /^Price$/ })).toHaveCount(0);
  await expect(page.locator('.lb-pl-card[data-tier="cardinal"]')).toContainText('$15 per year');
  await expect(page.locator('.lb-pl-card[data-tier="cardinal"] .lb-pl-go')).toHaveText('Ask for Cardinal');
});

test('account panel: tier, paid-until, usage, top-up, fallback line, receipts, decline wait', async ({ page }) => {
  const until = Date.now() + 100 * DAY;
  await mock(page, () => baseMe(
    { tier: 'cardinal', paidUntil: until, cap: { over: true, usedGb: 21, capGb: 20, period: 'week', topupGbLeft: 5 }, topupGbLeft: 5, fallback: 'cap', request: { status: 'declined', tier: 'prime', retryAfter: Date.now() + 2 * DAY } },
    { receipts: [{ id: 1, kind: 'plan', tier: 'cardinal', amount: 15, paidOn: Date.now() - DAY, howPaid: 'cash', paidUntil: until, voided: false }] },
  ));
  await boot(page);
  await openPlans(page);
  const acc = page.locator('#lbPlansAccount');
  await expect(acc).toContainText('Member 0102: Cardinal, paid until');
  await expect(acc).toContainText('Used 21 of 20 GB this week, plus 5 GB of top-up left');
  await expect(acc).toContainText('public relays until it resets');
  await expect(acc).toContainText('cash');
  await expect(acc).toContainText('You can ask again after');
});

test('trial button posts once and the page refreshes', async ({ page }) => {
  let me = baseMe({ trialAvailable: true });
  const posts = await mock(page, () => me);
  await boot(page);
  await openPlans(page);
  await expect(page.locator('#lbPlansTrial')).toHaveText('Try Cardinal for 24 hours');
  me = baseMe({ tier: 'cardinal', trial: { tier: 'cardinal', endsAt: Date.now() + DAY } });
  await page.locator('#lbPlansTrial').click();
  await expect(page.locator('#lbPlansAccount')).toContainText('Trial of Cardinal');
  expect(posts.map((p) => p.path)).toEqual(['/_lb/trial']);
});

test('load error and offline show a message and a retry', async ({ page }) => {
  let fail = true;
  await page.route('**/_lb/me', (route) => (fail ? route.fulfill({ status: 500, body: '' }) : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(baseMe()) })));
  await boot(page);
  await openPlans(page);
  await expect(page.locator('#lbPlans')).toContainText('Plans could not be loaded');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.lb-pl-card')).toHaveCount(3);
});

test('membership off: plans page says not available yet', async ({ page }) => {
  await page.route('**/_lb/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"membership":"off","busy":false}' }));
  await boot(page);
  await openPlans(page);
  await expect(page.locator('#lbPlans')).toContainText('not available yet');
});

test('expiry notice: shown once at 14 days and again at 3 days, with a Plans button', async ({ page }) => {
  let until = Date.now() + 10 * DAY;
  await mock(page, () => baseMe({ tier: 'cardinal', paidUntil: until }));
  await boot(page);
  const note = page.locator('#lbPlansExpiry');
  await expect(note).toBeVisible({ timeout: 15000 });
  await expect(note).toContainText('Your Cardinal plan ends on');
  await note.getByRole('button', { name: 'Plans' }).click();
  await expect(page.locator('#lbPlans')).toBeVisible();
  // same stage is not repeated; a nearer stage is
  await page.evaluate((u) => { document.dispatchEvent(new CustomEvent('lb-member', { detail: { plan: { tier: 'cardinal', paidUntil: u } } })); }, until);
  await expect(page.locator('#lbPlansExpiry')).toHaveCount(0);
  until = Date.now() + 2 * DAY;
  await page.evaluate((u) => { document.dispatchEvent(new CustomEvent('lb-member', { detail: { plan: { tier: 'cardinal', paidUntil: u } } })); }, until);
  await expect(page.locator('#lbPlansExpiry')).toBeVisible();
});

test('fallback notice appears the first time a cap or the brake sends the member to public relays', async ({ page }) => {
  await mock(page, () => baseMe({ tier: 'cardinal', paidUntil: Date.now() + 100 * DAY, fallback: 'cap' }));
  await boot(page);
  await expect(page.locator('#lbPlansFallback')).toContainText('public relays', { timeout: 15000 });
});

test('every new gate route is gated in nginx (never ungated) and POST only', () => {
  const nginx = fs.readFileSync(path.join(__dirname, '..', '..', 'deploy/web/nginx.conf'), 'utf8');
  for (const loc of ['trial', 'plan-request', 'load-now', 'perf']) {
    const m = new RegExp(`location = /_lb/${loc} \\{([\\s\\S]*?)\\n  \\}`).exec(nginx);
    expect(m, loc).toBeTruthy();
    expect(m ? m[1] : '').not.toContain('auth_request off');
    expect(m ? m[1] : '').toContain('limit_except POST');
  }
});

// ---- S9b: Load Now button and load-time samples ----
test('Load Now: Executive only, posts, shows uses left, then asks for a fresh relay token', async ({ page }) => {
  let n = 0, tokens = 0;
  await mock(page, () => baseMe({ tier: 'executive', loadNowLeft: 10 }));
  await page.route('**/_lb/load-now', (route) => { n++; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, left: 9 }) }); });
  await page.route('**/_lb/relay-token', (route) => { tokens++; route.fulfill({ status: 503, body: '' }); });
  await boot(page);
  await openPlans(page);
  await expect(page.locator('#lbPlansLoadLeft')).toContainText('10');
  const before = tokens;
  await page.locator('#lbPlansLoadNow').click();
  await expect(page.locator('#lbPlansLoadLeft')).toContainText('9');
  expect(n).toBe(1);
  await expect.poll(() => tokens).toBeGreaterThan(before);
});

test('Load Now: no button for other plans; disabled with no uses left; 429 says so', async ({ page }) => {
  let me = baseMe({ tier: 'cardinal' });
  await mock(page, () => me);
  await page.route('**/_lb/load-now', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"limit"}' }));
  await boot(page);
  await openPlans(page);
  await expect(page.locator('#lbPlansLoadNow')).toHaveCount(0);
  me = baseMe({ tier: 'executive', loadNowLeft: 1 });
  await openPlans(page);
  await page.evaluate(() => window.LB_go('limitless://plans'));
  await page.locator('#lbPlansLoadNow').click();
  await expect(page.locator('#lbPlans')).toContainText('No Load Now uses left today');
  await expect(page.locator('#lbPlansLoadNow')).toBeDisabled();
});

async function perfRun(page, { rand = 0.1, member = true, features, datasaver = false, marks = 1 } = {}) {
  const posts = [];
  await page.route('**/_lb/perf', (route) => { posts.push(route.request().postDataJSON()); route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await mock(page, () => (member ? baseMe() : { membership: 'off' }));
  await boot(page, {
    init: ([r]) => { Math.random = () => r; },
    arg: [rand],
    ...(features ? { features } : {}),
  });
  if (datasaver) await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => /^gi_.*limitless:/.test(x)); localStorage.setItem(k.slice(0, k.indexOf('limitless:')) + 'limitless:datasaver:v1', '1'); });
  await page.evaluate(() => window.LB_meRefresh());
  await page.evaluate((k) => { for (let i = 0; i < k; i++) { window.__lbPerf.start('https://secret.example/path'); window.__lbPerf.mark('shown'); } }, marks);
  await page.waitForTimeout(400);
  return posts;
}

test('perf sample: signed-in member, sampled, sends only metric, ms and device; at most one per 10 s', async ({ page }) => {
  const posts = await perfRun(page, { marks: 3 });
  expect(posts).toHaveLength(1);
  expect(Object.keys(posts[0])).toEqual(expect.arrayContaining(['device', 'metric', 'ms']));   // a longtask during the run may add longMs
  expect(posts[0].metric).toBe('page_shown');
  expect(['desktop', 'chromebook', 'tablet', 'phone', 'other']).toContain(posts[0].device);
  expect(JSON.stringify(posts)).not.toContain('secret');
});

test('perf sample (MS-8): breakdown numbers only, exactly the allowed keys, never a URL', async ({ page }) => {
  const posts = [];
  await page.route('**/_lb/perf', (route) => { posts.push(route.request().postDataJSON()); route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await mock(page, () => baseMe());
  await boot(page, { init: ([r]) => { Math.random = () => r; }, arg: [0.1] });
  await page.evaluate(() => window.LB_meRefresh());
  await page.evaluate(() => {
    const c = window.__lbPerf.start('https://secret.example/path');
    c.marks.firstBytes = 321; c.rwMs = 45.6; c.rwN = 3; c.long = 88.4; c.bytes = 2048 * 1024 + 5; c.fetches = 10; c.hits = 4;
    window.__lbPerf.mark('shown');
  });
  await page.waitForTimeout(400);
  expect(posts).toHaveLength(1);
  expect(Object.keys(posts[0]).sort()).toEqual(['device', 'docMs', 'hit', 'kb', 'longMs', 'metric', 'ms', 'rwMs', 'rwN']);
  expect(posts[0]).toMatchObject({ docMs: 321, rwMs: 46, rwN: 3, longMs: 88, kb: 2048, hit: 4 });
  for (const k of Object.keys(posts[0])) if (k !== 'metric' && k !== 'device') expect(Number.isInteger(posts[0][k])).toBe(true);
  expect(JSON.stringify(posts)).not.toContain('secret');
});

test('perf sample: not sampled at 1 in 5 odds, nothing sent', async ({ page }) => {
  expect(await perfRun(page, { rand: 0.5 })).toHaveLength(0);
});

test('perf sample: membership off, Data saver on, or features.perf false: nothing sent', async ({ page, browser }) => {
  expect(await perfRun(page, { member: false })).toHaveLength(0);
  const p2 = await (await browser.newContext()).newPage();
  expect(await perfRun(p2, { datasaver: true })).toHaveLength(0);
  const p3 = await (await browser.newContext()).newPage();
  expect(await perfRun(p3, { features: { ...require('./helpers').LEGACY_FEATURES, perf: false } })).toHaveLength(0);
});
