// @ts-check
// S5 (docs/1.0/MEMBERSHIP.md): the app only reads and displays /_lb/me; every access decision is the gate's and nginx's.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { boot } = require('./helpers');

const nginx = fs.readFileSync(path.join(__dirname, '..', '..', 'deploy/web/nginx.conf'), 'utf8');

test('the app keeps the gate membership answer in window.LB_member and announces it', async ({ page }) => {
  const me = { membership: 'on', number: '0102', tier: 'ordinal', standing: 'good', busy: false, plan: { tier: 'ordinal' } };
  await page.route('**/_lb/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me) }));
  await page.addInitScript(() => { window.__lbMemberEvents = 0; document.addEventListener('lb-member', () => { window.__lbMemberEvents++; }); });
  const errors = await boot(page);
  await page.waitForFunction(() => window.LB_member && window.LB_member.number, null, { timeout: 15000 });
  expect(await page.evaluate(() => window.LB_member.number)).toBe('0102');
  expect(await page.evaluate(() => window.__lbMemberEvents)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('membership off or an old gate leaves LB_member unset', async ({ page }) => {
  await page.route('**/_lb/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"membership":"off","busy":false}' }));
  await boot(page);
  await page.waitForTimeout(5500);
  expect(await page.evaluate(() => window.LB_member === undefined)).toBe(true);
});

test('nginx sends each gate reason to its page, and only /_lb/verify/ is ungated under /_lb/', () => {
  const m = /map \$lb_reason \$lb_deny_path \{([^}]*)\}/.exec(nginx);
  expect(m).toBeTruthy();
  const rows = Object.fromEntries([...(m ? m[1] : '').matchAll(/^\s*(\w+)\s+(\/\S+);/gm)].map((r) => [r[1], r[2]]));
  expect(rows).toEqual({ default: '/auth/invite', removed: '/auth/removed', suspended: '/auth/suspended', welcome: '/auth/welcome' });
  expect(nginx).toContain('proxy_pass $gate$lb_deny_path;');
  // Every /_lb/ location except verify is gated (no `auth_request off`).
  const blocks = [...nginx.matchAll(/location (?:=|\^~) (\/_lb\/\S+) \{([\s\S]*?)\n  \}/g)];
  expect(blocks.length).toBeGreaterThanOrEqual(4);
  for (const [, loc, body] of blocks) {
    if (loc === '/_lb/verify/') expect(body).toContain('auth_request off');
    else expect(body, loc).not.toContain('auth_request off');
  }
});
