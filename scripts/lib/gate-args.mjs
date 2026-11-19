// TS-1 helpers for scripts/gate.mjs: argument parsing, tier to step list, cache key.
import { createHash } from 'node:crypto';

const TIERS = ['item', 'rc'];
const STEPS = { item: ['rwbench', 'e2e', 'speed', 'sites'], rc: ['rwbench', 'speed', 'e2e+sites', 'profile', 'bootsize'] };

export function parseArgs(argv) {
  const a = { ref: null, base: 'main', tier: 'item', tags: [], features: {}, dryRun: false, steps: null, speedReps: null };
  const v = (i, n) => { if (i + 1 >= argv.length) throw new Error(`${n} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--base') a.base = v(i++, x);
    else if (x === '--tier') { a.tier = v(i++, x); if (!TIERS.includes(a.tier)) throw new Error(`bad tier ${a.tier} (item or rc)`); }
    else if (x === '--tags') a.tags = v(i++, x).split(',').filter(Boolean);
    else if (x === '--features') {
      for (const p of v(i++, x).split(',').filter(Boolean)) {
        const k = p.indexOf('=');
        if (k < 1) throw new Error(`bad feature pair "${p}" (K=V)`);
        a.features[p.slice(0, k)] = p.slice(k + 1);
      }
    } else if (x === '--steps') { a.steps = v(i++, x).split(',').filter(Boolean); for (const t of a.steps) if (!ALL.includes(t)) throw new Error(`unknown step ${t} (${ALL.join(', ')})`); }
    else if (x === '--speed-reps') a.speedReps = Number(v(i++, x));
    else if (x === '--dry-run') a.dryRun = true;
    else if (x.startsWith('--')) throw new Error(`unknown option ${x}`);
    else if (!a.ref) a.ref = x;
    else throw new Error(`unexpected argument ${x}`);
  }
  if (!a.ref) throw new Error('usage: gate.sh <ref> [--base <ref>] [--tier item|rc] [--tags a,b] [--features K=V,...] [--dry-run] (ref missing)');
  return a;
}

const ALL = ['rwbench', 'e2e', 'speed', 'sites', 'profile', 'bootsize'];
// only = optional filter; a combined step (e2e+sites) keeps just the halves that were asked for
export const stepsFor = (tier, only = null) => STEPS[tier].map((s) => (only ? s.split('+').filter((p) => only.includes(p)).join('+') : s)).filter(Boolean);

export const featureHash = (pairs) =>
  createHash('sha256').update(Object.keys(pairs).sort().map((k) => `${k}=${pairs[k]}`).join('\n')).digest('hex').slice(0, 8);

export const cacheKey = (sha, pairs) => `${sha}-${featureHash(pairs)}`;
