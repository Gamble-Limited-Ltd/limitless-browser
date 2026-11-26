#!/usr/bin/env node
// Join test-results/sites-<sha>/*.json (one file per site, written by tests/stack/sites.spec.js) into test-results/sites-<sha>.json
// and print the success rate, the median shown/load of the sites that loaded and the failures by category.
// Usage: node scripts/sites-merge.mjs [sha]   (default: the newest sites-* directory)
import fs from 'fs';
import path from 'path';
import { challengeSummary } from './lib/challenge.mjs';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'test-results');
let sha = process.argv[2];
if (!sha) {
  const dirs = fs.readdirSync(root).filter((d) => d.startsWith('sites-') && fs.statSync(path.join(root, d)).isDirectory());
  dirs.sort((a, b) => fs.statSync(path.join(root, b)).mtimeMs - fs.statSync(path.join(root, a)).mtimeMs);
  if (!dirs.length) { console.error('no sites-* results'); process.exit(1); }
  sha = dirs[0].slice(6);
}
const dir = path.join(root, `sites-${sha}`);
const sites = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const { name, ...rest } = j;
  sites[name] = rest;
}
const med = (a) => { const v = a.filter((x) => typeof x === 'number').sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };
const all = Object.values(sites);
const reps = all.reduce((a, s) => a + s.reps, 0);
const loaded = all.reduce((a, s) => a + s.loadedCount, 0);
const cats = {};
for (const [n, s] of Object.entries(sites)) for (const [c, k] of Object.entries(s.failures)) (cats[c] = cats[c] || []).push(`${n} x${k}`);
const summary = {
  sha, sites: all.length, reps, loaded, successRate: +(loaded / reps).toFixed(3),
  allRepsLoaded: all.filter((s) => s.loadedCount === s.reps).length,
  shownMedianOfMedians: med(all.map((s) => s.shownMedian)), loadMedianOfMedians: med(all.map((s) => s.loadMedian)), failures: cats,
  challenges: challengeSummary(sites, all[0]?.vantage || 'rehearsal-home'),
};
fs.writeFileSync(path.join(root, `sites-${sha}.json`), JSON.stringify({ summary, sites }, null, 2));
console.log(JSON.stringify(summary, null, 2));
