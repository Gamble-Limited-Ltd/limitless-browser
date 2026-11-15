#!/usr/bin/env node
// Probe the public WISP relays in the app's pool (app/main.js WISP_POOL_DEFAULTS) plus the mages.io fallback.
// A relay is alive when the WebSocket opens and the server's first frame is a WISP CONTINUE packet (type 0x03, stream 0).
//   node scripts/probe-relays.mjs [--json] [--timeout=6000] [--reps=3]
// The Origin header is the production origin: some relays refuse unknown origins. Prints a table (alive, median latency to the CONTINUE frame). Exit 0 always; read the table.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../app/main.js', import.meta.url)), 'utf8');
const block = src.match(/const WISP_POOL_DEFAULTS = \[\.\.\.new Set\(\[([\s\S]*?)\]\)\]/)[1];
const urls = [...new Set([...block.matchAll(/"(wss:\/\/[^"]+)"/g)].map((m) => m[1]).concat('wss://mages.io/wisp/'))];
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const ms = Number(arg('timeout', 6000)), reps = Number(arg('reps', 3));

function once(url) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let done = false, ws;
    const end = (v) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch {} resolve(v); };
    const timer = setTimeout(() => end({ ok: false, why: 'timeout' }), ms);
    try { ws = new WebSocket(url, { headers: { Origin: 'https://limitless.taps-holdings.org' } }); } catch (e) { return resolve({ ok: false, why: 'bad url' }); }
    ws.binaryType = 'arraybuffer';
    ws.onerror = () => end({ ok: false, why: 'error' });
    ws.onclose = (e) => end({ ok: false, why: 'closed ' + e.code });
    ws.onmessage = (e) => {
      const b = new Uint8Array(e.data instanceof ArrayBuffer ? e.data : []);
      end(b[0] === 3 && b.length >= 5 ? { ok: true, ms: performance.now() - t0 } : { ok: false, why: 'no CONTINUE frame' });
    };
  });
}

const rows = await Promise.all(urls.map(async (url) => {
  const r = [];
  for (let i = 0; i < reps; i++) r.push(await once(url));
  const good = r.filter((x) => x.ok).map((x) => x.ms).sort((a, b) => a - b);
  return { url, alive: good.length === reps, flaky: good.length > 0 && good.length < reps, ok: good.length, ms: good.length ? Math.round(good[Math.floor(good.length / 2)]) : null, why: (r.find((x) => !x.ok) || {}).why || '' };
}));
rows.sort((a, b) => (b.alive - a.alive) || ((a.ms ?? 1e9) - (b.ms ?? 1e9)));
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else {
  console.log(`${new Date().toISOString()}  ${reps} tries each, ${ms} ms timeout`);
  for (const r of rows) console.log(`${r.alive ? 'alive' : r.flaky ? 'flaky' : 'DEAD '}  ${String(r.ms ?? '-').padStart(5)} ms  ${r.ok}/${reps}  ${r.url}  ${r.alive ? '' : r.why}`);
}
