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
- 2026-11-16, Boss: permission for VPS changes (`limitless-relay`) for the bot check work. Each change is backed up first,
  applied one at a time with a relay check, logged with its rollback in `docs/1.1/BOTCHECK.md` and in `~/gll-agents/logs/changelog.md`.
- 2026-11-16, Boss (on `DESIGN-GAPS.md` questions): paid themes switch to Cormorant Garamond + Space Grotesk as in the design; both
  maybes are built (Engrave inside the seal, Crimson and platinum Prime theme); Silver keeps its light mode, restyled; the plain-words
  terms copy is held (layout built with current wording, draft copy in `docs/1.1/TERMS-DRAFT.md` for Boss).
- Defaults taken (no Boss call needed): numbers stay four digits (`No. 0047`, `MEMBERSHIP.md` 4); text on the garnet accent is dark
  for 4.5:1 contrast; Prime out-of-tabs keeps Boss's joke heading "Why are you using so many tabs!?".
- Work packages from `DESIGN-GAPS.md` run one at a time next to the bot check slice (light schedule: at most 2 slices in flight):
  WP1 Foundations, WP2 Member identity, WP3 Limits and notices, WP4 Pages, WP5 Admin. Gate/HALL items in that doc are out of 1.1 Browser scope.

- 2026-11-16, Boss: the gate and HALL items are in 1.1 too. Gate (`~/limitless-gate`, `slice/1.1-gate` from `main` 85fa464): certificate
  PDF fonts and rich gold (G1), member pages (G4), small `/_lb/me` fields (G5). HALL (`~/gll-launcher`): per-tier verify pages (G2) and the
  plans page (G3), started when a slot frees (portfolio limit of 3 slices in flight), after WP4 fixes the plans markup.
- 2026-11-16, Boss (on `PLANS-AUDIT.md`): plan limits take the "recommended" sets from the Plan Numbers artifact
  (https://claude.ai/artifact/9V2K7cY62h9JrfBA6ydXVG); Ordinal gets a client-side 3 Mbit/s throttle (number from the gate catalog);
  Executive files are capped at 2 GB in 1.1 (the browser keeps downloads in memory; streaming to disk is later). Pricing page: in-app `limitless://plans`.
Last verified: 2026-11-16
