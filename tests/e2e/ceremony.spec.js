// S6 welcome ceremony (docs/1.0/UI.md 6.1). The gate's JSON state route does not exist yet, so the gate answers are mocked here.
const { test, expect } = require('@playwright/test');

const CHARTER = [{ title: 'Article 1.', body: 'Be decent.' }, { title: 'Article 2.', body: 'Do not abuse the relay.' }];
async function gate(page, state, over = {}) {
  const s = { ...state };
  await page.route('**/auth/welcome/state', (r) => r.fulfill({ json: s }));
  await page.route('**/auth/welcome/number?*', (r) => { const n = new URL(r.request().url()).searchParams.get('n'); r.fulfill({ json: { status: over.status ? over.status(n) : (n === '0102' ? 'unavailable' : n === '0013' ? 'not_for_plan' : 'free') } }); });
  const calls = [];
  await page.route('**/auth/welcome/number', (r) => { if (r.request().method() !== 'POST') return r.fallback(); calls.push(['number', r.request().postData()]); s.number = new URLSearchParams(r.request().postData()).get('n'); r.fulfill({ status: 200, body: '' }); });
  await page.route('**/auth/welcome/sign', (r) => { calls.push(['sign', r.request().postData()]); s.signed = true; r.fulfill({ status: 200, body: '' }); });
  await page.route('**/auth/welcome/step', (r) => { calls.push(['step', r.request().postData()]); r.fulfill({ status: 200, body: '' }); });
  return calls;
}
const NEW = { kind: 'approved', step: 0, number: null, suggested: '0047', signed: false, tier: 'ordinal', charter: CHARTER, charterVersion: 'draft-2026-11-15', certificateCode: null };
const go = async (page) => { await page.goto('/theme/ceremony/'); };

test('six steps for a new Ordinal member: welcome, number, charter and name, reveal, member card, tour', async ({ page }) => {
  const calls = await gate(page, NEW);
  await go(page);
  await expect(page.locator('h1')).toHaveText('Welcome');
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page.locator('h1')).toHaveText('Choose your number');
  await expect(page.locator('#cwNum')).toHaveValue('0047');
  await expect(page.locator('.msg')).toHaveText('That number is free');
  await page.locator('#cwNum').fill('0102');
  await expect(page.locator('.msg')).toHaveText('That number is unavailable');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.locator('#cwNum').fill('0013');
  await expect(page.locator('.msg')).toHaveText('Not available for your plan');
  await page.locator('#cwNum').fill('12');
  await expect(page.locator('.msg')).toHaveText('Enter four digits');
  await page.locator('#cwNum').fill('0047');
  await expect(page.locator('.msg')).toHaveText('That number is free');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('h1')).toHaveText('Sign the Charter');
  await expect(page.locator('.charter')).toContainText('Do not abuse the relay.');
  await expect(page.getByRole('button', { name: 'Sign' })).toBeDisabled();
  await page.locator('#cwName').fill('Alex Morgan');
  await expect(page.locator('.sig')).toHaveText('Alex Morgan');
  await page.locator('#cwAgree').check();
  await page.getByRole('button', { name: 'Sign' }).click();
  await expect(page.locator('.reveal svg text')).toHaveText('Nº 0047');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('h1')).toHaveText('Your member card');
  await expect(page.locator('.card')).toContainText('Alex Morgan');
  await expect(page.locator('body')).toContainText('Certificates begin at the Cardinal plan.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('ul.tour li')).toHaveCount(3);
  expect(calls.map((c) => c[0])).toEqual(['step', 'number', 'sign']);
  expect(calls[2][1]).toContain('name=Alex+Morgan');
  expect(calls[2][1]).toContain('agree=on');
});

test('Cardinal and above see the certificate with the Director and the PDF links', async ({ page }) => {
  await gate(page, { ...NEW, kind: 'invited', number: '0101', signed: true, step: 3, tier: 'prime', name: 'Alex Morgan', certificateCode: 'ABCD-1234' });
  await go(page);
  await expect(page.locator('.reveal svg text')).toHaveText('Nº 0101');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('h1')).toHaveText('Your certificate');
  await expect(page.locator('.cert')).toHaveAttribute('data-tier', 'prime');
  await expect(page.locator('.cert')).toContainText('James Thiessen, Director of Gamble Limited Ltd.');
  await expect(page.locator('.cert')).toContainText('Verification code ABCD-1234');
  await expect(page.locator('a[href$="variant=print"]')).toBeVisible();
});

test('existing members get the short 1.0 welcome and skip the number step', async ({ page }) => {
  await gate(page, { ...NEW, kind: 'existing', number: '0102' });
  await go(page);
  await expect(page.locator('h1')).toHaveText('Welcome to Limitless 1.0');
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page.locator('h1')).toHaveText('Sign the Charter');
});

test('progress resumes: a reload returns to the step the gate has recorded', async ({ page }) => {
  await gate(page, { ...NEW, step: 2, number: '0047' });
  await go(page);
  await expect(page.locator('h1')).toHaveText('Sign the Charter');
});

test('the name is shown with textContent (no markup injection) and the end opens the app', async ({ page }) => {
  const calls = await gate(page, { ...NEW, number: '0047', signed: true, step: 5, tier: 'ordinal', name: '<img src=x onerror=alert(1)>' });
  await go(page);
  await expect(page.locator('h1')).toHaveText('Three things to know');
  expect(await page.locator('img').count()).toBe(0);
  await page.route('**/', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>app</title>' }));
  await page.getByRole('button', { name: 'Open Limitless' }).click();
  await expect(page).toHaveTitle('app');
  expect(calls.some((c) => c[0] === 'step' && c[1] === 'step=6')).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('limitless:tour:v1'))).toBe('done');
});

test('reduced motion: the reveal shows at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gate(page, { ...NEW, number: '0047', signed: true, step: 3 });
  await go(page);
  expect(await page.locator('.reveal svg text').evaluate((t) => getComputedStyle(t).fillOpacity)).toBe('1');
});
