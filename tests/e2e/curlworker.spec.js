const { test, expect } = require('@playwright/test');
const http = require('http');
const { boot } = require('./helpers');
const { startWisp } = require('./wispserver');

// features.curlWorker (docs/1.2/SWCURL-DESIGN.md 2): libcurl runs in app/curl-worker.js. These tests use the real libcurl.js and a real
// WebSocket WISP relay on localhost, so the worker path is exercised end to end (page.routeWebSocket does not reach Worker sockets).
let wisp, web, port;
const BIG = Buffer.alloc(300000); for (let i = 0; i < BIG.length; i++) BIG[i] = (i * 7) & 255;
test.beforeAll(async () => {
  wisp = await startWisp();
  web = http.createServer((req, res) => {
    if (req.url === '/big') { res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': BIG.length }); res.end(BIG); }
    else if (req.url === '/slow') { res.writeHead(200, { 'content-length': 10 }); res.write('abc'); /* never finishes */ }
    else if (req.url === '/echo') { let b = ''; req.on('data', (d) => b += d); req.on('end', () => { res.setHeader('x-method', req.method); res.setHeader('set-cookie', ['a=1', 'b=2']); res.end(b); }); }
    else { res.setHeader('content-type', 'text/plain'); res.end('hello ' + req.url); }
  });
  await new Promise((r) => web.listen(0, '127.0.0.1', r));
  port = web.address().port;
});
test.afterAll(async () => { web.closeAllConnections && web.closeAllConnections(); await new Promise((r) => web.close(r)); await wisp.close(); });

async function start(page, curlWorker) {
  const errors = await boot(page, { features: { ownRelay: true, ownSockets: 4, curlWorker } });
  await page.evaluate(() => window.LB_featuresReady);
  await page.evaluate((u) => window.LB_swapSession(u), wisp.url);
  return errors;
}
const get = (page, path, o) => page.evaluate(async ([p, port, o]) => {
  try { const r = await window.LB_queueFetch('http://127.0.0.1:' + port + p, o || {}); return { s: r.status, n: r.buf.byteLength, t: new TextDecoder().decode(r.buf.slice(0, 40)), h: r.headers }; }
  catch (e) { return { err: e.message, name: e.name, cat: e.lbCat, code: e.lbCode }; }
}, [path, port, o]);

test('default off: libcurl stays on the main thread and no Worker is created', async ({ page }) => {
  const errors = await start(page, undefined);
  expect(await page.evaluate(() => window.LB_features.curlWorker)).toBe(false);
  expect((await get(page, '/a')).t).toBe('hello /a');
  expect(await page.evaluate(() => window.LB_CurlWorker.stats)).toEqual({ created: 0, fetches: 0 });
  expect(errors).toEqual([]);
});

test('on: requests go through the Worker, bodies are intact, headers and POST work', async ({ page }) => {
  const errors = await start(page, true);
  expect((await get(page, '/a')).t).toBe('hello /a');
  const big = await page.evaluate(async (port) => { const r = await window.LB_queueFetch('http://127.0.0.1:' + port + '/big', {}); const a = new Uint8Array(r.buf); let ok = a.length === 300000; for (let i = 0; i < a.length && ok; i++) if (a[i] !== ((i * 7) & 255)) ok = false; return { n: a.length, ok }; }, port);
  expect(big).toEqual({ n: 300000, ok: true });
  const post = await get(page, '/echo', { method: 'POST', body: 'payload', headers: { 'content-type': 'text/plain' } });
  expect(post.t).toBe('payload'); expect(post.h['x-method']).toBe('POST');
  const st = await page.evaluate(() => window.LB_CurlWorker.stats);
  expect(st.created).toBeGreaterThanOrEqual(1); expect(st.fetches).toBeGreaterThanOrEqual(3);
  expect(wisp.stats.connects).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('on: lbCat/lbCode errors and AbortError cross the boundary', async ({ page }) => {
  await start(page, true);
  const dead = await page.evaluate(async () => { try { await window.LB_queueFetch('http://127.0.0.1:1/', {}); return null; } catch (e) { return { m: e.message, cat: e.lbCat, code: e.lbCode }; } });
  expect(dead && dead.m, JSON.stringify(dead)).toContain('error code');
  expect(dead.cat).toBeTruthy(); expect(dead.code).toBeGreaterThan(0);
});

test('on: a deadline abort reaches the worker, rejects as TimeoutError and frees the slot', async ({ page }) => {
  await start(page, true);
  const r = await page.evaluate(async (port) => {
    window.LB_deadlines.body = 500;   // runQueue aborts the job's own AbortController at this deadline
    try { await window.LB_queueFetch('http://127.0.0.1:' + port + '/slow', {}); return 'finished'; } catch (e) { return e.name + ':' + e.lbCat; }
  }, port);
  expect(r).toBe('TimeoutError:timeout');
  expect((await get(page, '/after')).t).toBe('hello /after');
});

test('on: the session swap retires the old worker session and the new one works', async ({ page }) => {
  await start(page, true);
  await page.evaluate((u) => window.LB_swapSession(u), wisp.url);
  expect((await get(page, '/b')).t).toBe('hello /b');
  expect(await page.evaluate(() => window.LB_CurlWorker.stats.created)).toBeGreaterThanOrEqual(2);
});

test('on: a worker script that cannot load falls back to the main thread', async ({ page }) => {
  await page.route('**/curl-worker.js*', (r) => r.fulfill({ status: 404, body: 'no' }));
  await start(page, true);
  expect((await get(page, '/c')).t).toBe('hello /c');
  expect(await page.evaluate(() => window.LB_CurlWorker.stats.created)).toBe(0);
});

test('on: our own relay URL never uses the Worker', async ({ page }) => {
  await boot(page, { features: { ownRelay: true, ownSockets: 4, curlWorker: true } });
  await page.evaluate(() => window.LB_featuresReady);
  const used = await page.evaluate(async () => { const before = window.LB_CurlWorker.stats.created; await window.LB_swapSession(location.origin.replace(/^http/, 'ws') + '/wisp/'); return window.LB_CurlWorker.stats.created - before; });
  expect(used).toBe(0);
});
