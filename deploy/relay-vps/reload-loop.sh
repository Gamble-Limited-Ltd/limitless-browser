#!/bin/sh
# nginx image entrypoint hook: reload every 12 h so a renewed certificate (volume written by certbot) is picked up.
( while :; do sleep 43200; nginx -s reload; done ) &
