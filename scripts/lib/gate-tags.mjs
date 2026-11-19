// TS-5: which e2e spec files run for an item (tests/tags.json).
// selectSpecs: tags null = everything (rc tier); else specs tagged core or any of `tags`; a spec missing from the map counts as core.
export function selectSpecs(T, allSpecs, tags) {
  if (!tags) return allSpecs;
  const want = new Set(['core', ...tags]);
  return allSpecs.filter((f) => (T.specs[f] || ['core']).some((t) => want.has(t)));
}

// Changed paths to a tag set. full = run the whole suite (shared helper, harness, build or deploy change, or a path nobody mapped).
// "item" paths (app/main.js, index.html) are too big to map: they use the explicit --tags, else full. Changed spec files always run.
export function tagsFromDiff(T, changed, explicit) {
  const tags = new Set(explicit), specs = [];
  const prefixes = Object.keys(T.sources).sort((a, b) => b.length - a.length);
  for (const f of changed) {
    const m = /^tests\/e2e\/([^/]+\.spec\.js)$/.exec(f);
    if (m) { specs.push(m[1]); continue; }
    const p = prefixes.find((x) => f === x || f.startsWith(x));
    const rule = p === undefined ? 'full' : T.sources[p];
    if (rule === 'full') return { full: true };
    if (rule === 'item') { if (!explicit.length) return { full: true }; continue; }
    rule.forEach((t) => tags.add(t));
  }
  return { full: false, tags: [...tags], specs };
}
