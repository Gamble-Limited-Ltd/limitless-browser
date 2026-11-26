// @ts-check
// Device/network profiles shared by the e2e and stack Playwright configs (docs/1.0/TESTING.md section 2).
// The `chromebook` project sets `use.lbProfile = 'chromebook'`; call applyProfile(page, testInfo) before navigating.
// CPU: Emulation.setCPUThrottlingRate; network: Network.emulateNetworkConditions (bytes/s, ms). Chromium only.
// cb-low / cb-mid / cb-high (docs/1.3/PROFILES.md): real school-Chromebook classes. cpuRate comes from scripts/calibrate-cpu.mjs
// (never below 1 on this VM); ciOnly profiles are skipped by the gate here (LB_PROFILES_FORCE=1 forces them); deviceMemory and
// hardwareConcurrency are overridden with an init script, real memory caps are not emulated.
const net = (down, up) => ({ offline: false, latency: 20, downloadThroughput: (down * 1e6) / 8, uploadThroughput: (up * 1e6) / 8 });
const PROFILES = {
  'cb-low': { viewport: { width: 1366, height: 768 }, cpuRate: 1, net: net(100, 15), deviceMemory: 4, hardwareConcurrency: 4 },
  'cb-mid': { viewport: { width: 1920, height: 1080 }, cpuRate: 1, net: net(200, 30), deviceMemory: 8, hardwareConcurrency: 4 },
  'cb-high': { viewport: { width: 1920, height: 1080 }, cpuRate: 1, net: net(200, 30), deviceMemory: 8, hardwareConcurrency: 8, ciOnly: true },
  chromebook: {
    viewport: { width: 1366, height: 768 },
    cpuRate: 4,
    // 10 Mbit/s down, 5 Mbit/s up, 40 ms RTT
    net: { offline: false, latency: 40, downloadThroughput: (10 * 1e6) / 8, uploadThroughput: (5 * 1e6) / 8 },
  },
};

/** Returns the CDP session, or null when the project has no profile. */
async function applyProfile(page, testInfo) {
  const name = testInfo.project.use.lbProfile;
  if (!name) return null;
  const p = PROFILES[name];
  if (!p) throw new Error(`unknown lbProfile ${name}`);
  if (p.deviceMemory) await page.addInitScript(({ dm, hc }) => {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => dm });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => hc });
  }, { dm: p.deviceMemory, hc: p.hardwareConcurrency });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', p.net);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpuRate });
  return cdp;
}

/** Playwright projects for the three realistic profiles: same shape as the `chromebook` project of each config. */
const cbProjects = (devices, extra = {}) => ['cb-low', 'cb-mid', 'cb-high'].map((name) => ({
  name, ...extra, use: { ...devices['Desktop Chrome'], viewport: PROFILES[name].viewport, deviceScaleFactor: 1, lbProfile: name },
}));

module.exports = { PROFILES, applyProfile, cbProjects };
