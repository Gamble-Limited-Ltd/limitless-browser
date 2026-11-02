#!/bin/sh
# Runs at container start (nginx image runs /docker-entrypoint.d/*.sh). nginx cannot read env, so write the
# snippet that nginx.conf includes. LEGAL_VERSION unset, empty or not YYYY-MM-DD: empty snippet, /legal/ as before.
OUT="${LEGAL_V2_OUT:-/tmp/legal-v2.conf}"
HALL=https://hall.taps-holdings.org/legal
: > "$OUT"
case "${LEGAL_VERSION:-}" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])
    # /legal/ itself stays served: it carries the AGPL source link.
    cat > "$OUT" <<CONF
rewrite ^/legal/terms(\.html)?\$ $HALL/terms redirect;
rewrite ^/legal/privacy(\.html)?\$ $HALL/privacy redirect;
CONF
    ;;
  "") ;;
  *) echo "legal-v2: LEGAL_VERSION is not YYYY-MM-DD, ignored" >&2 ;;
esac
