# Limitless 1.0: tunnel options for `/wisp/` (RELAY.md 3.0)

Research only, 2026-11-10. Nothing was changed, logged in or deployed. This is a reading of public terms pages, not legal advice.
Problem (`R1-WORKERS-RESULT.md` addendum): Cloudflare Self-Serve Subscription Agreement 2.2.1(j), last updated September 12, 2025,
https://www.cloudflare.com/terms/ : "Unless otherwise expressly permitted in writing by Cloudflare, you will not ... (j) use the
Services to provide a virtual private network or other similar proxy services." `/wisp/` on the tunnel reads as that. Boss accepted
the risk for now (2026-11-10). The same account carries GATE, HALL, Status, the games and Access, so a suspension is wide.

Facts used below: home upload about 21 Mbit/s, download about 104 Mbit/s, 30 ms to Cloudflare (`BASELINE.md`). The home upload is the
ceiling for all members in every option that keeps the relay at home. Whether the ISP gives a public (non-CGNAT) IP, whether it is
static, and the ISP's acceptable-use terms were not checked (not readable from here): they gate options A and B.

## Summary table
| Option | Cost | Home IP exposure | Free-only rule | Latency vs today | Effort | Terms risk |
|---|---|---|---|---|---|---|
| 0 Status quo (CF tunnel) | 0 | None to members (sites see the home IP) | Met | Baseline | None | Breach of CF 2.2.1(j), whole-account suspension |
| A `/wisp/` direct to home IP (port forward) | 0 | Yes: the DNS name resolves to the home IP | Met | Lower: removes the Cloudflare edge hop | Medium | No provider terms in the path except the ISP's |
| B Another free tunnel for `/wisp/` | 0 | No (provider sees all bytes of the socket) | Met if free tier holds | Likely worse (extra relay, bandwidth caps) | Medium | Each provider's own terms (see below) |
| C Separate CF account and domain | Domain about 10 to 15 USD a year (new paid item) unless a free subdomain is found | None extra | Domain breaks the rule unless free | Same | Medium | Still a breach, only shrinks the blast radius |
| D Written permission from Cloudflare | Probably paid (Enterprise) | None | Breaks the rule if paid | Same | Low effort, uncertain outcome | None if granted |
| E Proton egress | Already paid (about 1.5 years left) | Home IP hidden from sites, not from the tunnel path | Met | Adds a Proton hop and Proton server speed | High | Proton 2.7 (below) |

## 0 Status quo
Free, fast enough, but the exposure is the one above. Mitigations already true: invite only, a handful of members, WSS is opaque.

## A Port forward on the home IP
- What changes: a router port forward (for example TCP 8443, or 443 if free) to the VM, a small TLS front (nginx `web` already exists)
  for a name such as `wisp.taps-holdings.org` published as a **DNS-only** (grey cloud) record, the app's relay URL points there.
  `/wisp/` stays gated by the same `auth_request` (cookies are host-only `__Host-`, so a second hostname needs the session to reach
  it: either the app origin stays on the tunnel and `/wisp/` is a cross-origin WebSocket with a short-lived signed token from
  the gate, or the whole app moves; the token route is new gate work, about one slice).
- Cost 0. Exposure: the home IP is public in DNS and every member learns it; the host takes direct internet scans and any DDoS.
  Members on school networks may block non-443 ports.
- Latency: member to home with no Cloudflare edge, so usually lower. Throughput: same 21 Mbit/s ceiling.
- Needs from Boss: a router rule (a port change, Boss's call), a DNS record, a TLS cert (Let's Encrypt through DNS-01 needs no
  extra open port), a DDNS updater if the IP is not static, and an ISP terms check (hosting for others from a home line is often
  restricted; not read here).
- Cloudflare's terms are no longer in the `/wisp/` path. DNS hosting of a grey-cloud name is not the "Services" use that (j) targets,
  but that is my reading, not Cloudflare's statement.

## B Other free tunnels (terms quoted, fetched 2026-11-10)
- **Tailscale Funnel** (https://tailscale.com/kb/1223/funnel, last validated Jan 20, 2026, beta): "Traffic sent over a Funnel is
  subject to non-configurable bandwidth limits." Only ports 443, 8443, 10000; DNS names only under `*.ts.net`. Funnel hides the home
  IP. The bandwidth limit is unspecified, which is a poor fit for a 21 Mbit/s shared pipe we want to measure. Its terms of service were
  not read.
- **ngrok** (https://ngrok.com/tos, last updated March 2, 2026): Acceptable Use (iii) forbids to "rent, transfer, resell, lease,
  license, assign, grant any rights in, or otherwise make available the ngrok Services ... to third parties". Fees section: free
  services are "provided to you without charge, up to certain specified limits", and over them ngrok "may limit your access or usage".
  The free-tier numbers are on the pricing page, not in the terms, and were not read. Members using our endpoint is arguably
  "making available".
- **playit.gg** (https://playit.gg/terms, last updated Feb 20, 2026): 3.4 forbids to "make the Services ... available to any third
  party ... including ... making access to any network tunnels, endpoints, bandwidth, or infrastructure provided by the Services
  available for purchase, transfer, or use by others"; 3.3 forbids "Establishing hidden, encrypted, or obfuscated communication
  tunnels intended to conceal remote control, evade detection, or disguise the nature of traffic". It is a game-server tunnel;
  a general web proxy is outside its purpose.
- **Pinggy, localhost.run, bore and similar:** their terms pages were not reachable (404) or not read, so no quote. Nothing is
  assumed about them.
- Overall: no free tunnel read here clearly permits carrying other people's arbitrary TCP. Each adds a hop and a bandwidth cap that
  is not ours to size, and we would trade one provider's clause for another's. Not recommended.

## C Separate Cloudflare account and domain
Cheapest way to stop a suspension reaching GATE, HALL, Status and the games. Breach stays. A new domain is a paid item (rule
is free only), so it needs a free name, which Cloudflare does not provide. Needs: new account, new tunnel, new DNS, a new GATE
redirect host for sign-in (the OIDC client and `PUBLIC_ORIGIN` change), all Boss's calls. Partial and slow to set up.

## D Written permission
Cloudflare's own text allows it ("Unless otherwise expressly permitted in writing"). Realistically an Enterprise conversation. The
request is free to send; an answer or a price may follow. A support ticket naming the use (invite-only private browsing
proxy) is the honest route. No outcome is predictable from the public text. Not a plan by itself.

## E Proton egress
Does not fix the tunnel problem: members still reach us through Cloudflare. It only hides the home IP from sites. Proton Terms of
Service (https://protonvpn.com/terms-and-conditions, last modified November 05, 2026), section 2 item 7 lists as unauthorized
"Reselling, sublicensing, or otherwise making the Services available to any third party, except where expressly permitted under your
subscription plan or authorized in writing by the Company", and item 6 "Sharing your Account or login credentials with any other
person or entity". Running members' traffic through Proton reads as item 7. Throughput is bounded by the Proton server and the
home upload anyway. Ends with the subscription. Needs a WireGuard container, a kill switch and Boss's account credentials on the VM.
Not recommended until Proton agrees in writing (a support question).

## Recommendation
1. Keep the status quo for 1.0 (already decided), log the risk, and send Cloudflare one written request for permission (D, free, no
   change). In parallel check the ISP terms and whether the home IP is public.
2. If Boss wants out of Cloudflare's terms: move only `/wisp/` to option A (direct, DNS-only name, token-authenticated WebSocket).
   It is the only free path that removes a provider clause and also lowers latency; its price is a public home IP and a
   gate token feature (one slice). Do not do B, C or E first.
   Nothing here is applied: any port, tunnel or DNS change is Boss's.

## Update 2026-11-11 (checked from the Gamble VM)
- **Home IP:** the address the internet sees from the VM is a public IPv4 (not in 100.64.0.0/10 or a private range), so
  option A is technically possible. Not checked: whether the router's WAN address is that same address (no CGNAT behind it),
  whether it is static, and the ISP's terms. The Claude Hub had no agent running to read the UniFi gateway; ask it next time
  one is up, or Boss reads the WAN IP in the UniFi console.
- **The tunnel runs on QUIC** (`cloudflared` log: `protocol=quic`). This matters for S4 3.3: host BBR does not change the
  tunnel leg (QUIC carries its own congestion control), see `S4-HOST-COMMANDS.md`.
- **Draft permission request (option D)** for Boss to send from the Cloudflare dashboard (Support, account and billing or
  general question). It is free and changes nothing; sending it is Boss's call (it names the use to Cloudflare):

  > Subject: Permission question, Self-Serve Subscription Agreement 2.2.1(j)
  >
  > Hello. We run a small, invite-only web browser app for a small number of signed-in members, published through a Cloudflare
  > Tunnel on our account. Part of it is a WebSocket endpoint that lets the app fetch web pages for the signed-in member
  > (a private browsing proxy). Access is limited to members we approve; it is not offered to the public and not sold.
  > Section 2.2.1(j) of the Self-Serve Subscription Agreement says the Services may not be used to provide "a virtual
  > private network or other similar proxy services" unless expressly permitted in writing. Could you tell us whether this
  > use can be permitted in writing on our current plan, and if not, which plan or option would allow it? If it cannot be
  > permitted, we will move that endpoint off Cloudflare. Thank you.

- **Decision Boss needs to make before 1.0 ships (pick one):**
  1. **Status quo + send the request (recommended for 1.0).** Zero work, risk logged. Revisit when Cloudflare answers.
  2. **Move `/wisp/` to option A now.** Needs: router port forward, DNS-only record, cert, and a gate token feature
     (about one slice, added to 1.0 before S5). Exposes the home IP to members.
  3. **Status quo, no request.** Zero work, risk stays silent; a suspension would hit GATE, HALL, Status and the games.

Last verified: 2026-11-11
