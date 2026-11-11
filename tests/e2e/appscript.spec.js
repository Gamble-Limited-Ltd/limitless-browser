const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// S3 4: the 1 MB application script lives in app/main.js; index.html only points at it.
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'app', 'main.js'), 'utf8');

test('index.html references app/main.js and no longer carries the application script', async () => {
  expect(html).toContain('<script src="app/main.js"></script>');
  expect(html.length).toBeLessThan(700 * 1024);
  expect(main.length).toBeGreaterThan(1000 * 1024);
  expect(main).toContain('@LB_BUILD_SHA@');   // build-static.sh stamps the sha here
  expect(html).not.toContain('@LB_BUILD_SHA@');
});

test('credits and licence strings stay intact: libcurl LGPL notice in index.html, AGPL and credit header in app/main.js', async () => {
  expect(html).toContain('const copyright_notice = `libcurl.js is licensed under the GNU LGPL v3.');
  expect(html).toContain('Limitless Browser is free software under the GNU AGPLv3.');
  expect(main.slice(0, 600)).toContain('GNU AGPLv3');
  expect(main.slice(0, 600)).toContain('Nautilus Labs');
});

test('the patcher puts the application script back inline, so its patches see the same text as before', async ({ page }) => {
  await page.goto('/patcher.html');
  await page.waitForFunction(() => window.sourceLoaded === true || (typeof sourceLoaded !== 'undefined' && sourceLoaded), null, { timeout: 30000 });
  const r = await page.evaluate(() => ({
    noSrcTag: !sourceHTML.includes('src="app/main.js"'),
    hasMain: sourceHTML.includes('Private state variables') && sourceHTML.includes('@LB_BUILD_SHA@'),
    hasCopyright: sourceHTML.includes('const copyright_notice'),
    len: sourceHTML.length,
  }));
  expect(r.noSrcTag).toBe(true);
  expect(r.hasMain).toBe(true);
  expect(r.hasCopyright).toBe(true);
  expect(r.len).toBeGreaterThan(1600 * 1024);
});

test('the app boots from the external script (no page errors, start page ready)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/index.html');
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => typeof window.LB_go + typeof window.LB_features)).toBe('functionobject');
  expect(errors).toEqual([]);
});
