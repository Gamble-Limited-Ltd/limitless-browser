const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// 1.2 J5 (features.googleSignin, default off): Google sign-in pages show a plain card with an "Open outside Limitless" button
// (window.open, noopener) instead of the page Google breaks for proxies. Off: the page is fetched as before.
const SETUP = `
  window.__net = [];
  window.__opened = [];
  window.open = (...a) => { window.__opened.push(a); return null; };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url) {
      window.__net.push(url);
      const b = new TextEncoder().encode('<html><head><title>real page</title></head><body><h1>Fetched page</h1><p>Some visible text for the test.</p></body></html>');
      return { status: 200, headers: new Headers({ 'content-type': 'text/html' }), arrayBuffer: async () => b.buffer.slice(0) };
    },
  };
`;
const SIGNIN = 'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmail.google.com&flowName=GlifWebSignIn';

test('on: the sign-in page is a card, nothing is fetched, and the button opens the real URL outside', async ({ page }) => {
  await boot(page);
  await page.evaluate(SETUP);
  await page.evaluate((u) => { LB_features.googleSignin = true; LB_go(u); }, SIGNIN);
  const f = page.frameLocator('#frame');
  await expect(f.locator('h1')).toHaveText('Google sign-in is not available inside Limitless', { timeout: 6000 });
  await expect(f.locator('body')).toContainText('Search');
  await expect(f.locator('body')).not.toContainText('YouTube');
  expect(await page.evaluate(() => __net.filter((u) => u.startsWith('https://accounts.google.com/')))).toEqual([]);
  await f.locator('#outside').click();
  // the card's button reaches the parent page asynchronously, so poll (an immediate read raced on CI)
  await expect.poll(() => page.evaluate(() => __opened)).toEqual([[SIGNIN, '_blank', 'noopener']]);
});

test('on: other Google pages and other sites still load; the matcher knows the sign-in paths', async ({ page }) => {
  await boot(page);
  await page.evaluate(SETUP);
  const r = await page.evaluate(() => ['https://accounts.google.com/ServiceLogin?x=1', 'https://accounts.google.com/signin/v2/identifier', 'https://accounts.google.com/signin/identifier', 'https://accounts.google.com/AccountChooser', 'https://www.google.com/search?q=a', 'https://accounts.google.com.evil.test/signin', 'http://accounts.google.com/signin', 'https://example.com/signin'].map((u) => LB_isGoogleSignin(u)));
  expect(r).toEqual([true, true, true, true, false, false, false, false]);
  await page.evaluate(() => { LB_features.googleSignin = true; LB_go('https://www.google.com/search?q=a'); });
  await expect(page.frameLocator('#frame').locator('h1')).toHaveText('Fetched page', { timeout: 6000 });
});

test('off (default): the sign-in URL is fetched like any page and no card shows', async ({ page }) => {
  await boot(page);
  await page.evaluate(SETUP);
  expect(await page.evaluate(() => LB_features.googleSignin)).toBe(false);
  await page.evaluate((u) => LB_go(u), SIGNIN);
  await expect(page.frameLocator('#frame').locator('h1')).toHaveText('Fetched page', { timeout: 6000 });
  expect(await page.evaluate(() => __net.some((u) => u.startsWith('https://accounts.google.com/v3/signin')))).toBe(true);
  await page.evaluate((u) => window.postMessage({ type: 'lbOpenOutside', url: u }, '*'), SIGNIN);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => __opened.length)).toBe(0);
});
