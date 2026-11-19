// TS-3: build cache pruning (keep newest N trees by mtime) and the "never cache a dirty tree" rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prune, cacheable } from '../../scripts/lib/gate-cache.mjs';

test('prune keeps the newest N by mtime', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-'));
  for (let i = 0; i < 13; i++) { const p = path.join(d, `k${i}`); fs.mkdirSync(p); fs.utimesSync(p, 1000 + i, 1000 + i); }
  const gone = prune(d, 10);
  assert.deepEqual(gone.sort(), ['k0', 'k1', 'k2']);
  assert.equal(fs.readdirSync(d).length, 10);
});

test('dirty trees are not cacheable', () => {
  assert.equal(cacheable(''), true);
  assert.equal(cacheable(' M app/main.js\n'), false);
});
