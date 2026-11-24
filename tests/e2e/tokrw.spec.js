const { test, expect } = require('@playwright/test');
const { boot, LEGACY_FEATURES } = require('./helpers');

// CL-15 (features.tokRewrite, default off): the token rewriter runs before the AST rewriter and must not change a single output byte.
// Small scripts take the sync path, padded ones the Worker; `shadow` makes the scanner bail, so the AST path answers and tokFallback counts it.
const PAD = '/*' + 'x'.repeat(20000) + '*/\n';
const CASES = {
  member: 'var a = location.href; var b = top.location.hash;',
  assign: 'location.href = "/x"; window.location = "/y";',
  optional: 'var a = window.location?.search; var b = self?.location?.hash;',
  dyn: 'import("./a.js"); var q = document.location;',
  shadow: 'function f(location) { return location.href; } var p = top.location;',
  bad: 'var = ;; location;',   // NOTE: no trailing bare `location` at EOF: tokrw.js loops forever there (reported to the lead)
};

async function run(page, on) {
  const reqs = [];
  page.on('request', (r) => { if (r.url().includes('tokrw.js')) reqs.push(r.url()); });
  await boot(page, { features: { ...LEGACY_FEATURES, tokRewrite: on, rewriteCache: false } });
  const out = await page.evaluate(async ([cases, pad]) => {
    const res = {};
    for (const k of Object.keys(cases)) {
      LB_rewrite.dropMemo();
      res[k] = { sync: await LB_rewrite.async(cases[k]), worker: await LB_rewrite.async(cases[k] + '\n' + pad) };
    }
    return { res, stats: LB_rewrite.stats() };
  }, [CASES, PAD]);
  return { ...out, reqs };
}

test('tokRewrite on and off give identical rewrites; scanner use and fallbacks are counted', async ({ browser }) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  const on = await run(a, true);
  const off = await run(b, false);
  expect(on.res).toEqual(off.res);
  expect(on.res.member.sync).toContain('__lbLoc');
  expect(on.res.assign.worker).toContain('__lbLoc');
  expect(on.res.dyn.sync).toContain('__lbImport(');
  expect(on.stats.tok).toBeGreaterThan(0);
  expect(on.stats.tokFallback).toBeGreaterThan(0);
  expect(on.reqs.length).toBeGreaterThan(0);
  expect(off.stats.tok || 0).toBe(0);
  expect(off.stats.tokFallback || 0).toBe(0);
  expect(off.reqs).toEqual([]);
  await a.close(); await b.close();
});
