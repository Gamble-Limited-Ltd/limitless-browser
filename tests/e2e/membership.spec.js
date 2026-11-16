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

test('nginx sends each gate reason to its page, and only /_lb/verify/ and the secret-guarded /_lb/relay/sync are ungated under /_lb/', () => {
  const m = /map \$lb_reason \$lb_deny_path \{([^}]*)\}/.exec(nginx);
  expect(m).toBeTruthy();
  const rows = Object.fromEntries([...(m ? m[1] : '').matchAll(/^\s*(\w+)\s+(\/\S+);/gm)].map((r) => [r[1], r[2]]));
  expect(rows).toEqual({ default: '/auth/invite', removed: '/auth/removed', suspended: '/auth/suspended', welcome: '/auth/welcome' });
  expect(nginx).toContain('proxy_pass $gate$lb_deny_path;');
  // A welcome-state member opening any page is sent to the designed ceremony, not shown the gate's fallback form at that URL.
  const invite = /location @invite \{([\s\S]*?)\n  \}/.exec(nginx);
  expect(invite && invite[1]).toContain('if ($lb_reason = welcome) { return 302 /auth/welcome; }');
  // Every /_lb/ location except verify and the relay sync (authenticated by its shared secret in the gate) is gated.
  const blocks = [...nginx.matchAll(/location (?:=|\^~) (\/_lb\/\S+) \{([\s\S]*?)\n  \}/g)];
  expect(blocks.length).toBeGreaterThanOrEqual(4);
  for (const [, loc, body] of blocks) {
    if (loc === '/_lb/verify/' || loc === '/_lb/relay/sync') expect(body, loc).toContain('auth_request off');
    else expect(body, loc).not.toContain('auth_request off');
  }
});

test('nginx serves the designed ceremony at /auth/welcome and its assets ungated, from this tree', () => {
  const page = /location = \/auth\/welcome \{([\s\S]*?)\n  \}/.exec(nginx);
  expect(page && page[1]).toContain('auth_request off');
  expect(page && page[1]).toContain('rewrite ^ /theme/ceremony/index.html break;');
  const assets = /location ~ \^\/theme\/\(([^)]*)\) \{([\s\S]*?)\n  \}/.exec(nginx);
  expect(assets && assets[2]).toContain('auth_request off');
  expect(assets && assets[1]).toContain('ceremony/');
  expect(nginx.indexOf('location = /auth/welcome')).toBeLessThan(nginx.indexOf('location ^~ /auth/'));
});

test('nginx names the gate reason on a bare 403, so a version.json fetch can tell welcome from invite only', () => {
  const invite = /location @invite \{([\s\S]*?)\n  \}/.exec(nginx);
  expect(invite && invite[1]).toContain('add_header X-LB-Reason $lb_reason always;');
  expect(invite && invite[1].indexOf('add_header X-LB-Reason')).toBeLessThan(invite ? invite[1].indexOf('return 403') : 0);
  // version.json is fetched with Accept */*, so lb_html is 0 there and it gets the bare 403 (with the reason), never a redirect.
  expect(/map \$http_accept \$lb_html \{\s*default 0;/.test(nginx)).toBe(true);
});
