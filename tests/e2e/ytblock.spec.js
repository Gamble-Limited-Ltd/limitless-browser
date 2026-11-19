const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// K2 (features.ytBlock, default true): YouTube hosts are refused for every request and tier, whatever the ad-block switch or allowlist says.
const SETUP = `
  window.__net = { log: [] };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url) {
      window.__net.log.push(url);
      const bytes = new TextEncoder().encode('<html><body><h1>Example page</h1><p>Some real page text for the test.</p></body></html>');
      return { status: 200, headers: new Headers({ 'content-type': 'text/html' }), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
`;

test('navigating to YouTube shows the plain card and fetches nothing', async ({ page }) => {
  await boot(page);
  await page.evaluate(SETUP);
  await page.evaluate(() => LB_go('https://www.youtube.com/watch?v=abc'));
  await expect(page.frameLocator('#frame').locator('h1')).toHaveText('YouTube is not available in Limitless.', { timeout: 6000 });
  expect(await page.evaluate(() => __net.log.length)).toBe(0);
});

test('a subresource fetch to i.ytimg.com is refused, even with the ad-block switch off; google.com is not', async ({ page }) => {
  await boot(page);
  await page.evaluate(SETUP);
  const r = await page.evaluate(async () => {
    LB_setBlock(false);
    const yt = await LB_queueFetch('https://i.ytimg.com/vi/a/0.jpg', {}, 2);
    const g = await LB_queueFetch('https://www.google.com/x', {}, 2);
    return {
      ytSkipped: !!yt.skipped, gSkipped: !!g.skipped, log: __net.log.slice(),
      hosts: ['https://youtube.com/', 'https://youtu.be/a', 'https://a.youtube-nocookie.com/', 'https://r1---sn.googlevideo.com/v', 'https://ytimg.com/'].map((u) => LB_shouldSkip(u)),
      look: ['https://notyoutube.com/', 'https://youtube.com.evil.example/', 'https://google.com/', 'https://example.com/youtube.com/'].map((u) => LB_shouldSkip(u)),
      script: LB_makeProxyScript('https://example.com/', false).includes('const YT_BLOCK = true'),
    };
  });
  expect(r.ytSkipped).toBe(true);
  expect(r.gSkipped).toBe(false);
  expect(r.log).toEqual(['https://www.google.com/x']);
  expect(r.hosts).toEqual([true, true, true, true, true]);
  expect(r.look).toEqual([false, false, false, false]);
  expect(r.script).toBe(true);
});

test('features.ytBlock=false behaves as before', async ({ page }) => {
  await boot(page);
  await page.evaluate(SETUP);
  const r = await page.evaluate(async () => {
    LB_features.ytBlock = false;
    LB_setBlock(false);
    const off = LB_shouldSkip('https://i.ytimg.com/a');
    const script = LB_makeProxyScript('https://example.com/', false).includes('const YT_BLOCK = false');
    LB_go('https://www.youtube.com/');
    return { off, script };
  });
  expect(r).toEqual({ off: false, script: true });
  await page.waitForTimeout(2000);
  await expect(page.frameLocator('#frame').locator('h1', { hasText: 'YouTube is not available' })).toHaveCount(0);
});
