const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// F5: the AST location rewriter runs in a Blob Worker for big scripts, with a synchronous fallback.

const SETUP = `
  window.__big = (n = 500) => {
    const parts = [];
    for (let i = 0; i < n; i++) {
      parts.push('function f' + i + '(){ var a = window.location.href; var b = document.location; var c = self["location"]; location = "x' + i + '"; var s = "location.href inside a string"; /* location in a comment */ return location.search + a + b + c + s; }');
    }
    return parts.join('\\n');
  };
`;

async function setup(page) {
  const errors = await boot(page);
  await page.evaluate(SETUP);
  return errors;
}

test('big scripts are rewritten in a worker and the output equals the synchronous rewrite', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(async () => {
    const src = __big();
    const expected = LB_rewrite.sync(src);
    const got = await LB_rewrite.async(src);
    return { same: got === expected, changed: got !== src, len: src.length, stats: { ...LB_rewrite.stats() }, hasLoc: got.includes('__lbSafe(window).__lbLoc$') };
  });
  expect(r.len).toBeGreaterThan(16 * 1024);
  expect(r.changed).toBe(true);
  expect(r.same).toBe(true);
  expect(r.hasLoc).toBe(true);
  expect(r.stats.worker).toBe(1);
  expect(r.stats.disabled).toBe(false);
  expect(errors).toEqual([]);
});

test('small scripts and scripts without "location" stay synchronous; repeats come from the memo', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    const small = 'var a = window.location.href;';
    const out1 = await LB_rewrite.async(small);
    const plain = 'x'.repeat(40000);
    const out2 = await LB_rewrite.async(plain);
    const big = __big();
    await LB_rewrite.async(big);
    await LB_rewrite.async(big);
    return { out1: out1 === LB_rewrite.sync(small), out2: out2 === plain, stats: { ...LB_rewrite.stats() } };
  });
  expect(r.out1).toBe(true);
  expect(r.out2).toBe(true);
  expect(r.stats.worker).toBe(1);
  expect(r.stats.memoHits).toBe(1);
  expect(r.stats.sync).toBeGreaterThanOrEqual(1);
});

test('when Worker cannot be created: same output, worker disabled for the session', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    window.Worker = function () { throw new Error('workers are blocked'); };
    const a = __big(400), b = __big(401);
    const o1 = await LB_rewrite.async(a);
    const o2 = await LB_rewrite.async(b);
    return { s1: o1 === LB_rewrite.sync(a), s2: o2 === LB_rewrite.sync(b), stats: { ...LB_rewrite.stats() } };
  });
  expect(r.s1).toBe(true);
  expect(r.s2).toBe(true);
  expect(r.stats.disabled).toBe(true);
  expect(r.stats.worker).toBe(0);
  expect(r.stats.fallback).toBeGreaterThanOrEqual(1);
});

test('a worker that never answers times out and falls back; only that worker is replaced (workers stay on)', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    window.Worker = class { constructor() { this.terminated = false; } postMessage() {} terminate() { window.__terminated = true; } addEventListener() {} };
    LB_rewrite.timeoutMs = 150;
    const a = __big(450);
    const t0 = performance.now();
    const o = await LB_rewrite.async(a);
    const ms = performance.now() - t0;
    const o2 = await LB_rewrite.async(__big(451));
    return { same: o === LB_rewrite.sync(a), ms, terminated: !!window.__terminated, same2: o2 === LB_rewrite.sync(__big(451)), stats: { ...LB_rewrite.stats() } };
  });
  expect(r.same).toBe(true);
  expect(r.same2).toBe(true);
  expect(r.ms).toBeGreaterThanOrEqual(140);
  expect(r.terminated).toBe(true);
  expect(r.stats.disabled).toBe(false);
  expect(r.stats.fallback).toBe(2);
});

test('a big script (over 256 KB) that times out is not rewritten on the main thread and not cached', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    window.Worker = class { postMessage() {} terminate() {} addEventListener() {} };
    LB_rewrite.timeoutMs = 50;
    const big = __big(1300);
    const o = await LB_rewrite.async(big);
    const o2 = await LB_rewrite.async(big);
    return { len: big.length, unchanged: o === big && o2 === big, stats: { ...LB_rewrite.stats() } };
  });
  expect(r.len).toBeGreaterThan(256 * 1024);
  expect(r.unchanged).toBe(true);
  expect(r.stats.skipped).toBe(2);
  expect(r.stats.memoHits).toBe(0);
  expect(r.stats.disabled).toBe(false);
});

test('a worker that errors falls back to the synchronous rewrite', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    window.Worker = class {
      constructor() { setTimeout(() => this.onerror && this.onerror(new ErrorEvent('error', { message: 'boom' })), 20); }
      postMessage() {} terminate() {} addEventListener(t, f) { if (t === 'error') setTimeout(() => f(new ErrorEvent('error', { message: 'boom' })), 20); }
    };
    const a = __big(420);
    const o = await LB_rewrite.async(a);
    return { same: o === LB_rewrite.sync(a), stats: { ...LB_rewrite.stats() } };
  });
  expect(r.same).toBe(true);
  expect(r.stats.disabled).toBe(true);
});

test('the worker kill switch (features.worker = false) keeps everything synchronous', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async () => {
    LB_features.worker = false;
    const a = __big(430);
    const o = await LB_rewrite.async(a);
    return { same: o === LB_rewrite.sync(a), stats: { ...LB_rewrite.stats() } };
  });
  expect(r.same).toBe(true);
  expect(r.stats.worker).toBe(0);
});

// CL-7 (features.rwPool): pool size from the device; one more only under the queue rule; off = fixed 2.
async function poolPeak(page, hc, on, sizeKB, n) {
  await boot(page, { features: { rwPool: on } });
  await page.evaluate(SETUP);
  return page.evaluate(async ({ hc, sizeKB, n }) => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: hc, configurable: true });
    await LB_rewrite.async(__big());
    const jobs = [];
    for (let i = 0; i < n; i++) jobs.push(LB_rewrite.async(__big(Math.ceil(sizeKB * 1024 / 230)) + '\n//' + i));
    await Promise.all(jobs);
    return LB_rewrite.poolPeak();
  }, { hc, sizeKB, n });
}
test('rwPool: 4 cores or fewer keep the 2 workers; more cores hc-2, max 4', async ({ page }) => {
  await boot(page, { features: { rwPool: true } });
  const cap = (hc) => page.evaluate((hc) => { Object.defineProperty(navigator, 'hardwareConcurrency', { value: hc, configurable: true }); return LB_rewrite.poolCap(); }, hc);
  for (const [hc, want] of [[1, 2], [2, 2], [4, 2], [5, 3], [6, 4], [16, 4]]) expect(await cap(hc)).toBe(want);
});
test('rwPool: workers spawn lazily, one job uses one worker', async ({ page }) => {
  expect(await poolPeak(page, 16, true, 120, 0)).toBe(1);
});
test('rwPool: above 4 cores, 4+ queued scripts of 256 KB or more allow one extra worker', async ({ page }) => {
  expect(await poolPeak(page, 6, true, 300, 8)).toBe(5);
});
test('rwPool: on 4 cores a big-script queue still stays at 2 workers', async ({ page }) => {
  expect(await poolPeak(page, 4, true, 300, 8)).toBe(2);
});
test('rwPool off: the fixed pool of 2', async ({ page }) => {
  expect(await poolPeak(page, 16, false, 120, 12)).toBe(2);
});
