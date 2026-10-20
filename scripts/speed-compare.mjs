#!/usr/bin/env node
// Compare two speed harness outputs (tests/stack/speed.spec.js).
//   node scripts/speed-compare.mjs <baseline.json> <candidate.json> [--threshold 10] [--floor 100]
// A site/phase regresses when its candidate median "load" is more than --threshold percent slower than the baseline
// AND more than --floor ms slower (so tiny pages do not fail on noise). Any regression exits 1 (a failed gate).
// A site/phase with no usable median in either file is reported as "n/a" and does not fail the gate.
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = Number(args[i + 1]); args.splice(i, 2); return v; };
const threshold = opt('--threshold', 10);
const floor = opt('--floor', 100);
const [aPath, bPath] = args;
if (!aPath || !bPath) { console.error('usage: speed-compare.mjs <baseline.json> <candidate.json> [--threshold 10] [--floor 100]'); process.exit(2); }
const A = JSON.parse(fs.readFileSync(aPath, 'utf8'));
const B = JSON.parse(fs.readFileSync(bPath, 'utf8'));

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log(`baseline ${A.sha} (${A.date})  candidate ${B.sha} (${B.date})  gate: >${threshold}% and >${floor} ms slower`);
console.log(`${pad('site', 14)}${pad('phase', 6)}${lpad('base ms', 9)}${lpad('cand ms', 9)}${lpad('change', 9)}  verdict`);
let failed = 0;
for (const name of Object.keys(A.sites)) {
  for (const phase of ['cold', 'warm']) {
    const a = A.sites[name]?.[phase]?.load?.median;
    const b = B.sites[name]?.[phase]?.load?.median;
    let verdict = 'n/a';
    let change = '';
    if (typeof a === 'number' && typeof b === 'number') {
      const pct = ((b - a) / a) * 100;
      change = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
      if (pct > threshold && b - a > floor) { verdict = 'REGRESSION'; failed++; } else verdict = pct < -threshold ? 'faster' : 'ok';
    }
    console.log(`${pad(name, 14)}${pad(phase, 6)}${lpad(a ?? '-', 9)}${lpad(b ?? '-', 9)}${lpad(change, 9)}  ${verdict}`);
  }
}
console.log(failed ? `\n${failed} regression(s): gate FAILED` : '\nno regressions: gate passed');
process.exit(failed ? 1 : 0);
