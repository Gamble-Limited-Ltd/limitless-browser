const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');
const { SETUP } = require('./s3-helpers');
const { cases, KNOWN_LEAKS } = require('./leakzoo-cases');

// TL-6 leak zoo. Each case loads a page that tries one way of reaching https://leak.fixture/ outside the proxy path. The stubbed libcurl
// answers everything that comes through the proxy; context.route and routeWebSocket see only what reaches the real network, so any hit
// there is a direct load. Cases in KNOWN_LEAKS leak today and run as test.fail(); a new leak fails, a closed one fails until the line goes.
// LB_LEAKZOO_FEATURES='{"lockdown":true,"rwGaps":true}' checks how the switches change the picture (all known leaks are then expected to differ).
const H = 'https://leak.fixture';
const features = JSON.parse(process.env.LB_LEAKZOO_FEATURES || '{}');

for (const c of cases) {
  test(`leakzoo ${c.fam}: ${c.id}`, async ({ page, context }) => {
    const known = KNOWN_LEAKS[c.id];
    if (known && !process.env.LB_LEAKZOO_FEATURES) test.fail(true, `known leak, closed by ${known}`);
    const direct = [];
    await context.route(H + '/**', (route) => { direct.push(route.request().url()); route.fulfill({ status: 418, body: 'direct' }); });
    await context.routeWebSocket(/leak\.fixture/, (ws) => { direct.push(ws.url()); ws.close(); });
    await boot(page, { tourTimeout: 2500, features: { ownRelay: true, ownSockets: 4, pageCache: true, warm: true, ...features } });
    await page.evaluate(SETUP);
    const u = `${H}/${c.id}`;
    const fill = (s) => s.replace(/\{\{u\}\}/g, u).replace(/\{\{id\}\}/g, c.id);
    const html = `<html><head><title>z</title></head><body><p id="ok">ok</p>${fill(c.html)}<script>${fill(c.js)}</script></body></html>`;
    await page.evaluate((html) => {
      __respond('https://zoo.test/', { headers: { 'content-type': 'text/html' }, body: html });
      window.LB_go('https://zoo.test/');
    }, html);
    await page.waitForFunction(() => { const x = window.__lbPerf.cur; return x && x.marks.shown != null; }, null, { timeout: 20000 });
    await page.waitForTimeout(1200);   // a late load (srcset, preload, worker start) still lands before we look
    const proxied = await page.evaluate((id) => window.__net.log.filter((x) => x.url.includes('/' + id)).length, c.id);
    // proxied = 0 and direct = 0 means the browser never asked (inconclusive: the case proves nothing about routing)
    test.info().annotations.push({ type: 'leak', description: `direct=${direct.length ? direct.join(' ') : 'none'} proxied=${proxied}` });
    expect(direct, 'requests that reached leak.fixture directly').toEqual([]);
  });
}
