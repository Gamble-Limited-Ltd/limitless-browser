#!/usr/bin/env node
// MS-5: read the VPS meter over ssh and push the result to a Kuma push monitor; `--report` prints the week's CPU/RAM peaks for SV-0.
//   node scripts/vps-meter-alert.mjs            push (needs LB_KUMA_PUSH_URL or the url in ~/.config/gll-cloud/vps-meter-kuma.env)
//   node scripts/vps-meter-alert.mjs --dry      print what would be pushed, send nothing (also the behaviour with no push url)
//   node scripts/vps-meter-alert.mjs --report   per-container CPU peak/avg, RAM peak, load, memory, disk from samples.jsonl
// Env: LB_VPS_SSH (default limitless-relay), LB_SAMPLE_DIR (default /var/lib/limitless-sampler).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pushQuery, cpuPeaks } from './lib/vpsmeter.mjs';

const host = process.env.LB_VPS_SSH || 'limitless-relay';
const dir = process.env.LB_SAMPLE_DIR || '/var/lib/limitless-sampler';
const ssh = (f) => execFileSync('ssh', ['-o', 'ConnectTimeout=10', host, `cat ${dir}/${f}`], { encoding: 'utf8' });

if (process.argv.includes('--report')) {
  const s = ssh('samples.jsonl').trim().split('\n').map((l) => JSON.parse(l));
  const min = (k) => Math.min(...s.map((x) => x[k]));
  console.log(JSON.stringify({ samples: s.length, from: s[0].t, to: s.at(-1).t, load1Peak: Math.max(...s.map((x) => x.load1)), memAvailMbMin: min('memAvailMb'), diskPctMax: Math.max(...s.map((x) => x.diskPct)), containers: cpuPeaks(s) }, null, 2));
  process.exit(0);
}

const m = JSON.parse(ssh('meter.json'));
const q = pushQuery(m);
let url = process.env.LB_KUMA_PUSH_URL;
if (!url) try { url = /^LB_KUMA_PUSH_URL=(.+)$/m.exec(fs.readFileSync(path.join(os.homedir(), '.config/gll-cloud/vps-meter-kuma.env'), 'utf8'))?.[1].trim(); } catch { /* no file: disabled */ }
if (process.argv.includes('--dry') || !url) {
  console.log(`${url ? 'dry run' : 'disabled (no Kuma push url)'}: status=${q.status} ${q.msg}`);
  process.exit(0);
}
const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}status=${q.status}&msg=${encodeURIComponent(q.msg)}&ping=`);
console.log(`kuma ${r.status}: ${q.status} ${q.msg}`);
process.exit(r.ok ? 0 : 1);
