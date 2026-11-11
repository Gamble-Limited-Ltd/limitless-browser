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
  expect(html.length).toBeLessThan(1.6e6);
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
