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

// A rep that starts with load1 above 2.0 waits up to 60 s, then runs flagged noisy.
export const repNoise = (load1, waitedS) => (load1 <= 2.0 ? { wait: false, noisy: false } : waitedS < 60 ? { wait: true, noisy: false } : { wait: false, noisy: true });

// TS-12: run e2e beside the site suite only when 4 GB or more is available (/proc/meminfo text).
export const memAvailableGb = (meminfo) => { const m = /MemAvailable:\s+(\d+)\s*kB/.exec(meminfo); return m ? Number(m[1]) / 1048576 : 0; };
export const sideBySide = (meminfo) => memAvailableGb(meminfo) >= 4;
