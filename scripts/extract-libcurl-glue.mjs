// Extracts the vendored libcurl.js 0.7.5 glue from index.html into vendor/libcurl/0.7.5/libcurl-glue.js so a Worker (app/curl-worker.js)
// runs the same code as the main thread. libcurl.js: Copyright (C) 2024 ading2210, GNU LGPL v3 (https://github.com/ading2210/libcurl.js).
// Only edit: the wasm URL comes from self.__lbWasm in a worker (a worker has no `document`). Rerun after changing the glue in index.html.
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').split('\n');
const a = html.findIndex(l => l.startsWith('const libcurl = (function() {'));
const b = html.findIndex((l, i) => i > a && l.startsWith('})()'));
let src = html.slice(a - 10, b + 1).join('\n');
const from = 'new URL("vendor/libcurl/0.7.5/libcurl.wasm",document.baseURI).href';
if (src.split(from).length !== 2) throw new Error('expected one wasm url');
src = src.replace(from, '(typeof document!="undefined"?' + from + ':self.__lbWasm)');
fs.writeFileSync(new URL('../vendor/libcurl/0.7.5/libcurl-glue.js', import.meta.url), src + '\n');
console.log('glue lines', a + 1, b + 1, 'bytes', src.length);
