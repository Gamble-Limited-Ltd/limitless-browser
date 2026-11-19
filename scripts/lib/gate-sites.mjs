// TS-6: real-site suite selection and scheduling (used by tests/stack/sites.spec.js).
export const SITE_TAGS = ['images', 'video', 'chat', 'botcheck', 'heavyjs', 'school', 'game', 'google'];

// tags null = every site; else sites whose tags meet `tags`, plus the official list. `only` (names) wins over everything.
export function selectSites(sites, tags, only = null) {
  if (only) return sites.filter((s) => only.includes(s.name));
  if (!tags) return sites;
  return sites.filter((s) => s.official || s.tags.some((t) => tags.includes(t)));
}

// n shards, round robin by index: each site belongs to exactly one shard (one worker), so no two workers hit one host at once.
export const shardSites = (sites, n) => Array.from({ length: n }, (_, k) => sites.filter((_, i) => i % n === k));

// Rep-major order: site 1 rep 1, site 2 rep 1, ... then rep 2, so a host never sees back-to-back loads (with 2 or more sites).
export const repOrder = (names, reps) => { const o = []; for (let r = 0; r < reps; r++) for (const n of names) o.push([r, n]); return o; };
