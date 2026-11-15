const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// RELAY 3.6: the gate's /_lb/me says busy; the app shows the hint once per session and never turns Data saver on.
test('busy line shows the Data saver hint once per session and does not enable Data saver', async ({ page }) => {
  let calls = 0;
  await page.route('**/_lb/me', (route) => {
    calls++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ busy: true }) });
  });
  const errors = await boot(page);
  const note = page.locator('#lbBusyNote');
  await expect(note).toBeVisible({ timeout: 15000 });
  await expect(note).toHaveText('The line is busy, Data saver helps');
  expect(await page.evaluate(() => localStorage.getItem('limitless:datasaver:v1'))).not.toBe('1');
  await page.locator('#lbBusyDismiss').click();
  await expect(note).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(6000);
  await expect(page.locator('#lbBusyNote')).toHaveCount(0);
  expect(calls).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('no hint while the line is not busy', async ({ page }) => {
  await page.route('**/_lb/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"busy":false}' }));
  await boot(page);
  await page.waitForTimeout(6000);
  await expect(page.locator('#lbBusyNote')).toHaveCount(0);
});

// S5 open item 4: the poll goes on after the busy note, so LB_member keeps refreshing (plan, standing, notices).
test('LB_member keeps refreshing after the busy note was shown', async ({ page }) => {
  let n = 0;
  await page.route('**/_lb/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ membership: 'on', busy: true, number: '0047', tier: 'ordinal', serial: ++n }) }));
  await boot(page);
  await expect(page.locator('#lbBusyNote')).toBeVisible({ timeout: 15000 });
  const first = await page.evaluate(() => window.LB_member.serial);
  await page.evaluate(() => window.LB_meRefresh());
  await page.waitForFunction((a) => window.LB_member.serial > a, first, { timeout: 5000 });
  await expect(page.locator('#lbBusyNote')).toHaveCount(1);
});
