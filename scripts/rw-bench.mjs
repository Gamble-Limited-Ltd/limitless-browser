#!/usr/bin/env node
// TS-10: rewriter micro-bench. node scripts/rw-bench.mjs [--base <dir>] [--save-base]
// Runs the rewriter on every *.js in $LB_RW_BUNDLES (default ~/.cache/limitless-fixtures/bundles/), 5 reps, median ms per bundle, and
// compares with ~/.cache/limitless-fixtures/rw-bench-base.json: more than 10 percent slower on any bundle exits 1.
// --base <dir> (the gate passes its base worktree): base and candidate rewriters are timed interleaved in this one run (7 reps, A,B then B,A,
// median per side), so machine load cannot fail it; more than 10 percent slower than base on any bundle exits 1, a byte-identical rewriter
// is not compared. Without --base the saved file is the fallback (load-sensitive).
// Bundles are third-party scripts (never committed). No bundles: prints SKIPPED and exits 0. --save-base writes the base file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRewriter, median, compare, sameRewriter, abMedians } from './lib/rwbench.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = path.join(os.homedir(), '.cache/limitless-fixtures');
const DIR = process.env.LB_RW_BUNDLES || path.join(FX, 'bundles');
const BASE = process.env.LB_RW_BASE || path.join(FX, 'rw-bench-base.json');
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).sort() : [];
if (!files.length) { console.log(`rw-bench: SKIPPED, no bundles in ${DIR}`); process.exit(0); }

const rw = loadRewriter(ROOT);
const bi = process.argv.indexOf('--base');
if (bi > 0) {
  const baseDir = path.resolve(process.argv[bi + 1] || '');
  if (sameRewriter(baseDir, ROOT)) { console.log('rw-bench: same rewriter, skipped compare'); process.exit(0); }
  const rwBase = loadRewriter(baseDir), b = {}, c = {};
  for (const f of files) {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8'), m = abMedians(rwBase, rw, src);
    b[f] = m.a; c[f] = m.b;
    console.log(`rw-bench: ${f.padEnd(32)} ${String(Math.round(src.length / 1024)).padStart(6)} KB  base ${m.a.toFixed(1)} ms  cand ${m.b.toFixed(1)} ms`);
  }
  const { fail } = compare(b, c);
  if (fail.length) { console.log(`rw-bench: FAIL, more than 10 percent slower than base: ${fail.join(', ')}`); process.exit(1); }
  console.log('rw-bench: pass');
  process.exit(0);
}
const srcs = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(DIR, f), 'utf8')]));
const measure = (f) => { rw(srcs[f]); const t = []; for (let i = 0; i < 5; i++) { const s = performance.now(); rw(srcs[f], true); t.push(performance.now() - s); } return Math.round(median(t) * 10) / 10; };
const cur = {};
for (const f of files) { cur[f] = measure(f); console.log(`rw-bench: ${f.padEnd(32)} ${String(Math.round(srcs[f].length / 1024)).padStart(6)} KB  ${cur[f]} ms`); }
if (process.argv.includes('--save-base')) { fs.mkdirSync(path.dirname(BASE), { recursive: true }); fs.writeFileSync(BASE, JSON.stringify(cur, null, 1)); console.log(`rw-bench: base saved to ${BASE}`); process.exit(0); }
if (!fs.existsSync(BASE)) { console.log(`rw-bench: SKIPPED compare, no base file (${BASE}); run with --save-base on a good build`); process.exit(0); }
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
let { fail, added } = compare(base, cur);
// A one-off slow pass (another job on the machine) must not fail the gate: measure the failing bundles once more; both passes must be slow.
if (fail.length) { for (const f of fail) { const again = measure(f); console.log(`rw-bench: retry ${f} ${again} ms (base ${base[f]})`); cur[f] = Math.min(cur[f], again); } ({ fail } = compare(base, cur)); }
if (added.length) console.log(`rw-bench: new bundles, no base yet: ${added.join(', ')}`);
if (fail.length) { console.log(`rw-bench: FAIL, more than 10 percent slower: ${fail.join(', ')}`); process.exit(1); }
console.log('rw-bench: pass');
