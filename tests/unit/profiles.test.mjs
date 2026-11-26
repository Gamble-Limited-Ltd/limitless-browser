// cb-* profile table, rate derivation and the gate's --profiles option. Run: node --test tests/unit/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseArgs, projectsFor } from '../../scripts/lib/gate-args.mjs';
import { rates } from '../../scripts/lib/cbrates.mjs';

const { PROFILES, cbProjects } = createRequire(import.meta.url)('../lib/profile.js');

test('chromebook profile is unchanged', () => {
  assert.deepEqual(PROFILES.chromebook, { viewport: { width: 1366, height: 768 }, cpuRate: 4, net: { offline: false, latency: 40, downloadThroughput: 1250000, uploadThroughput: 625000 } });
});

test('cb-low, cb-mid, cb-high match the decision of 2026-11-25', () => {
  const pick = (p) => [p.viewport.width, p.viewport.height, p.net.downloadThroughput * 8 / 1e6, p.net.uploadThroughput * 8 / 1e6, p.net.latency, p.deviceMemory, p.hardwareConcurrency];
  assert.deepEqual(pick(PROFILES['cb-low']), [1366, 768, 100, 15, 20, 4, 4]);
  assert.deepEqual(pick(PROFILES['cb-mid']), [1920, 1080, 200, 30, 20, 8, 4]);
  assert.deepEqual(pick(PROFILES['cb-high']), [1920, 1080, 200, 30, 20, 8, 8]);
});

test('table cpuRate and ciOnly agree with the calibration', () => {
  const r = rates();
  for (const n of ['cb-low', 'cb-mid', 'cb-high']) { assert.equal(PROFILES[n].cpuRate, r[n].rate); assert.equal(!!PROFILES[n].ciOnly, r[n].ciOnly); }
});

test('rate is never below 1 and raw is machine over chromebook', () => {
  const r = rates({ thisMachine: { gb6: 1000 }, classes: { a: { gb6: 250 }, b: { gb6: 2000 }, c: { gb6: 4000 } } });
  assert.deepEqual([r.a.rate, r.b.rate, r.b.raw, r.c.ciOnly], [4, 1, 0.5, true]);
});

test('playwright projects for the three profiles', () => {
  const p = cbProjects({ 'Desktop Chrome': {} }, { testMatch: /x/ });
  assert.deepEqual(p.map((x) => x.use.lbProfile), ['cb-low', 'cb-mid', 'cb-high']);
  assert.ok(p.every((x) => x.testMatch));
});

test('--profiles: default unchanged, list parsed, unknown throws', () => {
  assert.equal(parseArgs(['r']).profiles, null);
  assert.deepEqual(parseArgs(['r', '--profiles', 'cb-low,cb-mid']).profiles, ['cb-low', 'cb-mid']);
  assert.throws(() => parseArgs(['r', '--profiles', 'cb-ultra']), /profile/);
});

test('projectsFor: defaults per tier, CI-only skipped unless forced', () => {
  assert.deepEqual(projectsFor(null, 'rc').run, ['chromium', 'chromebook']);
  assert.deepEqual(projectsFor(null, 'item').run, ['chromebook']);
  assert.deepEqual(projectsFor(['cb-low', 'cb-high'], 'item'), { run: ['cb-low'], skipped: ['cb-high'] });
  assert.deepEqual(projectsFor(['cb-low', 'cb-high'], 'item', { LB_PROFILES_FORCE: '1' }).run, ['cb-low', 'cb-high']);
});
