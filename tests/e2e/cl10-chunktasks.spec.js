const { test, expect } = require('@playwright/test');
const { setup } = require('./s3-helpers');

// CL-10 (features.chunkTasks): keying a big script for the rewrite cache (hash + UTF-8 encode) runs in slices with a yield
// between, so the page stays responsive. Off: one sync pass, as before. Same rewritten text either way.
test('chunkTasks: on has shorter main-thread tasks than off, same output', async ({ page }) => {
  await setup(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const r = await page.evaluate(async () => {
    const mk = (tag) => { let b = ''; const s = 'var ' + tag + ' = location.href;\n' + 'a'.repeat(1000) + '\n'; while (b.length < 6e6) b += s; return b; };
    const lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => lt.push(e.duration))).observe({ type: 'longtask' });
    const run = async (on, tag) => {
      window.LB_features.chunkTasks = on; lt.length = 0;
      await new Promise((r) => setTimeout(r, 200));
      const out = await window.LB_rewrite.async(mk(tag));
      await new Promise((r) => setTimeout(r, 300));
      return { max: Math.max(0, ...lt), n: out.split('\n').length };
    };
    return { off: await run(false, 'x'), on: await run(true, 'y') };
  });
  console.log('chunkTasks', JSON.stringify(r));
  expect(r.on.n).toBe(r.off.n);
  expect(r.on.max).toBeLessThan(r.off.max);
});
