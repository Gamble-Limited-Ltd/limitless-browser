const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// 1.2 popup bridge (docs/1.2/POPUP.md): window.open from a proxied page opens a second proxied tab whose window.opener works
// and whose postMessage is relayed both ways, with the real origins on the events. No real Google account: a fixture page
// plays "Sign in with Google" (the popup tells its opener a credential, then closes itself).

const SETUP = `
  window.__net = { log: [], script: {} };
  window.__respond = (url, r) => { window.__net.script[url] = r; };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url, o) {
      window.__net.log.push({ url });
      const r = window.__net.script[url] || { status: 404, headers: {}, body: 'nope' };
      const bytes = new TextEncoder().encode(r.body);
      return { status: r.status || 200, headers: new Headers(r.headers || {}), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
`;
const SITE = 'https://site.test', IDP = 'https://idp.test';
const H = { 'content-type': 'text/html' };

const OPENER = `<html><head><title>site</title></head><body><button id="b">Sign in</button><script>
  window.__got = []; window.__closedSeen = null;
  window.addEventListener('message', function (e) { if (e.data && (e.data.t || e.data.type)) return; /* the app's own internal messages */ window.__got.push({ d: e.data, o: e.origin, hasSource: !!e.source }); });
  document.getElementById('b').onclick = function () {
    window.__pop = window.open('${IDP}/auth?client=1', 'login', 'width=500,height=600');
    window.__popType = typeof window.__pop;
  };
</script></body></html>`;

const POPUP = `<html><head><title>idp</title></head><body><p id="p">sign in</p><script>
  window.__opener = !!window.opener;
  window.__got = [];
  window.addEventListener('message', function (e) { if (e.data && (e.data.t || e.data.type)) return; window.__got.push({ d: e.data, o: e.origin }); });
  window.__send = function () { window.opener.postMessage({ credential: 'tok-123' }, '${SITE}'); };
  window.__sendWrong = function () { window.opener.postMessage({ leak: 1 }, 'https://evil.test'); };
</script></body></html>`;

async function setup(page, features) {
  const errors = await boot(page);
  await page.evaluate(SETUP);
  if (features) await page.evaluate((f) => Object.assign(window.LB_features, f), features);
  await page.evaluate(([s, i, op, pp]) => {
    __respond(s + '/', { headers: { 'content-type': 'text/html' }, body: op });
    __respond(i + '/auth?client=1', { headers: { 'content-type': 'text/html' }, body: pp });
  }, [SITE, IDP, OPENER, POPUP]);
  await page.evaluate((u) => LB_go(u), SITE + '/');
  await expect.poll(() => frameWith(page, 'site')).toBeTruthy();
  return errors;
}
// the live proxied frame whose document title matches
function frameWith(page, title) {
  return Promise.all(page.frames().filter((f) => f.url().startsWith('blob:')).map((f) => f.title().then((t) => (t === title ? f : null), () => null))).then((l) => l.find(Boolean) || null);
}
async function frameOf(page, title) { await expect.poll(() => frameWith(page, title), { timeout: 15000 }).toBeTruthy(); return frameWith(page, title); }

test('window.open gives a handle with a working opener and relays postMessage with real origins', async ({ page }) => {
  await setup(page);
  const opener = await frameOf(page, 'site');
  await opener.evaluate(() => document.getElementById('b').click());
  expect(await opener.evaluate(() => window.__popType)).toBe('object');
  const popup = await frameOf(page, 'idp');
  expect(await popup.evaluate(() => window.__opener)).toBe(true);
  await expect(page.locator('#url')).toHaveValue(/idp\.test/);
  // popup -> opener, right target origin
  await popup.evaluate(() => window.__send());
  const site = await frameOf(page, 'site');   // opener frame is parked, still alive
  await expect.poll(() => site.evaluate(() => window.__got.length)).toBe(1);
  expect(await site.evaluate(() => window.__got[0])).toEqual({ d: { credential: 'tok-123' }, o: IDP, hasSource: true });
  // wrong target origin is dropped, like a browser
  await popup.evaluate(() => window.__sendWrong());
  await page.waitForTimeout(300);
  expect(await site.evaluate(() => window.__got.length)).toBe(1);
  // opener -> popup
  await site.evaluate(() => window.__pop.postMessage({ hello: 'popup' }, 'https://idp.test'));
  await expect.poll(() => popup.evaluate(() => window.__got.length)).toBe(1);
  expect(await popup.evaluate(() => window.__got[0])).toEqual({ d: { hello: 'popup' }, o: SITE });
  expect(await site.evaluate(() => window.__pop.closed)).toBe(false);
  // window.close() in the popup: back on the opener tab, live document intact, handle says closed
  await popup.evaluate(() => window.close());
  await expect(page.locator('#url')).toHaveValue(/site\.test/);
  await expect.poll(() => site.evaluate(() => window.__pop.closed)).toBe(true);
  expect(await site.evaluate(() => window.__got.length)).toBe(1);   // the opener document was never reloaded
  await expect(page.locator('.tab')).toHaveCount(1);
});

test('closing the popup tab by hand returns to the opener and marks the handle closed', async ({ page }) => {
  await setup(page);
  const opener = await frameOf(page, 'site');
  await opener.evaluate(() => document.getElementById('b').click());
  await frameOf(page, 'idp');
  await expect(page.locator('.tab')).toHaveCount(2);
  await page.locator('.tab.active .tab-close, .tab.active .close').first().click();
  await expect(page.locator('#url')).toHaveValue(/site\.test/);
  await expect.poll(() => opener.evaluate(() => window.__pop.closed)).toBe(true);
});

test('features.popupBridge=false keeps the old behaviour (same tab, dummy handle)', async ({ page }) => {
  await setup(page, { popupBridge: false });
  const opener = await frameOf(page, 'site');
  await opener.evaluate(() => document.getElementById('b').click());
  await expect.poll(() => frameWith(page, 'idp')).toBeTruthy();
  await expect(page.locator('.tab')).toHaveCount(1);
});
