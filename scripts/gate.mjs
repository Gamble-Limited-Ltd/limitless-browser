#!/usr/bin/env node
// TS-1 gate runner (called by gate.sh, which holds the rehearsal lock). Source = <ref> in a throwaway worktree; harness (the
// rehearsal stack, speed and site suites, fixtures) = this checkout, overlaid on it, so base and candidate always run the same harness.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, stepsFor, cacheKey } from './lib/gate-args.mjs';
import { prune, cacheable } from './lib/gate-cache.mjs';
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

// TS-3: build each (sha, feature set) once. Key = <sha>-<hash of the effective LB_FEATURE_* pairs>; newest 10 trees kept.
const CACHE = path.join(HOME, '.cache/limitless-gate');
const featureEnv = () => {
  const e = { ...(process.env.LB_REHEARSAL_RELAYOFF === '1' ? {} : { LB_FEATURE_OWNRELAY: 'true', LB_FEATURE_OWNSOCKETS: '4', LB_FEATURE_PAGECACHE: 'true', LB_FEATURE_WARM: 'true' }) };
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('LB_FEATURE_')) e[k] = v;   // same defaults run.sh applies, then the caller's
  for (const [k, v] of Object.entries(args.features)) e[`LB_FEATURE_${k.toUpperCase()}`] = v;
  return e;
};
function ensureDist(ref, wt) {
  const fe = featureEnv(), key = cacheKey(ref, fe), dir = path.join(CACHE, 'dist', key);
  if (fs.existsSync(dir)) { fs.utimesSync(dir, new Date(), new Date()); console.log(`gate: build cache hit ${key}`); return { dir, key, hit: true }; }
  const dirty = git('-C', wt, 'status', '--porcelain', '--', '.', ...OVERLAY.map((p) => `:(exclude)${p}`)).stdout;
  const r = sh(`scripts/build-static.sh rehearsal-${ref}`, { cwd: wt, env: fe, log: 'build.log' });
  if (r.code) throw new Error(`build of ${ref} failed, see ${OUT}/build.log`);
  const v = fs.readFileSync(path.join(wt, 'deploy/web/dist/version.json'), 'utf8');
  if (!v.includes(ref)) throw new Error(`built tree does not carry sha ${ref}`);
  if (cacheable(dirty)) {
    const tmp = `${dir}.tmp`; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    for (const d of ['dist', 'dist-br']) fs.cpSync(path.join(wt, 'deploy/web', d), path.join(tmp, d), { recursive: true });
    fs.renameSync(tmp, dir); prune(path.join(CACHE, 'dist'), 10);
  } else { console.log('gate: dirty tree, build not cached'); fs.cpSync(path.join(wt, 'deploy/web'), `${dir}.nocache`, { recursive: true }); return { dir: `${dir}.nocache`, key, hit: false, r }; }
  return { dir, key, hit: false, r };
}
// A killed run must still release the prebuild pause and its worktrees.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { fs.rmSync(PAUSE, { force: true }); fs.rmSync(MARK, { force: true }); } catch {} cleanup(); process.exit(130); });

const STEP = {
  rwbench: () => ({ skipped: 'not built yet' }),
  e2e: (wt) => { const r = sh('npx playwright test --reporter=line', { cwd: wt, env: { LB_E2E_PORT: '8597' }, log: 'e2e.log' }); return { r, ok: r.code === 0 }; },
  speed: (wt, baseWt) => quiet(() => {
    const env = { LB_SPEED: '1', LB_SPEED_REPS: '3', LB_SPEED_PUBLIC: '0' };
    const run = (dist, s, log) => sh('deploy/rehearsal/run.sh --project=chromebook tests/stack/speed.spec.js', { cwd: wt, env: { ...env, LB_DIST: dist, LB_SPEED_SHA: s }, log });
    const c = run(DIST.cand.dir, sha, 'speed-cand.log');
    // Base result reused when a run of the same base build and feature set is under 12 h old (no drift across a night).
    const cached = path.join(CACHE, 'speed', `${DIST.base.key}-chromebook.json`);
    const reuse = fs.existsSync(cached) && Date.now() - fs.statSync(cached).mtimeMs < 12 * 3600000;
    const b = reuse ? { code: 0, min: 0 } : run(DIST.base.dir, baseSha, 'speed-base.log');
    if (reuse) fs.copyFileSync(cached, path.join(OUT, `speed-${baseSha}-chromebook.json`));
    else { fs.copyFileSync(path.join(wt, `test-results/speed-${baseSha}-chromebook.json`), path.join(OUT, `speed-${baseSha}-chromebook.json`)); fs.mkdirSync(path.dirname(cached), { recursive: true }); fs.copyFileSync(path.join(OUT, `speed-${baseSha}-chromebook.json`), cached); }
    fs.cpSync(path.join(wt, `test-results/speed-${sha}-chromebook.json`), path.join(OUT, `speed-${sha}-chromebook.json`), { force: true });
    const cmp = sh(`node scripts/speed-compare.mjs ${OUT}/speed-${baseSha}-chromebook.json ${OUT}/speed-${sha}-chromebook.json > ${OUT}/speed-compare.txt`, { cwd: wt, log: 'speed-compare.log' });
    return { r: { min: c.min + b.min + cmp.min }, ok: c.code === 0 && b.code === 0 && cmp.code === 0, note: `cand ${c.min.toFixed(1)} + base ${reuse ? 'reused' : b.min.toFixed(1)}; noisy reps cand ${noisy(`${OUT}/speed-${sha}-chromebook.json`)} base ${noisy(`${OUT}/speed-${baseSha}-chromebook.json`)}` };
  }),
  sites: (wt) => { const r = sh('LB_SITES=1 deploy/rehearsal/run.sh --project=chromebook --workers=1 tests/stack/sites.spec.js', { cwd: wt, env: { LB_DIST: DIST.cand.dir, LB_SPEED_SHA: sha }, log: 'sites.log' }); return { r, ok: r.code === 0 }; },
};

const T0 = Date.now();
let wt, baseWt;
const DIST = {};
try {
  wt = mk(sha, 'cand');
  const needBase = steps.includes('speed');
  const cand = (() => { const t = Date.now(); const d = ensureDist(sha, wt); rows.push({ step: 'build', min: (Date.now() - t) / 60000, verdict: d.hit ? 'cached' : 'built', note: d.key }); return d; })();
  const base = { key: cacheKey(baseSha, featureEnv()) };
  DIST.cand = cand;
  if (needBase) {
    if (!fs.existsSync(path.join(CACHE, 'dist', base.key))) baseWt = mk(baseSha, 'base');
    const t = Date.now(); DIST.base = baseWt ? ensureDist(baseSha, baseWt) : ensureDist(baseSha, wt); rows.push({ step: 'build base', min: (Date.now() - t) / 60000, verdict: DIST.base.hit ? 'cached' : 'built', note: DIST.base.key });
  }
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
