#!/bin/sh
# Proves: LEGAL_VERSION off = /legal/ pages served as today; on = terms and privacy redirect to HALL, /legal/ still served.
# Uses a throwaway nginx container on 127.0.0.1 (no compose project touched).
set -u
cd "$(dirname "$0")/../.."
fail=0; ok() { echo "ok   $1"; }; bad() { echo "FAIL $1"; fail=1; }
T=$(mktemp -d); trap 'rm -rf "$T"; docker rm -f lb-legal-v2-test >/dev/null 2>&1' EXIT
mkdir -p "$T/html/legal"; cp legal/*.html "$T/html/legal/"
run() { # $1 = LEGAL_VERSION value
  docker rm -f lb-legal-v2-test >/dev/null 2>&1
  docker run -d --name lb-legal-v2-test -p 127.0.0.1:18599:80 -e LEGAL_VERSION="$1" \
    -v "$PWD/deploy/web/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v "$PWD/deploy/web/snippets:/etc/nginx/snippets:ro" \
    -v "$PWD/deploy/web/legal-v2.sh:/docker-entrypoint.d/40-legal-v2.sh:ro" \
    -v "$T/html:/usr/share/nginx/html:ro" -v "$T/html:/usr/share/nginx/br:ro" \
    nginx:1.29-alpine >/dev/null || exit 2
  i=0; while ! curl -s -o /dev/null http://127.0.0.1:18599/legal/ && [ $i -lt 30 ]; do sleep 0.3; i=$((i+1)); done
}
code() { curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "http://127.0.0.1:18599$1"; }
run ""
[ "$(code /legal/terms.html)" = "200 " ] && ok "off: terms.html served" || bad "off: terms.html"
[ "$(code /legal/privacy.html)" = "200 " ] && ok "off: privacy.html served" || bad "off: privacy.html"
[ "$(code /legal/)" = "200 " ] && ok "off: /legal/ served" || bad "off: /legal/"
run "garbage"
[ "$(code /legal/terms.html)" = "200 " ] && ok "invalid value = off" || bad "invalid value"
run "2026-11-15"
[ "$(code /legal/terms.html)" = "302 https://hall.taps-holdings.org/legal/terms" ] && ok "on: terms -> HALL" || bad "on: terms $(code /legal/terms.html)"
[ "$(code /legal/privacy)" = "302 https://hall.taps-holdings.org/legal/privacy" ] && ok "on: privacy -> HALL" || bad "on: privacy"
[ "$(code /legal/)" = "200 " ] && ok "on: /legal/ still served" || bad "on: /legal/"
curl -s http://127.0.0.1:18599/legal/ | grep -q 'github.com/Gamble-Limited-Ltd/limitless-browser' && ok "on: AGPL source link in /legal/" || bad "AGPL link"
exit $fail
