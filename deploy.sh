#!/usr/bin/env bash
# Build and publish Limitless Browser on 127.0.0.1:8580. Same idea as ~/gll-site/deploy.sh.
#   ./deploy.sh [sha]      default HEAD. Rollback = ./deploy.sh <previous sha> (see .last-deploy-hash)
# Builds everything from `git archive <sha>` (so a rollback gets that commit's nginx.conf too), tags the images
# with the sha, starts compose project `limitless-browser`, then smoke-tests. Touches only that project.
# Local testing without the private gate: deploy/dev-up.sh. No Cloudflare steps here.
set -euo pipefail
cd "$(dirname "$0")"
REPO="$PWD"

SHA="$(git rev-parse --short "${1:-HEAD}")" || { echo "unknown revision ${1:-HEAD}" >&2; exit 1; }
if [ -n "$(git status --porcelain)" ] && [ "${LB_ALLOW_DIRTY:-0}" != 1 ]; then
  echo "Working tree is dirty. Commit or stash first (the deploy builds from the commit anyway)." >&2
  echo "Override for a local test only: LB_ALLOW_DIRTY=1 ./deploy.sh" >&2
  exit 1
fi
GATE_CONTEXT="${GATE_CONTEXT:-$HOME/limitless-gate}"
[ -d "$GATE_CONTEXT" ] || { echo "Check service not found at $GATE_CONTEXT (set GATE_CONTEXT). Use deploy/dev-up.sh for a stub." >&2; exit 1; }
[ -f "$REPO/deploy/gate.env" ] || { echo "deploy/gate.env is missing (gate secrets, not in git)." >&2; exit 1; }

PREV="$(cat .last-deploy-hash 2>/dev/null || echo none)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git archive "$SHA" | tar -x -C "$WORK"
cp "$REPO/deploy/gate.env" "$WORK/deploy/gate.env"

"$WORK/scripts/build-static.sh" "$SHA"

export WEB_SHA="$SHA" RELAY_SHA="$SHA" GATE_SHA="$SHA" GATE_CONTEXT
docker compose -p limitless-browser -f "$WORK/deploy/docker-compose.yml" build
docker compose -p limitless-browser -f "$WORK/deploy/docker-compose.yml" up -d --remove-orphans

# Smoke: legal is public; the app must NOT be served without a session.
sleep 3
base=http://127.0.0.1:8580
code="$(curl -s -o /dev/null -w '%{http_code}' "$base/legal/")"
[ "$code" = 200 ] || { echo "SMOKE FAIL: /legal/ returned $code" >&2; exit 1; }
root_code="$(curl -s -o "$WORK/root.body" -w '%{http_code}' -H 'Accept: text/html' "$base/")"
if grep -q 'copyright_notice' "$WORK/root.body"; then
  echo "SMOKE FAIL: / served the app without a session (code $root_code)" >&2; exit 1
fi
case "$root_code" in 200|302|401|403|503) :;; *) echo "SMOKE FAIL: / returned $root_code" >&2; exit 1;; esac
curl -s -o /dev/null -w '%{http_code}' "$base/index.html" | grep -qE '^(401|403|503)$' \
  || { echo "SMOKE FAIL: /index.html (no session) is not 401/403/503" >&2; exit 1; }

echo "$SHA" > .last-deploy-hash
echo "Deployed $SHA to 127.0.0.1:8580 (/legal/ 200, / without a session: $root_code, app not served)."
echo "Rollback: ./deploy.sh $PREV"
