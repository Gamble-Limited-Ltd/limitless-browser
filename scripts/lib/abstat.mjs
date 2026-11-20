// TS-4: verdict for one interleaved A/B row (docs/1.3/specs/08-test-speed.md, decision D3, Boss 2026-11-19).
// Paired bootstrap of median(B) - median(A): resampling whole pairs keeps the drift both sides shared out of the interval.
//   pass         90 percent interval entirely below the bound (no regression)
//   fail         interval's lower end above the bound
//   continue     fewer than MIN_PAIRS usable pairs, or undecided below MAX_PAIRS pairs run (dropped pairs count)
//   inconclusive undecided at MAX_PAIRS, or 3 dropped pairs (counts as a fail for a release, a warning for an item)
export const MIN_PAIRS = 4, MAX_PAIRS = 9, RESAMPLES = 2000, MAX_DROPPED = 3;

/** Bound from the gate rule kept from speed-compare.mjs: 10 percent of A and at least 100 ms. */
export const bound = (medianA, pct = 10, floor = 100) => Math.max((medianA * pct) / 100, floor);

/** mulberry32: small seeded generator, so a verdict replays exactly. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const median = (v) => {
  const s = [...v].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * pairs: [[a, b], ...] in run order; a side that is not a number drops the pair.
 * Returns { verdict, n, dropped, medianA, medianB, diff, lo, hi, bound, reason? }.
 */
export function decide(pairs, { seed = 1, pct = 10, floor = 100 } = {}) {
  const ok = pairs.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const dropped = pairs.length - ok.length, n = ok.length;
  const base = { n, dropped };
  if (dropped >= MAX_DROPPED) return { ...base, verdict: 'inconclusive', reason: `${dropped} dropped pairs` };
  if (n < MIN_PAIRS) return { ...base, verdict: 'continue' };
  const A = ok.map((p) => p[0]), B = ok.map((p) => p[1]);
  const medianA = median(A), medianB = median(B), lim = bound(medianA, pct, floor);
  const r = rng(seed), d = new Array(RESAMPLES);
  for (let k = 0; k < RESAMPLES; k++) {
    const a = new Array(n), b = new Array(n);
    for (let i = 0; i < n; i++) { const j = Math.floor(r() * n); a[i] = A[j]; b[i] = B[j]; }
    d[k] = median(b) - median(a);
  }
  d.sort((x, y) => x - y);
  const lo = d[Math.floor(RESAMPLES * 0.05)], hi = d[Math.ceil(RESAMPLES * 0.95) - 1];
  const out = { ...base, medianA, medianB, diff: medianB - medianA, lo, hi, bound: lim };
  if (hi < lim) return { ...out, verdict: 'pass' };
  if (lo > lim) return { ...out, verdict: 'fail' };
  return { ...out, verdict: pairs.length >= MAX_PAIRS ? 'inconclusive' : 'continue', ...(pairs.length >= MAX_PAIRS ? { reason: `undecided at ${n} usable of ${pairs.length} pairs` } : {}) };
}

/** Gate step verdict from the abtest summaries of each project: a fail row fails; inconclusive fails an rc run, warns an item run. */
export function abVerdict(summaries, tier) {
  let fail = 0, inc = 0, rows = 0;
  for (const s of summaries) { if (!s) return { ok: false, note: 'no A/B result' }; fail += s.fail; inc += s.inconclusive; rows += s.rows; }
  const ok = fail === 0 && (tier !== 'rc' || inc === 0) && rows > 0;
  const warn = tier !== 'rc' && inc ? ' (inconclusive is a warning on the item tier)' : '';
  return { ok, note: `A/B: ${fail} fail, ${inc} inconclusive of ${rows} rows${warn}` };
}
