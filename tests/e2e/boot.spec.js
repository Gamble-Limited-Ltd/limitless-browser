const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { boot } = require('./helpers');

// S2 (docs/1.0/SPEED.md section 3): big vendored blobs live in versioned files, not in index.html.
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('index.html no longer carries the WASM data URI, acorn or the skins CSS', () => {
  expect(html).not.toContain('data:application/octet-stream;base64,AGFzbQ');
  expect(html).not.toContain('<style id="skinStyles">');
  expect(html).toContain('<script src="vendor/acorn/8.14.0/acorn.min.js"></script>');
  expect(html.length).toBeLessThan(1.75e6);
});

test('vendored files exist with their license notices', () => {
  const wasm = fs.readFileSync(path.join(ROOT, 'vendor/libcurl/0.7.4/libcurl.wasm'));
  expect(wasm.subarray(0, 4).toString('hex')).toBe('0061736d');
  expect(fs.readFileSync(path.join(ROOT, 'vendor/libcurl/0.7.4/LICENSE.txt'), 'utf8')).toContain('LGPL');
  expect(fs.readFileSync(path.join(ROOT, 'vendor/acorn/8.14.0/LICENSE.txt'), 'utf8')).toContain('MIT');
  expect(html).toContain('const copyright_notice');
  expect(fs.existsSync(path.join(ROOT, 'theme/skins.css'))).toBe(true);
});

test('libcurl loads its WASM from the vendored file and boots', async ({ page }) => {
  const seen = [];
  page.on('response', (r) => seen.push(r.url()));
  const errors = await boot(page);
  expect(seen.some((u) => u.endsWith('/vendor/libcurl/0.7.4/libcurl.wasm'))).toBe(true);
  expect(seen.some((u) => u.endsWith('/vendor/acorn/8.14.0/acorn.min.js'))).toBe(true);
  expect(await page.evaluate(() => typeof acorn.parse + typeof acorn.walk.full)).toBe('functionfunction');
  expect(await page.evaluate(() => libcurl.ready || new Promise((ok) => document.addEventListener('libcurl_load', () => ok(true), { once: true })))).toBe(true);
  expect(errors).toEqual([]);
});

// SPEED 3.5, fail closed: the libcurl session is created only after the gated version.json answered 200.
test('boot: no session until version.json answers 200', async ({ page }) => {
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route('**/version.json*', async (r) => { await held; await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 'x', sha: 'dev', features: { ownRelay: true } }) }); });
  await page.goto('/index.html');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => ({ access: window.LB_access, curl: window.LB_net.curl }))).toEqual({ access: 'pending', curl: null });
  release();
  await expect.poll(() => page.evaluate(() => !!window.LB_net.curl), { timeout: 30000 }).toBe(true);
  expect(await page.evaluate(() => window.LB_access)).toBe('ok');
});

for (const mode of ['network error', 'server 503']) {
  test(`boot: ${mode} shows "Cannot reach Limitless" and starts no session`, async ({ page }) => {
    await page.route('**/version.json*', (r) => (mode === 'network error' ? r.abort('connectionrefused') : r.fulfill({ status: 503, body: 'down' })));
    const ws = [];
    page.on('websocket', (w) => ws.push(w.url()));
    await page.goto('/index.html');
    await expect(page.locator('#overlayText')).toHaveText(/Cannot reach Limitless/, { timeout: 30000 });
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => ({ access: window.LB_access, curl: window.LB_net.curl }))).toEqual({ access: 'offline', curl: null });
    expect(ws).toEqual([]);
  });
}
