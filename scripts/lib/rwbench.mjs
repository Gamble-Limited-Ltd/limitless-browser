// TS-10: rewriter micro-bench helpers. Until SV-4 G4-1 makes app/rewriter.js a module, the rewriter is extracted from app/main.js.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Pull `function rewriteLocationRefs(src, imp) {...}` out of app/main.js (the body ends at the first line closing at the same indent)
// and bind it to the vendored acorn + acorn-walk, exactly as the app and its Worker do.
export function loadRewriter(root) {
  const lines = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8').split('\n');
  const i = lines.findIndex((l) => /^\s*function rewriteLocationRefs\(src, imp\) \{/.test(l));
  if (i < 0) throw new Error('rewriteLocationRefs not found in app/main.js');
  const indent = lines[i].match(/^\s*/)[0];
  const j = lines.findIndex((l, k) => k > i && l === `${indent}}`);
  const code = lines.slice(i, j + 1).join('\n');
  const acornSrc = fs.readFileSync(path.join(root, 'vendor/acorn/8.14.0/acorn.min.js'), 'utf8');
  const g = {}; new Function('self', 'window', 'globalThis', 'module', 'exports', acornSrc).call(g, g, g, g, undefined, undefined);
  const acorn = g.acorn || g.window?.acorn;
  if (!acorn?.walk) throw new Error('vendored acorn did not expose acorn.walk');
  return new Function('acorn', `${code}\nreturn rewriteLocationRefs;`)(acorn);
}

export const median = (a) => { const v = [...a].sort((x, y) => x - y), m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// base/cur: { bundleName: medianMs }. A bundle fails when it is more than pct percent slower than the base.
export function compare(base, cur, pct = 10) {
  const fail = [], added = [];
  for (const [n, ms] of Object.entries(cur)) { if (!(n in base)) added.push(n); else if (ms > base[n] * (1 + pct / 100)) fail.push(n); }
  return { fail, added };
}
