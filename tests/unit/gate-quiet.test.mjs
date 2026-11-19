// TS-2: prebuild pause decisions, quiet window, noisy-rep rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pauseAction, inQuietWindow, repNoise } from '../../scripts/lib/gate-quiet.mjs';

test('pause: take when absent, leave when someone else made it, refuse when ours is stale', () => {
  assert.equal(pauseAction({ pauseExists: false, ours: false, ageH: 0 }), 'take');
  assert.equal(pauseAction({ pauseExists: true, ours: false, ageH: 50 }), 'leave');
  assert.equal(pauseAction({ pauseExists: true, ours: true, ageH: 1 }), 'leave');
  assert.equal(pauseAction({ pauseExists: true, ours: true, ageH: 7 }), 'refuse');
});

test('quiet window is 01:00 to 05:00 Chicago', () => {
  assert.equal(inQuietWindow(new Date('2026-11-19T08:00:00Z')), true);  // 02:00 CST
  assert.equal(inQuietWindow(new Date('2026-11-19T12:00:00Z')), false); // 06:00 CST
  assert.equal(inQuietWindow(new Date('2026-11-19T06:30:00Z')), false); // 00:30 CST
});

test('rep noise: load above 2.0 waits up to 60 s then runs flagged noisy', () => {
  assert.deepEqual(repNoise(0.5, 0), { wait: false, noisy: false });
  assert.deepEqual(repNoise(2.5, 10), { wait: true, noisy: false });
  assert.deepEqual(repNoise(2.5, 60), { wait: false, noisy: true });
});

// TS-12: the second suite starts only with 4 GB or more available.
import { memAvailableGb, sideBySide } from '../../scripts/lib/gate-quiet.mjs';
test('memAvailableGb reads /proc/meminfo, sideBySide needs 4 GB', () => {
  const t = 'MemTotal:       19900000 kB\nMemFree:          100000 kB\nMemAvailable:    4300000 kB\n';
  assert.ok(Math.abs(memAvailableGb(t) - 4.10) < 0.05);
  assert.equal(sideBySide(t), true);
  assert.equal(sideBySide('MemAvailable:    3000000 kB\n'), false);
  assert.equal(sideBySide('garbage'), false);
});
