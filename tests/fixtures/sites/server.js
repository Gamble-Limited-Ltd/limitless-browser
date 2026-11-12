// Fixture sites for the speed harness (docs/1.0/TESTING.md section 2). Plain Node, no dependencies, deterministic
// content generated at request time (nothing large is committed). Run by the rehearsal compose service `fixtures`
// (profile "fixtures") on 10.89.85.10:8080; locally: `node tests/fixtures/sites/server.js` (PORT, default 8080).
//   /news-fresh  the same page with Cache-Control max-age=300 (page cache candidate)
//   /news      heavy news-style page: 60 images, 12 scripts, 4 CSS files chained with @import
//   /app       module-graph app page: 24 ES modules, depth 4
//   /slow      one image that takes 5 s and one script that takes 2 s (body end, plain script)
//   /article   long article, text only
//   /frames    page with 3 iframes (each a small page)
// Compression (T5): text, svg, js, css and json bodies over 1 KB are sent gzip or br when Accept-Encoding allows it.
// /echo-headers answers with the request headers as JSON.
// Fault fixtures (T5, tests/stack/failures.spec.js), all deterministic:
//   /fault/slow-script          page whose only script answers after 15 s (/fault/late.js?d=15000)
//   /fault/dead-third           page with one script on a port nobody listens on (10.89.85.10:8081, connection refused)
//   /fault/storm                page with 40 images that all answer 404
//   /fault/reset-body           headers and part of the body, then the socket is destroyed
//   /fault/hang                 accepts the request and never answers (a stalled first byte)
//   /fault/video.mp4            2 MB that ignores Range (always 200, whole file)
//   /fault/images               page with 300 small images (queue cap)
// A dead host (no listener) is any other port on this IP, for example http://10.89.85.10:8081/.
// Assets are cacheable for an hour (so "warm" means something); HTML is always revalidated.
const http = require('http');
const zlib = require('zlib');
const PORT = parseInt(process.env.PORT || '8080', 10);

// Small deterministic PRNG so every run serves the same bytes.
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const words = 'the of and to in is that for it as was with be by on not he this are or his from at which but have an had they you were their one all we can her has there been if more when will would who so no'.split(' ');
function para(r, n) { let o = []; for (let i = 0; i < n; i++) o.push(words[Math.floor(r() * words.length)]); const t = o.join(' '); return t[0].toUpperCase() + t.slice(1) + '.'; }

function svgImage(i, kb) { // incompressible-ish: random path data, about kb KB
  const r = rng(1000 + i); let d = '';
  while (d.length < kb * 1024) d += `M${(r() * 400).toFixed(2)} ${(r() * 300).toFixed(2)}L${(r() * 400).toFixed(2)} ${(r() * 300).toFixed(2)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="hsl(${(i * 37) % 360} 40% 85%)"/><path d="${d}" stroke="hsl(${(i * 37) % 360} 60% 35%)" fill="none"/></svg>`;
}
function jsFile(i, kb) { // filler functions, valid script, defines window.__fx[i]
  const r = rng(2000 + i); let o = `(window.__fx=window.__fx||{})[${i}]=1;var l${i}=location.href;\n`; let k = 0;
  while (o.length < kb * 1024) { o += `function f${i}_${k}(a,b){var x=${Math.floor(r() * 1e6)};for(var i=0;i<3;i++){x=(x*a+b+${Math.floor(r() * 100)})%65521}return x+"${para(r, 3)}".length}\n`; k++; }
  return o;
}
const css = (i, kb) => { const r = rng(3000 + i); let o = i < 4 ? `@import url("/news/css/${i + 1}.css");\n` : ''; let k = 0; while (o.length < kb * 1024) { o += `.fx${i}-${k}{color:hsl(${Math.floor(r() * 360)} 50% 30%);margin:${k % 9}px;padding:${k % 5}px}\n`; k++; } return o; };

const page = (title, head, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1">${head}</head><body>${body}</body></html>`;
const h = (type, body, extra = {}) => ({ type, body, ...extra });
const ASSET = { 'Cache-Control': 'public, max-age=3600' };

const routes = {
  '/news': () => {
    const r = rng(1); let heads = '', body = '<h1 class="fx1-1">Fixture News</h1>';
    for (let i = 1; i <= 4; i++) heads += i === 1 ? '<link rel="stylesheet" href="/news/css/1.css">' : '';
    for (let i = 1; i <= 60; i++) body += `<article><h2>${para(r, 6)}</h2><img src="/news/img/${i}.svg" width="400" height="300" alt=""><p>${para(r, 40)}</p></article>`;
    for (let i = 1; i <= 12; i++) body += `<script src="/news/js/${i}.js"></script>`;
    return h('text/html', page('Fixture news', heads, body));
  },
  // the same heavy page, but with explicit freshness like most real news sites: the S3 page cache can keep it
  '/news-fresh': () => ({ ...routes['/news'](), fresh: true }),
  '/app': () => h('text/html', page('Fixture app', '', '<div id="out">loading</div><script type="module" src="/app/m/0.js"></script>')),
  '/slow': () => h('text/html', page('Fixture slow', '', '<h1>Slow</h1><p>Text that is ready at once.</p><img src="/slow/img.svg?d=5000" width="400" height="300" alt=""><p>More text.</p><script src="/slow/s.js?d=2000"></script>')),
  '/article': () => { const r = rng(7); let b = '<h1>Fixture article</h1>'; for (let i = 0; i < 220; i++) b += `<p>${para(r, 70)}</p>`; return h('text/html', page('Fixture article', '', b)); },
  '/frames': () => h('text/html', page('Fixture frames', '', '<h1>Frames</h1>' + [1, 2, 3].map((i) => `<iframe src="/frames/f${i}" width="420" height="260" title="f${i}"></iframe>`).join(''))),
  '/fault/slow-script': () => h('text/html', page('Fault slow script', '', '<h1 id="h">Late script</h1><script src="/fault/late.js?d=15000"></script><p id="after">after</p>')),
  '/fault/dead-third': () => h('text/html', page('Fault dead third party', '', '<h1 id="h">One dead host</h1><script src="http://10.89.85.10:8081/dead.js"></script><img src="http://10.89.85.10:8081/dead.png" width="10" height="10" alt=""><p id="after">after</p>')),
  '/fault/storm': () => h('text/html', page('Fault 404 storm', '', '<h1 id="h">404 storm</h1>' + Array.from({ length: 40 }, (_, i) => `<img src="/fault/missing/${i}.png" width="10" height="10" alt="">`).join(''))),
  '/fault/images': () => h('text/html', page('Fault many images', '', '<h1 id="h">Many images</h1>' + Array.from({ length: 300 }, (_, i) => `<img id="im${i}" src="/fault/img/${i}.svg" width="40" height="30" alt="">`).join(''))),
};
for (const i of [1, 2, 3]) routes[`/frames/f${i}`] = () => { const r = rng(50 + i); return h('text/html', page('f' + i, '', `<h2>Frame ${i}</h2>` + Array.from({ length: 6 }, () => `<p>${para(r, 40)}</p>`).join(''))); };

function dynamic(url, q) {
  let m;
  if ((m = url.match(/^\/news\/img\/(\d+)\.svg$/))) return h('image/svg+xml', svgImage(+m[1], 6), ASSET);
  if ((m = url.match(/^\/news\/js\/(\d+)\.js$/))) return h('text/javascript', jsFile(+m[1], 24), ASSET);
  if ((m = url.match(/^\/news\/css\/(\d+)\.css$/))) return h('text/css', css(+m[1], 12), ASSET);
  if (url === '/fault/late.js') return h('text/javascript', '(window.__late=1);document.title="late-ran";', { ...ASSET, delay: +q.get('d') || 15000 });
  if ((m = url.match(/^\/fault\/img\/(\d+)\.svg$/))) return h('image/svg+xml', svgImage(+m[1], 1), ASSET);
  if (url === '/slow/img.svg') return h('image/svg+xml', svgImage(999, 8), { ...ASSET, delay: +q.get('d') || 5000 });
  if (url === '/slow/s.js') return h('text/javascript', jsFile(998, 4), { ...ASSET, delay: +q.get('d') || 2000 });
  if ((m = url.match(/^\/app\/m\/(\d+)\.js$/))) { // module tree: node n imports 2n+1 and 2n+2 (n < 24 => depth 4, 24 modules)
    const n = +m[1]; const kids = [2 * n + 1, 2 * n + 2].filter((k) => k < 24);
    let o = kids.map((k) => `import * as m${k} from './${k}.js';`).join('\n') + '\n' + jsFile(n, 6).replace('(window.__fx', 'export const id=' + n + ';(window.__fx');
    if (n === 0) o += `\ndocument.getElementById('out').textContent='modules '+(Object.keys(window.__fx).length);`;
    return h('text/javascript', o, ASSET);
  }
  return null;
}

const COMPRESSIBLE = /^(text\/|image\/svg|application\/(json|javascript))/;
const zcache = new Map();
function encode(hit, ae) {
  const body = Buffer.from(hit.body);
  if (!COMPRESSIBLE.test(hit.type) || body.length < 1024) return { body, enc: null };
  const enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null;
  if (!enc) return { body, enc: null };
  const key = enc + ':' + hit.type + ':' + body.length + ':' + body.subarray(0, 64).toString('base64');
  if (!zcache.has(key)) zcache.set(key, enc === 'br' ? zlib.brotliCompressSync(body) : zlib.gzipSync(body));
  return { body: zcache.get(key), enc };
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/healthz') { res.end('ok'); return; }
  if (u.pathname === '/echo-headers') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(req.headers)); return; }
  if (u.pathname === '/fault/hang') return;                    // never answers
  if (u.pathname === '/fault/reset-body') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '200000' }); res.write(Buffer.alloc(50000, 97)); setTimeout(() => req.socket.destroy(), 50); return; }
  if (u.pathname === '/fault/video.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'none', 'Content-Length': 2 * 1024 * 1024 }); res.end(Buffer.alloc(2 * 1024 * 1024, 1)); return; }
  if (/^\/fault\/missing\//.test(u.pathname)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('gone'); return; }
  const hit = (routes[u.pathname] && routes[u.pathname]()) || dynamic(u.pathname, u.searchParams);
  if (!hit) { res.writeHead(404); res.end('not found'); return; }
  const { body, enc } = encode(hit, String(req.headers['accept-encoding'] || ''));
  const headers = { 'Content-Type': hit.type + '; charset=utf-8', Vary: 'Accept-Encoding', ...(enc ? { 'Content-Encoding': enc } : {}), ...(hit.type === 'text/html' ? { 'Cache-Control': hit.fresh ? 'public, max-age=300' : 'no-cache' } : ASSET) };
  setTimeout(() => { res.writeHead(200, headers); res.end(body); }, hit.delay || 0);
}).listen(PORT, '0.0.0.0', () => console.log(`fixtures on :${PORT}`));
