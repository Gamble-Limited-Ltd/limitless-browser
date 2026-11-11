const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

// S1 (1.0): page pipeline. The network is a stub on the libcurl session (window.LB_net.curl) with per-URL delays, so
// these run without a relay. Timings come from window.__lbPerf (ms since the navigation started).

const SETUP = `
  window.__net = { log: [], script: {} };
  // script[url] = {status, headers, body, delay}; unknown URLs answer 404.
  window.__respond = (url, r) => { window.__net.script[url] = r; };
  window.LB_net.curl = {
    active_requests: 0,
    close() {},
    set_connections() {},
    async fetch(url, o) {
      const h = {}; for (const [k, v] of Object.entries(o.headers || {})) h[k.toLowerCase()] = v;
      window.__net.log.push({ url, headers: h, t: performance.now() });
      const r = window.__net.script[url] || { status: 404, headers: {}, body: 'nope' };
      if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
      const bytes = new TextEncoder().encode(r.body);
      return { status: r.status || 200, headers: new Headers(r.headers || {}), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
  window.__count = (re) => window.__net.log.filter((x) => re.test(x.url)).length;
  window.__go = async (u) => { window.LB_go(u); };
  window.__marks = () => { const c = window.__lbPerf.cur; return c ? { ...c.marks } : {}; };
  window.__waitMark = (name, ms) => new Promise((res) => {
    const t0 = performance.now();
    const iv = setInterval(() => { const m = window.__marks(); if (m[name] != null || performance.now() - t0 > ms) { clearInterval(iv); res(m); } }, 20);
  });
`;

async function setup(page, init) {
  const errors = await boot(page, init ? { init } : {});
  await page.evaluate(SETUP);
  return errors;
}

const O = 'https://pipe.test';

test('the page is shown before a slow image finishes', async ({ page }) => {
  const errors = await setup(page);
  const m = await page.evaluate(async (o) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><link rel="stylesheet" href="/a.css"><script src="/a.js"></script></head><body><h1 id="h">hi</h1><img id="i" src="/slow.png"></body></html>' });
    __respond(o + '/a.css', { headers: { 'content-type': 'text/css' }, body: 'h1{color:red}' });
    __respond(o + '/a.js', { headers: { 'content-type': 'application/javascript' }, body: 'window.__ran=1;' });
    __respond(o + '/slow.png', { headers: { 'content-type': 'image/png' }, body: 'x', delay: 4000 });
    await __go(o + '/');
    return await __waitMark('shown', 3500);
  }, O);
  expect(m.shown).toBeDefined();
  expect(m.shown).toBeLessThan(3000);
  expect(errors).toEqual([]);
});

test('features.pipeline=false keeps the serial path: shown waits for the image', async ({ page }) => {
  await setup(page);
  const m = await page.evaluate(async (o) => {
    LB_features.pipeline = false;
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title></head><body><img src="/slow.png"></body></html>' });
    __respond(o + '/slow.png', { headers: { 'content-type': 'image/png' }, body: 'x', delay: 1500 });
    await __go(o + '/');
    return await __waitMark('shown', 6000);
  }, O);
  expect(m.shown).toBeGreaterThanOrEqual(1400);
});

test('css, scripts and an iframe load in parallel, not one stage after another', async ({ page }) => {
  await setup(page);
  const m = await page.evaluate(async (o) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><link rel="stylesheet" href="/a.css"><script src="/a.js"></script><script src="/b.js"></script></head><body><iframe src="/f.html"></iframe></body></html>' });
    __respond(o + '/a.css', { headers: { 'content-type': 'text/css' }, body: 'h1{color:red}', delay: 700 });
    __respond(o + '/a.js', { headers: { 'content-type': 'application/javascript' }, body: 'window.__a=1;', delay: 700 });
    __respond(o + '/b.js', { headers: { 'content-type': 'application/javascript' }, body: 'window.__b=1;', delay: 700 });
    __respond(o + '/f.html', { headers: { 'content-type': 'text/html' }, body: '<html><body>f</body></html>', delay: 700 });
    await __go(o + '/');
    return await __waitMark('shown', 6000);
  }, O);
  // serial stages: css 700 + scripts 700 + iframe 700 = 2100 and more; parallel is about one delay
  expect(m.shown).toBeLessThan(1500);
});

test('script execution order and css order are unchanged', async ({ page }) => {
  await setup(page);
  await page.evaluate(async (o) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>t</title><link rel="stylesheet" href="/1.css"><link rel="stylesheet" href="/2.css"><script src="/a.js"></script><script src="/b.js"></script><script>(window.__order=window.__order||[]).push("inline")</script><script src="/c.js"></script></head><body><p id="p">x</p></body></html>' });
    __respond(o + '/1.css', { headers: { 'content-type': 'text/css' }, body: '#p{color:rgb(1,2,3)}', delay: 400 });
    __respond(o + '/2.css', { headers: { 'content-type': 'text/css' }, body: '#p{color:rgb(4,5,6)}', delay: 50 });
    __respond(o + '/a.js', { headers: { 'content-type': 'application/javascript' }, body: '(window.__order=window.__order||[]).push("a")', delay: 500 });
    __respond(o + '/b.js', { headers: { 'content-type': 'application/javascript' }, body: '(window.__order=window.__order||[]).push("b")', delay: 10 });
    __respond(o + '/c.js', { headers: { 'content-type': 'application/javascript' }, body: '(window.__order=window.__order||[]).push("c")', delay: 200 });
    await __go(o + '/');
    await __waitMark('shown', 6000);
  }, O);
  const fr = page.frameLocator('#frame');
  await expect(fr.locator('#p')).toBeVisible();
  await expect.poll(async () => await page.frames().find((f) => f !== page.mainFrame() && f.url().startsWith('blob:')).evaluate(() => (window.__order || []).join(',')), { timeout: 5000 }).toBe('a,b,inline,c');
  const color = await fr.locator('#p').evaluate((e) => getComputedStyle(e).color);
  expect(color).toBe('rgb(4, 5, 6)');
});

function imgPage(n) {
  let b = '';
  for (let i = 0; i < n; i++) b += '<img id="i' + i + '" src="/img/' + i + '.png" width="300" height="400" style="display:block">';
  return '<html><head><title>t</title></head><body style="margin:0">' + b + '</body></html>';
}

test('lazyImg: images far below the fold are fetched only when scrolled near', async ({ page }) => {
  await setup(page);
  const html = imgPage(60);
  const r = await page.evaluate(async ({ o, html }) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: html });
    for (let i = 0; i < 60; i++) __respond(o + '/img/' + i + '.png', { headers: { 'content-type': 'image/png' }, body: 'x' });
    await __go(o + '/');
    await __waitMark('shown', 6000);
    await new Promise((res) => setTimeout(res, 1500));
    return { early: __count(/\/img\//), last: __count(/\/img\/59\.png/) };
  }, { o: O, html });
  expect(r.early).toBeLessThanOrEqual(30);
  expect(r.last).toBe(0);
  const fr = page.frames().find((f) => f !== page.mainFrame() && f.url().startsWith('blob:'));
  await fr.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => __count(/\/img\/59\.png/)), { timeout: 5000 }).toBe(1);
});

test('features.lazyImg=false: all images are promoted at once', async ({ page }) => {
  await setup(page);
  const html = imgPage(40);
  const r = await page.evaluate(async ({ o, html }) => {
    LB_features.lazyImg = false;
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: html });
    for (let i = 0; i < 40; i++) __respond(o + '/img/' + i + '.png', { headers: { 'content-type': 'image/png' }, body: 'x' });
    await __go(o + '/');
    await __waitMark('shown', 6000);
    await new Promise((res) => setTimeout(res, 1500));
    return { last: __count(/\/img\/39\.png/) };
  }, { o: O, html });
  expect(r.last).toBe(1);
});

test('data saver: Save-Data header, no pre-warm, no autoplay, preload none', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => localStorage.setItem(localStorage.getItem('limitless:inst:v1') + ':limitless:datasaver:v1', '1'));
  const html = '<html><head><title>t</title></head><body style="margin:0"><video id="v" autoplay src="/v.mp4"></video><img src="/img/0.png" width="10" height="10"></body></html>';
  const r = await page.evaluate(async ({ o, html }) => {
    __respond(o + '/', { headers: { 'content-type': 'text/html' }, body: html });
    __respond(o + '/img/0.png', { headers: { 'content-type': 'image/png' }, body: 'x' });
    await __go(o + '/');
    await __waitMark('shown', 6000);
    return { sd: __net.log[0].headers['save-data'] };
  }, { o: O, html });
  expect(r.sd).toBe('on');
  await expect.poll(() => page.frames().some((f) => f !== page.mainFrame() && f.url().startsWith('blob:')), { timeout: 5000 }).toBe(true);
  const fr = page.frames().find((f) => f !== page.mainFrame() && f.url().startsWith('blob:'));
  const v = await fr.evaluate(() => { const e = document.getElementById('v'); return { auto: e.hasAttribute('autoplay'), pre: e.getAttribute('preload') }; });
  expect(v.auto).toBe(false);
  expect(v.pre).toBe('none');
});

test('progress bar replaces the overlay when a page is already showing, and moves with real progress', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(async (o) => {
    __respond(o + '/a', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>a</title></head><body>first</body></html>' });
    __respond(o + '/b', { headers: { 'content-type': 'text/html' }, body: '<html><head><title>b</title><script src="/s1.js"></script><script src="/s2.js"></script></head><body>second</body></html>' });
    __respond(o + '/s1.js', { headers: { 'content-type': 'application/javascript' }, body: '1', delay: 200 });
    __respond(o + '/s2.js', { headers: { 'content-type': 'application/javascript' }, body: '2', delay: 1500 });
    await __go(o + '/a');
    await __waitMark('shown', 6000);
    await new Promise((res) => setTimeout(res, 300));
    await __go(o + '/b');
    await new Promise((res) => setTimeout(res, 900));
    const ov = document.getElementById('overlay').classList.contains('hidden');
    const bar = document.getElementById('progress');
    const w = parseFloat(bar.style.width || '0');
    return { overlayHidden: ov, w, det: bar.classList.contains('lb-det') };
  }, O);
  expect(r.overlayHidden).toBe(true);
  expect(r.det).toBe(true);
  expect(r.w).toBeGreaterThan(5);
  expect(r.w).toBeLessThan(100);
});

test('data saver switch in Settings > Connection saves limitless:datasaver:v1', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { document.getElementById('settingsDataSaverSwitch').scrollIntoView(); });
  const sw = page.locator('#settingsDataSaverSwitch');
  await expect(sw).not.toHaveClass(/\bon\b/);
  await sw.evaluate((e) => e.click());
  await expect(sw).toHaveClass(/\bon\b/);
  const v = await page.evaluate(() => localStorage.getItem(localStorage.getItem('limitless:inst:v1') + ':limitless:datasaver:v1'));
  expect(v).toBe('1');
});
