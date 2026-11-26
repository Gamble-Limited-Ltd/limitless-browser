// TS-10: rewriter micro-bench helpers. Until SV-4 G4-1 makes app/rewriter.js a module, the rewriter is extracted from app/main.js.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Pull `function rewriteLocationRefs(src, imp) {...}` out of app/main.js (the body ends at the first line closing at the same indent)
// and bind it to the vendored acorn + acorn-walk, exactly as the app and its Worker do.
function parts(root) {
  const lines = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8').split('\n');
  const i = lines.findIndex((l) => /^\s*function rewriteLocationRefs\(src, imp\) \{/.test(l));
  if (i < 0) throw new Error('rewriteLocationRefs not found in app/main.js');
  const indent = lines[i].match(/^\s*/)[0];
  const j = lines.findIndex((l, k) => k > i && l === `${indent}}`);
  const code = lines.slice(i, j + 1).join('\n');
  return { code, acornSrc: fs.readFileSync(path.join(root, 'vendor/acorn/8.14.0/acorn.min.js'), 'utf8') };
}

// Two trees with byte-identical rewriter text (function + vendored acorn) cannot differ in speed: the bench skips the compare.
export const sameRewriter = (a, b) => { const x = parts(a), y = parts(b); return x.code === y.code && x.acornSrc === y.acornSrc; };

export function loadRewriter(root) {
  const { code, acornSrc } = parts(root);
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

// Interleaved A/B (same idea as the speed gate's TS-4): per bundle, A and B alternate (A,B then B,A ...) so machine load hits both
// alike. fa/fb take (src, true) like the rewriter. Returns median ms of each side.
export function abMedians(fa, fb, src, reps = 7) {
  fa(src); fb(src);
  const ta = [], tb = [], time = (f) => { const s = performance.now(); f(src, true); return performance.now() - s; };
  for (let i = 0; i < reps; i++) { if (i % 2) { tb.push(time(fb)); ta.push(time(fa)); } else { ta.push(time(fa)); tb.push(time(fb)); } }
  return { a: median(ta), b: median(tb) };
}
