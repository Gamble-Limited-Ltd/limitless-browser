const { test, expect } = require('@playwright/test');
const { setup } = require('./s3-helpers');

// 1.2 N7: hover (100 ms) on a same-site link prefetches its document; the click takes that response.
const O = 'https://pf.test';
const H = { 'content-type': 'text/html' };
const DOC = (t, links = '') => `<html><head><title>${t}</title></head><body><h1>${t}</h1>${links}</body></html>`;
const LINKS = '<a id="next" href="/next">n</a> <a id="far" href="https://other.test/x">f</a> <a id="out" href="/account/logout">o</a> <a id="act" href="/p2?action=delete&id=1">a</a>';

async function open(page) {
  const errors = await setup(page);
  await page.evaluate(([o, h, home, next]) => {
    __respond(o + '/p', { headers: h, body: home });
    __respond(o + '/next', { headers: h, body: next });
    __respond('https://other.test/x', { headers: h, body: 'x' });
    __respond(o + '/account/logout', { headers: h, body: 'x' });
    __respond(o + '/p2?action=delete&id=1', { headers: h, body: 'x' });
  }, [O, H, DOC('Home', LINKS), DOC('Next')]);
  await page.evaluate((u) => { window.LB_go(u); }, O + '/p');
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.load != null; }, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return errors;
}
const fr = (page) => page.frameLocator('#frame');
const hover = async (page, id, ms) => { await fr(page).locator('#' + id).hover(); await page.waitForTimeout(ms); await page.mouse.move(0, 0); };
const nextCount = (page) => page.evaluate(() => __count(/pf\.test\/next$/));

test('hover prefetch: 100 ms hover on a same-site link fetches it once, the click reuses it', async ({ page }) => {
  const errors = await open(page);
  await hover(page, 'next', 400);
  expect(await nextCount(page)).toBe(1);
  await fr(page).locator('#next').click();
  await expect.poll(() => fr(page).locator('h1').textContent()).toBe('Next');
  expect(await nextCount(page)).toBe(1);
  expect(await page.evaluate(() => LB_pf.size())).toBe(0);
  expect(errors).toEqual([]);
});

test('hover prefetch: a short hover, other sites and action-looking URLs fetch nothing', async ({ page }) => {
  await open(page);
  await hover(page, 'next', 30);
  await hover(page, 'far', 400);
  await hover(page, 'out', 400);
  await hover(page, 'act', 400);
  expect(await page.evaluate(() => __count(/pf\.test\/next$|other\.test|logout|action=/))).toBe(0);
});

test('hover prefetch: Data saver, the Ordinal cap and the switch each stop it', async ({ page }) => {
  await open(page);
  const id = await page.evaluate(() => localStorage.getItem('limitless:inst:v1'));
  await page.evaluate((i) => localStorage.setItem(i + ':limitless:datasaver:v1', '1'), id);
  await hover(page, 'next', 400);
  await page.evaluate((i) => localStorage.removeItem(i + ':limitless:datasaver:v1'), id);
  await page.evaluate(() => { window.LB_member = { membership: 'on', plan: { tier: 'ordinal', limits: { speedMbps: 5 } } }; });
  await hover(page, 'next', 400);
  await page.evaluate(() => { window.LB_member = null; window.LB_features.hoverPrefetch = false; });
  await hover(page, 'next', 400);
  expect(await nextCount(page)).toBe(0);
  await page.evaluate(() => { window.LB_features.hoverPrefetch = true; });
  await hover(page, 'next', 400);
  expect(await nextCount(page)).toBe(1);
});

test('hover prefetch: a click while the prefetch still waits in a busy queue is not held behind the tail (the navigation drops the tab's queue)', async ({ page }) => {
  await open(page);
  // fill every slot and queue a long tail of ordinary requests ahead of the lowest-priority prefetch
  await page.evaluate(() => {
    for (let i = 0; i < 120; i++) { const u = 'https://pf.test/busy' + i; __respond(u, { body: 'b', delay: 2500 }); window.LB_queueFetch(u).catch(() => {}); }
  });
  await hover(page, 'next', 150);
  const t0 = Date.now();
  await fr(page).locator('#next').click();
  await expect.poll(() => fr(page).locator('h1').textContent(), { timeout: 15000 }).toBe('Next');
  expect(Date.now() - t0).toBeLessThan(4500);   // one busy round, not the whole tail
  expect(await nextCount(page)).toBe(1);
});
