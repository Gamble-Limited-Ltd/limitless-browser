const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// 1.2 Trusted Types (docs/1.2/POPUP.md). The proxied document never gets the site's CSP headers and parse-time meta CSPs are stripped,
// so enforcement can only start when the page's own script adds a CSP meta. A `require-trusted-types-for 'script'` meta added that way
// made the next innerHTML or script write throw (our runtime writes through the same sinks). The runtime now keeps such metas inert.

const SETUP = `
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url) {
      const r = window.__pages[url] || { status: 404, headers: {}, body: 'nope' };
      const bytes = new TextEncoder().encode(r.body);
      return { status: r.status || 200, headers: new Headers(r.headers || {}), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
`;
const PAGE = (meta) => `<html><head><title>tt</title>${meta}</head><body><div id="out">start</div><script>
  var r = {};
  try { document.head.appendChild(Object.assign(document.createElement('meta'), { httpEquiv: 'Content-Security-Policy', content: "require-trusted-types-for 'script'" })); r.append = 'ok'; } catch (e) { r.append = String(e); }
  try { var m = document.createElement('meta'); m.setAttribute('http-equiv', 'Content-Security-Policy'); m.setAttribute('content', "require-trusted-types-for 'script'"); document.head.appendChild(m); } catch (e) {}
  try { document.getElementById('out').innerHTML = '<b id="w">written</b>'; r.write = 'ok'; } catch (e) { r.write = 'blocked: ' + e.name; }
  try { var s = document.createElement('script'); s.textContent = 'window.__ran = 1'; document.head.appendChild(s); r.script = 'ok'; } catch (e) { r.script = 'blocked: ' + e.name; }
  window.__tt = r;
</script></body></html>`;

async function run(page, meta) {
  const errors = await boot(page);
  await page.evaluate(SETUP);
  await page.evaluate(([html]) => { window.__pages = { 'https://tt.test/': { headers: { 'content-type': 'text/html', 'content-security-policy': "require-trusted-types-for 'script'" }, body: html } }; LB_go('https://tt.test/'); }, [PAGE(meta)]);
  let f;
  await expect.poll(async () => { f = page.frames().find((x) => x.url().startsWith('blob:')); return f ? f.evaluate(() => !!window.__tt).catch(() => false) : false; }, { timeout: 15000 }).toBe(true);
  return { f, errors };
}

test('a page that adds a require-trusted-types-for meta by script does not break writes', async ({ page }) => {
  const { f } = await run(page, '');
  expect(await f.evaluate(() => window.__tt)).toEqual({ append: 'ok', write: 'ok', script: 'ok' });
  expect(await f.evaluate(() => document.getElementById('w') && document.getElementById('w').textContent)).toBe('written');
  expect(await f.evaluate(() => window.__ran)).toBe(1);
});

test('a parse-time meta CSP and the response header add nothing', async ({ page }) => {
  const { f } = await run(page, `<meta http-equiv="Content-Security-Policy" content="require-trusted-types-for 'script'; trusted-types goog">`);
  expect(await f.evaluate(() => window.__tt)).toEqual({ append: 'ok', write: 'ok', script: 'ok' });
});
