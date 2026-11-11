# Oracle Cloud Free Tier: terms check for the cloud relay (2026-11-11)

Required by `PLAN.md` item 13 before any Oracle VM exists. Read live on 2026-11-11 from oracle.com and docs.oracle.com.
Nothing has been created at Oracle.

## Sources
- Free Tier FAQ, https://www.oracle.com/cloud/free/faq/ : links the governing agreement as
  "Cloud Services Agreement (PDF)" = `cloud_csa_online_v062223_us_eng.pdf` (CSA Online v062223, 9 pages).
- Always Free Resources, https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Oracle Cloud Hosting and Delivery Policies v3.13 (September 2026): no proxy, relay or Free Tier clause found.
- The old standalone AUP page (`/legal/cloud-services-acceptable-use-policy.html`) now 404s. The AUP is CSA section 1.3.

## Clauses that decide it (verbatim, CSA Online v062223)
- **1.1 (grant):** "solely for Your internal business operations. You may allow Your Users (as defined below) to use the
  Services for this purpose, and You are responsible for their compliance with this Agreement and Your order."
- **20.5 (Users):** "'Users' means, for Services, those employees, contractors, and end users, as applicable, authorized by You
  or on Your behalf to use the Services ... For Services that are specifically designed to allow Your clients, agents,
  customers, suppliers or other third parties to access the Services to interact with You, such third parties will be
  considered 'Users'".
- **3.4(c):** You may not "license, sell, transfer, assign, distribute, outsource, permit timesharing or service bureau use of,
  commercially exploit, or make available the Services to any third party."
- **1.3 (Acceptable Use Policy):** no use to harass, cause damage, "send unsolicited bulk e-mail", "infringe intellectual or other
  property rights", "otherwise violate applicable laws"; no benchmarking or vulnerability testing of the Services; no "network
  discovery, port and service identification, vulnerability scanning" of the Services; no crypto mining. **No clause names
  proxies, relays, VPNs or anonymizers.**
- **9.3:** "We may suspend Your and/or Your Users' access to, or use of, the Services if we believe that ... (b) You or Your Users
  are accessing or using the Services to commit an illegal act; (c) there is a violation of the Acceptable Use Policy".

## Free Tier facts (live)
- One free account per person; accounts idle 30 days "may be deemed abandoned" and suspended or terminated (FAQ).
- Ampere A1: 1,500 OCPU hours and 9,000 GB hours a month, "equivalent to 2 OCPUs and 12 GB of memory". AMD micro: up to two
  VM.Standard.E2.1.Micro (1/8 OCPU, 1 GB, "up to 50 Mbps" internet). Outbound data: 10 TB a month. Home region only;
  "out of host capacity" errors are normal for A1.
- Idle reclaim: an instance is idle if over 7 days the 95th percentile CPU is under 20 %, network under 20 % and (A1 only) memory
  under 20 %. A relay for about 10 members will likely sit under all three: expect reclaim unless it is kept busier.

## Verdict
- **Invite-only relay for our approved members: grey, defensible.** Members are end users authorized by GLL (20.5) using it
  through our own app; no resale, no fee. The weak point is 1.1 "internal business operations": a members' browsing
  service is not obviously internal. Risk is suspension under 9.3 if a member's traffic draws an abuse report.
- **Open sign-up on Oracle: treat as not allowed.** Anyone who signs up is a third party to whom we "make available the
  Services" (3.4(c)), and a public proxy is not internal business operations (1.1). Item 13's conditional open sign-up
  needs a host whose terms allow a public proxy service (Plan B, a paid VPS, needs Boss's go).
- No free-tier guarantee of capacity or uptime; keep the home relay as fallback (already the plan).

## Next steps if Boss goes ahead (invite-only use only)
1. Boss creates the account (card for identity check) and picks the home region nearest Chicago (e.g. US Midwest Chicago).
2. Claude adapts `deploy/relay-box/` (`slice/1.0-edge`) for an A1 2 OCPU / 12 GB Ubuntu VM, rehearses, and pastes the host
   commands. DNS for the box name and the DNS-01 token are Boss's steps (section 4 of the global rules).
3. Measure with the real-site suite against home; record captcha/403 rates (cloud IPs are blocked more often).
