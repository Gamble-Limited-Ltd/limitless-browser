// @ts-check
// Visual and layout suite (docs/1.0/TESTING.md section 3): `npm run test:visual`. Not part of `npm test`.
const { defineConfig, devices } = require('@playwright/test');
const PORT = process.env.LB_E2E_PORT || '8598';
module.exports = defineConfig({
  testDir: 'tests/visual',
  timeout: 120000,
  fullyParallel: true,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/__screens__/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  use: { baseURL: `http://127.0.0.1:${PORT}`, reducedMotion: 'reduce' },
  projects: [{ name: 'visual', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: `python3 -m http.server ${PORT} --bind 127.0.0.1`, url: `http://127.0.0.1:${PORT}/index.html`, reuseExistingServer: false, timeout: 30000 },
});
