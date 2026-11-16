# Limitless 1.1 plan

Requested by Boss 2026-11-16. Base: `main` at `2f4c181` (1.0.1). Lane: Minor (1.1.0). Builders: Sonnet 5.5 agents on `slice/1.1-*` branches, merged into `release/1.1.0`.

## Scope
1. **Design pass:** bring every built surface closer to Design Room III (`docs/1.0/design/picks-round3.md`, artifact
   https://claude.ai/artifact/MEcUmGcZk958PVikWnMi2r). Step 1 is a gap audit (`docs/1.1/DESIGN-GAPS.md`), step 2 closes
   all gaps (member-facing and admin).
2. **Bot checks on our relay:** (a) stop false positives in `LB_botCheck` (`app/ui.js`); (b) make traffic through the VPS
   relay look like a normal browser so sites challenge it less (request hygiene on the client and the VPS).

## Decisions
- 2026-11-16, Boss: bot check work covers both parts. This changes the 2026-11-14 rule "Bot checks: no evasion" (`docs/1.0/PLAN.md`)
  for request hygiene only. Override: no-evasion rule - Boss: request hygiene on the relay so normal traffic is not challenged.
  Still out of scope: solving or auto-clicking CAPTCHAs or challenges, IP rotation, residential proxies, fingerprint spoofing beyond
  what a real current browser sends.
- 2026-11-16, Boss: design pass is "gap audit, then all".

Last verified: 2026-11-16
