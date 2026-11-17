// @ts-check
// CPU profile summary for the speed audit (tests/stack/profile.spec.js): self time per function and per bucket.
const BUCKETS = [
  ['gc', (f, u) => f === '(garbage collector)'],
  ['idle', (f) => f === '(idle)'],
  ['program/native', (f) => f === '(program)' || f === '(root)'],
  ['libcurl wasm', (f, u) => /\.wasm/.test(u) || /^wasm-function/.test(f) || /^(wasm|libcurl)/i.test(f)],
  ['rewriter (acorn/rewriteLocationRefs)', (f, u) => /vendor\/acorn/.test(u) || /rewriteLocationRefs|rewriteJs|lbRw|^acorn|parseExpression|parseTopLevel|^walk|simple\b/.test(f)],
  ['rewriteCssUrls', (f) => /rewriteCssUrls|cssStage|_cssStage/.test(f)],
  ['DOMParser/serialise', (f) => /parseFromString|outerHTML|innerHTML|serializeToString|XMLSerializer|insertAdjacentHTML|createContextualFragment|DOMParser/.test(f)],
  ['base64/transfer', (f) => /Base64|btoa|atob|b64|readAsDataURL|fromCharCode|arrayBuffer|lbBlobsToData|encode|decode/i.test(f)],
  ['frame runtime', (f, u) => /processEl|_lazyCheck|lbLazy|__lb|MutationObserver|^lbRt/.test(f)],
  ['libcurl glue (index.html)', (f, u) => /index\.html/.test(u)],
  ['app (main.js/ui.js)', (f, u) => /\/app\/.*\.js/.test(u) || /app\/main\.js|app\/ui\.js/.test(u)],
  ['page own JS / other', () => true],
];
function bucketOf(cf) {
  const f = cf.functionName || '', u = cf.url || '';
  for (const [name, fn] of BUCKETS) if (fn(f, u)) return name;
  return 'page own JS / other';
}
function shortUrl(u) {
  if (!u) return '(native)';
  if (/^blob:/.test(u)) return 'blob:' + u.slice(-8);
  return u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*/, '').slice(-60);
}
/** @param {{nodes:any[],samples:number[],timeDeltas:number[]}} p */
function summarise(p, top = 15) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) || 0) + (p.timeDeltas[i] || 0));
  const fn = new Map(), bk = new Map();
  let total = 0;
  for (const [id, us] of self) {
    const n = byId.get(id); if (!n) continue;
    const cf = n.callFrame; const ms = us / 1000; total += ms;
    const b = bucketOf(cf); bk.set(b, (bk.get(b) || 0) + ms);
    if (b === 'idle') continue;
    const key = `${cf.functionName || '(anon)'} ${shortUrl(cf.url)}:${cf.lineNumber + 1}`;
    const e = fn.get(key) || { key, bucket: b, ms: 0 }; e.ms += ms; fn.set(key, e);
  }
  const buckets = [...bk].map(([name, ms]) => ({ name, ms: Math.round(ms) })).sort((a, b) => b.ms - a.ms);
  const topFns = [...fn.values()].sort((a, b) => b.ms - a.ms).slice(0, top).map((e) => ({ ...e, ms: Math.round(e.ms) }));
  const idle = bk.get('idle') || 0;
  return { totalMs: Math.round(total), busyMs: Math.round(total - idle), buckets, topFns };
}
module.exports = { summarise, bucketOf, BUCKETS };
