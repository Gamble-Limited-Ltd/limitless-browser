const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { boot, LEGACY_FEATURES } = require('./helpers');

// S8 downloads panel (docs/1.0/SPEED.md 6, PLAN.md S8 card). A stubbed libcurl session (window.LB_net.curl) serves files with
// Content-Length, Accept-Ranges and a chunked stream, so pause/resume (HTTP Range), retry, cancel, early refusal and the stop at the
// limit are all exercised without a network. Plan limits come from window.LB_member (the shape /_lb/me gives).
const MB = 1024 * 1024;
const STUB = `
  window.__log = [];
  window.__files = {};
  window.__pulled = 0;
  // __files[url] = {size, ranges (default true), noLength, delay (ms per 16 KB chunk), failAfter: [bytes per attempt], fail: n attempts always fail}
  const byteAt = (i) => (i * 31 + 7) & 255;
  window.__expected = (size) => { const b = new Uint8Array(size); for (let i = 0; i < size; i++) b[i] = byteAt(i); return b; };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url, o) {
      const f = window.__files[url];
      const h = {}; for (const [k, v] of Object.entries(o.headers || {})) h[k.toLowerCase()] = v;
      window.__log.push({ url, range: h.range || null });
      if (o.signal && o.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!f) return { status: 404, headers: new Headers(), body: null, arrayBuffer: async () => new ArrayBuffer(0) };
      const n = window.__log.filter((x) => x.url === url).length;
      let start = 0, status = 200; const headers = { 'content-type': 'application/octet-stream' };
      if (f.ranges !== false) headers['accept-ranges'] = 'bytes';
      const m = (h.range || '').match(/bytes=(\\d+)-/);
      if (m && f.ranges !== false) { start = +m[1]; status = 206; headers['content-range'] = 'bytes ' + start + '-' + (f.size - 1) + '/' + f.size; }
      if (!f.noLength) headers['content-length'] = String(f.size - start);
      const stopAt = f.fail && n <= f.fail ? start + 1000 : (f.failAfter && f.failAfter[n - 1] != null ? start + f.failAfter[n - 1] : Infinity);
      let pos = start;
      const body = new ReadableStream({
        async pull(c) {
          if (o.signal && o.signal.aborted) return c.error(new DOMException('Aborted', 'AbortError'));
          if (f.delay) await new Promise((r) => setTimeout(r, f.delay));
          if (o.signal && o.signal.aborted) return c.error(new DOMException('Aborted', 'AbortError'));
          if (pos >= stopAt) return c.error(new TypeError('Request failed with error code 56: Failure when receiving data from the peer'));
          if (pos >= f.size) return c.close();
          const end = Math.min(pos + 16384, f.size, stopAt);
          const b = new Uint8Array(end - pos); for (let i = 0; i < b.length; i++) b[i] = byteAt(pos + i);
          pos = end; window.__pulled += b.length; c.enqueue(b);
        },
      });
      return { status, headers: new Headers(headers), body, arrayBuffer: async () => new ArrayBuffer(0) };
    },
  };
  window.__member = (tier, lim, extra) => { window.LB_member = { membership: 'on', plan: Object.assign({ tier, limits: Object.assign({ downloadMbPerFile: 0, downloadsPerDay: 0 }, lim), plansOpen: true }, extra || {}) }; };
  window.__wait = async (id, st, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 8000)) { const it = LB_downloads.items().find((x) => x.id === id); if (it && (Array.isArray(st) ? st : [st]).includes(it.status)) return it; await new Promise((r) => setTimeout(r, 20)); } return LB_downloads.items().find((x) => x.id === id); };
`;
const O = 'https://dl.test';

async function setup(page, opts) {
  const errors = await boot(page, opts);
  await page.evaluate(STUB);
  await page.evaluate(() => { LB_downloads.cfg.backoff = [20, 20, 20]; LB_downloads.ls.removeItem('limitless:dlcount:v1'); LB_downloads.ls.removeItem('limitless:datasaver:v1'); });
  return errors;
}
const files = (page, spec) => page.evaluate((s) => Object.assign(window.__files, s), spec);

test.describe('downloads panel (S8)', () => {
  test('queue, progress and save through a blob link', async ({ page }) => {
    const errors = await setup(page);
    await files(page, { [O + '/a.bin']: { size: 200000, delay: 5 } });
    await page.evaluate(() => LB_downloads.open());
    await expect(page.locator('#lbDl')).toBeVisible();
    const dl = page.waitForEvent('download');
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/a.bin');
    await expect(page.locator('#lbDl .lb-dl-row')).toHaveCount(1);
    await expect(page.locator('#lbDl .lb-dl-row [role=progressbar]')).toBeVisible();
    const d = await dl;
    expect(d.suggestedFilename()).toBe('a.bin');
    const got = fs.readFileSync(await d.path());
    expect(got.length).toBe(200000);
    expect(Buffer.compare(got, Buffer.from(await page.evaluate(() => Array.from(__expected(200000)))))).toBe(0);
    const it = await page.evaluate((i) => __wait(i, 'done'), id);
    expect(it.status).toBe('done');
    expect(it.got).toBe(200000);
    await expect(page.locator('#lbDl .lb-dl-row')).toContainText('Saved');
    expect(errors).toEqual([]);
  });

  test('pause and resume with an HTTP Range request, bytes intact', async ({ page }) => {
    await setup(page);
    await files(page, { [O + '/p.bin']: { size: 400000, delay: 15 } });
    const dl = page.waitForEvent('download');
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/p.bin');
    await page.waitForFunction((i) => (LB_downloads.items().find((x) => x.id === i) || {}).got > 40000, id);
    await page.evaluate((i) => LB_downloads.pause(i), id);
    const mid = await page.evaluate((i) => __wait(i, 'paused'), id);
    expect(mid.status).toBe('paused');
    expect(mid.got).toBeGreaterThan(0);
    expect(mid.got).toBeLessThan(400000);
    await page.evaluate((i) => LB_downloads.resume(i), id);
    const d = await dl;
    const got = fs.readFileSync(await d.path());
    expect(got.length).toBe(400000);
    expect(Buffer.compare(got, Buffer.from(await page.evaluate(() => Array.from(__expected(400000)))))).toBe(0);
    const log = await page.evaluate(() => __log.filter((x) => /p\.bin/.test(x.url)));
    expect(log[0].range).toBeNull();
    expect(log[1].range).toBe('bytes=' + mid.got + '-');
  });

  test('a server without Accept-Ranges restarts from zero on resume', async ({ page }) => {
    await setup(page);
    await files(page, { [O + '/n.bin']: { size: 150000, delay: 15, ranges: false } });
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/n.bin');
    await page.waitForFunction((i) => (LB_downloads.items().find((x) => x.id === i) || {}).got > 20000, id);
    await page.evaluate((i) => LB_downloads.pause(i), id);
    await page.evaluate((i) => __wait(i, 'paused'), id);
    await page.evaluate((i) => LB_downloads.resume(i), id);
    const it = await page.evaluate((i) => __wait(i, 'done'), id);
    expect(it.status).toBe('done');
    expect(it.got).toBe(150000);
    expect(await page.evaluate(() => __log.filter((x) => /n\.bin/.test(x.url)).map((x) => x.range))).toEqual([null, null]);
  });

  test('a dropped connection retries with backoff and continues by Range; after the retries run out Retry works', async ({ page }) => {
    await setup(page);
    await files(page, { [O + '/r.bin']: { size: 100000, failAfter: [30000] } });
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/r.bin');
    const it = await page.evaluate((i) => __wait(i, 'done'), id);
    expect(it.status).toBe('done');
    expect(it.got).toBe(100000);
    const log = await page.evaluate(() => __log.filter((x) => /r\.bin/.test(x.url)));
    expect(log.length).toBe(2);
    expect(log[1].range).toMatch(/^bytes=\d+-$/);
    // hard failure: every attempt fails, then the file is fixed and the Retry button is used
    await files(page, { [O + '/h.bin']: { size: 60000, fail: 99 } });
    const id2 = await page.evaluate((u) => LB_downloads.add(u), O + '/h.bin');
    const bad = await page.evaluate((i) => __wait(i, 'error'), id2);
    expect(bad.status).toBe('error');
    expect(bad.note).toMatch(/connection|try again/i);
    await files(page, { [O + '/h.bin']: { size: 60000 } });
    await page.evaluate(() => LB_downloads.open());
    await page.locator('#lbDl .lb-dl-row', { hasText: 'h.bin' }).getByRole('button', { name: 'Retry' }).click();
    const ok = await page.evaluate((i) => __wait(i, 'done'), id2);
    expect(ok.status).toBe('done');
  });

  test('cancel stops the transfer and saves nothing', async ({ page }) => {
    await setup(page);
    await files(page, { [O + '/c.bin']: { size: 800000, delay: 20 } });
    let saved = 0; page.on('download', () => saved++);
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/c.bin');
    await page.waitForFunction((i) => (LB_downloads.items().find((x) => x.id === i) || {}).got > 20000, id);
    await page.evaluate(() => LB_downloads.open());
    await page.locator('#lbDl .lb-dl-row', { hasText: 'c.bin' }).getByRole('button', { name: 'Cancel' }).click();
    const it = await page.evaluate((i) => __wait(i, 'cancelled'), id);
    expect(it.status).toBe('cancelled');
    const pulled = await page.evaluate(() => __pulled);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __pulled)).toBe(pulled);
    expect(saved).toBe(0);
  });

  test('early refusal from Content-Length: no body is read, plain message and the plans link', async ({ page }) => {
    await setup(page);
    await files(page, { [O + '/big.bin']: { size: 20 * MB } });
    await page.evaluate(() => { __member('ordinal', { downloadMbPerFile: 10, downloadsPerDay: 10 }); LB_downloads.open(); });
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/big.bin');
    const it = await page.evaluate((i) => __wait(i, 'refused'), id);
    expect(it.status).toBe('refused');
    expect(it.note).toContain('10 MB');
    expect(await page.evaluate(() => __pulled)).toBeLessThanOrEqual(16384);
    const row = page.locator('#lbDl .lb-dl-row', { hasText: 'big.bin' });
    await expect(row).toContainText('10 MB');
    await expect(row.getByRole('link', { name: /plans/i })).toHaveAttribute('href', /^https:\/\/hall\.taps-holdings\.org/);
    expect(await page.evaluate(() => LB_downloads.ls.getItem('limitless:dlcount:v1'))).toBeNull();
  });

  test('without a length the transfer stops at the limit with a note', async ({ page }) => {
    await setup(page);
    await files(page, { [O + '/u.bin']: { size: 3 * MB, noLength: true } });
    await page.evaluate(() => __member('ordinal', { downloadMbPerFile: 1, downloadsPerDay: 10 }));
    let saved = 0; page.on('download', () => saved++);
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/u.bin');
    const it = await page.evaluate((i) => __wait(i, ['refused', 'error', 'done']), id);
    expect(it.status).toBe('refused');
    expect(it.note).toMatch(/stopped at 1 MB/i);
    expect(await page.evaluate(() => __pulled)).toBeLessThan(MB + 40000);
    expect(saved).toBe(0);
  });

  test('anything over 2 GB is refused, even for a plan with no per-file limit', async ({ page }) => {
    await setup(page);
    await files(page, { [O + '/huge.iso']: { size: 2 * 1024 * MB + 1 } });
    await page.evaluate(() => __member('executive', { downloadMbPerFile: 0 }));
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/huge.iso');
    const it = await page.evaluate((i) => __wait(i, 'refused'), id);
    expect(it.status).toBe('refused');
    expect(it.note).toContain('2 GB');
    expect(await page.evaluate(() => __pulled)).toBeLessThanOrEqual(16384);
  });

  test('Ordinal daily count: the third download of a 2 a day plan is refused', async ({ page }) => {
    await setup(page);
    await files(page, { [O + '/1.bin']: { size: 1000 }, [O + '/2.bin']: { size: 1000 }, [O + '/3.bin']: { size: 1000 } });
    await page.evaluate(() => __member('ordinal', { downloadMbPerFile: 10, downloadsPerDay: 2 }));
    for (const n of [1, 2]) {
      const id = await page.evaluate((u) => LB_downloads.add(u), O + '/' + n + '.bin');
      expect((await page.evaluate((i) => __wait(i, 'done'), id)).status).toBe('done');
    }
    const id3 = await page.evaluate((u) => LB_downloads.add(u), O + '/3.bin');
    const it = await page.evaluate((i) => __wait(i, 'refused'), id3);
    expect(it.status).toBe('refused');
    expect(it.note).toMatch(/2 downloads a day/);
    expect(JSON.parse(await page.evaluate(() => LB_downloads.ls.getItem('limitless:dlcount:v1'))).n).toBe(2);
    expect(await page.evaluate(() => __log.filter((x) => /3\.bin/.test(x.url)).length)).toBe(0);
    // a paid plan (0 = no count) is not limited by the counter
    await page.evaluate(() => __member('cardinal', { downloadMbPerFile: 25, downloadsPerDay: 0 }));
    const id4 = await page.evaluate((u) => LB_downloads.add(u), O + '/3.bin');
    expect((await page.evaluate((i) => __wait(i, 'done'), id4)).status).toBe('done');
  });

  test('Data saver runs one download at a time, otherwise two', async ({ page }) => {
    await setup(page);
    await files(page, { [O + '/s1.bin']: { size: 200000, delay: 30 }, [O + '/s2.bin']: { size: 200000, delay: 30 }, [O + '/s3.bin']: { size: 200000, delay: 30 } });
    await page.evaluate(() => { for (const n of [1, 2, 3]) LB_downloads.add('https://dl.test/s' + n + '.bin'); });
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => LB_downloads.items().filter((x) => x.status === 'active').length)).toBe(2);
    await page.evaluate(() => { for (const x of LB_downloads.items()) LB_downloads.cancel(x.id); LB_downloads.ls.setItem('limitless:datasaver:v1', '1'); for (const n of [1, 2]) LB_downloads.add('https://dl.test/s' + n + '.bin'); });
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => LB_downloads.items().filter((x) => x.status === 'active').length)).toBe(1);
    expect(await page.evaluate(() => LB_downloads.items().filter((x) => x.status === 'queued').length)).toBe(1);
  });

  test('kill switch: features.downloads false turns the panel and the engine off', async ({ page }) => {
    await setup(page, { features: Object.assign({}, LEGACY_FEATURES, { downloads: false }) });
    await files(page, { [O + '/k.bin']: { size: 1000 } });
    expect(await page.evaluate(() => LB_downloads.enabled())).toBe(false);
    const id = await page.evaluate((u) => LB_downloads.add(u), O + '/k.bin');
    expect(id).toBeNull();
    await page.evaluate(() => LB_downloads.open());
    await expect(page.locator('#lbDl')).toHaveCount(0);
    expect(await page.evaluate(() => __log.length)).toBe(0);
  });

  test('a file the viewer path already fetched obeys the same limits and the daily count', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => __member('ordinal', { downloadMbPerFile: 1, downloadsPerDay: 1 }));
    const r = await page.evaluate(() => [LB_downloads.adopt('https://dl.test/x.zip', 'x.zip', 2 * 1048576), LB_downloads.adopt('https://dl.test/y.zip', 'y.zip', 1000), LB_downloads.adopt('https://dl.test/z.zip', 'z.zip', 1000)]);
    expect(r).toEqual([false, true, false]);
  });

  test('the on default: enabled with no flag', async ({ page }) => {
    await setup(page);
    expect(await page.evaluate(() => LB_downloads.enabled())).toBe(true);
  });
});
