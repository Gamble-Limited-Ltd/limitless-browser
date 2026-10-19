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
export GATE_CONTEXT="${GATE_CONTEXT:-$HOME/limitless-gate}"
PROJECT=limitless-browser-rehearsal
START=$(date +%s)

for p in "$REHEARSAL_WEB_PORT" "$REHEARSAL_MOCK_PORT"; do
  if ss -ltn | awk '{print $4}' | grep -qE "[:.]$p\$"; then echo "rehearsal: port $p is in use" >&2; exit 1; fi
done
[ -d "$GATE_CONTEXT/test-support/mock-gate" ] || { echo "rehearsal: no mock gate under $GATE_CONTEXT" >&2; exit 1; }

RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lb-rehearsal.XXXXXX")"
chmod 700 "$RUN_DIR"
rand() { head -c 36 /dev/urandom | base64 | tr -d '/+=\n' | head -c "$1"; }
export REHEARSAL_CLIENT_SECRET="$(rand 32)"
export REHEARSAL_GATE_ENV="$RUN_DIR/gate.env"
(umask 077; cat > "$REHEARSAL_GATE_ENV" <<ENV
GATE_ISSUER=http://127.0.0.1:$REHEARSAL_MOCK_PORT
GATE_BACKCHANNEL_URL=http://mock-gate:$REHEARSAL_MOCK_PORT
GATE_CLIENT_ID=limitless-browser
GATE_CLIENT_SECRET=$REHEARSAL_CLIENT_SECRET
PUBLIC_ORIGIN=http://127.0.0.1:$REHEARSAL_WEB_PORT
SESSION_SECRET=$(rand 48)
ENV
)

DC=(docker compose -p "$PROJECT" -f "$HERE/docker-compose.rehearsal.yml")
cleanup() {
  rc=$?
  if [ "${KEEP:-0}" = 1 ] && [ $rc -eq 0 ]; then
    echo "rehearsal: stack left up on 127.0.0.1:$REHEARSAL_WEB_PORT (mock on :$REHEARSAL_MOCK_PORT). Tear down:"
    echo "  REHEARSAL_CLIENT_SECRET=x REHEARSAL_GATE_ENV=$REHEARSAL_GATE_ENV ${DC[*]} down -v"
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
     && "${DC[@]}" exec -T lbgate wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1; then break; fi
  [ "$i" = 60 ] && { "${DC[@]}" logs --tail 40 >&2; echo "rehearsal: stack did not become ready" >&2; exit 1; }
  sleep 1
done

echo "rehearsal: running stack tests"
cd "$REPO"
REHEARSAL_BASE="http://127.0.0.1:$REHEARSAL_WEB_PORT" REHEARSAL_MOCK="http://127.0.0.1:$REHEARSAL_MOCK_PORT" \
  REHEARSAL_PROJECT="$PROJECT" REHEARSAL_COMPOSE_FILE="$HERE/docker-compose.rehearsal.yml" \
  npx playwright test -c playwright.stack.config.js "$@" || { "${DC[@]}" logs --tail 60 lbgate web >&2; exit 1; }
