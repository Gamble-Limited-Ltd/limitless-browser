#!/bin/sh
# Runs at container start (docker-entrypoint.d). nginx cannot read env, so write the snippet nginx.conf includes in
# `location ^~ /wisp/`. Default (prod, 0.3.0): 410, our relay is off until 1.0. WISP_RELAY=1 (rehearsal only) proxies to the gate.
OUT="${WISP_OUT:-/tmp/wisp.conf}"
if [ "${WISP_RELAY:-0}" = 1 ]; then echo 'include /etc/nginx/snippets/wisp-proxy.conf;' > "$OUT"; else echo 'return 410;' > "$OUT"; fi
