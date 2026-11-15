# Relay DNS cache (docs/1.0/RELAY.md 3.2): unbound, forwarding to 1.1.1.1 and 9.9.9.9 over DNS-over-TLS.
# Base pinned by digest (alpine at the time of writing; to bump: docker pull alpine, then docker inspect for the digest).
FROM alpine@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
RUN apk add --no-cache unbound ca-certificates
COPY unbound.conf /etc/unbound/unbound.conf
USER unbound
EXPOSE 53/udp 53/tcp
ENTRYPOINT ["unbound", "-d", "-c", "/etc/unbound/unbound.conf"]
