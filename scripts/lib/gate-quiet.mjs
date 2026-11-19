// TS-2: quiet machine rules for speed steps.
// pauseAction: what to do with ~/.gll-prebuild.pause before a speed step. "ours" = the gate marker exists.
export function pauseAction({ pauseExists, ours, ageH }) {
  if (!pauseExists) return 'take';
  if (ours && ageH > 6) return 'refuse';
  return 'leave';
}

// 01:00 to 05:00 America/Chicago (before the 05:00 rotation prestage).
export function inQuietWindow(d = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(d));
  return h >= 1 && h < 5;
}

// A rep that starts while other jobs keep the CPU more than 35 percent busy waits up to 60 s, then runs flagged noisy.
// (The spec said load1 above 2.0; load1 lags and still holds the previous rep's own work, so every rep waited the full 60 s in the
// first run on 2026-11-19. load1 is still recorded per rep.) busy = 0..1 over a short sample.
export const repNoise = (busy, waitedS) => (busy <= 0.35 ? { wait: false, noisy: false } : waitedS < 60 ? { wait: true, noisy: false } : { wait: false, noisy: true });

// Busy fraction between two /proc/stat texts (first line "cpu user nice system idle iowait ...").
export function cpuBusy(a, b) {
  const f = (t) => { const v = t.split('\n')[0].trim().split(/\s+/).slice(1).map(Number); const idle = v[3] + (v[4] || 0); return { idle, total: v.reduce((x, y) => x + y, 0) }; };
  const x = f(a), y = f(b), dt = y.total - x.total;
  return dt <= 0 ? 0 : 1 - (y.idle - x.idle) / dt;
}

// TS-12: run e2e beside the site suite only when 4 GB or more is available (/proc/meminfo text).
export const memAvailableGb = (meminfo) => { const m = /MemAvailable:\s+(\d+)\s*kB/.exec(meminfo); return m ? Number(m[1]) / 1048576 : 0; };
export const sideBySide = (meminfo) => memAvailableGb(meminfo) >= 4;
