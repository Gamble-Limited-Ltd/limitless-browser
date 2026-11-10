// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// LB_E2E_PORT lets two checkouts run `npm test` at the same time (default 8599).
const PORT = process.env.LB_E2E_PORT || '8599';

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  projects: [
    { name: 'chromium', testIgnore: /chromebook\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    // Chromebook profile (docs/1.0/TESTING.md section 2): 1366x768, 4x CPU, 10/5 Mbit/s, 40 ms RTT, applied by
    // tests/lib/profile.js. Only chromebook.spec.js runs here; the speed harness runs both projects.
    {
      name: 'chromebook',
      testMatch: /chromebook\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, lbProfile: 'chromebook' },
    },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
