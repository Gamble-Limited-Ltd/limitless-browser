#!/usr/bin/env bash
# Host-level egress rules for the VPS relay (docs/1.0/S4-HOST-COMMANDS.md).
# Same idea as deploy/relay/egress-rules.sh on the Gamble VM, for this stack's subnets (docker-compose.yml here).
# Even if the relay were exploited, its network could not reach this VPS, private ranges or the other Docker bridges.
#
#   sudo ./egress-rules.sh            print the rules (dry run, default)
#   sudo ./egress-rules.sh --apply    insert them (idempotent: removes its own earlier copies first)
#   sudo ./egress-rules.sh --remove   delete them
# Not persistent across reboot unless saved (S4-HOST-COMMANDS.md).
set -euo pipefail
MODE="${1:---print}"
EGRESS=10.88.82.0/24   # relay and dns way out
CERT=10.88.86.0/24     # certbot and relaygate way out (Let's Encrypt, the home poll)
FRONT=10.88.84.0/24    # tls: no outbound at all (inbound 443 is unaffected)
TAG="lbbox-egress"
DENY=(10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 127.0.0.0/8 0.0.0.0/8
      224.0.0.0/4 240.0.0.0/4 192.0.0.0/24 198.18.0.0/15)

rules() {
  local d s
  for s in "$EGRESS" "$CERT"; do
    for d in "${DENY[@]}"; do echo "-I DOCKER-USER -s $s -d $d -m comment --comment $TAG -j REJECT"; done
    echo "-I INPUT -s $s -m comment --comment $TAG -j DROP"
  done
  echo "-I DOCKER-USER -s $FRONT ! -d $FRONT -m conntrack --ctstate NEW -m comment --comment $TAG -j REJECT"
}
delete_rules() { rules | sed 's/^-I /-D /'; }

case "$MODE" in
  --print) echo "# dry run; use --apply (as root) to insert"; rules | sed 's/^/iptables /';;
  --apply)
    [ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
    delete_rules | while read -r r; do iptables $r 2>/dev/null || true; done
    rules | tac | while read -r r; do iptables $r; done
    echo "applied $(rules | wc -l) rules (tag $TAG). Check: iptables -S DOCKER-USER | grep $TAG";;
  --remove)
    [ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
    delete_rules | while read -r r; do iptables $r 2>/dev/null || true; done; echo removed;;
  *) echo "usage: $0 [--print|--apply|--remove]" >&2; exit 2;;
esac
