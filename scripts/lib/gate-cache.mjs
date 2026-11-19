// TS-3: build cache helpers for scripts/gate.mjs.
import fs from 'node:fs';
import path from 'node:path';

// Delete all but the newest `keep` entries (by mtime) of `dir`; returns the removed names.
export function prune(dir, keep = 10) {
  const e = fs.readdirSync(dir).map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs })).sort((a, b) => b.t - a.t);
  const gone = e.slice(keep).map((x) => x.n);
  for (const n of gone) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
  return gone;
}

// `git status --porcelain` output: only a clean tree may be cached.
export const cacheable = (porcelain) => porcelain.trim() === '';
