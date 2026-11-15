# Limitless 1.0 S4: host-level commands for Boss (nothing here was applied)

> **2026-11-15:** sections 1 to 6 are the 2026-11-10 home-server steps (BBR skipped, DNS cache and auth cache dropped for the VPS design). **Sections 7 to 10 are the VPS relay**: DNS, VPS base, deploy, check, load test, failure drill, rollback. Nothing in 7 to 10 has been run: the DNS record and the VPS are untouched (the coordinator's go for them reached this session only as a message, which the permission system refused for the DNS prompt to the hub). Placeholder hostname `relay.taps-holdings.org` (Boss decides; `*.taps-holdings.org` has a proxied wildcard record, so an explicit grey-cloud record is needed).

Written 2026-11-10. Everything in the repo (auth cache, DNS cache container, relay resources, timing headers) ships with the
1.0 deploy and needs no host step. Only BBR needs the host. Each step has a check and a rollback. Run them in a terminal on the
Gamble VM. Not testable in the rehearsal: `tcp_bbr` is not loaded on this kernel (6.12.113; available list is `reno cubic`,
module file `tcp_bbr.ko.xz` exists), and loading it is a host change.

**Recommendation (2026-11-11): skip steps 1 and 2.** Checked on the VM: still `cubic` / `fq_codel`, `bbr` not loaded, and
`cloudflared` runs the tunnel on **QUIC** (`protocol=quic` in its log). QUIC has its own congestion control in user space, so host
BBR does not touch the tunnel leg, which carries the home upload to members (the bottleneck). The relay mostly receives from
websites (the sender's congestion control applies there), and relay to gate to nginx to cloudflared is local. Expected gain is
near zero for a change that touches every service on the VM. Kept below in case Boss wants it anyway.

## 1. BBR and fq on the host (does not reach the QUIC tunnel, see above)
Applies to every service on the VM that sends data, not only Limitless (all of them move from `cubic` and `fq_codel` to `bbr` and `fq`).
Existing connections keep cubic until they reopen.

```bash
sudo modprobe tcp_bbr
echo tcp_bbr | sudo tee /etc/modules-load.d/bbr.conf
printf 'net.core.default_qdisc=fq\nnet.ipv4.tcp_congestion_control=bbr\n' | sudo tee /etc/sysctl.d/90-limitless-bbr.conf
sudo sysctl --system
```
Check: `sysctl net.ipv4.tcp_congestion_control net.core.default_qdisc` shows `bbr` and `fq`; `cat /proc/sys/net/ipv4/tcp_available_congestion_control` lists `bbr`.

Rollback:
```bash
sudo rm /etc/sysctl.d/90-limitless-bbr.conf /etc/modules-load.d/bbr.conf
sudo sysctl -w net.ipv4.tcp_congestion_control=cubic net.core.default_qdisc=fq_codel
```
(The module stays loaded until reboot, which is harmless.)

## 2. BBR for the relay container (only after step 1)
Container network namespaces start with the kernel default, so the relay needs its own setting. Without step 1 the relay
container would fail to start, which is why this line is not in the compose file. Add under `relay:` in
`deploy/docker-compose.yml`, commit, then run the normal deploy:
```yaml
    sysctls:
      net.ipv4.tcp_congestion_control: bbr
```
Check after deploy: `docker compose -p limitless-browser exec relay cat /proc/sys/net/ipv4/tcp_congestion_control` (the relay image is
distroless, so this may have no shell: use `docker inspect $(docker compose -p limitless-browser ps -q relay) --format '{{.HostConfig.Sysctls}}'`).
Rollback: delete the two lines and deploy again.

## 3. Socket buffers: no step
RELAY.md 3.4 planned a 4 MiB socket buffer ceiling. The host already allows 6 MiB for receive (`tcp_rmem` max 6291456) and 4 MiB for send
(`tcp_wmem` max 4194304). Whether a new container namespace starts from those host values was not tested, so the compose file sets nothing (setting 4 MiB
would have lowered receive if it does).

## 4. DNS cache container (ships with the deploy)
New service `dns` (unbound, fixed address 10.88.81.53 on `lb_relay`, outbound on `lb_egress` to 1.1.1.1 and 9.9.9.9 on port 853).
No host change. `egress-rules.sh` needs no change (it only rejects private ranges and port 853 to public addresses stays open).
After deploy:
```bash
cd ~/Browser && docker compose -p limitless-browser -f deploy/docker-compose.yml ps dns
docker compose -p limitless-browser -f deploy/docker-compose.yml exec dns nslookup example.com 127.0.0.1
```
Add a Kuma monitor for the container (Boss's call, a monitor change). Update the vault Service Inventory.
Kill switch without a rebuild of the other services: in `deploy/relay/config.toml` set `dns_servers = ["1.1.1.1", "9.9.9.9"]`
and run the normal deploy (the config is baked into the relay image).
Rollback of the whole release: `./deploy.sh <previous sha>`, then remove the leftover container:
`docker compose -p limitless-browser rm -sf dns`.

## 5. nginx auth cache (ships with the deploy)
No host step. Kill switch: delete the `proxy_cache lbauth;` block lines in the `/_gate/check` location of `deploy/web/nginx.conf`
and deploy (the web container's root is read-only, so there is no live edit).

## 6. Not done here (Boss decisions, see TUNNEL-OPTIONS.md)
No port, tunnel or DNS change. Home upload is still about 21 Mbit/s.

## 7. VPS relay: DNS and VPS base (placeholder host `relay.taps-holdings.org`, VPS 107.173.50.59, ssh alias `limitless-relay`, Ubuntu 24.04, root, 2 vCPU, 2 GB)
Checked read-only on 2026-11-15: Docker and Node are not installed, `ufw` is active with only 22 open, 29 GB free, 1.5 GB RAM available.

**7.1 DNS (Cloudflare dashboard, zone taps-holdings.org, or ask the hub).** One record, DNS only (grey cloud), never proxied:
`A  relay  107.173.50.59  Proxy status: DNS only  TTL 300`. Check: `dig +short relay.taps-holdings.org` prints `107.173.50.59`.
Rollback: delete that record (the name then falls back to the proxied wildcard).

**7.2 Firewall and Docker on the VPS** (`ssh limitless-relay`):
```bash
ufw allow 80/tcp comment 'lets encrypt http-01'
ufw allow 443/tcp comment 'limitless relay'
ufw status numbered
apt-get update && apt-get install -y docker.io docker-compose-v2 && systemctl enable --now docker
docker compose version
```
Rollback: `ufw delete allow 80/tcp; ufw delete allow 443/tcp; apt-get remove -y docker.io docker-compose-v2`. Port 80 is used only by certbot's HTTP-01 and answers nothing else.

**7.3 Keys and secrets** (on the Gamble VM, in `~/limitless-gate`, never paste the output anywhere):
```bash
cd ~/limitless-gate && node scripts/relay-keys.ts
```
It prints two blocks. Put the first (`RELAY_TOKEN_PRIVATE_KEY`, `RELAY_SYNC_SECRET`) in `~/Browser/deploy/gate.env` (home, read at the 1.0 deploy) and add `RELAY_PUBLIC_URL=wss://relay.taps-holdings.org/wisp/` there.
Put the second block in `relay.env` on the VPS, with the rest from `deploy/relay-vps/relay.env.example`:
```bash
ssh limitless-relay 'mkdir -p ~/limitless-relay-vps && umask 077 && cat > ~/limitless-relay-vps/relay.env' <<'EOF'
PUBLIC_ORIGIN=https://limitless.taps-holdings.org
RELAY_HOME_URL=https://limitless.taps-holdings.org
RELAY_TOKEN_PUBLIC_KEY=<from the second block>
RELAY_SYNC_SECRET=<same secret as home>
TOTAL_UPLINK_MBPS=150
FAIR_SHARE=on
EOF
ssh limitless-relay 'umask 077 && printf "RELAY_HOST=relay.taps-holdings.org\nACME_EMAIL=<your email>\nACME_STAGING=1\n" > ~/limitless-relay-vps/.env'
```
`ACME_STAGING=1` first: it proves DNS and port 80 without using Let's Encrypt's real rate limit; set it to `0` and redeploy for the real certificate.

## 8. VPS relay: deploy, check, rollback
Until the 1.0 deploy ships `/_lb/relay/sync` at home, the VPS polls a 404 and keeps itself locked (maintenance): safe, nothing is served to anyone.
```bash
cd ~/Browser && git checkout slice/1.0-relay   # or the merged commit; the tree must be clean
BOX_SSH=limitless-relay deploy/relay-vps/deploy-vps.sh        # builds here, ships images, starts certbot, waits for the certificate, starts the rest
```
It checks `/healthz` (200), a `/wisp/` upgrade with a foreign Origin (403) and `/` (404), then prints the rollback command (`deploy-vps.sh <previous sha>`).
Egress rules (the relay container cannot reach private ranges or the host; apply once, then at every boot):
```bash
ssh limitless-relay 'cd ~/limitless-relay-vps && ./egress-rules.sh && ./egress-rules.sh --apply'
ssh limitless-relay 'cat > /etc/systemd/system/lbrelay-egress.service <<EOF
[Unit]
Description=Limitless relay egress rules
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/root/limitless-relay-vps/egress-rules.sh --apply
[Install]
WantedBy=multi-user.target
EOF
systemctl enable lbrelay-egress.service'
```
**The single allowed reachability check** (no traffic through the relay): `curl -sI https://relay.taps-holdings.org/healthz | head -3` and `openssl s_client -connect relay.taps-holdings.org:443 -servername relay.taps-holdings.org </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates`.
Rollback of the whole VPS stack: `ssh limitless-relay 'cd ~/limitless-relay-vps && docker compose -p limitless-relay-vps down'`; of one release: `deploy-vps.sh <previous sha>`.
Home side (ships with the 1.0 deploy, `~/Browser/deploy.sh`): nginx `/_lb/relay-token` and `/_lb/relay/sync`, the gate with `RELAY_*` in `gate.env`, build `LB_FEATURE_OWNRELAY=true LB_FEATURE_OWNSOCKETS=4`. A rollback of home (`./deploy.sh <previous sha>`) makes the VPS lock itself after 120 s and the app use public relays.

## 9. Load test, revoke test, failure drill (NOT run: Boss says when; these push traffic through the VPS and spend transfer)
Budget first: RackNerd counts in plus out (5 TB a month, VPS powered off at 100 %). Record the meter before and after in the panel. Each relayed byte counts twice, so `--max-bytes 500000000` (the default) is about 1 GB of the budget.
**9.1 Load test (20 simulated members, separate relay-mode gate with its own keys, real epoxy and DNS cache, loopback client leg, no real members or home involved):**
```bash
ssh limitless-relay
cd ~/limitless-relay-vps && mkdir -p lt/out && chmod 777 lt/out
export GATE_SHA=$(docker images --format '{{.Tag}}' limitless-gate | head -1)   # the gate image deploy-vps.sh loaded
docker run --rm limitless-gate:$GATE_SHA node scripts/relay-keys.ts --json > lt/keys.json
python3 - <<'PY'
import json; k=json.load(open('lt/keys.json'))
open('loadtest.env','w').write(f"RELAY_TOKEN_PUBLIC_KEY={k['pub']}\nRELAY_SYNC_SECRET={k['secret']}\n")
PY
# CPU sampler (host) for the run; the runner reads it at the end
( while :; do docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' limitless-relay-vps-relaygate-lt-1 limitless-relay-vps-relay-1 limitless-relay-vps-dns-1 >> lt/cpu.txt; sleep 2; done ) & SAMPLER=$!
LT_TARGET=<host:80 of a large public test file> LT_PATH=</path> LT_MEMBERS=20 LT_SECONDS=60 LT_MAX_BYTES=500000000 \
  docker compose -p limitless-relay-vps --profile loadtest up --abort-on-container-exit loadtest
kill $SAMPLER; cat lt/out/report.md; ls lt/out
docker compose -p limitless-relay-vps --profile loadtest down
```
The report (`lt/out/report.json` and `report.md`) holds per member Mbit/s, aggregate, p50/p95/p99 connect-to-first-data latency, CPU per Mbit/s (sum of the sampled containers), bytes up and down against the relay's own count, and the revoke time of member 0 (halfway through the run). `LT_TARGET` must be a plain HTTP (port 80) file server Boss chooses; none is recorded here.
Local self-test of the script (loopback only, no VPS): `cd ~/limitless-gate && node scripts/relay-loadtest.ts --local --members 20 --seconds 10 --out /tmp/lt` (measured 2026-11-15: 20 members, about 107 Mbit/s each way through the in-process stand-in, revoke 0.46 s, relay byte count 99.8 % of the clients').
**9.2 Revoke test on the real pair (after the 1.0 deploy):** sign in as a test member, open a page that keeps a socket open (a video), then from the Gamble VM: `docker compose -p limitless-browser exec lbgate node scripts/kill.ts kill <sub>`; the socket must close (4403) within 2 s, and `unkill` restores it. Rehearsal numbers: `npm run test:stack` prints `revoke took N ms`.
**9.3 Failure drill on the real pair:** `ssh limitless-relay 'cd ~/limitless-relay-vps && docker compose -p limitless-relay-vps stop relaygate'`; within 15 s `POST /_lb/relay-token` answers 503, the app marks our relay down, shows the relay notice and uses public relays once the member agrees; `... start relaygate` and it recovers by itself. Rehearsal: `tests/stack/relay.spec.js`.

## 10. Log lines to write when these are run
`~/gll-agents/logs/changelog.md` (`date | repo | who | change | owner-to-know`), the vault Homelab Work Log, and the vault Service Inventory (`~/CodeZero/Projects/Gamble Limited/Service Inventory.md`): host name, VPS stack ports (80 certbot, 443 relay), the `lbrelay-egress` unit, the Kuma monitor for `https://relay.taps-holdings.org/healthz` (Boss's call). Not written yet because nothing was applied.

Last verified: 2026-11-15
