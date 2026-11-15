#!/bin/sh
# Let's Encrypt for $RELAY_HOST by HTTP-01 (standalone on port 80; the DNS record must already point at this VPS).
# Issues once, then tries a renewal every 12 h (certbot renews inside 30 days of expiry).
set -eu
STAGING=""; [ "${ACME_STAGING:-0}" = 1 ] && STAGING="--staging"
while :; do
  certbot certonly --non-interactive --agree-tos -m "$ACME_EMAIL" $STAGING --standalone --preferred-challenges http \
    -d "$RELAY_HOST" --keep-until-expiring || echo "certbot: failed, retrying in 12 h" >&2
  sleep 43200
done
