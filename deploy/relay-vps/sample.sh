#!/usr/bin/env bash
# MS-5 VPS sampler (docs/1.3/specs/01-measuring.md). Read-only: reads /proc, df and `docker stats`; writes only under $LB_SAMPLE_DIR.
# Cron every minute (see deploy/relay-vps/SAMPLER.md). No hostnames, no member ids: container names, counters and percentages only.
#   samples.jsonl  one line a minute, newest last, capped at 10080 lines (one week)
#   meter.json     {"month":"YYYY-MM","rx":bytes,"tx":bytes,"lastRx":n,"lastTx":n}: this month's transfer in BOTH directions
#                  (UTC calendar month; a counter that went down means a reboot, so its whole value counts as new traffic)
set -euo pipefail
DIR=${LB_SAMPLE_DIR:-/var/lib/limitless-sampler}
NETDEV=${LB_NETDEV:-/proc/net/dev}
MEMINFO=${LB_MEMINFO:-/proc/meminfo}
IFACE=${LB_IFACE:-$(ip route show default 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="dev"){print $(i+1); exit}}')}
IFACE=${IFACE:-eth0}
NOW=${LB_NOW:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
mkdir -p "$DIR"

read -r RX TX < <(awk -v i="$IFACE:" '$1==i {print $2, $10}' "$NETDEV")
[ -n "${RX:-}" ] || { echo "sample.sh: interface $IFACE not in $NETDEV" >&2; exit 1; }
MEM_TOTAL=$(awk '/^MemTotal:/{print int($2/1024)}' "$MEMINFO")
MEM_AVAIL=$(awk '/^MemAvailable:/{print int($2/1024)}' "$MEMINFO")
DISK_PCT=$(df --output=pcent / | tail -1 | tr -dc 0-9)
LOAD1=$(cut -d' ' -f1 /proc/loadavg)
if [ -n "${LB_DOCKER_STATS:-}" ]; then STATS=$(cat "$LB_DOCKER_STATS"); else STATS=$(docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' 2>/dev/null || true); fi
CONT=$(printf '%s\n' "$STATS" | jq -R -s -c 'split("\n") | map(select(length>0) | split("|") | {n: .[0], cpu: (.[1] | rtrimstr("%") | tonumber? // null), memMb: (.[2] | split(" / ")[0] | if test("GiB") then (rtrimstr("GiB") | tonumber * 1024) elif test("MiB") then (rtrimstr("MiB") | tonumber) else 0 end | floor)})')

jq -n -c --arg t "$NOW" --argjson rx "$RX" --argjson tx "$TX" --argjson mt "$MEM_TOTAL" --argjson ma "$MEM_AVAIL" \
  --argjson d "$DISK_PCT" --argjson l "$LOAD1" --argjson c "$CONT" \
  '{t:$t, load1:$l, memTotalMb:$mt, memAvailMb:$ma, diskPct:$d, rx:$rx, tx:$tx, containers:$c}' >> "$DIR/samples.jsonl"
tail -n 10080 "$DIR/samples.jsonl" > "$DIR/samples.tmp" && mv "$DIR/samples.tmp" "$DIR/samples.jsonl"

MONTH=${NOW:0:7}
OLD=$(cat "$DIR/meter.json" 2>/dev/null || echo '{}')
jq -n -c --argjson o "$OLD" --arg m "$MONTH" --argjson rx "$RX" --argjson tx "$TX" '
  def d($now; $last): if $last == null then 0 elif $now < $last then $now else $now - $last end;
  (if $o.month == $m then $o else {month: $m, rx: 0, tx: 0} end) as $s
  | {month: $m, rx: ($s.rx + d($rx; $o.lastRx)), tx: ($s.tx + d($tx; $o.lastTx)), lastRx: $rx, lastTx: $tx}' > "$DIR/meter.tmp"
mv "$DIR/meter.tmp" "$DIR/meter.json"
