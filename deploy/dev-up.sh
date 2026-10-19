#!/usr/bin/env bash
# Bring the stack up locally on 127.0.0.1:8580 with a STUB gate (no ~/limitless-gate needed).
#   deploy/dev-up.sh            stub denies (401): / shows the sign-in page
#   DEV_ALLOW=1 deploy/dev-up.sh   stub allows (200): the static app is served
#   DEV_ALLOW=403 ...              stub says signed in but not approved: invite page
# Tear down: docker compose -p limitless-browser down
# Touches only the limitless-browser compose project. Never prod: deploy.sh is the prod path.
set -euo pipefail
cd "$(dirname "$0")"
case "${DEV_ALLOW:-0}" in unavailable) export LB_STUB_CHECK=401 LB_STUB_REASON=unavailable;; 1) export LB_STUB_CHECK=200;; 403) export LB_STUB_CHECK=403;; *) export LB_STUB_CHECK=401;; esac
../scripts/build-static.sh "dev-$(git -C .. rev-parse --short HEAD 2>/dev/null || echo local)"
docker compose -p limitless-browser -f docker-compose.yml -f docker-compose.dev.yml build web
if [ "${DEV_WITH_RELAY:-0}" = 1 ]; then
  docker compose -p limitless-browser -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate web lbgate relay
else
  # Relay is skipped by default (slow first build); the stub gate has no /wisp/.
  docker compose -p limitless-browser -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate --no-deps web lbgate
fi
echo "dev stack up on http://127.0.0.1:8580 (stub gate check = $LB_STUB_CHECK)"
