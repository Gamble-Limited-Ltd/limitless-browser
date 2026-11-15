#!/usr/bin/env bash
# Build and publish the VPS relay stack (1.0 S4). Modelled on ../../deploy.sh. Boss runs it.
#   deploy/relay-vps/deploy-vps.sh [sha]     default HEAD. Rollback = deploy-vps.sh <previous sha> (see the box's .last-deploy-hash)
# Where it runs:
#   BOX_SSH=limitless-relay   (ssh alias; run from the Gamble VM) builds here from `git archive <sha>`, ships the images with
#                              docker save | ssh docker load, copies this folder to ~/limitless-relay-vps/ on the box and starts it there.
#   BOX_SSH unset              run it ON the box (both repos cloned there): builds and starts locally.
# The gate image comes from the gate repo (GATE_CONTEXT, default ~/limitless-gate) and must already contain relay mode.
# Secrets never travel: .env and relay.env live on the box only (examples next to this script).
# Touches only compose project limitless-relay-vps on the box. Does not change DNS, the router or Cloudflare.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"

SHA="$(git rev-parse --short "${1:-HEAD}")" || { echo "unknown revision ${1:-HEAD}" >&2; exit 1; }
if [ -n "$(git status --porcelain -- . ':!node_modules')" ] && [ "${LB_ALLOW_DIRTY:-0}" != 1 ]; then
  echo "Working tree is dirty. Commit or stash first (the deploy builds from the commit anyway)." >&2; exit 1
fi
GATE_CONTEXT="${GATE_CONTEXT:-$HOME/limitless-gate}"
[ -d "$GATE_CONTEXT/src/edge" ] || { echo "No relay mode in the gate at $GATE_CONTEXT (set GATE_CONTEXT to a checkout that has src/edge)." >&2; exit 1; }
GATE_SHA="$(git -C "$GATE_CONTEXT" rev-parse --short HEAD)"

BOX_DIR="${BOX_DIR:-limitless-relay-vps}"     # on the box, relative to the login home
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git archive "$SHA" deploy/relay deploy/dns deploy/relay-vps | tar -x -C "$WORK"
export RELAY_SHA="$SHA" DNS_SHA="$SHA" GATE_SHA GATE_CONTEXT
IMAGES=(limitless-gate:"$GATE_SHA" limitless-relay:"$SHA" limitless-dns:"$SHA")

# One place that runs a command where the stack lives.
if [ -n "${BOX_SSH:-}" ]; then
  box() { ssh -o BatchMode=yes "$BOX_SSH" "$@"; }
  STACK="$BOX_DIR"
else
  box() { bash -c "$*"; }
  STACK="$HOME/$BOX_DIR"
fi

echo "build: gate $GATE_SHA, relay and dns $SHA"
# The compose file builds with context dirs relative to deploy/relay-vps (../relay, ../dns, GATE_CONTEXT); .env is not needed to build.
( cd "$WORK/deploy/relay-vps" \
  && touch relay.env \
  && RELAY_HOST=build.invalid ACME_EMAIL=build@invalid \
     docker compose -p limitless-relay-vps build ) 
rm -f "$WORK/deploy/relay-vps/relay.env"

PREV="$(box "cat $STACK/.last-deploy-hash 2>/dev/null || echo none")"
echo "ship: compose files to ${BOX_SSH:-this machine}:$STACK"
[ -z "${BOX_SSH:-}" ] || docker save "${IMAGES[@]}" | box docker load >/dev/null
box "mkdir -p $STACK"
# Compose files only; the VPS's own .env, relay.env and .last-deploy-hash stay untouched.
tar -C "$WORK/deploy/relay-vps" --exclude='.env' --exclude='relay.env' -c . | box "tar -C $STACK -x"
for f in .env relay.env; do
  box "test -f $STACK/$f" || { echo "missing $f on the box in $STACK (copy it from $f.example, S4-HOST-COMMANDS.md)." >&2; exit 1; }
done

DC="cd $STACK && GATE_SHA=$GATE_SHA RELAY_SHA=$SHA DNS_SHA=$SHA docker compose -p limitless-relay-vps --no-ansi"
# Without a certificate nginx cannot start: bring certbot up first and wait for the first issue (up to 3 min).
box "$DC up -d --no-build certbot"
for i in $(seq 36); do
  box "$DC exec -T certbot sh -c 'ls /etc/letsencrypt/live/*/fullchain.pem' >/dev/null 2>&1" && break
  [ "$i" = 36 ] && { echo "SMOKE FAIL: no certificate after 3 minutes. See: docker compose -p limitless-relay-vps logs certbot (S4-HOST-COMMANDS.md)." >&2; exit 1; }
  sleep 5
done
box "$DC up -d --no-build --remove-orphans"
box "echo $SHA > $STACK/.last-deploy-hash"

fail() { echo "SMOKE FAIL: $*" >&2; echo "Running and recorded: $SHA. Roll back: deploy/relay-vps/deploy-vps.sh $PREV" >&2; exit 1; }
retry() { local i; for i in $(seq 15); do "$@" && return 0; sleep 2; done; return 1; }
RELAY_HOST="$(box "grep -E '^RELAY_HOST=' $STACK/.env | cut -d= -f2-")"
health() { [ "$(box "curl -sk -o /dev/null -w '%{http_code}' --resolve $RELAY_HOST:443:127.0.0.1 https://$RELAY_HOST/healthz")" = 200 ]; }
retry health || fail "https://$RELAY_HOST/healthz (from the VPS) did not return 200 within 30 s"
wisp_no_token() { [ "$(box "curl -sk -o /dev/null -w '%{http_code}' --resolve $RELAY_HOST:443:127.0.0.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://evil.invalid' https://$RELAY_HOST/wisp/")" = 403 ]; }
wisp_no_token || fail "/wisp/ with a foreign Origin and no token was not refused with 403"
other="$(box "curl -sk -o /dev/null -w '%{http_code}' --resolve $RELAY_HOST:443:127.0.0.1 https://$RELAY_HOST/")"
[ "$other" = 404 ] || fail "/ returned $other instead of 404"

echo "Deployed $SHA (gate $GATE_SHA) to the VPS relay: /healthz 200, /wisp/ refuses a foreign Origin, / is 404."
echo "The app only uses it when home gate.env has RELAY_PUBLIC_URL set and the build has LB_FEATURE_OWNRELAY=true."
echo "Rollback: deploy/relay-vps/deploy-vps.sh $PREV"
