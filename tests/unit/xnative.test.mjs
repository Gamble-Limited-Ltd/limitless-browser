import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratios, table, looksBlocked } from '../../scripts/lib/xnative.mjs';

const site = (cs, cl, ws, wl) => ({ cold: { shown: { median: cs }, load: { median: cl } }, warm: { shown: { median: ws }, load: { median: wl } } });
const L = { sites: { a: site(2000, 3000, 1000, 1500), b: site(500, 600, 400, 500), c: site(100, 100, 100, 100) } };
const N = { sites: { a: site(1000, 1000, 500, 500), b: { blocked: true, ...site(1, 1, 1, 1) } } };

test('ratio is Limitless over native, rounded to 2 places', () => {
  const r = ratios(L, N).find((x) => x.site === 'a' && x.phase === 'cold' && x.mark === 'load');
  assert.equal(r.ratio, 3);
  assert.equal(ratios(L, N).find((x) => x.site === 'a' && x.phase === 'warm' && x.mark === 'shown').ratio, 2);
});
test('blocked native and missing native side are labelled, not divided', () => {
  const rows = ratios(L, N);
  assert.deepEqual(rows.filter((x) => x.site === 'b').map((x) => [x.ratio, x.note]).at(0), [null, 'native blocked']);
  assert.deepEqual(rows.filter((x) => x.site === 'c').map((x) => [x.ratio, x.note]).at(0), [null, 'no native run']);
});
test('missing Limitless number', () => {
  const r = ratios({ sites: { a: { cold: {}, warm: {} } } }, N)[0];
  assert.equal(r.note, 'no limitless number');
});
test('table text and blocked check', () => {
  assert.match(table(ratios(L, N)), /\| a \| cold \| load \| 3000 \| 1000 \| 3x \|/);
  assert.match(table(ratios(L, N)), /\| b \| cold \| shown \| 500 \| 1 \| native blocked \|/);
  assert.equal(looksBlocked(200, 'Just a moment...'), true);
  assert.equal(looksBlocked(403, 'x'), true);
  assert.equal(looksBlocked(200, 'Wikipedia'), false);
});
