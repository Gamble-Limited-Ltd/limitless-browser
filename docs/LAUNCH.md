# Limitless Browser 0.1.0: launch runbook

Status 2026-10-19: all launch stages built on `launch/0.1.0`, `npm test` 21/21, `npm run test:stack` 15/15
(full stack against a mock GATE). 0.1.0 launches outside the release lanes (`PLAN.md` section 2); Boss runs
every step below. No non-hotfix deploy between 10 pm and 7 am America/Chicago.

## 1. Register the client in GATE (Boss, in `~/gll-id`)
```bash
cd ~/gll-id
./manage.sh clients add limitless-browser --name "Limitless Browser" --redirect https://limitless.taps-holdings.org/auth/callback --post-logout https://limitless.taps-holdings.org/ --requires-approval
./manage.sh clients direct limitless-browser on
./manage.sh apps approve limitless-browser thestrongest
./manage.sh apps list limitless-browser
```
The client secret is printed once by `clients add`; it goes into `deploy/gate.env` in step 2.

## 2. Gate secrets (Boss, in this repo)
```bash
cd ~/Browser
read -rsp "GATE client secret: " LB_S; echo
(umask 077; cat > deploy/gate.env <<EOF
GATE_ISSUER=https://id.taps-holdings.org
GATE_BACKCHANNEL_URL=http://gate:3301
GATE_CLIENT_ID=limitless-browser
GATE_CLIENT_SECRET=$LB_S
PUBLIC_ORIGIN=https://limitless.taps-holdings.org
SESSION_SECRET=$(openssl rand -base64 48)
RELAY_URL=ws://relay:4000/
DATA_DIR=/data
PORT=8080
EOF
); unset LB_S
```
`GATE_BACKCHANNEL_URL` makes the gate join GATE's private `gll_gate` network (needed while GATE is behind
Cloudflare Access; see `ACCESS-CONTROL.md` section 10).

## 3. Deploy (Boss)
```bash
cd ~/Browser && git checkout main && git merge --ff-only launch/0.1.0 && ./deploy.sh
```
Rollback for the first deploy (takes it offline): `docker compose -p limitless-browser down`.
Later rollbacks: `./deploy.sh <previous sha>` (see `.last-deploy-hash`).

## 4. Cloudflare Tunnel (Boss, dashboard)
The tunnel is token-managed (`cloudflared.service`), so the route is added in the dashboard: Zero Trust,
Networks, Tunnels, the existing tunnel, Public Hostname, Add: subdomain `limitless`, domain `taps-holdings.org`,
type `HTTP`, URL `localhost:8580`. Do not put a Cloudflare Access application in front of it (the gate does
access). Only switch the route on after step 3's smoke passed.

## 5. Owner caps (after Boss's first sign-in)
Print the GATE account id, then add `OWNER_SUB=<id>` to `deploy/gate.env` and run `./deploy.sh` again:
```bash
docker compose -p limitless-browser exec lbgate node -e "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('/data/gate.sqlite',{readOnly:true}).prepare('select distinct sub, email from sessions').all())"
```

## 6. After launch
- Push `main` to GitHub so the in-app source link (AGPL section 13) shows the running code.
- gll-shared v0.2.3 push; gll-site and gll-shared listings (Boss's OK per repo); vault handoff.
- Open: legal placeholders (Boss review), host egress rules (`deploy/relay/egress-rules.sh`), abuse contact.
