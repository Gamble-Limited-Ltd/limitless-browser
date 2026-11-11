#!/usr/bin/env node
// Markdown tables for docs/1.0/BASELINE.md from merged real-site results (scripts/sites-merge.mjs output).
// Usage: node scripts/sites-table.mjs label=path/to/sites-<sha>.json [label=path ...]
import fs from 'fs';

const runs = process.argv.slice(2).map((a) => { const i = a.indexOf('='); return { label: a.slice(0, i), data: JSON.parse(fs.readFileSync(a.slice(i + 1), 'utf8')) }; });
const med = (a) => { const v = a.filter((x) => typeof x === 'number').sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };
const names = [...new Set(runs.flatMap((r) => Object.keys(r.data.sites)))].sort();

console.log('| Build | Sites | Reps | Loaded | Success rate | Median shown (ms) | Median load (ms) |');
console.log('|---|---|---|---|---|---|---|');
for (const r of runs) {
  const s = Object.values(r.data.sites);
  const reps = s.reduce((a, x) => a + x.reps, 0), ok = s.reduce((a, x) => a + x.loadedCount, 0);
  const shown = med(s.flatMap((x) => x.runs.filter((y) => y.loaded).map((y) => y.shown)));
  const load = med(s.flatMap((x) => x.runs.filter((y) => y.loaded).map((y) => y.load)));
  console.log(`| ${r.label} | ${s.length} | ${reps} | ${ok} | ${(100 * ok / reps).toFixed(0)} % | ${shown} | ${load} |`);
}
console.log('');
console.log('Failures by category (reps that did not load; site x reps):');
console.log('');
const cats = ['dns', 'connect', 'tls', 'http', 'blocked', 'csp', 'script', 'render', 'timeout', 'hang', 'harness', 'error-other'];
console.log('| Category | ' + runs.map((r) => r.label).join(' | ') + ' |');
console.log('|---|' + runs.map(() => '---|').join(''));
for (const c of cats) {
  const cells = runs.map((r) => Object.entries(r.data.sites).filter(([, x]) => x.failures[c]).map(([n, x]) => `${n} x${x.failures[c]}`).join(', ') || '-');
  if (cells.some((x) => x !== '-')) console.log(`| ${c} | ${cells.join(' | ')} |`);
}
console.log('');
console.log('Per site (loaded reps / reps, median shown ms):');
console.log('');
console.log('| Site | Group | ' + runs.map((r) => r.label).join(' | ') + ' |');
console.log('|---|---|' + runs.map(() => '---|').join(''));
for (const n of names) {
  const g = (runs.find((r) => r.data.sites[n]) || {}).data?.sites[n]?.cat || '';
  console.log(`| ${n} | ${g} | ` + runs.map((r) => { const x = r.data.sites[n]; return x ? `${x.loadedCount}/${x.reps}${x.shownMedian != null ? ' (' + x.shownMedian + ')' : ''}` : '-'; }).join(' | ') + ' |');
}
