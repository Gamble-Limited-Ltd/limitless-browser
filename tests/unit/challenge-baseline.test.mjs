// TS-7 challenge class and rate, TS-8 baseline table. Run: node --test tests/unit/
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChallenge, challengeSummary } from '../../scripts/lib/challenge.mjs';
import { baselineMd } from '../../scripts/lib/baseline.mjs';

test('classifyChallenge: card beats vendor beats none', () => {
  assert.equal(classifyChallenge('Human Check: this site asked for a bot-check', '<script src=turnstile>'), 'card');
  assert.equal(classifyChallenge('', '<div class="cf-turnstile"></div>'), 'vendor');
  assert.equal(classifyChallenge('', '<p>hello</p>'), 'none');
  assert.equal(classifyChallenge(undefined, undefined), 'none');
});

test('challengeSummary: per 100 loads, skipped reps are not loads, empty is null', () => {
  const sites = { a: { runs: [{ challenge: 'card' }, { challenge: 'none' }, { challenge: 'none', skipped: true }] }, b: { runs: [{ challenge: 'vendor' }, { challenge: 'none' }] } };
  assert.deepEqual(challengeSummary(sites, 'vps'), { vantage: 'vps', loads: 4, card: 1, vendor: 1, cardPer100: 25, vendorPer100: 25, per100: 50 });
  assert.equal(challengeSummary({}, 'x').per100, null);
});

test('baselineMd: one table per project with medians and n', () => {
  const sp = { sites: { example: { cold: { runs: 7, shown: { median: 1200 }, load: { median: 1500 } }, warm: { shown: { median: 400 }, load: {} } } }, boot: { cold: { runs: 4, interactive: { median: 3900 } }, repeat: { interactive: { median: 2500 } } } };
  const md = baselineMd({ version: '1.3.0', sha: 'abc1234', date: '2026-11-26_0200', harness: 'def5678', speeds: { chromebook: sp } });
  assert.match(md, /^# Baseline 1\.3\.0/);
  assert.match(md, /\| example \| 7 \| 1200 \| 1500 \| 400 \| - \|/);
  assert.match(md, /\| boot .* \| 4 \| 3900 \| - \| 2500 \| - \|/);
});
