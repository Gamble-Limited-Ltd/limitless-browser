const { test, expect } = require('@playwright/test');
const { SETUP } = require('./s3-helpers');
const { me, bootMember, refreshMe, openSettings } = require('./helpers-ui');

// 1.0 slice/1.0-videoui: video cap, one video at a time, auto Data saver, data meter, per-site report.
const O = 'https://sl.test';
const HTML = (head, body) => `<html><head><title>T</title>${head || ''}</head><body style="margin:0">${body || ''}</body></html>`;
const PLAY_STUB = `<script>
  HTMLMediaElement.prototype.play = function () { Object.defineProperty(this, 'paused', { value: false, configurable: true }); this.dispatchEvent(new Event('play')); return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () { if (this.paused) return; Object.defineProperty(this, 'paused', { value: true, configurable: true }); this.dispatchEvent(new Event('pause')); };
</script>`;
const cardinal = (limits, plan) => me({ tier: 'cardinal' }, { tier: 'cardinal', limits: { relay: true, weeklyGb: 12, ...limits }, ...plan });

async function setup(page, member) {
  const errors = await bootMember(page, member);
  await page.evaluate(SETUP);
  await page.evaluate(() => { window.LB_features.ytBlock = false; });   // K2 blocks YouTube; these tests exercise the dormant YouTube player cap, which a ytBlock=false build still runs
  return errors;
}
async function load(page, url, html) {
  await page.evaluate(([u, h]) => { __respond(u, { headers: { 'content-type': 'text/html' }, body: h }); window.LB_go(u); }, [url, html]);
  await page.waitForFunction(() => { const c = window.__lbPerf.cur; return c && c.marks.load != null; }, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
const fr = async (page) => (await (await page.locator('#frame').elementHandle()).contentFrame());
const YT = `<script>
  window.__q = []; var p = document.createElement('div'); p.id = 'movie_player';
  p.setPlaybackQualityRange = function (a, b) { window.__q.push([a, b]); }; p.getPlaybackQuality = function () { return 'hd1080'; };
  p.setPlaybackQuality = function (q) { window.__q.push(['set', q]); }; p.addEventListener = function () {};
  document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(p); });
</script>`;

test('video cap: YouTube player is limited to the plan, note shows once per session', async ({ page }) => {
  const errors = await setup(page, cardinal({ videoMaxP: 720 }));
  await load(page, 'https://www.youtube.com/watch?v=1', HTML(YT, '<h1>yt</h1>'));
  const f = await fr(page);
  await expect.poll(() => f.evaluate(() => window.__q.length)).toBeGreaterThan(0);
  expect(await f.evaluate(() => window.__q)).toEqual(expect.arrayContaining([['tiny', 'hd720'], ['set', 'hd720']]));
  await expect(page.locator('#lbVideoNote')).toHaveText('Video is limited to 720p on your plan.');
  await page.locator('#lbVideoNote button').click();
  await load(page, 'https://www.youtube.com/watch?v=2', HTML(YT, '<h1>yt2</h1>'));
  await expect.poll(async () => (await fr(page)).evaluate(() => window.__q.length)).toBeGreaterThan(0);
  await expect(page.locator('#lbVideoNote')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('video cap: nothing for cap 0 (Executive) or with the switch off', async ({ page }) => {
  await setup(page, cardinal({ videoMaxP: 0 }));
  await load(page, 'https://www.youtube.com/watch?v=1', HTML(YT, ''));
  await page.waitForTimeout(2200);
  expect(await (await fr(page)).evaluate(() => window.__q.length)).toBe(0);
  await expect(page.locator('#lbVideoNote')).toHaveCount(0);
  await page.evaluate(() => { window.LB_features.videoCap = false; LB_member.plan.limits.videoMaxP = 480; });
  expect(await page.evaluate(() => LB_videoConfig('https://www.youtube.com/').cap)).toBe(0);
  expect(await page.evaluate(() => { window.LB_features.videoCap = true; return LB_videoConfig('https://www.youtube-nocookie.com/embed/x'); })).toEqual({ cap: 480, one: true, yt: true });
});

test('video cap: a plain video prefers the largest source at or below the cap', async ({ page }) => {
  await setup(page, cardinal({ videoMaxP: 480 }));
  const v = (srcs) => `<video id="v" controls>${srcs}</video>`;
  await load(page, O + '/a', HTML('', v('<source src="https://v.test/a.mp4" res="1080"><source src="https://v.test/b.mp4" label="720p"><source id="pick" src="https://v.test/c_480p.mp4"><source src="https://v.test/d_360p.mp4">')));
  const first = (await fr(page)).locator('#v source').first();
  await expect.poll(() => first.getAttribute('id')).toBe('pick');
  // all above the cap: the smallest
  await load(page, O + '/b', HTML('', v('<source src="https://v.test/a.mp4" size="1080"><source src="https://v.test/b.mp4" size="720">')));
  const f2 = (await fr(page)).locator('#v source').first();
  await expect.poll(() => f2.getAttribute('size')).toBe('720');
});

test('one video at a time: muted offscreen autoplay waits for the view; a clicked video keeps playing', async ({ page }) => {
  await setup(page, cardinal({}));
  await load(page, O + '/o', HTML(PLAY_STUB, '<div style="height:3000px"></div><video id="auto" muted autoplay style="width:200px;height:100px"></video><div style="height:3000px"></div>'
    + '<script>document.addEventListener("DOMContentLoaded", function(){ document.getElementById("auto").play(); });</script>'));
  const f = await fr(page);
  await expect.poll(() => f.evaluate(() => document.getElementById('auto').paused)).toBe(true);
  await f.evaluate(() => document.getElementById('auto').scrollIntoView());
  await expect.poll(() => f.evaluate(() => document.getElementById('auto').paused)).toBe(false);
  await f.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => f.evaluate(() => document.getElementById('auto').paused)).toBe(true);
  // a video the member clicked is never paused by scrolling
  await load(page, O + '/c', HTML(PLAY_STUB, '<video id="u" muted style="width:300px;height:200px"></video><div style="height:4000px"></div>'));
  const g = await fr(page);
  await g.locator('#u').click();
  await g.evaluate(() => document.getElementById('u').play());
  await g.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(500);
  expect(await g.evaluate(() => document.getElementById('u').paused)).toBe(false);
});

test('one video at a time: going to the background pauses media, also in iframes, and the tab is not slept at once', async ({ page }) => {
  await setup(page, cardinal({}));
  await load(page, O + '/p', HTML(PLAY_STUB, '<video id="m"></video>'));
  await (await fr(page)).evaluate(() => document.getElementById('m').play());
  await page.evaluate(() => { window.__pm = 0; const o = window.LB_pauseMedia; window.LB_pauseMedia = (d) => { window.__pm++; return o(d); }; });
  await page.locator('#newTab').click();
  await load(page, O + '/q', HTML('', 'two'));
  expect(await page.evaluate(() => window.__pm)).toBe(1);
  const st = await page.evaluate(() => LB_sleep.state());
  expect(st.find((t) => t.id === 1)).toMatchObject({ media: true, sleeping: false });
  expect(await page.evaluate(() => LB_sleep.run(Date.now() + 11 * 60000, 10))).toBe(0);
  // recursion into an embedded player
  const n = await page.evaluate(() => new Promise((res) => {
    const f = document.createElement('iframe'); f.srcdoc = '<body></body>'; document.body.appendChild(f);
    f.onload = () => { let c = 0; const v = f.contentDocument.createElement('video'); v.pause = () => c++; f.contentDocument.body.appendChild(v); window.LB_pauseMedia(document); f.remove(); res(c); };
  }));
  expect(n).toBe(1);
});

const capMe = (used, over = {}) => cardinal({ videoMaxP: 720 }, { cap: { usedGb: used, capGb: 12, period: 'week', ...over }, download: { usedGb: 1.5, capGb: 10 } });

test('auto Data saver: turns on at 90 % once per period and stays off after the member turns it off', async ({ page }) => {
  let cur = capMe(8);
  await setup(page, () => cur);
  expect(await page.evaluate(() => window.LB_ls.getItem('limitless:datasaver:v1'))).not.toBe('1');
  cur = capMe(11);
  await refreshMe(page);
  await expect(page.locator('#lbAutoSaverNote')).toHaveText(/You have used 90 % of this week's allowance, so Data saver is on\. You can turn it off in Settings\./);
  expect(await page.evaluate(() => window.LB_ls.getItem('limitless:datasaver:v1'))).toBe('1');
  await page.locator('#lbAutoSaverNote .lb-ub-x').click();
  await page.evaluate(() => window.LB_ls.setItem('limitless:datasaver:v1', '0'));
  cur = capMe(11.5);
  await refreshMe(page);
  expect(await page.evaluate(() => window.LB_ls.getItem('limitless:datasaver:v1'))).toBe('0');
  await expect(page.locator('#lbAutoSaverNote')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('limitless:autosaver:v1')).end > Date.now())).toBe(true);
});

test('auto Data saver: switch off does nothing', async ({ page }) => {
  let cur = capMe(1);
  await setup(page, () => cur);
  await page.evaluate(() => { window.LB_features.autoSaver = false; });
  cur = capMe(12);
  await refreshMe(page);
  expect(await page.evaluate(() => window.LB_ls.getItem('limitless:datasaver:v1'))).not.toBe('1');
});

test('data meter: bars in the menu with progressbar values; hidden for Ordinal', async ({ page }) => {
  await setup(page, capMe(6.2));
  await page.locator('#lbMenuBtn').click();
  const bars = page.locator('#lbMenu [role="progressbar"]');
  await expect(bars).toHaveCount(2);
  await expect(page.locator('#lbMenu .lb-mm-l').first()).toHaveText('Used 6.2 of 12 GB this week');
  await expect(bars.first()).toHaveAttribute('aria-valuenow', '6.2');
  await expect(bars.first()).toHaveAttribute('aria-valuemax', '12');
  await expect(bars.first()).toHaveAttribute('aria-valuemin', '0');
  await expect(page.locator('#lbMenu .lb-mm-l').nth(1)).toHaveText('Downloads 1.5 of 10 GB this month');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.LB_features.dataMeter = false; });
  await page.locator('#lbMenuBtn').click();
  await expect(bars).toHaveCount(0);
});

test('data meter: nothing for Ordinal', async ({ page }) => {
  await setup(page, me({}, { cap: { usedGb: 1, capGb: 2, period: 'week' } }));
  await page.locator('#lbMenuBtn').click();
  await expect(page.locator('#lbMenu [role="progressbar"]')).toHaveCount(0);
  await expect(page.locator('#lbMenu .lb-mm')).toBeHidden();
});

test('site report: bytes per site on the device, top 10 on the Membership page, Clear', async ({ page }) => {
  await setup(page, capMe(1));
  await load(page, O + '/s', HTML('', 'x'));
  await page.evaluate(() => {
    LB_siteBytes('https://www.example.co.uk/a', 3 * 1048576); LB_siteBytes('https://cdn.example.co.uk/b', 1048576);
    LB_siteBytes('https://alice.github.io/x', 1048576); LB_siteBytes('https://a.b.news.com/y', 2097152);
  });
  const rep = await page.evaluate(() => LB_siteReport().map((r) => r.site));
  expect(rep).toEqual(expect.arrayContaining(['example.co.uk', 'alice.github.io', 'news.com', 'sl.test']));
  expect(rep[0]).toBe('example.co.uk');
  await openSettings(page, 'membership');
  const box = page.locator('#lbSiteReport');
  await expect(page.locator('.settings-card:has(#lbSiteReport)')).toContainText('Where your data went');
  await expect(box.locator('dt').first()).toHaveText('example.co.uk');
  await expect(box.locator('dd').first()).toContainText(/4\.0 MB \(\d+ %\)/);
  await expect(box).toContainText('This list stays on this device. Limitless does not send it to us.');
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('limitless:siteusage:v1') || '{"days":{}}').days).length), { timeout: 8000 }).toBe(1);
  await page.locator('#lbSiteClear').click();
  await expect(page.locator('#lbSiteReport')).toContainText('Nothing recorded yet this week.');
  expect(await page.evaluate(() => LB_siteReport().length)).toBe(0);
});

test('site report: 200 sites a day and 31 days are kept', async ({ page }) => {
  await setup(page, capMe(1));
  const out = await page.evaluate(() => {
    for (let i = 0; i < 205; i++) LB_siteBytes('https://s' + i + '.test/', 10);
    return LB_siteReport().length;
  });
  expect(out).toBe(201);
});
