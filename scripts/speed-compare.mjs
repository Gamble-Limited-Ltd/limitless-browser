#!/usr/bin/env node
// Compare two speed harness outputs (tests/stack/speed.spec.js), medians only (7 reps on fixtures).
//   node scripts/speed-compare.mjs <baseline.json> <candidate.json> [--threshold 10] [--floor 100]
// Gate (docs/1.0/TESTING.md section 6): a fixture site/phase/metric regresses when its candidate median is more than
// --threshold percent AND more than --floor ms slower than the baseline, for any of firstBytes, dom, shown, load, and
// for boot splash/interactive. Sites without `fixture: true` (public sites) and the byte/long-task rows are reported
// only and never fail. Any gated regression exits 1. A row with no usable median on either side is "n/a".
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = Number(args[i + 1]); args.splice(i, 2); return v; };
const threshold = opt('--threshold', 10);
const floor = opt('--floor', 100);
const [aPath, bPath] = args;
if (!aPath || !bPath) { console.error('usage: speed-compare.mjs <baseline.json> <candidate.json> [--threshold 10] [--floor 100]'); process.exit(2); }
const A = JSON.parse(fs.readFileSync(aPath, 'utf8'));
const B = JSON.parse(fs.readFileSync(bPath, 'utf8'));

const TIME = ['firstBytes', 'dom', 'shown', 'load'];
const REPORT = ['rxBytes', 'longTaskCount', 'longTaskMs'];
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
let failed = 0;

function row(label, a, b, gated, unit = 'ms') {
  let verdict = 'n/a';
  let change = '';
  if (typeof a === 'number' && typeof b === 'number') {
    const pct = a === 0 ? (b === 0 ? 0 : 100) : ((b - a) / a) * 100;
    change = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    if (gated && unit === 'ms' && pct > threshold && b - a > floor) { verdict = 'REGRESSION'; failed++; }
    else verdict = pct < -threshold ? 'faster' : pct > threshold ? (gated ? 'ok' : 'slower (report only)') : 'ok';
  }
  console.log(`${pad(label, 34)}${lpad(a ?? '-', 10)}${lpad(b ?? '-', 10)}${lpad(change, 9)}  ${verdict}`);
}

console.log(`baseline ${A.sha}${A.project ? ' [' + A.project + ']' : ''} (${A.date})  candidate ${B.sha}${B.project ? ' [' + B.project + ']' : ''} (${B.date})`);
console.log(`gate: fixture pages and boot, >${threshold}% and >${floor} ms slower; public sites and bytes are reported only`);
console.log(`${pad('row', 34)}${lpad('base', 10)}${lpad('cand', 10)}${lpad('change', 9)}  verdict`);

for (const phase of ['cold', 'repeat']) {
  for (const m of ['splash', 'interactive']) row(`boot ${phase} ${m}`, A.boot?.[phase]?.[m]?.median, B.boot?.[phase]?.[m]?.median, true);
}
for (const name of Object.keys(A.sites)) {
  const gated = !!(B.sites[name]?.fixture ?? A.sites[name]?.fixture);
  for (const phase of ['cold', 'warm']) {
    for (const m of TIME) row(`${name} ${phase} ${m}${gated ? '' : ' *'}`, A.sites[name]?.[phase]?.[m]?.median, B.sites[name]?.[phase]?.[m]?.median, gated);
    for (const m of REPORT) {
      const a = A.sites[name]?.[phase]?.[m]?.median, b = B.sites[name]?.[phase]?.[m]?.median;
      if (a != null || b != null) row(`${name} ${phase} ${m}`, a, b, false, m);
    }
  }
  for (const m of ['domParserMs', 'rewriteMs']) {
    const a = A.sites[name]?.micro?.[m], b = B.sites[name]?.micro?.[m];
    if (a != null || b != null) row(`${name} ${m}`, a, b, false);
  }
}
console.log(failed ? `\n${failed} regression(s): gate FAILED` : '\nno regressions: gate passed');
console.log('(* = public site, reported not gated)');
process.exit(failed ? 1 : 0);
