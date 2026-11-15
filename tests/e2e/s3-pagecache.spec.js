const { test, expect } = require('@playwright/test');
const { SETUP, setup } = require('./s3-helpers');

// S3 4.4: cached rewritten pages. First visit stores the page, the second shows it before the network answers.
const O = 'https://pc.test';
const DOC = (t) => `<html><head><title>${t}</title></head><body><h1 id="h">${t}</h1><p>text</p></body></html>`;
const HEAD = { 'content-type': 'text/html', 'cache-control': 'max-age=300' };

async function visit(page, url) {
  await page.evaluate((u) => { window.LB_go(u); }, url);
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.load != null; }, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
const frameDoc = async (page, js) => (await (await page.locator('#frame').elementHandle()).contentFrame()).evaluate(js);

// First visit in this page load, then a fresh app load (empty session memory), so only IndexedDB carries over.
async function primed(page, body) {
  const errors = await setup(page);
  await page.evaluate(([o, h, b]) => { __respond(o + '/p', { headers: h, body: b }); }, [O, HEAD, body]);
  await visit(page, O + '/p');
  await expect.poll(() => page.evaluate(() => LB_pc.kv.count())).toBe(1);
  await page.reload();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  const no = page.locator('#lbRelayNo');
  if (await no.isVisible().catch(() => false)) await no.click();
  await page.evaluate(SETUP);
  await page.evaluate(() => LB_pc.kv.open());
  return errors;
}

test('page cache: a repeat visit shows the stored page at once and an unchanged document does nothing more', async ({ page }) => {
  const errors = await primed(page, DOC('One'));
  await page.evaluate(([o, h, b]) => { __respond(o + '/p', { headers: h, body: b, delay: 2500 }); }, [O, HEAD, DOC('One')]);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/p');
  const m = await page.evaluate(() => new Promise((res) => {
    const t0 = performance.now();
    const iv = setInterval(() => { const c = window.__lbPerf.cur; if ((c && c.marks.shown != null) || performance.now() - t0 > 2000) { clearInterval(iv); res({ ...(c ? c.marks : {}) }); } }, 10);
  }));
  expect(m.shown).toBeLessThan(1500);
  await expect.poll(() => frameDoc(page, 'document.title')).toBe('One');
  expect(errors).toEqual([]);
});

test('page cache: a changed document is swapped in when the member has not touched the page', async ({ page }) => {
  await primed(page, DOC('One'));
  await page.evaluate(async ([o, h, b]) => {
    const key = LB_pc.key(o + '/p'); const v = await LB_pc.kv.get(key);
    v.docSig = 'old'; await LB_cache.clearAll(); await LB_pc.kv.put(key, v, 100);   // the response cache must not answer with the old body
    __respond(o + '/p', { headers: h, body: b, delay: 600 });
  }, [O, HEAD, DOC('Two')]);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/p');
  await expect.poll(() => frameDoc(page, 'document.title'), { timeout: 15000 }).toBe('One');
  await expect.poll(() => frameDoc(page, 'document.title'), { timeout: 15000 }).toBe('Two');
  await expect(page.locator('#lbPageChip')).toHaveCount(0);
});

test('page cache: after a touch the new version waits behind an "Updated, reload" chip', async ({ page }) => {
  await primed(page, DOC('One'));
  await page.evaluate(async ([o, h, b]) => {
    const key = LB_pc.key(o + '/p'); const v = await LB_pc.kv.get(key);
    v.docSig = 'old'; await LB_cache.clearAll(); await LB_pc.kv.put(key, v, 100);   // the response cache must not answer with the old body
    __respond(o + '/p', { headers: h, body: b, delay: 1500 });
  }, [O, HEAD, DOC('Two')]);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/p');
  await expect.poll(() => frameDoc(page, 'document.title')).toBe('One');
  await page.waitForTimeout(300);
  await (await page.locator('#frame').elementHandle()).contentFrame().then((f) => f.evaluate(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))));
  await expect(page.locator('#lbPageChip')).toBeVisible({ timeout: 15000 });
  expect(await frameDoc(page, 'document.title')).toBe('One');
  await page.locator('#lbRelayNo').click({ timeout: 1500 }).catch(() => {});
  await page.locator('#lbPageChip').click();
  await expect.poll(() => frameDoc(page, 'document.title')).toBe('Two');
});

test('page cache: nothing is stored without explicit freshness, and features.pageCache=false stores nothing', async ({ page }) => {
  await setup(page);
  await page.evaluate(([o, b]) => { __respond(o + '/q', { headers: { 'content-type': 'text/html' }, body: b }); }, [O, DOC('NoFresh')]);
  await visit(page, O + '/q');
  expect(await page.evaluate(() => LB_pc.kv.count())).toBe(0);
});

test('page cache off by switch', async ({ page }) => {
  await page.route('**/version.json', (r) => r.fulfill({ contentType: 'application/json', body: '{"version":"x","sha":"abc","features":{"ownRelay":true,"pageCache":false}}' }));
  await setup(page);
  await page.evaluate(async ([o, h, b]) => { await window.LB_featuresReady; __respond(o + '/p', { headers: h, body: b }); }, [O, HEAD, DOC('One')]);
  await visit(page, O + '/p');
  expect(await page.evaluate(() => LB_pc.kv.count())).toBe(0);
});

test('page cache: a stored page never holds blob: script URLs (L6)', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(([o, h]) => {
    __respond(o + '/q', { headers: h, body: '<html><head><title>S</title><script src="/s.js"></script></head><body>x</body></html>' });
    __respond(o + '/s.js', { headers: { 'content-type': 'application/javascript' }, body: 'window.__ranS=1;' });
  }, [O, HEAD]);
  await visit(page, O + '/q');
  await expect.poll(() => page.evaluate(() => LB_pc.kv.count())).toBe(1);
  const html = await page.evaluate(async (o) => (await LB_pc.kv.get(LB_pc.key(o + '/q'))).html, O);
  expect(html).toContain('data-original-src');
  expect(html).not.toMatch(/src="blob:/);
  expect(html).toMatch(/src="data:text\/javascript/);
  expect(errors).toEqual([]);
});
