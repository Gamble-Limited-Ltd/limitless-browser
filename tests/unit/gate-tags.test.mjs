// TS-5: every e2e spec is tagged; tag selection rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectSpecs, tagsFromDiff } from '../../scripts/lib/gate-tags.mjs';

const T = JSON.parse(fs.readFileSync(new URL('../tags.json', import.meta.url), 'utf8'));

test('every spec file has at least one known tag', () => {
  for (const f of fs.readdirSync(new URL('../e2e/', import.meta.url)).filter((x) => x.endsWith('.spec.js'))) {
    assert.ok(T.specs[f]?.length > 0, `${f} has no entry in tests/tags.json`);
    for (const t of T.specs[f]) assert.ok(T.tags.includes(t), `${f}: unknown tag ${t}`);
  }
});

test('item tier is core plus the item tags; unknown spec counts as core; rc is everything', () => {
  const all = ['smoke.spec.js', 'meriyah.spec.js', 'ui-tabs.spec.js', 'brandnew.spec.js'];
  assert.deepEqual(selectSpecs(T, all, ['rewrite']).sort(), ['brandnew.spec.js', 'meriyah.spec.js', 'smoke.spec.js']);
  assert.deepEqual(selectSpecs(T, all, null), all);
});

test('diff to tags: shared helper forces full; main.js needs --tags; docs only needs none', () => {
  assert.deepEqual(tagsFromDiff(T, ['tests/lib/profile.js'], []), { full: true });
  assert.deepEqual(tagsFromDiff(T, ['app/main.js'], []), { full: true });
  assert.deepEqual(tagsFromDiff(T, ['app/main.js'], ['rewrite']), { full: false, tags: ['rewrite'], specs: [] });
  assert.deepEqual(tagsFromDiff(T, ['docs/x.md'], []), { full: false, tags: [], specs: [] });
  assert.deepEqual(tagsFromDiff(T, ['theme/chrome.css', 'tests/e2e/foo.spec.js'], []), { full: false, tags: ['ui'], specs: ['foo.spec.js'] });
  assert.deepEqual(tagsFromDiff(T, ['mystery/file.js'], []), { full: true });
});
