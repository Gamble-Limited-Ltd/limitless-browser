const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// 1.2 native image lane (docs/1.2/IMGLANE.md). The relay's /i/ endpoint is a mocked route; the page's own network is a stub libcurl.
// Lane URL: https://<relay host>/i/<token>/<w|s>/<image url>, only for Cardinal and above who opted in, with features.imgLane on.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const SETUP = `
  window.__net = [];
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url) {
      window.__net.push(url);
      if (url === 'https://img.test/') {
        const b = new TextEncoder().encode(window.__html);
        return { status: 200, headers: new Headers({ 'content-type': 'text/html' }), arrayBuffer: async () => b.buffer.slice(0) };
      }
      const png = Uint8Array.from(atob('${PNG.toString('base64')}'), (c) => c.charCodeAt(0));
      return { status: 200, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => png.buffer.slice(0) };
    },
  };
`;
const HTML = '<html><head><title>lane</title></head><body><img id="i" src="https://img.test/pics/a.png?x=1#frag"></body></html>';

async function setup(page, { tier = 'prime', feature = true, optIn = true, saver = false } = {}) {
  const lane = [];
  await page.route('https://relay.test/i/**', (route) => { lane.push(route.request().url()); return route.fulfill({ status: lane.status || 200, contentType: 'image/png', body: PNG }); });
  const errors = await boot(page);
  await page.evaluate(SETUP);
  await page.evaluate(([html, tier, feature, optIn, saver]) => {
    window.__html = html;
    LB_features.imgLane = feature;
    window.LB_member = { membership: 'on', plan: { tier } };
    window.LB_relayStatus = () => ({ ours: true, ownRelay: true, fallbackAllowed: false });
    LB_relayTok.cur = { url: 'wss://relay.test/wisp/', token: 'aa.bb.cc', ttl: 300, at: Date.now() };
    LB_relayTok.get = async () => LB_relayTok.cur;
    if (optIn) LB_ls.setItem('limitless:imglane:v1', '1');
    if (saver) LB_ls.setItem('limitless:datasaver:v1', '1');
  }, [HTML, tier, feature, optIn, saver]);
  return { lane, errors };
}
async function loadAndGetImg(page) {
  await page.evaluate(() => LB_go('https://img.test/'));
  let f;
  await expect.poll(async () => { f = page.frames().find((x) => x.url().startsWith('blob:')); return f ? f.evaluate(() => !!document.getElementById('i') && document.getElementById('i').complete && document.getElementById('i').naturalWidth).catch(() => 0) : 0; }, { timeout: 15000 }).toBeGreaterThan(0);
  return f;
}

test('Prime with the opt-in: the image loads from the relay lane URL, not through libcurl', async ({ page }) => {
  const { lane } = await setup(page);
  const f = await loadAndGetImg(page);
  expect(lane).toEqual(['https://relay.test/i/aa.bb.cc/w/https://img.test/pics/a.png?x=1']);
  expect(await page.evaluate(() => window.__net.filter((u) => /a\.png/.test(u)))).toEqual([]);
  expect(await f.evaluate(() => document.getElementById('i').getAttribute('src').startsWith('https://relay.test/i/'))).toBe(true);
});

test('Data saver sends mode s', async ({ page }) => {
  const { lane } = await setup(page, { tier: 'cardinal', saver: true });
  await loadAndGetImg(page);
  expect(lane[0]).toContain('/i/aa.bb.cc/s/');
});

test('a lane error falls back to the normal path and the image still loads', async ({ page }) => {
  const { lane } = await setup(page);
  await page.unroute('https://relay.test/i/**');
  await page.route('https://relay.test/i/**', (route) => { lane.push(route.request().url()); return route.fulfill({ status: 502, body: '' }); });
  const f = await loadAndGetImg(page);
  expect(lane.length).toBe(1);
  expect(await page.evaluate(() => window.__net.filter((u) => /a\.png/.test(u)).length)).toBeGreaterThan(0);
  expect(await f.evaluate(() => document.getElementById('i').getAttribute('src').startsWith('blob:'))).toBe(true);
});

for (const [name, opts] of [['Ordinal', { tier: 'ordinal' }], ['the member has not opted in', { optIn: false }], ['the build switch is off', { feature: false }]]) {
  test(`no lane when ${name}`, async ({ page }) => {
    const { lane } = await setup(page, opts);
    await loadAndGetImg(page);
    expect(lane).toEqual([]);
    expect(await page.evaluate(() => window.__net.filter((u) => /a\.png/.test(u)).length)).toBeGreaterThan(0);
  });
}

test('LB_imgLane.url refuses non-public looking and odd destinations', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => ['http://localhost/a.png', 'https://10.0.0.1/a.png', 'https://intranet/a.png', 'https://[::1]/a.png', 'https://u:p@img.test/a.png', 'https://img.test:8443/a.png', 'ftp://img.test/a.png', 'data:image/png;base64,AAAA', 'https://img.test/a.png'].map((u) => LB_imgLane.url(u)));
  expect(r.slice(0, 8).every((x) => x === null)).toBe(true);
  expect(r[8]).toBe('https://relay.test/i/aa.bb.cc/w/https://img.test/a.png');
});

test('five failures in a row switch the lane off for two minutes', async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(() => { for (let i = 0; i < 5; i++) LB_imgLane.note(false); return LB_imgLane.on(); })).toBe(false);
});

test('the settings card shows only for paid members when the build has the lane', async ({ page }) => {
  await setup(page, { tier: 'cardinal' });
  await page.evaluate(() => { document.dispatchEvent(new CustomEvent('lb-member', { detail: window.LB_member })); });
  await page.evaluate(() => LB_go('limitless://settings/connection'));
  await expect(page.locator('#settingsImgLaneCard')).toBeVisible();
  await page.locator('#settingsImgLaneSwitch').click();
  expect(await page.evaluate(() => LB_ls.getItem('limitless:imglane:v1'))).toBe('0');
});
