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

// A stamped (deployed) build always has version.json behind the gate: a 404 there is a fault, not "no gate", so it fails closed.
test('boot: a stamped build treats a 404 version.json as offline', async ({ page }) => {
  await page.addInitScript(() => { window.LB_BUILD_SHA = 'abc1234'; });
  await page.route('**/version.json*', (r) => r.fulfill({ status: 404, body: 'nope' }));
  await page.goto('/index.html');
  await expect(page.locator('#overlayText')).toHaveText(/Cannot reach Limitless/, { timeout: 30000 });
  expect(await page.evaluate(() => ({ access: window.LB_access, curl: window.LB_net.curl }))).toEqual({ access: 'offline', curl: null });
});

// Rollback (REVIEW 2 item 7): deploy.sh puts scripts/sw-rollback-stub.js at /sw.js when the rolled-back commit has no worker.
// An installed 0.3.0 worker must pick it up, clear its caches and unregister itself.
test('rollback stub: an installed worker is replaced by the stub, which removes its caches and itself', async ({ page, baseURL }) => {
  const stub = fs.readFileSync(path.join(ROOT, 'scripts/sw-rollback-stub.js'), 'utf8');
  expect(stub).not.toMatch(/addEventListener\(\s*['"]fetch['"]/);
  expect(fs.readFileSync(path.join(ROOT, 'deploy.sh'), 'utf8')).toContain('inject-sw-stub.sh');
  // A page route cannot answer the worker's own script request, so this test serves the tree itself and swaps /sw.js.
  const http = require('http');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.md': 'text/markdown' };
  let rolledBack = false;
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/sw.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' }); return res.end(rolledBack ? stub : fs.readFileSync(path.join(ROOT, 'sw.js'))); }
    if (u === '/version.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ version: '9', sha: 'stubtest', features: { sw: true } })); }
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    await page.addInitScript(() => { window.LB_BUILD_SHA = 'stubtest'; window.LB_SW_DELAY = 0; });
    await page.goto(base + '/index.html');
    await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
    const regs = () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    await expect.poll(regs).toBe(1);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('lb-shell-')).length)).toBeGreaterThan(0);
    rolledBack = true;
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    await expect.poll(regs, { timeout: 20000 }).toBe(0);
    expect(await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('lb-shell-')))).toEqual([]);
  } finally { srv.close(); }
});
