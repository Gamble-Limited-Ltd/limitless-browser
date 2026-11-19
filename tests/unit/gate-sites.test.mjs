// TS-6: real-sites.json schema, tag selection, shards that own whole sites, rep order across sites.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectSites, shardSites, repOrder, SITE_TAGS } from '../../scripts/lib/gate-sites.mjs';

const SITES = JSON.parse(fs.readFileSync(new URL('../stack/real-sites.json', import.meta.url), 'utf8'));

test('every site has known tags; the official list is exactly 10; youtube expects blocked', () => {
  for (const s of SITES) { assert.ok(s.tags?.length > 0, `${s.name} has no tags`); for (const t of s.tags) assert.ok(SITE_TAGS.includes(t), `${s.name}: unknown tag ${t}`); }
  assert.equal(SITES.filter((s) => s.official).length, 10);
  assert.equal(SITES.find((s) => s.name === 'youtube').expect, 'blocked');
  assert.equal(new Set(SITES.map((s) => s.name)).size, SITES.length);
});

test('item selection = tag match plus official; no tags = all; ONLY wins', () => {
  const some = selectSites(SITES, ['images']);
  assert.ok(some.length < SITES.length);
  assert.ok(SITES.filter((s) => s.official).every((o) => some.includes(o)));
  assert.ok(SITES.filter((s) => s.tags.includes('images')).every((o) => some.includes(o)));
  assert.equal(selectSites(SITES, null).length, SITES.length);
  assert.deepEqual(selectSites(SITES, ['images'], ['bbc']).map((s) => s.name), ['bbc']);
});

test('shards own whole sites and cover every site once', () => {
  const sh = shardSites(SITES, 4);
  assert.equal(sh.length, 4);
  assert.deepEqual(sh.flat().map((s) => s.name).sort(), SITES.map((s) => s.name).sort());
});

test('rep order: all sites for rep 1, then rep 2; no host twice in a row', () => {
  const order = repOrder(['a', 'b', 'c'], 2);
  assert.deepEqual(order, [[0, 'a'], [0, 'b'], [0, 'c'], [1, 'a'], [1, 'b'], [1, 'c']]);
});
