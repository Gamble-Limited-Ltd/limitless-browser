const { test, expect } = require('@playwright/test');

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
        version: 'abc1234', uptimeSec: 3700, relay: { ok: true, checkedAt: Date.now() }, gateId: { ok: false, checkedAt: Date.now() },
        live: { sockets: 3, streams: 8, users: 2 }, flags: st.flags, totals: { wisp_opened: 42, login_ok: 7 },
      }));
    }
    if (method === 'POST' && path === 'step-up') {
      const b = JSON.parse(req.postData() || '{}');
      if (b.password === 'right') { st.stepup = true; return route.fulfill(json({ ok: true })); }
      return route.fulfill(json({ error: 'stepup_failed' }, 403));
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
    return route.fulfill(json({ error: 'nope' }, 404));
  });
  return st;
}

async function boot(page) {
  const errors = [];
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
    const row = root.locator('tr', { hasText: 'alice' }).first();
    await row.getByRole('button', { name: 'Revoke' }).click();
    await row.getByRole('button', { name: 'Confirm revoke' }).click();
    await expect.poll(() => st.calls).toContain('POST users/revoke');
    expect(st.bodies.at(-1)).toEqual({ sub: ALICE });
    // Edit limits for alice: blank = default.
    await root.locator('tr', { hasText: 'alice' }).last().getByRole('button', { name: 'Limits' }).click();
    await root.locator('input[name=bandwidthMbps]').fill('10');
    await root.locator('input[name=dailyGb]').fill('2');
    await root.locator('button', { hasText: 'Save limits' }).click();
    await expect.poll(() => st.calls).toContain('POST overrides');
    expect(st.bodies.at(-1)).toEqual({ sub: ALICE, bandwidthMbps: 10, dailyByteCap: 2 * GB, maxSockets: null });
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

// Hotfix 0.2.1: the panel is an overlay page; every way of leaving it must hide it, and it has its own Close button.
test.describe('leaving the admin panel', () => {
  const shown = (page) => page.locator('#lbAdmin.show');
  for (const [name, leave] of [
    ['the Close button', (page) => page.locator('#lbAdmClose').click()],
    ['Home', (page) => page.locator('#home').click()],
    ['a new tab', (page) => page.locator('#newTab').click()],
    ['Settings', (page) => page.locator('#settingsBtn').click()],
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
