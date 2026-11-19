// TS-10: the rewriter micro-bench: extraction from app/main.js works, comparison rule is "more than 10 percent slower on any bundle fails".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRewriter, compare, median } from '../../scripts/lib/rwbench.mjs';

test('extracted rewriter rewrites X.location like the app does', () => {
  const rw = loadRewriter(new URL('../../', import.meta.url).pathname);
  assert.equal(rw('var u = a.location.href;'), 'var u = __lbSafe(a).__lbLoc$.href;');
  assert.equal(rw('var x = 1;'), 'var x = 1;');
});

test('compare: >10 percent slower fails, equal or faster passes, new bundle is noted', () => {
  const r = compare({ a: 100, b: 100, c: 100 }, { a: 111, b: 110, c: 70, d: 5 });
  assert.deepEqual(r.fail, ['a']);
  assert.deepEqual(r.added, ['d']);
});

test('median', () => { assert.equal(median([5, 1, 3]), 3); assert.equal(median([4, 1, 3, 2]), 2.5); });
