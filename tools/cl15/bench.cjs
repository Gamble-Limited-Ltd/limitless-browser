'use strict';
// CL-15 bench: node tools/cl15/bench.cjs [--reps N] [--fuzz N] [--max-mb N] [dir-or-file ...]   (no args: default corpus; golden: ~/.cache/limitless-fixtures/bundles)
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { tokRewrite } = require('../../app/tokrw.js');
const root = path.resolve(__dirname, '../..');
const ctx = {}; ctx.window = ctx; ctx.self = ctx;
vm.runInNewContext(fs.readFileSync(path.join(root, 'vendor/acorn/8.14.0/acorn.min.js'), 'utf8'), ctx);
const acorn = ctx.acorn;
// the current rewriter, cut verbatim out of app/main.js
const m = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
const a = m.indexOf('function rewriteLocationRefs(src, imp) {'), b = m.indexOf('// ── Worker rewriter (0.2.0)');
const mk = (mer) => new Function('acorn', 'meriyah', m.slice(a, b) + '\nreturn rewriteLocationRefs;')(acorn, mer);
const astRw = mk(undefined);   // acorn only (the main-thread path)
const mpath = path.join(root, 'vendor/meriyah/7.4.2/meriyah.umd.min.js');
const mctx = {}; mctx.window = mctx; mctx.self = mctx;
let astRwM = null; try { vm.runInNewContext(fs.readFileSync(mpath, 'utf8'), mctx); astRwM = mk(mctx.meriyah); } catch (e) { console.log('no meriyah baseline:', e.message); }

const args = process.argv.slice(2); let reps = 5, fuzz = 0, maxMb = 9; const paths = [];
for (let i = 0; i < args.length; i++) { if (args[i] === '--reps') reps = +args[++i]; else if (args[i] === '--fuzz') fuzz = +args[++i]; else if (args[i] === '--max-mb') maxMb = +args[++i]; else paths.push(args[i]); }
const home = process.env.HOME;
if (!paths.length) paths.push(path.join(root, 'app'), path.join(root, 'vendor'), path.join(root, 'sw.js'), path.join(root, 'tests'),
  home + '/.nodeterm-server-app/out/renderer/assets', home + '/gll-id/node_modules/axe-core/axe.js', home + '/gll-id-e2e-mail/node_modules/react-dom/cjs',
  home + '/gll-id-e2e-mail/node_modules/elkjs/lib', home + '/Browser/node_modules/playwright-core/lib/vite');
const files = [];
(function walk(p) { let st; try { st = fs.statSync(p); } catch { return; } if (st.isDirectory()) { for (const f of fs.readdirSync(p)) walk(path.join(p, f)); } else if (/\.(c|m)?js$/.test(p) && st.size >= 16384 && st.size < maxMb * 1e6) files.push(p); })
  ;
for (const p of paths) (function walk(p) { let st; try { st = fs.statSync(p); } catch { return; } if (st.isDirectory()) { for (const f of fs.readdirSync(p)) walk(path.join(p, f)); } else if (/\.(c|m)?js$/.test(p) && st.size >= 16384 && st.size < maxMb * 1e6) files.push(p); })(p);
const seen = new Set(), corpus = [];
for (const f of files) { const s = fs.readFileSync(f, 'utf8'); const h = crypto.createHash('sha1').update(s).digest('hex'); if (seen.has(h)) continue; seen.add(h); corpus.push({ f, s }); }
const med = xs => xs.slice().sort((x, y) => x - y)[xs.length >> 1];
const time = fn => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; };
let withEdits = 0, eq = 0, bail = 0, diff = 0, diffM = 0, parseFail = 0; const rows = [], why = {};
for (const imp of [false, true]) for (const { f, s } of corpus) {
  const st = {}; let ref, out;
  ref = astRw(s, imp); out = tokRewrite(s, imp, st);
  const name = path.relative(home, f) + (imp ? ' [imp]' : '');
  if (out === null) { bail++; if (st.why.tokerr) console.log('TOKERR', name); for (const k in st.why) why[k] = (why[k] || 0) + st.why[k]; }
  else if (out === ref) { eq++; if (ref !== s) withEdits++; if (astRwM && astRwM(s, imp) !== out) { diffM++; console.log('DIFF-MERIYAH', name); } }
  else { diff++; console.log('DIFF', name); }
  if (imp) continue;
  const ta = [], tt = [], tm = [];
  for (let r = 0; r < reps; r++) { ta.push(time(() => astRw(s, false))); if (astRwM) tm.push(time(() => astRwM(s, false))); tt.push(time(() => tokRewrite(s, false, {}))); }
  rows.push({ name, kb: s.length / 1024 | 0, ast: med(ta), mer: tm.length ? med(tm) : NaN, tok: med(tt), bailed: out === null, edits: ref !== s });
}
console.log(`corpus ${corpus.length} files (x2 with imp on/off): equal ${eq} (${withEdits} of them with edits), scanner bailed ${bail}, DIFFERENT ${diff}, different from the meriyah path ${diffM}`);
console.log('bail reasons', JSON.stringify(why));
rows.sort((x, y) => y.kb - x.kb);
console.log('name | KB | acorn ms | meriyah ms | scan ms | vs acorn | vs meriyah | bailed');
for (const r of rows.slice(0, 12)) console.log(`${r.name} | ${r.kb} | ${r.ast.toFixed(1)} | ${r.mer.toFixed(1)} | ${r.tok.toFixed(1)} | ${(r.ast / r.tok).toFixed(1)}x | ${(r.mer / r.tok).toFixed(1)}x | ${r.bailed}`);
const ok = rows.filter(r => !r.bailed), A = ok.reduce((s, r) => s + r.ast, 0), T = ok.reduce((s, r) => s + r.tok, 0);
console.log(`non-bailed files ${ok.length}/${rows.length}: total AST ${A.toFixed(0)} ms, scanner ${T.toFixed(0)} ms, ${(A / T).toFixed(1)}x; median per-file speedup ${med(ok.map(r => r.ast / r.tok)).toFixed(1)}x`);
const big = rows.slice(0, 5), eff = r => r.bailed ? r.tok + r.ast : r.tok;
console.log(`5 biggest: median speedup ${med(big.map(r => r.ast / r.tok)).toFixed(1)}x scanner-only, ${med(big.map(r => r.ast / eff(r))).toFixed(1)}x effective (bail = scan + AST); bailed among them: ${big.filter(r => r.bailed).length}`);
console.log(`5 biggest vs meriyah baseline: median ${med(big.map(r => r.mer / eff(r))).toFixed(1)}x; whole corpus meriyah ${rows.reduce((q, r) => q + r.mer, 0).toFixed(0)} ms`);
const EA = rows.reduce((s, r) => s + r.ast, 0), ET = rows.reduce((s, r) => s + eff(r), 0);
console.log(`whole corpus effective: AST ${EA.toFixed(0)} ms vs token-with-fallback ${ET.toFixed(0)} ms = ${(EA / ET).toFixed(1)}x`);
if (fuzz) require('./fuzz.cjs')(astRw, tokRewrite, fuzz, acorn, astRwM);
