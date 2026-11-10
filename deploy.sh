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
# deploy/.env (gitignored, optional) feeds compose interpolation, e.g. LEGAL_VERSION for web
[ -f "$REPO/deploy/.env" ] && cp "$REPO/deploy/.env" "$WORK/deploy/.env"

"$WORK/scripts/build-static.sh" "$SHA"

export WEB_SHA="$SHA" RELAY_SHA="$SHA" GATE_SHA="$SHA" GATE_CONTEXT  # WEB_SHA also reaches the gate as BUILD_SHA
COMPOSE=(-f "$WORK/deploy/docker-compose.yml")
# GATE back channel over GATE's private network (needed while id.taps-holdings.org is behind Cloudflare Access).
if grep -q '^GATE_BACKCHANNEL_URL=.' "$WORK/deploy/gate.env"; then
  docker network inspect gll_gate >/dev/null 2>&1 || { echo "gll_gate network missing (start GATE with ~/gll-id/manage.sh)." >&2; exit 1; }
  COMPOSE+=(-f "$WORK/deploy/docker-compose.gllgate.yml")
fi
docker compose -p limitless-browser "${COMPOSE[@]}" build
docker compose -p limitless-browser "${COMPOSE[@]}" up -d --remove-orphans
# Record what is running now, before the smoke: the 06:00 rotation preflight compares the containers to this file.
# Written only after the smoke, a failed smoke left a stale hash and blocked the rotation (2026-11-09).
echo "$SHA" > .last-deploy-hash
fail() { echo "SMOKE FAIL: $*" >&2; echo "Running and recorded: $SHA. Roll back: ./deploy.sh $PREV" >&2; exit 1; }
retry() { local i; for i in $(seq 15); do "$@" && return 0; sleep 2; done; return 1; }   # up to 30 s for containers to start

# Smoke: legal is public; the app must NOT be served without a session.
base=http://127.0.0.1:8580
legal_ok() { [ "$(curl -s -o /dev/null -w '%{http_code}' "$base/legal/")" = 200 ]; }
retry legal_ok || fail "/legal/ did not return 200 within 30 s"
# Smoke: the check service must reach GLL ID's back channel (catches a wrong GATE_BACKCHANNEL_URL host).
bc="$(grep -E '^GATE_BACKCHANNEL_URL=.' "$WORK/deploy/gate.env" | cut -d= -f2- || true)"
if [ -n "$bc" ]; then
  retry docker compose -p limitless-browser "${COMPOSE[@]}" exec -T lbgate wget -qO /dev/null "$bc/oidc/jwks" \
    || fail "check service cannot reach GLL ID at $bc"
fi
root_code="$(curl -s -o "$WORK/root.body" -w '%{http_code}' -H 'Accept: text/html' "$base/")"
grep -q 'copyright_notice' "$WORK/root.body" && fail "/ served the app without a session (code $root_code)"
case "$root_code" in 200|302|401|403|503) :;; *) fail "/ returned $root_code";; esac
curl -s -o /dev/null -w '%{http_code}' "$base/index.html" | grep -qE '^(401|403|503)$' \
  || fail "/index.html (no session) is not 401/403/503"

echo "Deployed $SHA to 127.0.0.1:8580 (/legal/ 200, / without a session: $root_code, app not served)."
echo "Rollback: ./deploy.sh $PREV"
