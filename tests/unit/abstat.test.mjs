// TS-4: interleaved A/B verdict (docs/1.3/specs/08-test-speed.md). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, rng, bound, MIN_PAIRS, MAX_PAIRS } from '../../scripts/lib/abstat.mjs';

const noisy = (n, base, sd, seed) => { const r = rng(seed); return Array.from({ length: n }, () => Math.round(base + (r() - 0.5) * 2 * sd)); };
const pairs = (a, b) => a.map((x, i) => [x, b[i]]);

test('bound is max(10 percent of A, 100 ms)', () => {
  assert.equal(bound(500), 100);
  assert.equal(bound(3000), 300);
});

test('identical samples pass in 4 pairs', () => {
  const a = noisy(4, 2000, 80, 1);
  assert.equal(decide(pairs(a, a)).verdict, 'pass');
});

test('under 4 pairs never decides', () => {
  const a = noisy(3, 2000, 10, 2);
  assert.equal(decide(pairs(a, a)).verdict, 'continue');
  assert.equal(MIN_PAIRS, 4);
});

test('a constant +300 ms shift fails by pair 4', () => {
  const a = noisy(4, 1000, 40, 3);
  assert.equal(decide(pairs(a, a.map((x) => x + 300))).verdict, 'fail');
});

test('a +5 percent shift with noise passes or goes inconclusive, never fails', () => {
  for (let s = 0; s < 40; s++) {
    const a = noisy(MAX_PAIRS, 3000, 250, 100 + s), b = noisy(MAX_PAIRS, 3150, 250, 900 + s);
    for (let n = MIN_PAIRS; n <= MAX_PAIRS; n++) {
      const v = decide(pairs(a.slice(0, n), b.slice(0, n)), { seed: s }).verdict;
      assert.notEqual(v, 'fail', `seed ${s} n ${n}`);
      if (v === 'pass') break;
    }
  }
});

test('undecided at 9 pairs is inconclusive', () => {
  const a = noisy(MAX_PAIRS, 1000, 400, 7), b = a.map((x, i) => x + (i % 2 ? 180 : 0));
  const v = decide(pairs(a, b)).verdict;
  assert.ok(v === 'inconclusive' || v === 'pass' || v === 'fail');
  assert.equal(decide(pairs(noisy(MAX_PAIRS, 1000, 900, 8), noisy(MAX_PAIRS, 1100, 900, 9))).verdict, 'inconclusive');
});

test('pairs with a missing side are dropped; 3 dropped is inconclusive', () => {
  const a = noisy(6, 2000, 50, 4);
  const p = pairs(a, a);
  p[1][1] = null; p[2][0] = null;
  const d = decide(p);
  assert.equal(d.n, 4); assert.equal(d.dropped, 2); assert.equal(d.verdict, 'pass');
  p[3][1] = null;
  const d3 = decide(p);
  assert.equal(d3.verdict, 'inconclusive'); assert.match(d3.reason, /3 dropped/);
});

test('the seed makes it deterministic', () => {
  const a = noisy(6, 1500, 300, 5), b = noisy(6, 1600, 300, 6);
  assert.deepEqual(decide(pairs(a, b), { seed: 42 }), decide(pairs(a, b), { seed: 42 }));
});

test('gate verdict: fail always fails, inconclusive fails only the rc tier', async () => {
  const { abVerdict } = await import('../../scripts/lib/abstat.mjs');
  const s = (fail, inconclusive) => ({ pass: 20 - fail - inconclusive, fail, inconclusive, rows: 20 });
  assert.equal(abVerdict([s(0, 0)], 'rc').ok, true);
  assert.equal(abVerdict([s(1, 0)], 'item').ok, false);
  assert.equal(abVerdict([s(0, 2)], 'item').ok, true);
  assert.equal(abVerdict([s(0, 2)], 'rc').ok, false);
  assert.equal(abVerdict([s(0, 0), null], 'rc').ok, false);
});

test('undecided after MAX_PAIRS pairs run is inconclusive even when pairs were dropped', () => {
  const a = noisy(MAX_PAIRS, 2000, 400, 7), b = noisy(MAX_PAIRS, 2150, 400, 8);
  const p = pairs(a, b); p[2][1] = null; p[5][0] = null; // 7 usable of 9 run
  const v = decide(p);
  assert.equal(v.n, 7);
  assert.notEqual(v.verdict, 'continue');
});
