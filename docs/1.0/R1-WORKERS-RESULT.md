# R1: Cloudflare Workers relay prototype, result

**Status: phase 1, not deployed. Verdict: NO-GO on terms. Build stopped before any code was written.**
Researched 2026-11-10 against the live Cloudflare docs. Nothing was deployed, no login, no DNS or account change.

## 1. Terms (the blocker)
Cloudflare Self-Serve Subscription Agreement, section 2.2.1 "Restrictions" (last updated September 12, 2025),
https://www.cloudflare.com/terms/ : "Unless otherwise expressly permitted in writing by Cloudflare, you will not ...
(j) use the Services to provide a virtual private network or other similar proxy services."

A Worker that accepts WISP WebSockets from members and opens arbitrary TCP connections for them is a proxy service
for other people. That reads as a plain breach of (j) on a self-serve account. Also relevant: 2.2.1(a) forbids selling or
renting access to the Services to third parties (we would not sell, but members would use our Worker), and 2.2.1(c)
forbids use that circumvents service limits (see 2 below).
The Service-Specific Terms (https://www.cloudflare.com/service-specific-terms-application-services/, updated
September 28, 2026) have no carve-out for Workers proxying that I could find. Only a written exception from Cloudflare
(for example an Enterprise contract) could change this, and that is a paid route, against the "no new paid services" rule
in `RELAY.md`. This is a reading of the public text, not legal advice.
Per the task rule ("if it looks like a breach, stop"), no Worker, test or deploy steps were produced.

## 2. Limits found (for the record, sources are Cloudflare docs)
| Item | Finding | Source |
|---|---|---|
| Connecting to Cloudflare IPs | Outbound sockets to Cloudflare IP ranges are blocked; also localhost and private IPs (`proxy request failed, cannot connect to the specified address`). Sites behind Cloudflare would fail through a Worker relay. For ports 80/443 the docs point to `fetch()`, which is HTTP only, not a raw tunnel. | https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/ |
| Port 25 | Prohibited. | same |
| Egress source | Worker TCP connections come from a prefix not in the published Cloudflare IP list (sites do not see the usual Cloudflare ranges; whether sites challenge them is unmeasured). | same |
| Free CPU time | 10 ms per invocation. Waiting on network does not count; streaming bytes through JS does. Whether a long-lived WebSocket survives this under video load is unclear in the docs and was not tested. | https://developers.cloudflare.com/workers/platform/limits/ |
| Free requests | 100,000 per day (Error 1027 beyond). A WebSocket counts as one request (the upgrade); messages do not. | limits page, https://developers.cloudflare.com/workers/platform/pricing/ |
| Duration | No hard wall-clock limit for HTTP-triggered Workers while the client stays connected; runtime updates give old connections up to 20 minutes to finish, so sockets can be cut then. | limits page |
| Simultaneous connections | 6 per invocation waiting for response headers (queued beyond that). WISP allows 64 streams, so bursts of new streams would queue. | limits page |
| WebSocket message size | 32 MiB inbound. | https://developers.cloudflare.com/workers/runtime-apis/websockets/ |
| Bandwidth | Paid plan: "no additional charges for data transfer (egress) or throughput". Free plan bandwidth limit: unclear in the docs. | pricing page |

## 3. Local test
None. No code was written (stopped at terms). No `wrangler` run.

## 4. Deploy steps for a throwaway `*.workers.dev` name
Not provided on purpose. If Boss wants to continue anyway (executive decision, logged as
`Override: Cloudflare SSA 2.2.1(j) - Boss: <reason>`), or obtains written permission from Cloudflare, phase 2 would be:
build the WISP v1 Worker with the HMAC-SHA256 5-minute token check and a token test in `research/r1-workers/`, run
`npx wrangler dev` locally, then Boss runs `wrangler login` and `wrangler deploy` himself. Risk to state to Boss:
account suspension (which could affect the tunnel, DNS and other projects on the same account).

## 5. What the measurement phase would have compared
Chromebook-profile harness from T0 through the home relay vs. the Worker: median `shown`, failure rate, list of failing
sites (expected: every Cloudflare-fronted site), socket survival under video load on the 10 ms CPU limit.
Recommended instead: skip R1; use the Proton egress option in `RELAY.md` section 5 after checking Proton's terms, or a
cheap VPS relay if Boss ever allows a paid service.

Last verified: 2026-11-10
