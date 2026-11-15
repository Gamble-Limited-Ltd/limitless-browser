// @ts-check
// T5 (docs/1.0/LOADING-REVIEW.md): fault fixtures through the real relay. Deterministic, local, no internet.
// Run: flock /tmp/limitless-rehearsal.lock env LB_FAULTS=1 deploy/rehearsal/run.sh tests/stack/failures.spec.js
// (LB_FAULTS=1 starts the fixtures container and the test-only relay config, like LB_SPEED=1). Fixture routes are listed at the
// top of tests/fixtures/sites/server.js. Checks the fetch core: site errors never reset the relay session (L2), timeouts free
// their queue slot (L4), page requests are never refused for queue length (L5), compression reaches the client.
const { test, expect } = require('@playwright/test');

const BASE = process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590';
const MOCK = process.env.REHEARSAL_MOCK || 'http://127.0.0.1:8591';
const FX = 'http://10.89.85.10:8080';
const DEAD = 'http://10.89.85.10:8081';

async function open(browser) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with GLL ID' }).click();
  await page.waitForURL(`${MOCK}/oidc/authorize**`);
  await page.locator('input[name=user][value=alice]').check();
  await page.locator('#continue').click();
  await expect(page.locator('#url')).toBeVisible({ timeout: 60000 });
  const skip = page.locator('#tutorialOverlay button', { hasText: 'Skip tour' });
  try { await skip.waitFor({ state: 'visible', timeout: 4000 }); await skip.click(); } catch (_) {}
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
  // the relay session must exist before the first request
  await page.waitForFunction(() => !!(window.LB_net && window.LB_net.curl), null, { timeout: 60000 });
  await page.evaluate(() => {
    window.__try = async (fn) => { const t = performance.now(); try { return { ok: await fn(), ms: performance.now() - t }; } catch (e) { return { err: e.message, name: e.name, cat: e.lbCat, code: e.lbCode, ms: performance.now() - t }; } };
  });
  return { ctx, page };
}

const swaps = (page) => page.evaluate(() => window.LB_stats.swaps);
const shown = (page, ms) => page.waitForFunction(() => { const c = window.__lbPerf && window.__lbPerf.cur; return !!(c && c.marks.shown != null); }, null, { timeout: ms });

// The fixtures container only exists with LB_FAULTS=1, so a plain test:stack skips this file.
test.skip(process.env.LB_FAULTS !== '1', 'needs LB_FAULTS=1 (fixtures container)');

test.describe('fault fixtures', () => {
  test('a dead host (connection refused) fails that request fast and leaves the session alone', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    const s0 = await swaps(page);
    const r = await page.evaluate((u) => __try(() => LB_queueFetch(u)), DEAD + '/x');
    expect(r.err, 'must fail').toBeTruthy();
    expect(r.ms).toBeLessThan(10000);
    expect(await swaps(page)).toBe(s0);
    await ctx.close();
  });

  test('a TLS error (https to a plain http port) is a site error, no session swap', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    const s0 = await swaps(page);
    const r = await page.evaluate(() => __try(() => LB_queueFetch('https://10.89.85.10:8080/')));
    expect(r.err).toBeTruthy();
    expect(await swaps(page)).toBe(s0);
    await ctx.close();
  });

  test('a reset in the middle of the body fails the request and frees the slot', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    const s0 = await swaps(page);
    const r = await page.evaluate((u) => __try(() => LB_queueFetch(u)), FX + '/fault/reset-body');
    expect(r.err).toBeTruthy();
    expect(await page.evaluate(() => LB_queueState().fetching)).toBe(0);
    expect(await swaps(page)).toBe(s0);
    await ctx.close();
  });

  test('a stalled first byte is cut at the deadline and frees the slot', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => { LB_deadlines.connect = 2500; });
    const r = await page.evaluate((u) => __try(() => LB_queueFetch(u)), FX + '/fault/hang');
    expect(r.cat).toBe('timeout');
    expect(r.ms).toBeLessThan(8000);
    expect(await page.evaluate(() => LB_queueState().fetching)).toBe(0);
    await ctx.close();
  });

  test('a page with one dead third-party host is shown with zero session swaps', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    const s0 = await swaps(page);
    await page.evaluate((u) => LB_go(u), FX + '/fault/dead-third');
    await shown(page, 60000);
    await expect(page.frameLocator('#frame').locator('#after')).toBeVisible({ timeout: 20000 });
    expect(await swaps(page)).toBe(s0);
    await ctx.close();
  });

  test('a page whose images all answer 404 loads without a session swap', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    const s0 = await swaps(page);
    await page.evaluate((u) => LB_go(u), FX + '/fault/storm');
    await shown(page, 60000);
    await page.waitForTimeout(1500);
    expect(await swaps(page)).toBe(s0);
    await ctx.close();
  });

  test('a script that answers after 15 s does not stop the page from being shown', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    const s0 = await swaps(page);
    await page.evaluate((u) => LB_go(u), FX + '/fault/slow-script');
    await shown(page, 60000);
    await expect(page.frameLocator('#frame').locator('#h')).toBeVisible({ timeout: 20000 });
    expect(await swaps(page)).toBe(s0);
    await ctx.close();
  });

  test('300 images: every one loads, none is refused as "Queue full"', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => { LB_features.lazyImg = false; });
    await page.evaluate((u) => LB_go(u), FX + '/fault/images');
    await shown(page, 60000);
    await page.waitForFunction(() => { const d = document.getElementById('frame').contentDocument; return !!d && [...d.images].filter((i) => i.complete && i.naturalWidth > 0).length >= 300; }, null, { timeout: 120000 });
    // all 300 loaded above: none was refused (a refused image stays broken, naturalWidth 0)
    await ctx.close();
  });

  test('a server that ignores Range still answers a Range request', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    const r = await page.evaluate((u) => __try(async () => { const x = await LB_queueFetch(u, { headers: { Range: 'bytes=0-9' } }); return { s: x.status, n: x.buf.byteLength }; }), FX + '/fault/video.mp4');
    expect(r.err).toBeUndefined();
    expect([10, 2097152]).toContain(r.ok.n);
    expect(await page.evaluate(() => LB_queueState().fetching)).toBe(0);
    await ctx.close();
  });
});

test.describe('compression', () => {
  test('requests ask for gzip or br and the fixture compresses text', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    let ws = 0;
    cdp.on('Network.webSocketFrameReceived', (e) => { ws += e.response.opcode === 1 ? Buffer.byteLength(e.response.payloadData || '') : Math.floor(((e.response.payloadData || '').length * 3) / 4); });
    const hdr = await page.evaluate((u) => LB_queueFetch(u).then((x) => JSON.parse(new TextDecoder().decode(x.buf))), FX + '/echo-headers');
    expect(String(hdr['accept-encoding'])).toMatch(/gzip|br/);
    ws = 0;
    const r = await page.evaluate((u) => LB_queueFetch(u).then((x) => ({ n: x.buf.byteLength, enc: x.headers['content-encoding'] || '' })), FX + '/article');
    expect(r.n).toBeGreaterThan(50000);
    expect(ws, 'bytes on the WebSocket').toBeLessThan(r.n * 0.7);
    await ctx.close();
  });
});
