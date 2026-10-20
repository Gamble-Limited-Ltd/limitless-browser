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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
