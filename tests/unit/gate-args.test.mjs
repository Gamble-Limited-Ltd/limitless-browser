// TS-1: gate.sh argument parsing, tier to step list, feature hash. Run: node --test tests/unit/
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, stepsFor, featureHash, cacheKey } from '../../scripts/lib/gate-args.mjs';

test('defaults: item tier, base main', () => {
  const a = parseArgs(['abc123']);
  assert.deepEqual({ ref: a.ref, base: a.base, tier: a.tier, tags: a.tags, dryRun: a.dryRun }, { ref: 'abc123', base: 'main', tier: 'item', tags: [], dryRun: false });
});

test('all flags', () => {
  const a = parseArgs(['r1', '--base', 'b1', '--tier', 'rc', '--tags', 'boot,rewrite', '--features', 'OWNSOCKETS=6,WORKER=false', '--dry-run']);
  assert.equal(a.base, 'b1'); assert.equal(a.tier, 'rc'); assert.deepEqual(a.tags, ['boot', 'rewrite']);
  assert.deepEqual(a.features, { OWNSOCKETS: '6', WORKER: 'false' }); assert.equal(a.dryRun, true);
});

test('bad input throws', () => {
  assert.throws(() => parseArgs([]), /ref/);
  assert.throws(() => parseArgs(['r', '--tier', 'night']), /tier/);
  assert.throws(() => parseArgs(['r', '--features', 'NOEQUALS']), /feature/);
  assert.throws(() => parseArgs(['r', '--bogus']), /unknown/);
});

test('tier to steps', () => {
  assert.deepEqual(stepsFor('item'), ['rwbench', 'e2e', 'speed', 'sites']);
  assert.deepEqual(stepsFor('rc'), ['rwbench', 'speed', 'e2e+sites', 'profile', 'bootsize']);
});

test('feature hash is stable for any order, 8 chars, differs on change', () => {
  const h1 = featureHash({ A: '1', B: '2' }), h2 = featureHash({ B: '2', A: '1' });
  assert.equal(h1, h2); assert.match(h1, /^[0-9a-f]{8}$/);
  assert.notEqual(h1, featureHash({ A: '1', B: '3' }));
  assert.equal(cacheKey('deadbee', { B: '2', A: '1' }), `deadbee-${h1}`);
});

test('--steps filters the tier list; --speed-reps sets reps; unknown step throws', () => {
  const a = parseArgs(['r', '--tier', 'rc', '--steps', 'speed,sites', '--speed-reps', '7']);
  assert.deepEqual(a.steps, ['speed', 'sites']); assert.equal(a.speedReps, 7);
  assert.deepEqual(stepsFor('rc', ['speed', 'sites']), ['speed', 'sites']);
  assert.deepEqual(stepsFor('rc', ['e2e']), ['e2e']);
  assert.deepEqual(stepsFor('rc', ['e2e', 'sites']), ['e2e+sites']);
  assert.throws(() => parseArgs(['r', '--steps', 'bogus']), /step/);
});

test('A/B speed step is the default; --no-ab turns it off', () => {
  assert.equal(parseArgs(['r']).ab, true);
  assert.equal(parseArgs(['r', '--no-ab']).ab, false);
});
