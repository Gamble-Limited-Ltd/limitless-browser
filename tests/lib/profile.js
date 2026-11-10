// @ts-check
// Device/network profiles shared by the e2e and stack Playwright configs (docs/1.0/TESTING.md section 2).
// The `chromebook` project sets `use.lbProfile = 'chromebook'`; call applyProfile(page, testInfo) before navigating.
// CPU: Emulation.setCPUThrottlingRate; network: Network.emulateNetworkConditions (bytes/s, ms). Chromium only.
const PROFILES = {
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
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', p.net);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpuRate });
  return cdp;
}

module.exports = { PROFILES, applyProfile };
