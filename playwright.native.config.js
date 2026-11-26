// @ts-check
// MS-1 native column: no stack, no proxy. Run with `npm run test:native` (see tests/stack/native.spec.js).
const { defineConfig, devices } = require('@playwright/test');
const { cbProjects } = require('./tests/lib/profile');

module.exports = defineConfig({
  testDir: 'tests/stack',
  testMatch: /native\.spec\.js/,
  timeout: 60 * 60 * 1000,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results-stack',
  projects: [{ name: 'chromebook', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, lbProfile: 'chromebook' } }, ...cbProjects(devices)],
});
