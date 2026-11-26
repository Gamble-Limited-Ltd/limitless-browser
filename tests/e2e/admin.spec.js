const { test, expect } = require('@playwright/test');
const { menuItem } = require('./helpers');

const THEMES = ['luxury', 'fancy', 'minimal', 'soft', 'retro', 'ledger', 'mono', 'vault'];
const OWNER = '99999999-9999-4999-8999-999999999999';
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const GB = 1024 ** 3;

const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Mocked admin API. `calls` records every request as "METHOD path". */
function mockApi(page, over = {}) {
  const st = { stepup: false, calls: [], bodies: [], users: null, flags: { signinsPaused: false, maintenance: false } };
  const users = [
    { sub: OWNER, loginName: 'boss', approvedAt: null, approved: true, owner: true, lastSeen: Date.now() - 1000, todayBytes: 0, sockets: 1, streams: 2, killed: false, override: null },
    { sub: ALICE, loginName: 'alice', approvedAt: null, approved: true, owner: false, lastSeen: Date.now() - 5 * 60_000, todayBytes: 5 * GB, sockets: 2, streams: 6, killed: false, override: null },
    { sub: BOB, loginName: '<img src=x onerror="window.__xss=1">', approvedAt: null, approved: true, owner: false, lastSeen: null, todayBytes: 0, sockets: 0, streams: 0, killed: true, override: null },
  ];
  st.users = users;
  page.route('**/_lb/admin/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace('/_lb/admin/api/', '');
    const method = req.method();
    st.calls.push(`${method} ${path}`);
    if (method === 'POST') st.bodies.push(JSON.parse(req.postData() || '{}'));
    if (over.whoami) return route.fulfill(json(over.whoami.body ?? {}, over.whoami.status));
    if (path === 'whoami') return route.fulfill(json({ owner: true, version: 'abc1234', stepup: st.stepup }));
    if (path === 'users') return route.fulfill(json({ source: over.readOnly ? 'local' : 'gll-id', readOnly: !!over.readOnly, users: st.users }));
    if (path === 'usage') {
      return route.fulfill(json({
        day: '2026-10-21',
        defaults: { dailyByteCap: 20 * GB, maxSockets: 8, bandwidthMbps: 50 },
        live: { sockets: 3, streams: 8 },
        rows: [
          { sub: ALICE, loginName: 'alice', owner: false, todayBytes: 17 * GB, bytes30: 40 * GB, sockets: 2, streams: 6, dailyCap: 20 * GB, maxSockets: 8, bandwidthMbps: 50, override: null, warn: { bytes: true, sockets: false } },
          { sub: OWNER, loginName: 'boss', owner: true, todayBytes: 1024 ** 2, bytes30: 2 * 1024 ** 2, sockets: 1, streams: 2, dailyCap: 0, maxSockets: 256, bandwidthMbps: 0, override: null, warn: { bytes: false, sockets: false } },
        ],
      }));
    }
    if (path === 'flags' && method === 'GET') return route.fulfill(json(st.flags));
    if (path === 'health') {
      return route.fulfill(json({
        version: 'abc1234', uptimeSec: 3700, relay: { ok: !over.relayDown, checkedAt: Date.now() }, gateId: { ok: false, checkedAt: Date.now() },
        live: { sockets: 3, streams: 8, users: 2 }, flags: st.flags, totals: { wisp_opened: 42, login_ok: 7 },
      }));
    }
    if (method === 'POST' && path === 'step-up') {
      const b = JSON.parse(req.postData() || '{}');
      if (over.stepupError) return route.fulfill(json({ error: over.stepupError.error }, over.stepupError.status));
      if (b.password === 'right') {
        if (over.legal && b.acceptedLegal !== true) return route.fulfill(json({ error: 'legal_required' }, 403));
        st.stepup = true; return route.fulfill(json({ ok: true }));
      }
      return route.fulfill(json({ error: over.legal ? 'wrong_password' : 'stepup_failed' }, 403));
    }
    if (method === 'POST' && !st.stepup) return route.fulfill(json({ error: 'stepup' }, 403));
    if (path === 'users/approve') return route.fulfill(json({ sub: BOB, loginName: 'bob', created: true }));
    if (path === 'users/revoke') return route.fulfill(json({ sub: ALICE, revoked: 1 }));
    if (path === 'kill') return route.fulfill(json({ ok: true, killed: true }));
    if (path === 'overrides') return route.fulfill(json({ ok: true }));
    if (path === 'flags') {
      const b = JSON.parse(req.postData() || '{}');
      st.flags = { ...st.flags, ...b };
      return route.fulfill(json(st.flags));
    }
    const x = s7(path, method, req, st, over);
    if (x) return route.fulfill(x);
    return route.fulfill(json({ error: 'nope' }, 404));
  });
  return st;
}


// ---- S7 routes (members, invites, charts, hops, plans, notices, reports, audit) ----
const MEMBERS = [
  { sub: OWNER, number: '0000', tier: 'executive', plan: 'executive', standing: 'good', signed: true, loginName: 'boss', name: 'The Boss', lastSeen: Date.now() - 1000, paidUntil: null, memberId: 'm_1' },
  { sub: ALICE, number: '0102', tier: 'cardinal', plan: 'cardinal', standing: 'good', signed: true, loginName: 'alice', name: 'Alice <b>A</b>', lastSeen: Date.now() - 300000, paidUntil: null, memberId: 'm_2' },
  { sub: BOB, number: null, tier: 'ordinal', plan: 'ordinal', standing: 'warned', signed: false, loginName: 'bob', name: null, lastSeen: null, paidUntil: null, memberId: 'm_3' },
];
const PLAN = (o) => ({ relay: true, tabs: 15, dailyMinutes: 0, weeklyGb: 20, monthlyGb: 0, speedMbps: 20, downloadMbPerFile: 25, downloadsPerDay: 0, weight: 1.5, priceUsdYear: 15, topupGb: 25, ...o });
function s7(path, method, req, st, over) {
  const body = method === 'GET' ? {} : JSON.parse(req.postData() || '{}');
  if (method === 'DELETE' && !st.stepup) return json({ error: 'stepup' }, 403);
  if (over.noMembership && path.startsWith('membership/')) return json({}, 404);
  const u = new URL(req.url());
  if (path === 'membership/members') {
    const q = (u.searchParams.get('q') || '').toLowerCase(), f = u.searchParams.get('filter') || 'all';
    let list = MEMBERS.filter((m) => !q || [m.number, m.name, m.loginName].some((v) => v && v.toLowerCase().includes(q)));
    if (f === 'warned') list = list.filter((m) => m.standing === 'warned');
    if (f === 'ceremony') list = list.filter((m) => !m.signed);
    if (f === 'cardinal') list = list.filter((m) => m.plan === 'cardinal');
    return json({ members: list });
  }
  const mp = path.match(/^membership\/members\/(.+)$/);
  if (mp) {
    const m = MEMBERS.find((x) => x.sub === mp[1]);
    return json({ member: { ...m, admittedAt: Date.now() - 86400000 * 9, charterVersion: 'draft-2026-11-15', signedAt: Date.now() - 86400000 * 9, standingUntil: null }, name: m.name, loginName: m.loginName, events: [{ kind: 'warn', article: '4.2', note: 'Too loud', until: null, created_at: Date.now() - 3600000 }], receipts: [{ id: 11, kind: 'plan', tier: 'cardinal', amount: 15, paidOn: Date.now() - 30 * 86400000, howPaid: 'cash', paidUntil: Date.now() + 335 * 86400000, voided: false }], certificateCode: 'LMT-0102-ABCD', sessions: [{ createdAt: Date.now() - 7200000, lastActive: Date.now() - 60000 }], usage: { sockets: 1, streams: 3, days: [{ day: '2026-11-14', bytes: 3 * GB }] } });
  }
  if (path === 'membership/invites' && method === 'GET') return json({ invites: [{ id: 1, loginName: 'carol', email: null, createdAt: Date.now() - 86400000, expiresAt: Date.now() + 86400000 * 5, redeemedAt: null, revokedAt: null, number: null }, { id: 2, loginName: 'dan', email: null, createdAt: Date.now() - 86400000 * 3, expiresAt: Date.now() + 1, redeemedAt: Date.now() - 86400000, revokedAt: null, number: '0042' }] });
  if (path === 'membership/invites') return json({ id: 3, link: 'https://limitless.test/auth/invite/tok', expiresAt: Date.now() + 86400000 });
  if (path === 'membership/plans' && method === 'GET') return json({ plans: { ordinal: PLAN({ relay: false, tabs: 4, priceUsdYear: 0, weight: 0 }), cardinal: PLAN({}), prime: PLAN({ tabs: 25, priceUsdYear: 35 }), executive: PLAN({ priceUsdYear: null }) }, limitsVersion: 3, plansOpen: !!st.plansOpen, execBlock: '0010-0099', knobs: { slowStageMbps: 2, primeSeats: 10, execReservePct: 20 }, reserved: [] });
  if (path === 'membership/settings') { if (body.plansOpen !== undefined) st.plansOpen = body.plansOpen; return json({ ok: true }); }
  if (path === 'membership/requests' && method === 'GET') return json({ primeSeatsLeft: 3, requests: [{ id: 7, tier: 'prime', number: '0102', note: 'Paid <b>cash</b>', createdAt: Date.now() - 3600000 }] });
  if (path === 'membership/outbox' && method === 'GET') return json({ mail: [{ id: 4, to: 'a@kmlhs.org', subject: 'Welcome <i>Prime</i>', body: 'Line one\nLine two', createdAt: Date.now() - 60000, sentAt: null }, { id: 3, to: 'old@kmlhs.org', subject: 'Old', body: 'x', createdAt: Date.now() - 9e6, sentAt: Date.now() - 8e6 }] });
  if (path === 'membership/transfer') return json({ stage: 'warn', fraction: 0.42 * 1.7, usedMeterGb: 3570, meterGb: 5000 });
  if (path.startsWith('membership/')) return json({ ok: true, signedOut: 1 });
  if (path === 'perf') return json({ daily: [{ day: '2026-10-20', device: 'desktop', metric: 'page_shown', n: 12, p50: 800, p90: 2100 }, { day: '2026-10-21', device: 'phone', metric: 'page_shown', n: 9, p50: 1500, p90: 4000 }] });
  if (path === 'usage/live') return json({ online: 2, sockets: 3, streams: 8, uplinkMbps: 18, fairShare: true, fairShareActive: false });
  if (path === 'usage/30d') return json({ days: Array.from({ length: 30 }, (_, i) => ({ day: '2026-10-' + String(i + 1).padStart(2, '0'), members: 2 + (i % 5), bytes: (1 + (i % 7)) * GB })), top: [{ number: '0102', bytes: 40 * GB }, { number: null, bytes: GB }] });
  if (path === 'hops') return json({ binsMs: [25, 50], last5m: { count: 12, p50: 100, p90: 400 }, last1h: { count: 300, p50: 100, p90: 800 }, last24h: { count: 0, p50: null, p90: null }, perMinute: [{ minute: 1_800_000_000, count: 3, p50: 100, p90: 200 }, { minute: 1_800_000_060, count: 3, p50: 200, p90: 400 }] });
  if (path === 'notices' && method === 'GET') return json({ notices: [{ id: 5, text: 'Maintenance <i>tonight</i>', startsAt: Date.now() - 1000, endsAt: null }] });
  if (path === 'notices' || path === 'notices/update' || path.startsWith('notices/')) return json({ id: 6, updated: true, deleted: true });
  if (path === 'reports') return json({ categories: [], reports: [{ id: 9, number: '0102', category: 'slow', note: 'It crawls <u>x</u>', device: 'chromebook', timings: { shown: 4200 }, host: 'news.example.com', createdAt: Date.now() - 60000, doneAt: null }] });
  if (path === 'reports/done') return json({ done: true });
  if (path.startsWith('audit')) { st.auditUrl = u.search; return json({ entries: [{ id: 1, at: Date.now() - 5000, actorSub: OWNER, action: u.searchParams.get('action') || 'standing-warn', targetSub: ALICE }] }); }
  return null;
}

async function boot(page, { features = { ownRelay: true } } = {}) {
  const errors = [];
  await page.context().route('**/version.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 'dev', sha: 'dev', features }) }));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/index.html');
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
  const skip = page.locator('#tutorialOverlay button', { hasText: 'Skip tour' });
  try { await skip.waitFor({ state: 'visible', timeout: 12000 }); await skip.click(); } catch (_) {}
  await expect(page.locator('#tutorialOverlay')).toBeHidden();
  if (await no.isVisible().catch(() => false)) await no.click();
  return errors;
}
const openAdmin = (page) => page.evaluate(() => window.LB_go('limitless://admin'));

test.describe('admin panel entry', () => {
  test('hidden when whoami is 404; the page says it is not available', async ({ page }) => {
    mockApi(page, { whoami: { status: 404, body: {} } });
    const errors = await boot(page);
    expect(await page.evaluate(() => window.LB_adminProbe())).toBe(false);
    await expect(page.locator('#lbAboutAdmin')).toBeHidden();
    await openAdmin(page);
    await expect(page.locator('#lbAdmin')).toBeVisible();
    await expect(page.locator('#lbAdmin')).toContainText('not available');
    await expect(page.locator('#lbAdmin .lb-adm-card')).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('shown when whoami is 200', async ({ page }) => {
    mockApi(page);
    await boot(page);
    expect(await page.evaluate(() => window.LB_adminProbe())).toBe(true);
    await expect(page.locator('#lbAboutAdmin')).toBeAttached();
    await page.evaluate(() => document.getElementById('lbAboutAdmin').closest('div').scrollIntoView());
    await expect(page.locator('#lbAboutAdmin')).not.toHaveAttribute('hidden', /.*/);
  });
});

test.describe('admin page', () => {
  for (const [ownRelay, want, not] of [[false, 'Public relays', 'Down'], [true, 'Down', 'Public relays']]) {
    test(`Health relay row with features.ownRelay=${ownRelay} and a relay that is down`, async ({ page }) => {
      mockApi(page, { relayDown: true });
      await boot(page, { features: { ownRelay } });
      await openAdmin(page);
      const row = page.locator('#lbAdmin dt', { hasText: 'Relay' }).locator('xpath=following-sibling::dd[1]');
      await expect(row).toHaveText(want);
      await expect(row).not.toHaveText(not);
    });
  }

  test('renders Users, Usage, Switches and Health from the API', async ({ page }) => {
    const st = mockApi(page);
    const errors = await boot(page);
    await openAdmin(page);
    const root = page.locator('#lbAdmin');
    for (const name of ['Users', 'Usage', 'Switches', 'Health']) {
      await expect(root.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    await expect(root).toContainText('alice');
    await expect(root).toContainText('17 GB');
    await expect(root).toContainText('Cut off');
    await expect(root.locator('.lb-adm-warn').first()).toBeVisible();
    await expect(root).toContainText('abc1234');
    await expect(root).toContainText('GLL ID');
    await expect(root).toContainText('wisp_opened');
    // Data is shown as text, never as markup.
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await expect(root.locator('img')).toHaveCount(0);
    await expect(root).toContainText('<img src=x');
    expect(st.calls).toEqual(expect.arrayContaining(['GET whoami', 'GET users', 'GET usage', 'GET flags', 'GET health']));
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('read only note when approvals come from local data', async ({ page }) => {
    mockApi(page, { readOnly: true });
    await boot(page);
    await openAdmin(page);
    await expect(page.locator('#lbAdmin')).toContainText('read only');
    await expect(page.locator('#lbAdmin #lbAdmApprove')).toHaveCount(0);
  });

  test('a write asks for step-up, then goes through; a wrong password is refused', async ({ page }) => {
    const st = mockApi(page);
    const errors = await boot(page);
    await openAdmin(page);
    const root = page.locator('#lbAdmin');
    await root.locator('#lbAdmApproveName').fill('bob');
    await root.locator('#lbAdmApproveBtn').click();
    const dlg = page.locator('#lbAdmStepup');
    await expect(dlg).toBeVisible();
    await dlg.locator('input[name=login]').fill('boss');
    await dlg.locator('input[name=password]').fill('wrong');
    await dlg.locator('button[type=submit]').click();
    await expect(dlg).toContainText('did not match');
    await dlg.locator('input[name=password]').fill('right');
    await dlg.locator('button[type=submit]').click();
    await expect(dlg).toBeHidden();
    await expect(root.locator('.lb-adm-toast')).toContainText('bob');
    const writes = st.calls.filter((c) => c.startsWith('POST'));
    expect(writes).toEqual(['POST users/approve', 'POST step-up', 'POST step-up', 'POST users/approve']);
    expect(st.bodies[0]).toEqual({ loginName: 'bob' });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('step-up under legal v2 shows the acceptance box and resends acceptedLegal', async ({ page }) => {
    const st = mockApi(page, { legal: true });
    await boot(page);
    await openAdmin(page);
    const root = page.locator('#lbAdmin');
    await root.locator('#lbAdmApproveName').fill('bob');
    await root.locator('#lbAdmApproveBtn').click();
    const dlg = page.locator('#lbAdmStepup');
    const box = dlg.locator('input[name=acceptedLegal]');
    await expect(box).toBeHidden();
    await dlg.locator('input[name=login]').fill('boss');
    await dlg.locator('input[name=password]').fill('wrong');
    await dlg.locator('button[type=submit]').click();
    await expect(dlg.locator('.lb-adm-err')).toContainText('password');
    await dlg.locator('input[name=password]').fill('right');
    await dlg.locator('button[type=submit]').click();
    await expect(box).toBeVisible();
    await expect(dlg).toContainText('I am 18 or older, or I am at least 13 and my parent or guardian has agreed to the Terms of Service and Privacy Policy for me.');
    await expect(dlg.locator('.lb-adm-err')).toContainText('accept');
    await expect(dlg.locator('input[name=password]')).toHaveValue('right');
    await box.check();
    await dlg.locator('button[type=submit]').click();
    await expect(dlg).toBeHidden();
    await expect(root.locator('.lb-adm-toast')).toContainText('bob');
    const stepBodies = st.bodies.filter((b) => 'password' in b);
    expect(stepBodies.at(-1).acceptedLegal).toBe(true);
    expect(stepBodies[0]).not.toHaveProperty('acceptedLegal');
  });

  for (const [status, error, text] of [[403, 'not_owner', 'not the owner'], [429, 'rate_limited', 'Too many'], [503, 'gate_unavailable', 'not reachable']]) {
    test(`step-up shows the reason ${error}; cancelling a write says why nothing happened`, async ({ page }) => {
      mockApi(page, { stepupError: { status, error } });
      await boot(page);
      await openAdmin(page);
      const root = page.locator('#lbAdmin');
      await root.locator('#lbAdmApproveName').fill('bob');
      await root.locator('#lbAdmApproveBtn').click();
      const dlg = page.locator('#lbAdmStepup');
      await dlg.locator('input[name=login]').fill('boss');
      await dlg.locator('input[name=password]').fill('x');
      await dlg.locator('button[type=submit]').click();
      await expect(dlg.locator('.lb-adm-err')).toContainText(text);
      if (error === 'gate_unavailable') {
        await dlg.getByRole('button', { name: 'Cancel' }).click();
        await expect(root.locator('.lb-adm-toast')).toContainText('password');
      }
    });
  }

  test('switches, cut off and revoke send the right requests', async ({ page }) => {
    const st = mockApi(page);
    st.stepup = true;
    await boot(page);
    await openAdmin(page);
    const root = page.locator('#lbAdmin');
    await root.locator('#lbAdmPause').click();
    await expect.poll(() => st.calls).toContain('POST flags');
    expect(st.bodies.at(-1)).toEqual({ signinsPaused: true });
    // Maintenance needs a second click to confirm.
    await root.locator('#lbAdmMaint').click();
    expect(st.calls.filter((c) => c === 'POST flags')).toHaveLength(1);
    await root.locator('#lbAdmMaint').click();
    await expect.poll(() => st.calls.filter((c) => c === 'POST flags').length).toBe(2);
    expect(st.bodies.at(-1)).toEqual({ maintenance: true });
    // Revoke (two clicks) for alice.
    const row = root.locator('#lbAdmUsers tr', { hasText: 'alice' }).first();
    await row.getByRole('button', { name: 'Revoke' }).click();
    await row.getByRole('button', { name: 'Confirm revoke' }).click();
    await expect.poll(() => st.calls).toContain('POST users/revoke');
    expect(st.bodies.at(-1)).toEqual({ sub: ALICE });
    // 1.0: Usage shows use only; limits come from plans (Plans and knobs) and per-member overrides live in the member profile.
    const usage = root.locator('#lbAdmUsage');
    await expect(usage.locator('tr', { hasText: 'alice' }).first()).toContainText('17 GB of 20 GB');
    await expect(usage.getByRole('button', { name: 'Limits' })).toHaveCount(0);
    await expect(usage).not.toContainText('Default:');
    await expect(usage).not.toContainText('until 1.0');
  });

  for (const theme of THEMES) {
    for (const mode of ['dark', 'light']) {
      if (theme === 'vault' && mode === 'light') continue;
      test(`readable in ${theme} ${mode}`, async ({ page }) => {
        mockApi(page);
        await boot(page);
        await page.evaluate(([t, m]) => window.LBTheme.set({ theme: t, mode: m }), [theme, mode]);
        await openAdmin(page);
        const card = page.locator('#lbAdmin .lb-adm-card').first();
        await expect(card.locator('h2')).toBeVisible();
        const ok = await page.evaluate(() => {
          const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
          const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
          const card = document.querySelector('#lbAdmin .lb-adm-card');
          const bg = rgb(getComputedStyle(card).backgroundColor);
          const fg = rgb(getComputedStyle(card.querySelector('h2')).color);
          const [a, b] = [lum(bg), lum(fg)].sort((x, y) => y - x);
          const root = document.getElementById('lbAdmin');
          return { ratio: (a + 0.05) / (b + 0.05), overflow: root.scrollWidth > root.clientWidth + 1 };
        });
        expect(ok.ratio).toBeGreaterThan(4.5);
        expect(ok.overflow).toBe(false);
      });
    }
  }
});

test.describe('admin panel S7', () => {
  const sec = (page, id) => page.locator('#lbAdm' + id);

  test('members: list, search, filter chips, profile with history, sessions and usage; text only', async ({ page }) => {
    const st = mockApi(page);
    const errors = await boot(page);
    await openAdmin(page);
    const m = sec(page, 'Members');
    await expect(m.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
    await expect(m).toContainText('0102');
    await expect(m).toContainText('Alice <b>A</b>');
    await expect(m.locator('b')).toHaveCount(0);
    await m.locator('#lbAdmMemberQ').fill('0102');
    await m.locator('#lbAdmMemberQ').press('Enter');
    await expect.poll(() => st.calls).toContain('GET membership/members');
    await expect(m.locator('tbody tr')).toHaveCount(1);
    await m.locator('#lbAdmMemberQ').fill('');
    await m.locator('#lbAdmMemberQ').press('Enter');
    await m.getByRole('button', { name: 'Warned or suspended' }).click();
    await expect(m.locator('tbody tr')).toHaveCount(1);
    await expect(m).toContainText('Ceremony not done');
    await m.getByRole('button', { name: 'All', exact: true }).click();
    await m.getByRole('button', { name: 'Alice <b>A</b>' }).click();
    const p = m.locator('#lbAdmProfile');
    await expect(p).toContainText('LMT-0102-ABCD');
    await expect(p).toContainText('1 connections, 3 streams');
    await p.getByRole('tab', { name: 'History' }).click();
    await expect(p).toContainText('Too loud');
    await expect(p).toContainText('last active');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('profile actions send the right writes through step-up; remove needs a second click', async ({ page }) => {
    const st = mockApi(page);
    await boot(page);
    await openAdmin(page);
    const m = sec(page, 'Members');
    await m.getByRole('button', { name: 'Alice <b>A</b>' }).click();
    const p = m.locator('#lbAdmProfile');
    // each write reloads the profile and redraws the form; typing before that lands loses the input (seen on CI)
    const redrawn = async (call, sel) => {
      await expect.poll(() => { const i = st.calls.lastIndexOf(call); return i >= 0 && st.calls.slice(i).some((c) => c.startsWith('GET membership/members/')); }).toBe(true);
      await expect(p.locator(sel)).toBeVisible();
    };
    await p.getByRole('tab', { name: 'Standing and access' }).click();
    await p.locator('input[name=article]').fill('4.2');
    await p.locator('input[name=note]').fill('Loud');
    await p.getByRole('button', { name: 'Warn', exact: true }).click();
    await expect(page.locator('#lbAdmStepup')).toHaveClass(/show/);
    await page.locator('#lbAdmStepup input[name=login]').fill('boss');
    await page.locator('#lbAdmStepup input[name=password]').fill('right');
    await page.locator('#lbAdmStepup button[type=submit]').click();
    await expect.poll(() => st.bodies.filter((b) => b.action === 'warn').length).toBe(2);
    expect(st.bodies.find((b) => b.action === 'warn')).toMatchObject({ sub: ALICE, action: 'warn', article: '4.2', note: 'Loud' });
    await p.getByRole('button', { name: 'Sign out everywhere' }).click();
    await expect.poll(() => st.calls).toContain('POST membership/signout');
    await p.getByRole('button', { name: 'Re-issue certificate' }).click();
    await expect.poll(() => st.calls).toContain('POST membership/certificate/reissue');
    await redrawn('POST membership/certificate/reissue', 'select[name=days]');
    await p.locator('select[name=days]').selectOption('30');
    await p.getByRole('button', { name: 'Suspend', exact: true }).click();
    await expect.poll(() => st.bodies.filter((b) => b.action === 'suspend').length).toBe(1);
    const sus = st.bodies.find((b) => b.action === 'suspend');
    expect(sus.until).toBeGreaterThan(Date.now() + 29 * 86400000);
    await redrawn('POST membership/standing', '#lbAdmNumber input');
    await p.locator('#lbAdmNumber input').fill('0042');
    await p.locator('#lbAdmNumber button').click();
    await expect.poll(() => st.calls).toContain('POST membership/assign-number');
    await redrawn('POST membership/assign-number', '#lbAdmNumber input');
    const n = st.calls.filter((c) => c === 'POST membership/standing').length;
    await p.getByRole('button', { name: 'Remove', exact: true }).click();
    expect(st.calls.filter((c) => c === 'POST membership/standing').length).toBe(n);
    await p.getByRole('button', { name: 'Confirm remove' }).click();
    await expect.poll(() => st.bodies.some((b) => b.action === 'remove')).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  test('invites: create shows the link, history shows the number, revoke needs a second click', async ({ page }) => {
    const st = mockApi(page);
    await boot(page);
    await openAdmin(page);
    const inv = sec(page, 'Invites');
    await expect(inv.getByRole('button', { name: /^Waiting/ })).toBeVisible();
    await inv.getByRole('button', { name: /^Done/ }).click();
    await expect(inv).toContainText('Redeemed as 0042');
    await inv.getByRole('button', { name: /^Sent/ }).click();
    await inv.locator('input[name=loginName]').fill('erin');
    await inv.locator('textarea[name=message]').fill('Welcome, Erin.');
    await inv.getByRole('button', { name: 'Create invite' }).click();
    await page.locator('#lbAdmStepup input[name=login]').fill('boss');
    await page.locator('#lbAdmStepup input[name=password]').fill('right');
    await page.locator('#lbAdmStepup button[type=submit]').click();
    await expect(inv.locator('#lbAdmInviteLink')).toHaveValue('https://limitless.test/auth/invite/tok');
    expect(st.bodies.find((b) => b.loginName === 'erin')).toEqual({ loginName: 'erin', message: 'Welcome, Erin.' });
    await inv.getByRole('button', { name: 'Revoke' }).click();
    await inv.getByRole('button', { name: 'Confirm revoke' }).click();
    await expect.poll(() => st.calls).toContain('POST membership/invites/revoke');
    expect(st.bodies.at(-1)).toEqual({ id: 1 });
  });

  test('charts are inline SVG with data, live tiles show totals, hops show medians', async ({ page }) => {
    mockApi(page);
    await boot(page);
    await openAdmin(page);
    const c = sec(page, 'Charts');
    await expect(c.locator('#lbAdmLive')).toContainText('18 Mbit/s');
    await expect(c.locator('svg.lb-adm-svg')).toHaveCount(3);
    await expect(c.locator('svg.lb-adm-svg').first().locator('rect.lb-adm-bar')).toHaveCount(30);
    await expect(c.locator('svg').first()).toHaveAttribute('role', 'img');
    await expect(c).toContainText('0102');
    const h = sec(page, 'Hops');
    await expect(h).toContainText('Last 5 minutes');
    await expect(h).toContainText('100 ms');
    await expect(h.locator('svg.lb-adm-svg')).toHaveCount(1);
    await expect(page.locator('#lbAdmin')).not.toContainText('example.com/');
  });

  test('plans: knobs, price and cap table save through step-up; "Plans open for sale" ships off and needs a confirm', async ({ page }) => {
    const st = mockApi(page);
    await boot(page);
    await openAdmin(page);
    const pl = sec(page, 'Plans');
    await expect(pl).toContainText('Off. Nobody can buy yet.');
    await pl.locator('#lbAdmPlansOpen').click();
    expect(st.calls).not.toContain('POST membership/settings');
    await pl.getByRole('button', { name: 'Confirm turn on' }).click();
    await page.locator('#lbAdmStepup input[name=login]').fill('boss');
    await page.locator('#lbAdmStepup input[name=password]').fill('right');
    await page.locator('#lbAdmStepup button[type=submit]').click();
    await expect.poll(() => st.bodies.some((b) => b.plansOpen === true)).toBe(true);
    await expect(pl).toContainText('Members can see and request plans');
    await pl.locator('input[name="cardinal.weeklyGb"]').fill('30');
    await pl.getByRole('button', { name: 'Save and apply' }).click();
    await expect.poll(() => st.bodies.filter((b) => b.tier).length).toBe(4);
    const card = st.bodies.find((b) => b.tier === 'cardinal');
    expect(card.limits.weeklyGb).toBe(30);
    expect(st.bodies.find((b) => b.tier === 'executive').limits.priceUsdYear).toBeNull();
    await pl.locator('input[name=primeSeats]').fill('8');
    await pl.getByRole('button', { name: 'Save knobs' }).click();
    await expect.poll(() => st.bodies.some((b) => b.primeSeats === 8)).toBe(true);
  });

  test('membership off on the server: member sections say so, the rest still works', async ({ page }) => {
    mockApi(page, { noMembership: true });
    await boot(page);
    await openAdmin(page);
    await expect(sec(page, 'Members')).toContainText('Membership is off');
    await expect(sec(page, 'Plans')).toContainText('Membership is off');
    await expect(page.locator('#lbAdmin')).toContainText('alice');
    await expect(sec(page, 'Notices')).toContainText('Maintenance');
  });

  test('notices: publish, edit and delete; reports: filter and mark done; audit: filter by action', async ({ page }) => {
    const st = mockApi(page);
    await boot(page);
    await openAdmin(page);
    const n = sec(page, 'Notices');
    await expect(n).toContainText('Maintenance <i>tonight</i>');
    await expect(n.locator('i')).toHaveCount(0);
    await n.locator('input[name=text]').fill('Back at noon');
    await n.getByRole('button', { name: 'Publish' }).click();
    await page.locator('#lbAdmStepup input[name=login]').fill('boss');
    await page.locator('#lbAdmStepup input[name=password]').fill('right');
    await page.locator('#lbAdmStepup button[type=submit]').click();
    await expect.poll(() => st.bodies.some((b) => b.text === 'Back at noon')).toBe(true);
    await n.getByRole('button', { name: 'Edit' }).click();
    await n.locator('td input').fill('Changed');
    await n.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => st.bodies.some((b) => b.id === 5 && b.text === 'Changed')).toBe(true);
    await n.getByRole('button', { name: 'Delete' }).click();
    await n.getByRole('button', { name: 'Confirm delete' }).click();
    await expect.poll(() => st.calls).toContain('DELETE notices/5');
    const r = sec(page, 'Reports');
    await expect(r).toContainText('It crawls <u>x</u>');
    await expect(r).toContainText('news.example.com');
    await expect(r.locator('u')).toHaveCount(0);
    await r.getByRole('button', { name: 'Slow', exact: true }).click();
    await expect.poll(() => st.calls).toContain('GET reports');
    await r.getByRole('button', { name: 'Mark done' }).click();
    await expect.poll(() => st.bodies.some((b) => b.id === 9)).toBe(true);
    const a = sec(page, 'Audit');
    await a.locator('input[name=action]').fill('standing-warn');
    await a.getByRole('button', { name: 'Filter' }).click();
    await expect.poll(() => st.auditUrl).toContain('action=standing-warn');
  });

  test('queue: plan requests approve with details and decline; text is never HTML', async ({ page }) => {
    const st = mockApi(page);
    const errors = await boot(page);
    await openAdmin(page);
    const q = sec(page, 'Queue');
    await expect(q).toContainText('Paid <b>cash</b>');
    await expect(q.locator('b')).toHaveCount(0);
    await q.locator('input[name=amount]').fill('35');
    await q.locator('input[name=howPaid]').fill('cash');
    await q.locator('input[name=receiptNote]').fill('in person');
    await q.getByRole('button', { name: 'Approve' }).click();
    await page.locator('#lbAdmStepup input[name=login]').fill('boss');
    await page.locator('#lbAdmStepup input[name=password]').fill('right');
    await page.locator('#lbAdmStepup button[type=submit]').click();
    await expect.poll(() => st.calls).toContain('POST membership/requests/approve');
    expect(st.bodies.find((b) => b.id === 7)).toEqual({ id: 7, amount: 35, howPaid: 'cash', receiptNote: 'in person' });
    await q.getByRole('button', { name: 'Decline' }).click();
    await q.getByRole('button', { name: 'Confirm decline' }).click();
    await expect.poll(() => st.calls).toContain('POST membership/requests/decline');
    expect(st.bodies.at(-1)).toEqual({ id: 7 });
    expect(errors).toEqual([]);
  });

  test('queue: outbox shows to, subject and body as text, copies, marks sent', async ({ page, context }) => {
    const st = mockApi(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await boot(page);
    await openAdmin(page);
    const q = sec(page, 'Queue');
    await expect(q).toContainText('a@kmlhs.org');
    await expect(q).toContainText('Welcome <i>Prime</i>');
    await expect(q.locator('i')).toHaveCount(0);
    await expect(q.getByRole('button', { name: 'Mark sent' })).toHaveCount(1);
    await q.getByRole('button', { name: 'Copy' }).first().click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Welcome <i>Prime</i>\n\nLine one\nLine two');
    await q.getByRole('button', { name: 'Mark sent' }).click();
    await page.locator('#lbAdmStepup input[name=login]').fill('boss');
    await page.locator('#lbAdmStepup input[name=password]').fill('right');
    await page.locator('#lbAdmStepup button[type=submit]').click();
    await expect.poll(() => st.calls).toContain('POST membership/outbox/sent');
    expect(st.bodies).toContainEqual({ id: 4 });
  });

  test('charts: load-time p50 and p90 by day', async ({ page }) => {
    mockApi(page);
    await boot(page);
    await openAdmin(page);
    const c = sec(page, 'Charts');
    await expect(c).toContainText('Page load time');
    const pt = c.locator('table', { hasText: 'p90' });
    await expect(pt).toContainText('2026-10-21');
    await expect(pt).toContainText('4.0 s');
  });

  for (const theme of THEMES) {
    test(`new sections readable in ${theme}, no sideways scroll at 1366x768 and 2560x1440`, async ({ page }) => {
      mockApi(page);
      await boot(page);
      await page.evaluate((t) => window.LBTheme.set({ theme: t }), theme);
      await openAdmin(page);
      await sec(page, 'Members').getByRole('button', { name: 'Alice <b>A</b>' }).click();
      await expect(sec(page, 'Charts').locator('svg.lb-adm-svg')).toHaveCount(3);
      await expect(sec(page, 'Queue')).toContainText('Prime');
      for (const vp of [{ width: 1366, height: 768 }, { width: 2560, height: 1440 }, { width: 390, height: 800 }]) {
        await page.setViewportSize(vp);
        const r = await page.evaluate(() => {
          const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
          const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
          const root = document.getElementById('lbAdmin');
          const card = document.getElementById('lbAdmMembers');
          const bg = rgb(getComputedStyle(card).backgroundColor), fg = rgb(getComputedStyle(card.querySelector('h2')).color);
          const [a, b] = [lum(bg), lum(fg)].sort((x, y) => y - x);
          const bar = document.querySelector('#lbAdmCharts rect.lb-adm-bar').getBoundingClientRect();
          return { ratio: (a + 0.05) / (b + 0.05), overflow: root.scrollWidth > root.clientWidth + 1, bar: bar.height > 0 };
        });
        expect(r.ratio, vp.width + ' ' + theme).toBeGreaterThan(4.5);
        expect(r.overflow, vp.width + ' ' + theme).toBe(false);
        expect(r.bar).toBe(true);
      }
      if (process.env.LB_SHOTS) {
        await page.setViewportSize({ width: 1366, height: 768 });
        await page.screenshot({ path: `test-results/admin-s7-${theme}-1366.png` });
        await page.setViewportSize({ width: 2560, height: 1440 });
        await page.screenshot({ path: `test-results/admin-s7-${theme}-2560.png` });
      }
    });
  }
});

// Hotfix 0.2.1: the panel is an overlay page; every way of leaving it must hide it, and it has its own Close button.
test.describe('admin panel 1.1 WP5', () => {
  const sec = (page, id) => page.locator('#lbAdm' + id);
  const unlock = async (page) => { await page.locator('#lbAdmStepup input[name=login]').fill('boss'); await page.locator('#lbAdmStepup input[name=password]').fill('right'); await page.locator('#lbAdmStepup button[type=submit]').click(); };

  test('members: plan pill, master-detail beside the table at 1366 and under it at 390', async ({ page }) => {
    mockApi(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await boot(page); await openAdmin(page);
    const m = sec(page, 'Members');
    await expect(m.locator('.lb-adm-plan').first()).toContainText(/Ordinal|Cardinal|Prime|Executive/);
    await m.getByRole('button', { name: 'Alice <b>A</b>' }).click();
    const t = await m.locator('.lb-adm-mlist').boundingBox(), pr = await m.locator('#lbAdmProfile').boundingBox();
    expect(pr.x).toBeGreaterThan(t.x + t.width - 2);
    await page.setViewportSize({ width: 390, height: 800 });
    const t2 = await m.locator('.lb-adm-mlist').boundingBox(), p2 = await m.locator('#lbAdmProfile').boundingBox();
    expect(p2.y).toBeGreaterThan(t2.y + t2.height - 2);
    expect(await page.evaluate(() => document.getElementById('lbAdmin').scrollWidth <= document.getElementById('lbAdmin').clientWidth + 1)).toBe(true);
  });

  test('void side sheet: reasons, suggested refund, second click, then POST membership/void', async ({ page }) => {
    const st = mockApi(page);
    await boot(page); await openAdmin(page);
    const m = sec(page, 'Members');
    await m.getByRole('button', { name: 'Alice <b>A</b>' }).click();
    await m.getByRole('tab', { name: 'Plan and payments' }).click();
    await m.getByRole('button', { name: 'Void plan' }).click();
    const sh = page.locator('#lbAdmSheet');
    await expect(sh).toHaveAttribute('role', 'dialog');
    await expect(sh).toContainText('Suggested refund: $0');
    await sh.getByLabel('Error').check();
    await expect(sh).toContainText(/Suggested refund: \$1[3-4]/);
    await sh.locator('#lbAdmVoidGo').click();
    expect(st.calls).not.toContain('POST membership/void');
    await sh.locator('#lbAdmVoidGo').click();
    await unlock(page);
    await expect.poll(() => st.calls).toContain('POST membership/void');
    expect(st.bodies.find((b) => b.reason)).toMatchObject({ id: 11, reason: 'error' });
    await expect(sh).toBeHidden();
  });

  test('top-up, trial and Executive send the right writes', async ({ page }) => {
    const st = mockApi(page);
    await boot(page); await openAdmin(page);
    const m = sec(page, 'Members');
    await m.getByRole('button', { name: 'Alice <b>A</b>' }).click();
    await m.getByRole('tab', { name: 'Plan and payments' }).click();
    await m.locator('#lbAdmTopup input[name=gb]').fill('25');
    await m.getByRole('button', { name: 'Add top-up' }).click();
    await unlock(page);
    await expect.poll(() => st.calls).toContain('POST membership/topup');
    expect(st.bodies.find((b) => b.gb)).toMatchObject({ gb: 25 });
    await m.locator('#lbAdmPane-plan').getByRole('button', { name: 'Start trial' }).click();
    await expect.poll(() => st.calls).toContain('POST membership/trial');
    await m.getByRole('tab', { name: 'Standing and access' }).click();
    await m.getByRole('button', { name: 'Make Executive' }).click();
    await m.getByRole('button', { name: 'Confirm Executive' }).click();
    await expect.poll(() => st.bodies.some((b) => b.tier === 'executive')).toBe(true);
  });

  test('plan limits turn amber until saved; transfer board shows ticks and the active brake; hop bar renders', async ({ page }) => {
    mockApi(page);
    await boot(page); await openAdmin(page);
    const pl = sec(page, 'Plans');
    const i = pl.locator('#lbAdmPlanForm input[name="cardinal.tabs"]');
    await i.fill('20');
    await expect(i).toHaveClass(/lb-adm-dirty/);
    await expect(pl.getByRole('button', { name: 'Save and apply' })).toBeVisible();
    const tr = sec(page, 'Transfer');
    await expect(tr).toContainText('3570 of 5000 GB');
    await expect(tr.locator('.lb-adm-tick')).toHaveCount(3);
    await expect(tr.locator('.lb-adm-tile.on')).toContainText('warn');
    await expect(sec(page, 'Hops').locator('#lbAdmHopBar .lb-adm-seg')).toHaveCount(2);
    await expect(sec(page, 'Charts').locator('#lbAdmSpark svg')).toHaveCount(2);
  });

  test('invites tabs: waiting shows plan requests; queue "Waiting for cash" sends accept', async ({ page }) => {
    const st = mockApi(page);
    await boot(page); await openAdmin(page);
    const inv = sec(page, 'Invites');
    await inv.getByRole('button', { name: /^Waiting/ }).click();
    await expect(inv).toContainText('PLAN REQUEST');
    await sec(page, 'Queue').getByRole('button', { name: 'Waiting for cash' }).click();
    await unlock(page);
    await expect.poll(() => st.calls).toContain('POST membership/requests/accept');
    expect(st.bodies.filter((b) => b.id === 7).length).toBeGreaterThan(0);
    await expect(sec(page, 'Queue')).toContainText('[waiting_cash]');
  });
});

test.describe('leaving the admin panel', () => {
  const shown = (page) => page.locator('#lbAdmin.show');
  for (const [name, leave] of [
    ['the Close button', (page) => page.locator('#lbAdmClose').click()],
    ['Home', (page) => menuItem(page, 'home')],
    ['a new tab', (page) => page.locator('#newTab').click()],
    ['Settings', (page) => menuItem(page, 'settings')],
    ['closing its tab', (page) => page.evaluate(() => { const t = document.querySelector('.tab.active .tab-close, .tab.active [class*="close"]'); t.click(); })],
  ]) {
    test(`${name} hides it`, async ({ page }) => {
      mockApi(page);
      await boot(page);
      await page.evaluate(() => window.LB_go('limitless://whats-new'));   // a second tab-scoped page in history
      await page.evaluate(() => document.querySelector('#newTab').click());
      await openAdmin(page);
      await expect(shown(page)).toBeVisible();
      await leave(page);
      await expect(shown(page)).toBeHidden();
    });
  }
});

// Hotfix 0.2.2: Close only closes the panel. The tab stays, with the page it showed before (here Settings).
test('Close returns to the previous page in the same tab and keeps every tab', async ({ page }) => {
  mockApi(page);
  await boot(page);
  await menuItem(page, 'settings');
  await expect(page.locator('#lbAboutAdmin')).toBeAttached();
  const tabsBefore = await page.locator('.tab').count();
  await page.evaluate(() => document.getElementById('lbAboutAdmin').click());
  await expect(page.locator('#lbAdmin.show')).toBeVisible();
  await page.locator('#lbAdmClose').click();
  await expect(page.locator('#lbAdmin.show')).toBeHidden();
  expect(await page.locator('.tab').count()).toBe(tabsBefore);
  await expect(page.locator('#url')).toHaveValue(/limitless:\/\/settings/);
});

test('1.2.1 profile: tabs switch with aria-selected and arrow keys; the tab survives an action', async ({ page }) => {
  mockApi(page);
  await boot(page); await openAdmin(page);
  const m = page.locator('#lbAdmMembers');
  await m.getByRole('button', { name: 'Alice <b>A</b>' }).click();
  const p = m.locator('#lbAdmProfile');
  await expect(p.getByRole('tablist')).toBeVisible();
  await expect(p.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await p.getByRole('tab', { name: 'Overview' }).press('ArrowRight');
  await expect(p.getByRole('tab', { name: 'Plan and payments' })).toHaveAttribute('aria-selected', 'true');
  await expect(p.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'false');
  await expect(p.getByRole('tabpanel')).toContainText('Set plan');
  await p.getByRole('tab', { name: 'Plan and payments' }).press('End');
  await expect(p.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
  await p.getByRole('tab', { name: 'Standing and access' }).click();
  await p.getByRole('button', { name: 'Sign out everywhere' }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('#lbAdmProfile [role=tab][aria-selected=true]').textContent)).toBe('Standing and access');
});

test('1.2.1 quick grant: a preset sends tier and paidUntil; trial toggle; danger zone Remove needs two clicks', async ({ page }) => {
  const st = mockApi(page);
  await boot(page); await openAdmin(page);
  const m = page.locator('#lbAdmMembers');
  await m.getByRole('button', { name: 'Alice <b>A</b>' }).click();
  const p = m.locator('#lbAdmProfile');
  await expect(p.locator('#lbAdmQgrant')).toBeHidden();
  await p.getByRole('button', { name: 'Grant plan' }).click();
  await expect(p.locator('#lbAdmQgrant')).toBeVisible();
  await p.getByRole('button', { name: 'Suspend / Warn' }).click();
  await expect(p.locator('#lbAdmQgrant')).toBeHidden();
  await p.getByRole('button', { name: 'Grant plan' }).click();
  await p.locator('#lbAdmQgrant select[name=qtier]').selectOption('prime');
  await p.locator('#lbAdmQgrant').getByRole('button', { name: '90 days' }).click();
  const t0 = Date.now();
  await p.getByRole('button', { name: 'Apply grant' }).click();
  await page.locator('#lbAdmStepup input[name=login]').fill('boss'); await page.locator('#lbAdmStepup input[name=password]').fill('right'); await page.locator('#lbAdmStepup button[type=submit]').click();
  await expect.poll(() => st.bodies.some((b) => b.tier === 'prime')).toBe(true);
  const g = st.bodies.find((b) => b.tier === 'prime');
  expect(g.sub).toBe(ALICE);
  expect(Math.abs(g.paidUntil - (t0 + 90 * 86400000))).toBeLessThan(60000);
  await expect(p.getByRole('button', { name: 'End trial' })).toHaveCount(0);
  await p.getByRole('button', { name: 'Start trial' }).click();
  await expect.poll(() => st.calls).toContain('POST membership/trial');
  await p.getByRole('tab', { name: 'Standing and access' }).click();
  const n = st.calls.filter((c) => c === 'POST membership/standing').length;
  await p.locator('.lb-adm-danger').getByRole('button', { name: 'Remove', exact: true }).click();
  expect(st.calls.filter((c) => c === 'POST membership/standing').length).toBe(n);
  await p.locator('.lb-adm-danger').getByRole('button', { name: 'Confirm remove' }).click();
  await expect.poll(() => st.bodies.some((b) => b.action === 'remove')).toBe(true);
});
