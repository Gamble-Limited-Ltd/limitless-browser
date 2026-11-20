// @ts-check
// MS-4 real-VPS lane: prod, no rehearsal stack. Run with `npm run test:vps` (see tests/stack/vps.spec.js).
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/stack',
  testMatch: /vps\.spec\.js/,
  timeout: 6 * 60 * 60 * 1000,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results-stack',
  projects: [{ name: 'chromebook', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, lbProfile: 'chromebook' } }],
});
