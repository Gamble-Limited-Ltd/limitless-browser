// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8599',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'python3 -m http.server 8599 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8599/index.html',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
