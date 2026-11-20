#!/usr/bin/env node
// MS-1: node scripts/x-native.mjs <limitless.json> <native.json> [out.md]
// Limitless file: a vps-<tier>-<date>.json (MS-4) or any run with the same `sites` shape. Prints the table, writes it when out.md is given.
import fs from 'node:fs';
import { ratios, table } from './lib/xnative.mjs';
const [l, n, out] = process.argv.slice(2);
if (!l || !n) { console.error('usage: x-native.mjs <limitless.json> <native.json> [out.md]'); process.exit(2); }
const j = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const lj = j(l), nj = j(n);
const t = `${table(ratios(lj, nj))}\n\nNative: ${nj.date} (${nj.profile}, n=${nj.reps}). Limitless: ${lj.tier || ''} ${lj.date} (${lj.profile}, n=${lj.reps}). Medians.\n`;
console.log(t);
if (out) fs.writeFileSync(out, t);
