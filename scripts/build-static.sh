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
REQUIRED=(index.html patcher.html sw.js legal theme favicon.svg CHANGELOG.md)
# N1: hosts.txt -> hosts.bin (sorted 64-bit hashes; the file is also committed so the dev/e2e tree works, this keeps it in step)
[ -f "$SRC/scripts/build-blocklist.mjs" ] && [ -d "$SRC/vendor/blocklist" ] && node "$SRC/scripts/build-blocklist.mjs"
OPTIONAL=(vendor fonts)
for p in "${REQUIRED[@]}"; do
  [ -e "$SRC/$p" ] || { echo "build-static: missing required $p in $SRC" >&2; exit 1; }
  cp -a "$SRC/$p" "$OUT/"
done
for p in "${OPTIONAL[@]}"; do
  if [ -e "$SRC/$p" ]; then cp -a "$SRC/$p" "$OUT/"; else echo "build-static: note, $p/ not present yet, skipped"; fi
done
# Lazy subsystems (SPEED.md 3.4): source app/*.js is served from app/<sha>/ so every build has its own immutable URLs.
if [ -d "$SRC/app" ]; then mkdir -p "$OUT/app/$SHA" && cp -a "$SRC/app/." "$OUT/app/$SHA/"; fi

# Stamp the build's own sha into the dist copy of the app script (never the source) so the app can tell when
# version.json names a newer build. The marker line in app/main.js is `... || 'dev'; // @LB_BUILD_SHA@`.
if [[ ! "$SHA" =~ ^[0-9A-Za-z._-]+$ ]]; then echo "build-static: unsafe sha '$SHA'" >&2; exit 1; fi
# S3: the application script lives in app/main.js (source) and is served from app/<sha>/main.js; the marker line is in that file.
sed -i "s#<script src=\"app/curlproxy.js\"></script>#<script src=\"app/$SHA/curlproxy.js\"></script>#" "$OUT/index.html"
grep -q "<script src=\"app/$SHA/curlproxy.js\"></script>" "$OUT/index.html" || { echo "build-static: could not point index.html at app/$SHA/curlproxy.js" >&2; exit 1; }
sed -i "s#<script src=\"app/main.js\"></script>#<script src=\"app/$SHA/main.js\"></script>#" "$OUT/index.html"
sed -i "s#<script src=\"app/swlane.js\"></script>#<script src=\"app/$SHA/swlane.js\"></script>#" "$OUT/index.html"
grep -q "<script src=\"app/$SHA/swlane.js\"></script>" "$OUT/index.html" || { echo "build-static: could not point index.html at app/$SHA/swlane.js" >&2; exit 1; }
sed -i "s#<script src=\"app/ui.js\"></script>#<script src=\"app/$SHA/ui.js\"></script>#" "$OUT/index.html"
grep -q "<script src=\"app/$SHA/ui.js\"></script>" "$OUT/index.html" || { echo "build-static: could not point index.html at app/$SHA/ui.js" >&2; exit 1; }
grep -q "<script src=\"app/$SHA/main.js\"></script>" "$OUT/index.html" || { echo "build-static: could not point index.html at app/$SHA/main.js" >&2; exit 1; }
sed -i "/@LB_BUILD_SHA@/ s/|| 'dev';/|| '$SHA';/" "$OUT/app/$SHA/main.js"
grep -q "|| '$SHA'; // @LB_BUILD_SHA@" "$OUT/app/$SHA/main.js" || { echo "build-static: could not stamp the build sha into app/main.js" >&2; exit 1; }
# Lazy loaders in index.html read the sha from the same constant; the service worker gets it plus its precache list
# (shell files a first visit needs; no other HTML: the worker refuses it and the whole install fails. index, acorn, the WASM, font css, Latin faces, theme css, app/<sha>). Skins CSS and PDF.js are cached on use.
sed -i "/@LB_BUILD_SHA@/ s/const SHA = 'dev';/const SHA = '$SHA';/" "$OUT/sw.js"
PRE="$(cd "$OUT" && { echo index.html; find vendor/acorn vendor/libcurl vendor/iso-639-1 vendor/fontawesome/6.7.2/css vendor/fontawesome/6.7.2/webfonts fonts theme app -type f \
  ! -name '*.gz' ! -name '*.html' ! -name 'LICENSE*' ! -name '*.txt' ! -name 'skins.css' ! -name '*.md' ! -name '*.ttf' \
  ! -regex '.*-\(latin-ext\|cyrillic-ext\|cyrillic\|greek\|vietnamese\)\.woff2' 2>/dev/null || true; } | sort | node -e 'const l=require("fs").readFileSync(0,"utf8").split("\n").filter(Boolean).map(x=>"/"+x);process.stdout.write(JSON.stringify(l))')"
sed -i "s|^const PRECACHE = \[\]; // @LB_PRECACHE@|const PRECACHE = $PRE; // @LB_PRECACHE@|" "$OUT/sw.js"
grep -q "const SHA = '$SHA';" "$OUT/sw.js" && grep -q '@LB_PRECACHE@' "$OUT/sw.js" && ! grep -q 'PRECACHE = \[\]' "$OUT/sw.js" || { echo "build-static: could not stamp sw.js" >&2; exit 1; }

VERSION=0.1.0
if [ -f "$SRC/package.json" ]; then
  VERSION="$(node -e 'try{console.log(require(process.argv[1]).version||"0.1.0")}catch(e){console.log("0.1.0")}' "$SRC/package.json")"
fi
# Kill switches the app reads at boot (features in version.json, see CLAUDE.md "Feature switches"). Defaults are on except pageCache and warm.
# To turn one off for a release, export it for the build, e.g. LB_FEATURE_WORKER=false ./deploy.sh
# 1.0.0: our VPS relay is on (LB_FEATURE_OWNRELAY=false LB_FEATURE_OWNSOCKETS=0 is the 0.3.0 public-relays-only build).
FEAT_OWNRELAY="${LB_FEATURE_OWNRELAY:-true}"
FEAT_SOCKETS="${LB_FEATURE_OWNSOCKETS:-4}"
FEAT_WORKER="${LB_FEATURE_WORKER:-true}"
FEAT_CACHE="${LB_FEATURE_RESPCACHE:-true}"
FEAT_SW="${LB_FEATURE_SW:-true}"
FEAT_PIPELINE="${LB_FEATURE_PIPELINE:-true}"
FEAT_LAZYIMG="${LB_FEATURE_LAZYIMG:-true}"
FEAT_TABSLEEP="${LB_FEATURE_TABSLEEP:-true}"
FEAT_REWRITECACHE="${LB_FEATURE_REWRITECACHE:-true}"
# pageCache and warm moved to 1.1 (PLAN 0.3 item 4): code stays, off by default.
FEAT_PAGECACHE="${LB_FEATURE_PAGECACHE:-false}"
FEAT_WARM="${LB_FEATURE_WARM:-false}"
FEAT_INSTANTBACK="${LB_FEATURE_INSTANTBACK:-true}"
FEAT_NODIRECT="${LB_FEATURE_NODIRECT:-true}"
FEAT_BLOBSCRIPTS="${LB_FEATURE_BLOBSCRIPTS:-true}"
FEAT_ERRCLASS="${LB_FEATURE_ERRCLASS:-true}"
FEAT_DEADLINES="${LB_FEATURE_DEADLINES:-true}"
FEAT_TRANSFER="${LB_FEATURE_TRANSFER:-true}"
FEAT_DOWNLOADS="${LB_FEATURE_DOWNLOADS:-true}"
FEAT_PERF="${LB_FEATURE_PERF:-true}"
FEAT_COMPRESS="${LB_FEATURE_COMPRESS:-true}"
FEAT_IMGACCEPT="${LB_FEATURE_IMGACCEPT:-true}"
FEAT_LAZYPREFETCH="${LB_FEATURE_LAZYPREFETCH:-true}"
FEAT_NOPREFETCH="${LB_FEATURE_NOPREFETCH:-true}"
FEAT_DLSPLIT="${LB_FEATURE_DLSPLIT:-true}"
FEAT_DLCLASS="${LB_FEATURE_DLCLASS:-true}"
FEAT_PAGESFIRST="${LB_FEATURE_PAGESFIRST:-true}"
FEAT_VIDEOCAP="${LB_FEATURE_VIDEOCAP:-true}"
FEAT_ONEVIDEO="${LB_FEATURE_ONEVIDEO:-true}"
FEAT_SPEEDCAP="${LB_FEATURE_SPEEDCAP:-true}"
FEAT_CSSBLOBS="${LB_FEATURE_CSSBLOBS:-true}"
FEAT_BLOCKLISTYIELD="${LB_FEATURE_BLOCKLISTYIELD:-true}"
FEAT_COMPACTBLOCKLIST="${LB_FEATURE_COMPACTBLOCKLIST:-true}"
FEAT_MEMBUDGET="${LB_FEATURE_MEMBUDGET:-true}"
FEAT_IMPORTHELPER="${LB_FEATURE_IMPORTHELPER:-true}"
FEAT_QPRIO="${LB_FEATURE_QPRIO:-true}"
FEAT_ERRCARD="${LB_FEATURE_ERRCARD:-true}"
FEAT_YTBLOCK="${LB_FEATURE_YTBLOCK:-true}"   # K2: YouTube blocked for every tier; rollback is LB_FEATURE_YTBLOCK=false
FEAT_SCRIPTDEDUP="${LB_FEATURE_SCRIPTDEDUP:-true}"
# 1.2 (docs/1.2/SWCURL-DESIGN.md): off by default until measured on a real Chromebook.
FEAT_CURLWORKER="${LB_FEATURE_CURLWORKER:-false}"
FEAT_SWDOC="${LB_FEATURE_SWDOC:-false}"
FEAT_AUTOSAVER="${LB_FEATURE_AUTOSAVER:-true}"
FEAT_DATAMETER="${LB_FEATURE_DATAMETER:-true}"
FEAT_SITEREPORT="${LB_FEATURE_SITEREPORT:-true}"
FEAT_VIDEOSOCK="${LB_FEATURE_VIDEOSOCK:-true}"
FEAT_BOTCARD="${LB_FEATURE_BOTCARD:-true}"
FEAT_REQHYGIENE="${LB_FEATURE_REQHYGIENE:-true}"
FEAT_IMGLANE="${LB_FEATURE_IMGLANE:-false}"   # 1.2 native image lane: opt-in, off until Boss turns it on (docs/1.2/IMGLANE.md)
FEAT_POPUPBRIDGE="${LB_FEATURE_POPUPBRIDGE:-true}"
FEAT_VISIBLEFIRST="${LB_FEATURE_VISIBLEFIRST:-false}"   # 1.2 G1: opt-in until measured on a real site
FEAT_GOOGLESIGNIN="${LB_FEATURE_GOOGLESIGNIN:-true}"   # J5: on from 1.2.2 (Boss 2026-11-19); rollback LB_FEATURE_GOOGLESIGNIN=false
FEAT_LOCKDOWN="${LB_FEATURE_LOCKDOWN:-false}"   # lockdown
[[ "$FEAT_SOCKETS" =~ ^[0-4]$ ]] || { echo "build-static: LB_FEATURE_OWNSOCKETS must be 0 to 4" >&2; exit 1; }
for v in "$FEAT_OWNRELAY" "$FEAT_WORKER" "$FEAT_CACHE" "$FEAT_SW" "$FEAT_PIPELINE" "$FEAT_LAZYIMG" "$FEAT_TABSLEEP" "$FEAT_REWRITECACHE" "$FEAT_PAGECACHE" "$FEAT_WARM" "$FEAT_INSTANTBACK" "$FEAT_NODIRECT" "$FEAT_BLOBSCRIPTS" "$FEAT_ERRCLASS" "$FEAT_DEADLINES" "$FEAT_TRANSFER" "$FEAT_DOWNLOADS" "$FEAT_PERF" "$FEAT_COMPRESS" "$FEAT_IMGACCEPT" "$FEAT_LAZYPREFETCH" "$FEAT_NOPREFETCH" "$FEAT_DLSPLIT" "$FEAT_DLCLASS" "$FEAT_PAGESFIRST" "$FEAT_VIDEOCAP" "$FEAT_ONEVIDEO" "$FEAT_AUTOSAVER" "$FEAT_DATAMETER" "$FEAT_SITEREPORT" "$FEAT_VIDEOSOCK" "$FEAT_BOTCARD" "$FEAT_REQHYGIENE" "$FEAT_SPEEDCAP" "$FEAT_CSSBLOBS" "$FEAT_BLOCKLISTYIELD" "$FEAT_COMPACTBLOCKLIST" "$FEAT_MEMBUDGET" "$FEAT_IMPORTHELPER" "$FEAT_QPRIO" "$FEAT_ERRCARD" "$FEAT_YTBLOCK" "$FEAT_SCRIPTDEDUP" "$FEAT_CURLWORKER" "$FEAT_SWDOC" "$FEAT_IMGLANE" "$FEAT_POPUPBRIDGE" "$FEAT_VISIBLEFIRST" "$FEAT_GOOGLESIGNIN" "$FEAT_LOCKDOWN"; do
  [[ "$v" =~ ^(true|false)$ ]] || { echo "build-static: LB_FEATURE_OWNRELAY, LB_FEATURE_WORKER, LB_FEATURE_RESPCACHE, LB_FEATURE_SW, LB_FEATURE_PIPELINE, LB_FEATURE_LAZYIMG, LB_FEATURE_TABSLEEP, LB_FEATURE_REWRITECACHE, LB_FEATURE_PAGECACHE, LB_FEATURE_WARM, LB_FEATURE_INSTANTBACK, LB_FEATURE_NODIRECT, LB_FEATURE_BLOBSCRIPTS, LB_FEATURE_ERRCLASS, LB_FEATURE_DEADLINES, LB_FEATURE_TRANSFER, LB_FEATURE_DOWNLOADS, LB_FEATURE_PERF, LB_FEATURE_COMPRESS, LB_FEATURE_IMGACCEPT, LB_FEATURE_LAZYPREFETCH, LB_FEATURE_NOPREFETCH, LB_FEATURE_DLSPLIT, LB_FEATURE_DLCLASS, LB_FEATURE_PAGESFIRST, LB_FEATURE_VIDEOCAP, LB_FEATURE_ONEVIDEO, LB_FEATURE_AUTOSAVER, LB_FEATURE_DATAMETER, LB_FEATURE_SITEREPORT, LB_FEATURE_VIDEOSOCK, LB_FEATURE_BOTCARD, LB_FEATURE_REQHYGIENE, LB_FEATURE_SPEEDCAP, LB_FEATURE_CSSBLOBS, LB_FEATURE_BLOCKLISTYIELD, LB_FEATURE_COMPACTBLOCKLIST, LB_FEATURE_MEMBUDGET, LB_FEATURE_IMPORTHELPER, LB_FEATURE_QPRIO, LB_FEATURE_ERRCARD, LB_FEATURE_YTBLOCK, LB_FEATURE_SCRIPTDEDUP, LB_FEATURE_CURLWORKER, LB_FEATURE_SWDOC, LB_FEATURE_IMGLANE, LB_FEATURE_POPUPBRIDGE, LB_FEATURE_VISIBLEFIRST, LB_FEATURE_GOOGLESIGNIN, LB_FEATURE_LOCKDOWN must be true or false" >&2; exit 1; }
done
printf '{"version":"%s","sha":"%s","date":"%s","security":false,"features":{"ownRelay":%s,"ownSockets":%s,"worker":%s,"respCache":%s,"sw":%s,"pipeline":%s,"lazyImg":%s,"tabSleep":%s,"rewriteCache":%s,"pageCache":%s,"warm":%s,"instantBack":%s,"noDirect":%s,"blobScripts":%s,"errClass":%s,"deadlines":%s,"transfer":%s,"downloads":%s,"perf":%s,"compress":%s,"imgAccept":%s,"lazyPrefetch":%s,"noPrefetch":%s,"dlSplit":%s,"dlClass":%s,"pagesFirst":%s,"videoCap":%s,"oneVideo":%s,"autoSaver":%s,"dataMeter":%s,"siteReport":%s,"videoSock":%s,"botCard":%s,"reqHygiene":%s,"speedCap":%s,"cssBlobs":%s,"blocklistYield":%s,"compactBlocklist":%s,"memBudget":%s,"importHelper":%s,"qPrio":%s,"errCard":%s,"ytBlock":%s,"scriptDedup":%s,"curlWorker":%s,"swDoc":%s,"imgLane":%s,"popupBridge":%s,"visibleFirst":%s,"googleSignin":%s,"lockdown":%s}}\n' \
  "$VERSION" "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$FEAT_OWNRELAY" "$FEAT_SOCKETS" "$FEAT_WORKER" "$FEAT_CACHE" "$FEAT_SW" "$FEAT_PIPELINE" "$FEAT_LAZYIMG" "$FEAT_TABSLEEP" "$FEAT_REWRITECACHE" "$FEAT_PAGECACHE" "$FEAT_WARM" "$FEAT_INSTANTBACK" "$FEAT_NODIRECT" "$FEAT_BLOBSCRIPTS" "$FEAT_ERRCLASS" "$FEAT_DEADLINES" "$FEAT_TRANSFER" "$FEAT_DOWNLOADS" "$FEAT_PERF" "$FEAT_COMPRESS" "$FEAT_IMGACCEPT" "$FEAT_LAZYPREFETCH" "$FEAT_NOPREFETCH" "$FEAT_DLSPLIT" "$FEAT_DLCLASS" "$FEAT_PAGESFIRST" "$FEAT_VIDEOCAP" "$FEAT_ONEVIDEO" "$FEAT_AUTOSAVER" "$FEAT_DATAMETER" "$FEAT_SITEREPORT" "$FEAT_VIDEOSOCK" "$FEAT_BOTCARD" "$FEAT_REQHYGIENE" "$FEAT_SPEEDCAP" "$FEAT_CSSBLOBS" "$FEAT_BLOCKLISTYIELD" "$FEAT_COMPACTBLOCKLIST" "$FEAT_MEMBUDGET" "$FEAT_IMPORTHELPER" "$FEAT_QPRIO" "$FEAT_ERRCARD" "$FEAT_YTBLOCK" "$FEAT_SCRIPTDEDUP" "$FEAT_CURLWORKER" "$FEAT_SWDOC" "$FEAT_IMGLANE" "$FEAT_POPUPBRIDGE" "$FEAT_VISIBLEFIRST" "$FEAT_GOOGLESIGNIN" > "$OUT/version.json" "$FEAT_LOCKDOWN"

# Mirror the tree into dist-br/, then compress compressible types.
cp -a "$OUT/." "$OUTBR/"
EXT='html|js|mjs|css|wasm|svg|json|txt'
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
