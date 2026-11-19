#!/usr/bin/env node
// TS-1 gate runner (called by gate.sh, which holds the rehearsal lock). Source = <ref> in a throwaway worktree; harness (the
// rehearsal stack, speed and site suites, fixtures) = this checkout, overlaid on it, so base and candidate always run the same harness.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, stepsFor } from './lib/gate-args.mjs';
import { pauseAction, inQuietWindow } from './lib/gate-quiet.mjs';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();
const OVERLAY = ['deploy/rehearsal', 'tests/stack', 'tests/lib', 'tests/fixtures', 'playwright.stack.config.js', 'scripts/speed-compare.mjs', 'scripts/sites-merge.mjs', 'scripts/sites-table.mjs'];

let args;
try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`gate: ${e.message}`); process.exit(2); }

const git = (...a) => spawnSync('git', ['-C', TOOLS, ...a], { encoding: 'utf8' });
const rev = (r) => { const x = git('rev-parse', '--short=7', `${r}^{commit}`); if (x.status) { console.error(`gate: unknown ref ${r}`); process.exit(2); } return x.stdout.trim(); };
const sha = rev(args.ref), baseSha = rev(args.base);
const steps = stepsFor(args.tier);
const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(' ', '_').replace(':', '');
const OUT = path.join(HOME, 'gll-planning/reports/limitless-speed', `${stamp}-${args.ref.replace(/[^\w.-]/g, '_')}`);

console.log(`gate: ref ${args.ref} (${sha}) base ${args.base} (${baseSha}) tier ${args.tier}${args.tags.length ? ` tags ${args.tags}` : ''}`);
console.log(`gate: steps ${steps.join(', ')}`);
if (args.dryRun) { console.log('gate: dry run, nothing started'); process.exit(0); }

fs.mkdirSync(OUT, { recursive: true });
const rows = [];
const sh = (cmd, { cwd, env = {}, log }) => {
  const fd = fs.openSync(path.join(OUT, log), 'a');
  const t = Date.now();
  const r = spawnSync('bash', ['-c', cmd], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  return { code: r.status ?? 1, min: (Date.now() - t) / 60000 };
};
const record = (step, r, ok, note = '') => { rows.push({ step, min: r.min, verdict: ok ? 'pass' : 'FAIL', note }); console.log(`gate: ${step.padEnd(10)} ${r.min.toFixed(1)} min ${ok ? 'pass' : 'FAIL'} ${note}`); };

function worktree(ref, name) {
  const wt = path.join(HOME, 'gll-worktrees', `gate-${name}-${process.pid}`);
  const r = git('worktree', 'add', '--detach', wt, ref);
  if (r.status) throw new Error(`worktree failed: ${r.stderr}`);
  fs.symlinkSync(path.join(TOOLS, 'node_modules'), path.join(wt, 'node_modules'));
  for (const p of OVERLAY) {
    fs.rmSync(path.join(wt, p), { recursive: true, force: true });
    fs.mkdirSync(path.dirname(path.join(wt, p)), { recursive: true });
    fs.cpSync(path.join(TOOLS, p), path.join(wt, p), { recursive: true });
  }
  return wt;
}
const wts = [];
const mk = (ref, name) => { const w = worktree(ref, name); wts.push(w); return w; };
const cleanup = () => { for (const w of wts) git('worktree', 'remove', '--force', w); git('worktree', 'prune'); };

// TS-2: pause the 10-minute image prebuild while a speed step runs; the marker says the pause is ours. Removed in finally, also on failure.
const PAUSE = path.join(HOME, '.gll-prebuild.pause'), MARK = path.join(HOME, '.cache/limitless-gate/paused-by-gate');
const ageH = (f) => (Date.now() - fs.statSync(f).mtimeMs) / 3600000;
function quiet(fn) {
  const act = pauseAction({ pauseExists: fs.existsSync(PAUSE), ours: fs.existsSync(MARK), ageH: fs.existsSync(PAUSE) ? ageH(PAUSE) : 0 });
  if (act === 'refuse') { console.error(`gate: ${PAUSE} was set by an earlier gate run more than 6 h ago and never removed. Check it, remove it by hand, and start again.`); process.exit(3); }
  if (!inQuietWindow()) console.warn('gate: warning, outside 01:00 to 05:00 Chicago; other jobs may add noise to the speed rows');
  if (act === 'take') { fs.mkdirSync(path.dirname(MARK), { recursive: true }); fs.writeFileSync(PAUSE, 'paused by gate.mjs\n'); fs.writeFileSync(MARK, String(process.pid)); }
  try { return fn(); } finally { if (act === 'take') { fs.rmSync(PAUSE, { force: true }); fs.rmSync(MARK, { force: true }); } }
}
const noisy = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).env?.noisy ?? '?'; } catch { return '?'; } };

const STEP = {
  rwbench: () => ({ skipped: 'not built yet' }),
  e2e: (wt) => { const r = sh('npx playwright test --reporter=line', { cwd: wt, env: { LB_E2E_PORT: '8597' }, log: 'e2e.log' }); return { r, ok: r.code === 0 }; },
  speed: (wt, baseWt) => quiet(() => {
    const env = { LB_SPEED: '1', LB_SPEED_REPS: '3', LB_SPEED_PUBLIC: '0' };
    const c = sh('deploy/rehearsal/run.sh --project=chromebook tests/stack/speed.spec.js', { cwd: wt, env: { ...env, LB_SPEED_SHA: sha }, log: 'speed-cand.log' });
    const b = sh('deploy/rehearsal/run.sh --project=chromebook tests/stack/speed.spec.js', { cwd: baseWt, env: { ...env, LB_SPEED_SHA: baseSha }, log: 'speed-base.log' });
    for (const [d, s] of [[wt, sha], [baseWt, baseSha]]) fs.cpSync(path.join(d, `test-results/speed-${s}-chromebook.json`), path.join(OUT, `speed-${s}-chromebook.json`), { force: true });
    const cmp = sh(`node scripts/speed-compare.mjs ${OUT}/speed-${baseSha}-chromebook.json ${OUT}/speed-${sha}-chromebook.json > ${OUT}/speed-compare.txt`, { cwd: wt, log: 'speed-compare.log' });
    return { r: { min: c.min + b.min + cmp.min }, ok: c.code === 0 && b.code === 0 && cmp.code === 0, note: `cand ${c.min.toFixed(1)} + base ${b.min.toFixed(1)}; noisy reps cand ${noisy(`${OUT}/speed-${sha}-chromebook.json`)} base ${noisy(`${OUT}/speed-${baseSha}-chromebook.json`)}` };
  }),
  sites: (wt) => { const r = sh('LB_SITES=1 deploy/rehearsal/run.sh --project=chromebook --workers=1 tests/stack/sites.spec.js', { cwd: wt, env: { LB_SPEED_SHA: sha }, log: 'sites.log' }); return { r, ok: r.code === 0 }; },
};

const T0 = Date.now();
let wt, baseWt;
try {
  wt = mk(sha, 'cand');
  if (steps.includes('speed')) baseWt = mk(baseSha, 'base');
  for (const s of steps.flatMap((x) => x.split('+'))) {
    const x = STEP[s]?.(wt, baseWt);
    if (!x) { rows.push({ step: s, min: 0, verdict: 'not built', note: '' }); continue; }
    if (x.skipped) { rows.push({ step: s, min: 0, verdict: 'skipped', note: x.skipped }); continue; }
    record(s, x.r, x.ok, x.note);
  }
} finally { cleanup(); }

const total = (Date.now() - T0) / 60000;
const failed = rows.some((r) => r.verdict === 'FAIL');
const md = [`# Gate ${args.ref} (${sha}) vs ${args.base} (${baseSha}), tier ${args.tier}`, '', `Started ${stamp} Chicago, total ${total.toFixed(1)} min. Verdict: ${failed ? 'FAIL' : 'PASS'}.`, '',
  '| step | minutes | verdict | note |', '|---|---|---|---|', ...rows.map((r) => `| ${r.step} | ${r.min.toFixed(1)} | ${r.verdict} | ${r.note} |`), ''].join('\n');
fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), md);
console.log(md);
process.exit(failed ? 1 : 0);
