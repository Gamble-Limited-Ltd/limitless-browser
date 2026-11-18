const { test, expect } = require('@playwright/test');
const { boot, LEGACY_FEATURES } = require('./helpers');

// 1.2 N4 (features.meriyah): the Worker rewriter parses with meriyah (parseScript, then parseModule, then acorn as the last resort).
// Scripts are padded past LB_RW_MIN (16 KB) so they take the Worker path; the switch must not change a single output byte.
const PAD = '/*' + 'x'.repeat(20000) + '*/\n';
const CASES = {
  plain: 'var a = window.location.href; var b = location; var c = x["location"];',
  module: 'import x from "y"; export const z = location.hash;',
  dyn: 'import("./a.js"); var q = document.location;',
  hashbang: '#!/usr/bin/env node\nvar a = top.location;',
  tla: 'await foo(); var a = self.location;',
  shadow: 'function f(location) { return location; } var p = top.location;',
  // meriyah rejects both ways (import is module-only, with is sloppy-only); acorn accepts it
  both: 'import x from "y"; with (o) { var q = a.location; }',
  bad: 'var = ;; location',
};

async function run(page, on) {
  const reqs = [];
  page.on('request', (r) => { if (r.url().includes('vendor/meriyah')) reqs.push(r.url()); });
  await boot(page, { features: { ...LEGACY_FEATURES, meriyah: on, rewriteCache: false } });
  const out = await page.evaluate(async ([cases, pad]) => {
    const res = {};
    for (const k of Object.keys(cases)) { LB_rewrite.dropMemo(); res[k] = await LB_rewrite.async(cases[k] + '\n' + pad); }
    return { res, stats: LB_rewrite.stats() };
  }, [CASES, PAD]);
  return { ...out, reqs };
}

test('meriyah on and off give identical rewrites; the fallback is counted', async ({ browser }) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  const on = await run(a, true);
  const off = await run(b, false);
  expect(on.res).toEqual(off.res);
  for (const k of ['plain', 'module', 'dyn', 'hashbang', 'tla', 'both']) expect(on.res[k], k).not.toBe(CASES[k] + '\n' + PAD);
  expect(on.res.plain).toContain('__lbLoc');
  expect(on.res.dyn).toContain('__lbImport(');
  expect(on.res.shadow).toBe(CASES.shadow + '\n' + PAD);   // a bound location shadows the global: untouched, same as acorn
  expect(on.res.bad).toBe(CASES.bad + '\n' + PAD);
  expect(on.stats.worker).toBe(Object.keys(CASES).length);
  expect(on.stats.meriyahFallback).toBe(1);   // `both`: only acorn parses it (`bad` is parsed by nobody, not counted)
  expect(on.reqs.length).toBeGreaterThan(0);
  expect(off.reqs).toEqual([]);
  expect(off.stats.meriyahFallback || 0).toBe(0);
  await a.close(); await b.close();
});
