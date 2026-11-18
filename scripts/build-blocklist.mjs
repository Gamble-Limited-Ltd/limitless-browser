// N1: vendor/blocklist/<date>/hosts.txt -> hosts.bin, sorted 64-bit host hashes (no Set at runtime).
// Layout (little endian, no header): n Uint32 "hi" values, then n Uint32 "lo" values; entries sorted by (hi, lo), deduplicated.
// Hash of a host string: hi = FNV-1a 32 (seed 0x811c9dc5, prime 0x01000193) over UTF-16 code units; lo = same loop with
// seed 0x9e3779b1 and multiplier 0x5bd1e995, then lo ^= lo >>> 15. Keep in step with `hash64` in app/main.js (test blocklist.spec.js checks it).
// Usage: node scripts/build-blocklist.mjs [dir]   (default: the newest dir in vendor/blocklist)
import fs from 'node:fs';
import path from 'node:path';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'vendor', 'blocklist');
const dir = process.argv[2] || path.join(root, fs.readdirSync(root).filter(d => /^\d{4}-/.test(d)).sort().pop());
const keys = new Set();
for (const l of fs.readFileSync(path.join(dir, 'hosts.txt'), 'utf8').split('\n')) {
  const h = l.trim().toLowerCase();
  if (!h || h.charCodeAt(0) === 35) continue;
  let a = 0x811c9dc5, b = 0x9e3779b1;
  for (let i = 0; i < h.length; i++) { const c = h.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x5bd1e995) >>> 0; }
  b = (b ^ (b >>> 15)) >>> 0;
  keys.add((BigInt(a) << 32n) | BigInt(b));
}
const all = BigUint64Array.from(keys).sort();
const out = new Uint32Array(all.length * 2);
all.forEach((k, i) => { out[i] = Number(k >> 32n); out[all.length + i] = Number(k & 0xffffffffn); });
fs.writeFileSync(path.join(dir, 'hosts.bin'), Buffer.from(out.buffer));
console.log('blocklist: ' + all.length + ' hashes -> ' + path.join(dir, 'hosts.bin'));
