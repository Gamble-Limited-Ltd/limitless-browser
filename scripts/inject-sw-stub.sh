#!/usr/bin/env bash
# Rollback helper (deploy.sh): put the self-removing service worker stub at /sw.js in a built web tree that has none.
#   scripts/inject-sw-stub.sh <web-dir>     web-dir holds dist/ and dist-br/ (deploy/web)
# Same layout as build-static.sh: raw + .gz in dist/, brotli-compressed bytes in dist-br/ (nginx adds Content-Encoding: br there).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB="${1:?usage: inject-sw-stub.sh <web-dir>}"
[ -d "$WEB/dist" ] && [ -d "$WEB/dist-br" ] || { echo "inject-sw-stub: $WEB has no dist/ and dist-br/" >&2; exit 1; }
if [ -e "$WEB/dist/sw.js" ]; then echo "inject-sw-stub: dist/sw.js exists, nothing to do"; exit 0; fi
cp "$HERE/sw-rollback-stub.js" "$WEB/dist/sw.js"
gzip -9 -k -n -f "$WEB/dist/sw.js"
node -e 'const z=require("zlib"),fs=require("fs");fs.writeFileSync(process.argv[2],z.brotliCompressSync(fs.readFileSync(process.argv[1]),{params:{[z.constants.BROTLI_PARAM_QUALITY]:11}}))' "$WEB/dist/sw.js" "$WEB/dist-br/sw.js"
echo "inject-sw-stub: rollback stub installed as /sw.js"
