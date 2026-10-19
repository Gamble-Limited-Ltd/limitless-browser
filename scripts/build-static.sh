#!/usr/bin/env bash
# Build the static tree that the web image serves.
#   scripts/build-static.sh <sha> [source-dir]
# source-dir defaults to the repo root; deploy.sh passes a `git archive` export of <sha>.
# Output (both gitignored):
#   deploy/web/dist/     raw files + .gz for compressible types (served via gzip_static)
#   deploy/web/dist-br/  same names, compressible types brotli-compressed (nginx picks this root for br clients)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SHA="${1:?usage: build-static.sh <sha> [source-dir]}"
SRC="${2:-$REPO}"
OUT="$REPO/deploy/web/dist"
OUTBR="$REPO/deploy/web/dist-br"

rm -rf "$OUT" "$OUTBR"
mkdir -p "$OUT" "$OUTBR"

# What the web tier serves. Optional entries are skipped with a notice while other work lands.
REQUIRED=(index.html GUST-Patcher.html legal theme favicon.svg)
OPTIONAL=(vendor fonts)
for p in "${REQUIRED[@]}"; do
  [ -e "$SRC/$p" ] || { echo "build-static: missing required $p in $SRC" >&2; exit 1; }
  cp -a "$SRC/$p" "$OUT/"
done
for p in "${OPTIONAL[@]}"; do
  if [ -e "$SRC/$p" ]; then cp -a "$SRC/$p" "$OUT/"; else echo "build-static: note, $p/ not present yet, skipped"; fi
done

VERSION=0.1.0
if [ -f "$SRC/package.json" ]; then
  VERSION="$(node -e 'try{console.log(require(process.argv[1]).version||"0.1.0")}catch(e){console.log("0.1.0")}' "$SRC/package.json")"
fi
printf '{"version":"%s","sha":"%s","date":"%s","security":false}\n' \
  "$VERSION" "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT/version.json"

# Mirror the tree into dist-br/, then compress compressible types.
cp -a "$OUT/." "$OUTBR/"
EXT='html|js|mjs|css|wasm|svg|json'
brotli_file() { # $1 in, $2 out (brotli CLI if installed, else node's built-in zlib at quality 11)
  if command -v brotli >/dev/null 2>&1; then brotli -q 11 -f -c "$1" > "$2"
  else node -e 'const z=require("zlib"),fs=require("fs");fs.writeFileSync(process.argv[2],z.brotliCompressSync(fs.readFileSync(process.argv[1]),{params:{[z.constants.BROTLI_PARAM_QUALITY]:11}}))' "$1" "$2"
  fi
}
n=0
while IFS= read -r -d '' f; do
  rel="${f#"$OUT"/}"
  gzip -9 -k -n -f "$f"                 # dist/<f>.gz next to the raw file
  brotli_file "$f" "$OUTBR/$rel"        # always a valid brotli stream: nginx adds Content-Encoding: br by extension
  n=$((n+1))
done < <(find "$OUT" -type f -regextype posix-extended -regex ".*\.($EXT)$" -print0)

echo "build-static: $SHA v$VERSION, $n files compressed, tree $(du -sh "$OUT" | cut -f1), br tree $(du -sh "$OUTBR" | cut -f1)"
