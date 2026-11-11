# Limitless 1.0 S4: host-level commands for Boss (nothing here was applied)

Written 2026-11-10. Everything in the repo (auth cache, DNS cache container, relay resources, timing headers) ships with the
1.0 deploy and needs no host step. Only BBR needs the host. Each step has a check and a rollback. Run them in a terminal on the
Gamble VM. Not testable in the rehearsal: `tcp_bbr` is not loaded on this kernel (6.12.113; available list is `reno cubic`,
module file `tcp_bbr.ko.xz` exists), and loading it is a host change.

## 1. BBR and fq on the host (helps cloudflared, which runs on the host)
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

Last verified: 2026-11-10
