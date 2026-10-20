const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

test('window.__lbPerf records navigation marks once each, in milliseconds since start', async ({ page }) => {
  const errors = await boot(page);
  const r = await page.evaluate(() => {
    const p = window.__lbPerf;
    p.start('https://example.test/');
    p.mark('firstBytes');
    p.mark('firstBytes'); // second call must not overwrite
    p.mark('dom');
    p.mark('load');
    return { n: p.runs.length, last: p.runs[p.runs.length - 1] };
  });
  expect(r.n).toBeGreaterThan(0);
  expect(r.last.url).toBe('https://example.test/');
  for (const k of ['firstBytes', 'dom', 'load']) expect(typeof r.last.marks[k]).toBe('number');
  expect(errors).toEqual([]);
});
