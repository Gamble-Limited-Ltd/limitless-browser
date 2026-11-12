#!/usr/bin/env bash
# Full release-gate speed set, unattended: full speed harness (chromium + chromebook, 7 reps), full real-site suite
# (all sites, 3 reps, 1 worker). Dev rehearsal stack only (compose project limitless-browser-rehearsal), never prod.
#   scripts/speed-nightly.sh            (run from any checkout of the Browser repo; ~/Browser is used for git)
# Which code runs: a fresh DETACHED worktree of release/1.0.0 as it is at run time. If that does not yet contain the
# speed-test changes (package.json has no test:speed:quick), slice/1.0-testspeed is merged into the temp worktree
# (temp only, no branch moves). On a merge conflict the merge is aborted and the slice branch itself is used.
# Results: ~/gll-planning/reports/limitless-speed/<YYYY-MM-DD_HHMM>/ (speed-*.json, sites-*.json, logs, SUMMARY.txt).
# The whole run holds /tmp/limitless-rehearsal.lock (waits for the other agents). The worktree is removed at the end.
set -uo pipefail
REPO="${LB_REPO:-$HOME/Browser}"
STAMP="$(TZ=America/Chicago date +%F_%H%M)"
OUT="$HOME/gll-planning/reports/limitless-speed/$STAMP"
WT="$HOME/gll-worktrees/Browser-speed-$STAMP"
mkdir -p "$OUT"
exec > >(tee -a "$OUT/run.log") 2>&1
export PATH="$HOME/.nvm/versions/node/v22.23.0/bin:$PATH"
cd "$REPO"
cleanup() { cd "$HOME"; git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1; git -C "$REPO" worktree prune; }
trap cleanup EXIT

echo "speed-nightly: $STAMP, waiting for the rehearsal lock"
exec 9>/tmp/limitless-rehearsal.lock
flock 9
echo "speed-nightly: lock taken $(date +%T)"

git worktree add --detach "$WT" release/1.0.0 || { echo "worktree failed"; exit 2; }
cd "$WT"
NOTE="release/1.0.0 as is"
if ! grep -q '"test:speed:quick"' package.json; then
  if git -c user.name=TheGeneral4757 -c user.email=jgthiessen3@icloud.com merge --no-edit -q slice/1.0-testspeed >/dev/null 2>&1; then NOTE="release/1.0.0 + merged slice/1.0-testspeed (temp)"
  else git merge --abort >/dev/null 2>&1; git checkout -q --detach slice/1.0-testspeed; NOTE="slice/1.0-testspeed (merge with release conflicted)"; fi
fi
ln -s "$REPO/node_modules" node_modules
SHA="$(git rev-parse --short HEAD)"
export LB_SPEED_SHA="$SHA"
echo "speed-nightly: code = $NOTE @ $SHA"

T0=$(date +%s)
LB_SPEED=1 deploy/rehearsal/run.sh tests/stack/speed.spec.js > "$OUT/speed.log" 2>&1; echo "speed exit $? in $(( $(date +%s)-T0 )) s"
T1=$(date +%s)
LB_SITES=1 deploy/rehearsal/run.sh --project=chromebook --workers=1 tests/stack/sites.spec.js > "$OUT/sites.log" 2>&1; echo "sites exit $? in $(( $(date +%s)-T1 )) s"
node scripts/sites-merge.mjs "$SHA" > "$OUT/sites-summary.txt" 2>&1
cp test-results/speed-"$SHA"-*.json test-results/sites-"$SHA".json "$OUT"/ 2>/dev/null
cp -r test-results/sites-"$SHA" "$OUT/sites-per-site" 2>/dev/null
{
  echo "code: $NOTE @ $SHA   started $STAMP   total $(( $(date +%s)-T0 )) s   (speed $(( T1-T0 )) s)"
  for p in chromium chromebook; do
    echo; echo "== speed vs 0.2.3 [$p] =="
    node scripts/speed-compare.mjs docs/1.0/baseline/speed-c88ce5e-$p.json test-results/speed-"$SHA"-$p.json 2>&1 | grep -E 'REGRESSION|faster|gate|baseline'
  done
  echo; echo "== real sites =="; cat "$OUT/sites-summary.txt"
} > "$OUT/SUMMARY.txt" 2>&1
echo "speed-nightly: done, see $OUT/SUMMARY.txt"
