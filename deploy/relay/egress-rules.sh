#!/usr/bin/env bash
# Host-level egress rules for the Limitless Browser containers. FOR BOSS TO REVIEW. NOT APPLIED by anyone else.
# Belt and braces on top of epoxy-server's own checks (allow_non_global=false etc., deploy/relay/config.toml):
# even if the relay were exploited, its network could not reach this VM, the LAN or other Docker projects.
#
#   sudo deploy/relay/egress-rules.sh            print the rules (dry run, default)
#   sudo deploy/relay/egress-rules.sh --apply    insert them (idempotent: removes its own earlier copies first)
#   sudo deploy/relay/egress-rules.sh --remove   delete them
# Rules live in DOCKER-USER (FORWARD path, evaluated before Docker's own) and INPUT (traffic to the host itself).
# They are not persistent across reboot unless saved (iptables-persistent / a systemd unit); decide when applying.
# Subnets must match deploy/docker-compose.yml.
set -euo pipefail
MODE="${1:---print}"
EGRESS=10.88.82.0/24     # lb_egress: relay's way out
GATEOUT=10.88.83.0/24    # lb_gate_out: gate -> GLL ID
EDGE=10.88.84.0/24       # lb_edge: web's published-port bridge (should not initiate anything)
TAG="lb-egress"

# Destinations the relay must never reach. (Includes every Docker bridge on this VM: 172.16/12, and the LAN 10/8.)
DENY=(10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 127.0.0.0/8 0.0.0.0/8
      224.0.0.0/4 240.0.0.0/4 192.0.0.0/24 198.18.0.0/15)

rules() { # prints iptables arguments (without the leading "iptables"), one rule per line
  local d
  # relay: DOCKER-USER, inserted so the first listed ends up first
  for d in "${DENY[@]}"; do echo "-I DOCKER-USER -s $EGRESS -d $d -m comment --comment $TAG -j REJECT"; done
  # gate_out: same denials (GLL ID is reached over its public name)
  for d in "${DENY[@]}"; do echo "-I DOCKER-USER -s $GATEOUT -d $d -m comment --comment $TAG -j REJECT"; done
  # web edge bridge: nothing to initiate outbound
  echo "-I DOCKER-USER -s $EDGE ! -d $EDGE -m conntrack --ctstate NEW -m comment --comment $TAG -j REJECT"
  # traffic from these containers to the host's own addresses (hits INPUT, not FORWARD)
  echo "-I INPUT -s $EGRESS -m comment --comment $TAG -j DROP"
  echo "-I INPUT -s $GATEOUT -m comment --comment $TAG -j DROP"
}
delete_rules() { rules | sed 's/^-I /-D /'; }

case "$MODE" in
  --print) echo "# dry run; use --apply (as root) to insert"; rules | sed 's/^/iptables /';;
  --apply)
    [ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
    delete_rules | while read -r r; do iptables $r 2>/dev/null || true; done
    rules | tac | while read -r r; do iptables $r; done   # tac: keeps the printed order after -I
    echo "applied $(rules | wc -l) rules (tag $TAG). Check: iptables -S DOCKER-USER | grep $TAG";;
  --remove)
    [ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
    delete_rules | while read -r r; do iptables $r 2>/dev/null || true; done; echo removed;;
  *) echo "usage: $0 [--print|--apply|--remove]" >&2; exit 2;;
esac
# IPv6: the compose networks have no IPv6, so containers have no v6 route. If enable_ipv6 is ever set on
# lb_egress, add equivalent ip6tables rules for ::1, fc00::/7, fe80::/10, ff00::/8.
