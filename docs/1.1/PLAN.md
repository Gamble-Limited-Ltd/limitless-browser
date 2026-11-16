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

Last verified: 2026-11-16
