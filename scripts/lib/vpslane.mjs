// MS-4 pure logic (docs/1.3/specs/01-measuring.md): month key, time window, GB meter and refuse/stop thresholds.
export const START_GB = 45; // refuse to start at or above this many GB this month
export const STOP_GB = 50; // stop between sites at or above this
const GB = 1e9;

/** Chicago calendar month, "YYYY-MM". */
export function monthKey(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).format(d);
  return p.slice(0, 7);
}

/** True from 22:00 up to (not including) 06:00 Chicago. */
export function inWindow(d = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', hourCycle: 'h23' }).format(d));
  return h >= 22 || h < 6;
}

/** Bytes a run used: usage counter after minus before (never negative; a reset counter counts as 0). */
export const usedBytes = (before, after) => Math.max(0, (after || 0) - (before || 0));

export const monthGb = (meter, d = new Date()) => (meter?.months?.[monthKey(d)] || 0) / GB;
export const mayStart = (meter, d = new Date()) => monthGb(meter, d) < START_GB;
export const mustStop = (meter, runBytes, d = new Date()) => ((meter?.months?.[monthKey(d)] || 0) + runBytes) / GB >= STOP_GB;

/** Returns a new meter with the run's bytes added to its month. */
export function addRun(meter, bytes, d = new Date()) {
  const k = monthKey(d);
  return { months: { ...(meter?.months || {}), [k]: ((meter?.months || {})[k] || 0) + bytes } };
}

/** The gate says the relay is slowed or cut for this member (/_lb/me plan.fallback, plan.cap.over). */
export const throttled = (me) => !!(me?.plan && (me.plan.fallback || me.plan.cap?.over));
