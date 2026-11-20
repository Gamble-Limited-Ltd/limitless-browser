// MS-5 pure logic (docs/1.3/specs/01-measuring.md): monthly transfer percent and alert level.
// Both directions count (Boss, 2026-11-19, decision D7): the RackNerd 5 TB plan is read as 2.5 TB a month of member traffic.
export const LIMIT_BYTES = 5e12; // plan transfer, both directions added
export const WARN_PCT = 70;
export const CRIT_PCT = 90;

/** Percent of the monthly transfer used, from the sampler's meter.json. */
export const meterPct = (m, limit = LIMIT_BYTES) => (((m?.rx || 0) + (m?.tx || 0)) / limit) * 100;

/** 'ok' below 70, 'warn' from 70, 'crit' from 90. */
export const level = (pct) => (pct >= CRIT_PCT ? 'crit' : pct >= WARN_PCT ? 'warn' : 'ok');

/** Kuma push query for a meter: down at warn and crit (the message names the level), up otherwise. */
export function pushQuery(m, limit = LIMIT_BYTES) {
  const pct = meterPct(m, limit), lv = level(pct);
  const gb = Math.round(((m?.rx || 0) + (m?.tx || 0)) / 1e9);
  const msg = `${lv}: ${m?.month || '?'} transfer ${gb} GB of ${limit / 1e9} GB, ${pct.toFixed(1)} percent`;
  return { status: lv === 'ok' ? 'up' : 'down', msg, pct, level: lv };
}

/** Peak CPU percent per container over samples (jsonl objects), for SV-0. */
export function cpuPeaks(samples) {
  const out = {};
  for (const s of samples) for (const c of s.containers || []) {
    const o = (out[c.n] ||= { peak: 0, sum: 0, n: 0, memMbPeak: 0 });
    if (typeof c.cpu === 'number') { o.peak = Math.max(o.peak, c.cpu); o.sum += c.cpu; o.n++; }
    o.memMbPeak = Math.max(o.memMbPeak, c.memMb || 0);
  }
  for (const o of Object.values(out)) { o.avg = o.n ? Math.round((o.sum / o.n) * 100) / 100 : null; delete o.sum; delete o.n; }
  return out;
}
