#!/usr/bin/env bash
# Launch rehearsal: real web + gate + relay against a MOCK GATE, local only (127.0.0.1), then the stack tests.
#   deploy/rehearsal/run.sh                 build, start, test, tear down
#   KEEP=1 deploy/rehearsal/run.sh          leave the stack up afterwards (tear down: see end of output)
#   REHEARSAL_WEB_PORT=8590 REHEARSAL_MOCK_PORT=8591 GATE_CONTEXT=~/limitless-gate  (defaults)
#   Extra args go to playwright, e.g.  deploy/rehearsal/run.sh -g Relay
# Touches only compose project limitless-browser-rehearsal. Secrets are generated per run in a temp dir.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
export REHEARSAL_WEB_PORT="${REHEARSAL_WEB_PORT:-8590}"
export REHEARSAL_MOCK_PORT="${REHEARSAL_MOCK_PORT:-8591}"
export REHEARSAL_VPS_PORT="${REHEARSAL_VPS_PORT:-8592}"   # VPS relay stand-in (plain ws, 127.0.0.1)
export GATE_CONTEXT="${GATE_CONTEXT:-$HOME/limitless-gate}"
# The mock GATE seeds an owner user with this id; the gate treats it as OWNER_SUB (admin panel tests).
export REHEARSAL_OWNER_SUB="00000000-0000-4000-8000-0000000000a1"
PROJECT=limitless-browser-rehearsal
# 0.3.0 builds ship with our relay off; the rehearsal keeps a working relay (WISP_RELAY=1 on web) and tests the 1.0 path.
# LB_REHEARSAL_RELAYOFF=1 builds the real 0.3.0 defaults instead (the relay is still reachable there: WISP_RELAY=1 stays on the web container).
if [ "${LB_REHEARSAL_RELAYOFF:-0}" != 1 ]; then export LB_FEATURE_OWNRELAY=true LB_FEATURE_OWNSOCKETS=4 LB_FEATURE_PAGECACHE=true LB_FEATURE_WARM=true; fi
# Speed run (LB_SPEED=1) or fault run (LB_FAULTS=1, tests/stack/failures.spec.js): start the fixture sites container and give the relay the TEST-ONLY config that allows the fixture subnet
# (prod config.toml keeps allow_non_global = false; tests/e2e/relay-config.spec.js asserts it). Exported before every
# compose call so `down` also removes the fixtures container.
if [ "${LB_SPEED:-0}" = 1 ] || [ "${LB_FAULTS:-0}" = 1 ]; then
  export COMPOSE_PROFILES=fixtures
  RELAY_SRC="$HERE/relay-fixtures.toml"
fi
START=$(date +%s)

for p in "$REHEARSAL_WEB_PORT" "$REHEARSAL_MOCK_PORT" "$REHEARSAL_VPS_PORT"; do
  if ss -ltn | awk '{print $4}' | grep -qE "[:.]$p\$"; then echo "rehearsal: port $p is in use" >&2; exit 1; fi
done
[ -d "$GATE_CONTEXT/test-support/mock-gate" ] || { echo "rehearsal: no mock gate under $GATE_CONTEXT" >&2; exit 1; }

RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lb-rehearsal.XXXXXX")"
chmod 700 "$RUN_DIR"
rand() { head -c 36 /dev/urandom | base64 | tr -d '/+=\n' | head -c "$1"; }
# The relay's resolver is the dns container at a fixed address; the rehearsal networks are 10.89.x, so the prod
# address is rewritten in a per-run copy of the config (the prod file is untouched).
RELAY_SRC="${RELAY_SRC:-$REPO/deploy/relay/config.toml}"
sed 's/10\.88\.81\.53/10.89.81.53/' "$RELAY_SRC" > "$RUN_DIR/relay.toml"
chmod 644 "$RUN_DIR/relay.toml"
export REHEARSAL_RELAY_CONFIG="$RUN_DIR/relay.toml"
export REHEARSAL_CLIENT_SECRET="$(rand 32)"
export REHEARSAL_GATE_ENV="$RUN_DIR/gate.env"
export REHEARSAL_VPS_ENV="$RUN_DIR/vps.env"
# Fresh Ed25519 pair and sync secret for the VPS stand-in, made by the gate's own script.
[ -f "$GATE_CONTEXT/scripts/relay-keys.ts" ] || { echo "rehearsal: no scripts/relay-keys.ts under $GATE_CONTEXT (gate needs relay mode)" >&2; exit 1; }
KEYS="$(cd "$GATE_CONTEXT" && node scripts/relay-keys.ts)"
key() { printf '%s\n' "$KEYS" | grep "^$1=" | cut -d= -f2-; }
(umask 077; cat > "$REHEARSAL_VPS_ENV" <<ENV
PUBLIC_ORIGIN=http://127.0.0.1:$REHEARSAL_WEB_PORT
RELAY_TOKEN_PUBLIC_KEY=$(key RELAY_TOKEN_PUBLIC_KEY)
RELAY_SYNC_SECRET=$(key RELAY_SYNC_SECRET)
TOTAL_UPLINK_MBPS=18
ENV
)
(umask 077; cat > "$REHEARSAL_GATE_ENV" <<ENV
GATE_ISSUER=http://127.0.0.1:$REHEARSAL_MOCK_PORT
GATE_BACKCHANNEL_URL=http://mock-gate:$REHEARSAL_MOCK_PORT
GATE_CLIENT_ID=limitless-browser
GATE_CLIENT_SECRET=$REHEARSAL_CLIENT_SECRET
PUBLIC_ORIGIN=http://127.0.0.1:$REHEARSAL_WEB_PORT
SESSION_SECRET=$(rand 48)
OWNER_SUB=$REHEARSAL_OWNER_SUB
RELAY_PUBLIC_URL=ws://127.0.0.1:$REHEARSAL_VPS_PORT/wisp/
RELAY_TOKEN_PRIVATE_KEY=$(key RELAY_TOKEN_PRIVATE_KEY)
RELAY_SYNC_SECRET=$(key RELAY_SYNC_SECRET)
ENV
)
# LB_REHEARSAL_MEMBERSHIP=1: gate with MEMBERSHIP=on (S5), for tests/stack/membership.spec.js. Off by default: the other specs sign in
# fresh accounts, which membership would hold at the welcome ceremony.
if [ "${LB_REHEARSAL_MEMBERSHIP:-0}" = 1 ]; then
  printf 'MEMBERSHIP=on\nMEMBER_DATA_KEY=%s\n' "$(head -c 32 /dev/urandom | base64)" >> "$REHEARSAL_GATE_ENV"
fi

DC=(docker compose -p "$PROJECT" -f "$HERE/docker-compose.rehearsal.yml")
cleanup() {
  rc=$?
  if [ "${KEEP:-0}" = 1 ] && [ $rc -eq 0 ]; then
    echo "rehearsal: stack left up on 127.0.0.1:$REHEARSAL_WEB_PORT (mock on :$REHEARSAL_MOCK_PORT). Tear down:"
    echo "  REHEARSAL_OWNER_SUB=x REHEARSAL_CLIENT_SECRET=x REHEARSAL_GATE_ENV=$REHEARSAL_GATE_ENV REHEARSAL_VPS_ENV=$REHEARSAL_VPS_ENV ${DC[*]} down -v"
  else
    "${DC[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$RUN_DIR"
  fi
  echo "rehearsal: done in $(( $(date +%s) - START )) s (exit $rc)"
  exit $rc
}
trap cleanup EXIT INT TERM

echo "rehearsal: building static tree"
"$REPO/scripts/build-static.sh" "rehearsal-$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo local)"

echo "rehearsal: building images (gate from $GATE_CONTEXT)"
"${DC[@]}" build

echo "rehearsal: starting stack"
"${DC[@]}" up -d --force-recreate
for i in $(seq 1 60); do
  if curl -fs -o /dev/null "http://127.0.0.1:$REHEARSAL_WEB_PORT/legal/" \
     && curl -fs -o /dev/null "http://127.0.0.1:$REHEARSAL_MOCK_PORT/healthz" \
     && "${DC[@]}" exec -T lbgate wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 \
     && curl -fs -o /dev/null "http://127.0.0.1:$REHEARSAL_VPS_PORT/healthz"; then break; fi
  [ "$i" = 60 ] && { "${DC[@]}" logs --tail 40 >&2; echo "rehearsal: stack did not become ready" >&2; exit 1; }
  sleep 1
done

echo "rehearsal: running stack tests"
cd "$REPO"
REHEARSAL_VPS_PORT="$REHEARSAL_VPS_PORT" REHEARSAL_BASE="http://127.0.0.1:$REHEARSAL_WEB_PORT" REHEARSAL_MOCK="http://127.0.0.1:$REHEARSAL_MOCK_PORT" \
  REHEARSAL_PROJECT="$PROJECT" REHEARSAL_COMPOSE_FILE="$HERE/docker-compose.rehearsal.yml" \
  npx playwright test -c playwright.stack.config.js "$@" || { "${DC[@]}" logs --tail 60 lbgate web >&2; exit 1; }
