#!/usr/bin/env node
// Calibrates the cb-* CPU throttle rates for this VM (docs/1.3/PROFILES.md). Runs a fixed, offline JS workload (JSON, regex, DOM, sort,
// a small parser) in Chromium: 3 reps unthrottled, then once at 4x to check that the CDP throttle scales the score. Prints the score
// and the rates from the reference table in scripts/lib/cbrates.mjs. Writes ~/.cache/limitless-fixtures/cpu-calibration.json.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rates, REF } from './lib/cbrates.mjs';

const { chromium } = createRequire(import.meta.url)('@playwright/test');

// Deterministic; the score is milliseconds for the whole mix (lower is faster).
const WORKLOAD = () => {
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const t0 = performance.now();
  let sink = 0;
  const rows = Array.from({ length: 4000 }, (_, i) => ({ id: i, name: `item-${i}`, tags: ['a', 'b', 'c'], v: rnd(), nest: { x: rnd(), y: [rnd(), rnd()] } }));
  for (let k = 0; k < 12; k++) sink += JSON.parse(JSON.stringify(rows)).length;
  const text = Array.from({ length: 3000 }, (_, i) => `user${i}@host${i % 97}.example.com GET /path/${i}?q=${i * 7} 200 ${i % 5000}`).join('\n');
  for (let k = 0; k < 30; k++) sink += (text.match(/(\w+)@(\w+)\.example\.com\s+GET\s+\/path\/(\d+)/g) || []).length + text.replace(/\d+/g, 'N').length;
  for (let k = 0; k < 4; k++) {
    const root = document.createElement('div');
    for (let i = 0; i < 1500; i++) { const e = document.createElement('p'); e.className = 'c' + (i % 9); e.textContent = 'row ' + i; e.setAttribute('data-i', String(i)); root.appendChild(e); }
    sink += root.querySelectorAll('p.c3').length + root.innerHTML.length;
  }
  for (let k = 0; k < 6; k++) sink += Array.from({ length: 60000 }, rnd).sort((a, b) => a - b)[100] > 0 ? 1 : 0;
  const src = 'var a=1;'.repeat(1) + Array.from({ length: 2500 }, (_, i) => `function f${i}(x,y){if(x>${i}){return x*y+${i};}else{return [x,y].map(function(z){return z-${i}});}}`).join('\n');
  for (let k = 0; k < 6; k++) { const toks = src.match(/[A-Za-z_]\w*|\d+|[{}()\[\];,+*<>-]/g); const depth = toks.reduce((d, t) => d + (t === '{' ? 1 : t === '}' ? -1 : 0), 0); sink += toks.length + depth; }
  return { ms: Math.round(performance.now() - t0), sink };
};

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const browser = await chromium.launch();
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
const run = async (rate) => { await cdp.send('Emulation.setCPUThrottlingRate', { rate }); return (await page.evaluate(`(() => { let ms = 0; for (let i = 0; i < 4; i++) ms += (${WORKLOAD})().ms; return { ms }; })()`)).ms; };   // 4 passes: about 2.5 s here
await run(1);   // warm up
const base = median([await run(1), await run(1), await run(1)]);
const at4 = await run(4);
await browser.close();

const r = rates();
const out = { date: new Date().toISOString(), cpu: os.cpus()[0].model, score_ms: base, score_ms_at_4x: at4, throttle_scaling_at_4x: +(at4 / base).toFixed(2), ref: REF, rates: r };
console.log(`workload: ${base} ms unthrottled (median of 3), ${at4} ms at 4x (x${out.throttle_scaling_at_4x}) on ${out.cpu}`);
for (const [n, v] of Object.entries(r)) console.log(`${n.padEnd(8)} raw ${v.raw}  rate ${v.rate}${v.ciOnly ? '  CI-ONLY (VM too slow for this class)' : ''}  (${REF.classes[n].chip})`);
const dir = path.join(os.homedir(), '.cache/limitless-fixtures');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'cpu-calibration.json'), JSON.stringify(out, null, 2));
