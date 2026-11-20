# VPS sampler (MS-5, docs/1.3/specs/01-measuring.md)

Read-only. Every minute `sample.sh` appends one line to `/var/lib/limitless-sampler/samples.jsonl` (load, RAM, disk, uplink/downlink
counters, CPU and RAM per container; last 10080 lines) and updates `meter.json` (this UTC month's transfer, both directions). No
hostnames, no member ids. It feeds spec 04 SV-0 (CPU budget) and the 70 and 90 percent transfer alerts (5 TB plan read both ways).

Install (as root on the VPS, from the Gamble VM):
```bash
scp ~/Browser/deploy/relay-vps/sample.sh limitless-relay:/usr/local/bin/limitless-sample.sh
ssh limitless-relay 'chmod 755 /usr/local/bin/limitless-sample.sh && echo "* * * * * root /usr/local/bin/limitless-sample.sh" > /etc/cron.d/limitless-sample'
```
Remove (data included):
```bash
ssh limitless-relay 'rm -f /etc/cron.d/limitless-sample /usr/local/bin/limitless-sample.sh; rm -rf /var/lib/limitless-sampler'
```
Alerts (from the Gamble VM): `node scripts/vps-meter-alert.mjs --dry` shows the state; with a Kuma push monitor URL in
`~/.config/gll-cloud/vps-meter-kuma.env` (`LB_KUMA_PUSH_URL=...`) it pushes (down at 70 percent and above, the message names warn or
crit). Schedule it hourly by cron when the monitor exists. `--report` prints the week's CPU and RAM peaks for SV-0.
