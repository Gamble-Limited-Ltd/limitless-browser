// @ts-check
// Stack rehearsal: real nginx + gate + relay against a mock GATE. Run through deploy/rehearsal/run.sh
// (it starts the stack and sets REHEARSAL_BASE / REHEARSAL_MOCK). `npm test` does not touch this.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/stack',
  timeout: 120000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  outputDir: 'test-results-stack',
  use: {
    baseURL: process.env.REHEARSAL_BASE || 'http://127.0.0.1:8590',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Chromebook profile (tests/lib/profile.js): only the speed harness runs under it.
    {
      name: 'chromebook',
      testMatch: /speed\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, lbProfile: 'chromebook' },
    },
  ],
});
