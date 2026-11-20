import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthKey, inWindow, usedBytes, mayStart, mustStop, addRun, throttled } from '../../scripts/lib/vpslane.mjs';

test('month key is Chicago, not UTC', () => {
  assert.equal(monthKey(new Date('2026-12-01T03:00:00Z')), '2026-11'); // still Nov 30 evening in Chicago
  assert.equal(monthKey(new Date('2026-12-01T07:00:00Z')), '2026-12');
});

test('window 22:00 to 06:00 Chicago (CST)', () => {
  const at = (h) => new Date(Date.UTC(2026, 10, 20, h + 6, 0, 0)); // CST = UTC-6
  assert.equal(inWindow(at(21)), false);
  assert.equal(inWindow(at(22)), true);
  assert.equal(inWindow(at(23)), true);
  assert.equal(inWindow(at(0)), true);
  assert.equal(inWindow(at(5)), true);
  assert.equal(inWindow(at(6)), false);
  assert.equal(inWindow(at(12)), false);
});

test('usage delta never negative', () => {
  assert.equal(usedBytes(100, 350), 250);
  assert.equal(usedBytes(500, 100), 0);
  assert.equal(usedBytes(undefined, 7), 7);
});

test('start and stop thresholds, per month', () => {
  const d = new Date('2026-11-20T12:00:00Z');
  const m = { months: { '2026-11': 44.9e9, '2026-10': 60e9 } };
  assert.equal(mayStart(m, d), true);
  assert.equal(mayStart(addRun(m, 0.2e9, d), d), false);
  assert.equal(mayStart({ months: { '2026-10': 60e9 } }, d), true);
  assert.equal(mustStop(m, 5.0e9, d), false);
  assert.equal(mustStop(m, 5.1e9, d), true);
  assert.equal(mustStop(m, 4.9e9, d), false);
  assert.equal(mayStart(null, d), true);
});

test('addRun keeps other months', () => {
  const d = new Date('2026-11-20T12:00:00Z');
  assert.deepEqual(addRun({ months: { '2026-10': 5 } }, 3, d), { months: { '2026-10': 5, '2026-11': 3 } });
});

test('throttled reads fallback and cap', () => {
  assert.equal(throttled({ plan: { fallback: 'brake' } }), true);
  assert.equal(throttled({ plan: { cap: { over: true } } }), true);
  assert.equal(throttled({ plan: { fallback: null, cap: { over: false } } }), false);
  assert.equal(throttled(null), false);
});
