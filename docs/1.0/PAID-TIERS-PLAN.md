# Limitless Browser paid tiers: plan (DRAFT, thinking only)

Status: planning from Boss's answers, 2026-11-13. Nothing is bought, built or announced. All numbers are
placeholders until the relay VM exists and the automated tests have measured real speeds. Boss plans to test as much
as possible before release, so published numbers will be measured ones.

## 1. Server
- Relay host for paid tiers: RackNerd 2 GB special ($35.99 per year, 2 vCPU, 5 TB per month, 1 Gbps shared). **Bought 2026-11-14:
  Buffalo NY (not Chicago), 107.173.50.59, ssh alias `limitless-relay`, hardened, nothing deployed** (vault Service Inventory).
  RackNerd API credentials are also stored on the VM (`~/.config/gll-cloud/racknerd.env`); never print them.
- **The 5 TB counts both ways (checked 2026-11-14, RackNerd staff on LowEndTalk and LowEndBox, 2021 to 2024; not in an official
  KB):** inbound and outbound are added together, the meter resets on the 1st at midnight California time, and at 100 % the
  VPS is **switched off until the reset**. A relay moves every byte twice (site to VPS, VPS to member), so members get at most
  about **2.5 TB a month** (less with TLS and WISP overhead). Every capacity number below is halved, the brake counts against
  the RackNerd meter month (Pacific), and the 95 % stage must fully stop relay traffic so the VPS never hits 100 %. Confirm with
  RackNerd support once before prices are set.
- Oracle Always Free is NOT used for paid access (its terms allow internal use only). The Oracle A1 retry loop still runs; if it succeeds it can serve testing.
- Planning speed (estimate): about 150 Mbit/s total (range 100 to 400). Replace with measured numbers.
- Transfer cap: 5 TB per month is about 15 Mbit/s averaged over the month.

## 2. Tiers
| | Ordinal (free) | Cardinal | Prime | Limitless Access |
|---|---|---|---|---|
| Relay | public relays only | our relay | our relay | our relay |
| Price | free | about $15 per year (placeholder) | about $35 per year (placeholder) | invite-only, Boss grants the ability to see and buy |
| Open tabs | 4 (5th tab hard-redirects to buy page) | 15 | 25 (no buy nag, only "out of tabs") | 50 |
| Daily time | about 4 h per day (was 2 h) | none | none | none |
| Data | none of ours (public relays) | about 20 GB per week, resets Monday | about 250 GB per month | about 500 GB per month fast stage, then slow stage (speed TBD) |
| At the cap | n/a | fall back to public relays, note in account panel | falls back | slow stage never stops |
| Downloads | 10 MB per file, 10 a day | faster, same weekly cap | larger files, priority, separate download allowance | best downloads |
| Speed / weight | whatever the public relay gives | capped, fair-share weight | higher cap, higher weight | fastest reasonable, reserved floor (size TBD) |
| Cosmetics | none | badge in account, theme | certificate, Prime theme | extra themes, unique badge |
| Extras | Plans link in menu, line on new-tab page, notice at 15 min left | trial of Prime 24 h once a month | no moderation immunity | Load Now (10 per day, page loads only), direct line to Boss |
| Trial | 24 h Cardinal-level once a month, self-start | 24 h Prime-level once a month | n/a | n/a |

- Seat counts: Prime seats capped, number decided after measuring. Limitless Access: Boss plus about 3 others.
- Limitless Access gate: hidden GATE flag. Invisible to everyone without it. Boss (TheStrongest) has it as owner.
- Load Now: that page load gets first claim on relay bandwidth until it finishes. Others slow briefly, nobody is cut off. Not for big downloads.
- **Worst case with the placeholder knobs (review 2026-11-14):** 4 Executive x 500 GB + 10 Prime x 250 GB = 4.5 TB delivered, which
  is 9 TB on the two-way meter: nearly double the whole allowance before any Cardinal. Placeholders must shrink (for example
  Executive 250 GB, Prime 100 GB, or fewer seats). Real use will be far lower, but
  set Prime seats and caps so worst case stays under 70 % of the real (metered) allowance, or accept that the brake is the plan.
- Capacity check: Access 4 x 500 GB = 2 TB of the 5 TB. Remaining 3 TB covers about 34 Cardinal members at the full weekly cap (about 87 GB per month each). Real use will be lower. Measure before promising seat numbers.

## 2b. Certificates, member cards and the QR (Boss, 2026-11-13)
- Ordinal: no certificate. The member card (name first, number as a small footer) is the keepsake; Membership shows one line that certificates begin at Cardinal.
- Cardinal: a nice certificate, silver foil, no QR (code printed as text).
- Prime: a really nice certificate, crimson and obsidian, bigger seal, QR small in a corner.
- Limitless Access: the best, aurora foil, issue line, same corner QR. (Round three, 2026-11-14: Executive is **Gold classic**.)
- The QR only proves a paper copy is genuine: it opens the verify page for the code (genuine, superseded or void, number, tier, date, never a name). It appears only on Prime and Access certificates, small, clear of text and seal.
- Decided (D3, 2026-11-13): the QR points at a public HALL verify page that never shows the name or the browser address.
- `MEMBERSHIP.md` sections 7 and the "may show their certificate" table still say every member gets a certificate: update them when this plan is approved.
- Design room round two (artifact "Limitless 1.0 Design Room", copy in `docs/1.0/design/design-room.html`) holds the options for marks, cards, plans page, comparison, buying flow, free-limit screens, account panel, certificates, themes, admin and wording.

## 2c. Naming and picks update (Boss, 2026-11-13)
- The top invite-only tier is now **Limitless Executive** (was Limitless Access), with more gold and a pure black theme. Older text in this file and the design room still says Access.
- The trial pause in the transfer brake starts at 70% of the 5 TB.
- Round two picks: `docs/1.0/design/picks-round2.md`. Opus will polish the designs later and may propose new looks beyond the favourites.

## 3. Money
- One purchase = one year (12 months from the day Boss grants access).
- Cash only, handled by hand. The page has a request form or contact. Boss replies, collects cash, sets paid-until.
- Minors may buy with a note that a parent or guardian agrees. No extra personal data.
- Individual price = only Boss giving a named person a discount from the normal price. Amount 0 is allowed (confirm prompt).
- No founding discount.
- Top-ups: Cardinal limited, Prime more. Sizes and prices after measuring. Unused top-up GB last until the plan's yearly expiry and carry over if renewed. Boss logs each pack by hand. No top-up refunds at all.
- Expiry: member drops to Ordinal. Notices 14 days and 3 days before.
- Terms: limits can change any time with notice.

## 4. Refunds and voids
- 24 h trial, then a full refund within 3 days of the grant, then none.
- If we end the service: prorated refund of unused months.
- Void with NO refund: ban for rule-breaking, reselling or sharing the account, relay abuse (heavy or automated traffic), illegal use or attacks through the relay.
- Void NOT the member's fault (error, duplicate, late request): prorated refund, Boss decides each time.
- Short ban or mute: paid-until keeps running.
- Prime no longer carries moderation immunity. Update `RULES-DRAFT.md` section 4 and mention money in the rules and terms.

## 5. Trial rules
- One trial per GATE account per month. Account at least 7 days old. Verified email or login.
- Free gets Cardinal for 24 h, Cardinal gets Prime for 24 h.

## 6. Abuse
- Counts as abuse: sustained use at a plan's top speed for many hours with no breaks, automated or scripted traffic, sharing one paid account, illegal content or attacks.
- First response: automatic throttle to a low speed, alert to Boss, Boss decides restore or void.

## 7. Admin panel (in GATE admin) and member panel
Per plan, live (applied within a minute): max speed, weekly and monthly caps, tab caps, daily time limit, download limits. Every plan, free included, must be easy to rate-limit.
Per member: paid-until, tier, amount, receipt note (date and how paid); top-up entry (GB, amount, date); void with reason code and refund amount; grant or end a trial; Limitless Access flag.
Member account panel: tier, paid-until, GB used (weekly or monthly), notes such as "fell back to public relays".

## 8. Emergencies
- VPS down: paid members fall back to public relays automatically and Boss is alerted. No account uses the home relay, Executive included (D5, 2026-11-13, replaces the old Executive home fallback).
- 5 TB brake (staged): warn about 70%, auto-lower speeds about 85%, fall back to public relays about 95%. Limitless Access may keep using the relay longer, scaled by days left in the month. Download limiting is the main lever.
- Relay abuse: see section 6.
- Alerts: Status page, Kuma, and a line in the admin panel.

## 9. Page and advertising
- Public pricing page on HALL, three columns (Ordinal, Cardinal, Prime) plus a plain feature table. Compares only our own tiers, no named competitors. Limitless Access is not shown.
- Headline: faster, steadier loading on our own relay.
- Free downsides may be stated: shared public relays can be slow at busy times, no uptime promise, other operators' relays see connection metadata (needs a privacy notice), no speed promised.
- Speed numbers appear only once measured by the automated tests. Prices are placeholders until release.

## 10. Build list (when Boss approves; nothing started)
1. GATE: paid-until, tier, amount, receipt note, top-up balance, trial lock, Limitless Access flag, void reason and refund amount.
2. Gate (Node): per-plan limits from the admin panel (speed, caps, tabs, daily time, downloads), weekly and monthly counters, fair-share weights, fallback to public relays, VPS-down fallback, Load Now.
3. Browser: tab cap with redirect, plans link, new-tab line, 15 minute notice, account panel.
4. HALL: pricing page (no form: plan requests are an in-app form, `PLAN.md` 0.2b) and the public verify pages.
5. Docs: terms, privacy notice, RULES-DRAFT.md section 4, Service Inventory.
6. After the VPS exists: relay setup, iperf and load tests, replace estimates, set slow stage, reserve, Prime seats, caps, Load Now uses, final prices.

## 10b. How this fits the 1.0 plan (refinement, 2026-11-13)
- Decisions D1 to D6 (answered 2026-11-13, `PLAN.md` 0.2): VPS relay, the limits engine AND selling all land in 1.0 (slice S9); the speed work ships first as 0.3.0. Boss buys the VPS before release and gives SSH only; prices are final only after measuring.
- "GATE" in this file means the Limitless gate and its admin panel (`~/limitless-gate`, `limitless://admin`), not GLL ID:
  no GLL ID change (keeps the 2026-11-10 rule). Everything in build list item 1 is columns on the gate's `members` table.
- Ordinal's tab cap and daily time are enforced in the app only: public-relay traffic never reaches our gate.
- The VPS is the RELAY-OFF-CLOUDFLARE plan's Option B: it also fixes the Cloudflare SSA issue for `/wisp/`.
- Older text here says "Limitless Access": read it as **Limitless Executive**.

## 10c. Promises, rights and terms (Boss, 2026-11-14, five question series)
- **Entry:** any GLL ID may REQUEST Ordinal access with a reason of one or two sentences; Boss approves (keeps the 2026-10-17 "only users Boss approves get in" rule and the gate unchanged). Decline: polite no, no reason given, may reapply after about 48 h; the reason text is deleted after the decision.
- **Who may buy:** any approved member may request a paid plan. Boss alone invites to Executive, with a fully custom invitation (members never can).
- **Charter first:** every member signs the Membership Charter before any money moves.
- **Minors:** members are 13+; a plain tick box "I am allowed to do this" is the only consent record, no parent name or check (Boss's call; wording in the Rules must not claim parental verification).
- **Seller and receipt:** Gamble Limited Ltd. is the provider. Each payment is a receipt line in the account panel (date, amount, tier, paid-until, how paid) plus a SNAPSHOT of the tier, price and limits at purchase (the snapshot is the promise).
- **Service promise (paid):** best effort, no speed or uptime guarantee. Outage credit: more than 24 h down in a row (Status page and Kuma), each full day down adds a day to paid-until.
- **Changes mid-term:** limits change with 14 days' notice; if a change makes a plan clearly worse, the member may ask for a prorated refund of unused months.
- **Refunds:** paid out the same way as paid (cash by hand, logged). 3-day rule stays; leaving or deleting a GLL ID after day 3 gets no refund. Plans are not transferable; a gift is the friend buying, or Boss granting a named member, logged as a normal grant.
- **Void appeal:** one appeal in 14 days; if won, plan restored and paid-until extended by the days lost; void and reversal both in the receipt log.
- **Upgrades and renewal:** upgrade (Cardinal to Prime) pays the prorated difference; early renewal stacks 12 months on the end date, capped 2 years ahead; both logged as normal purchases.
- **Records:** payment records 7 years; request reasons deleted after the decision.
- **Numbers:** four digits, Boss is 0000; the full rules (reserved set, Executive block 0010 to 0099, Prime primes only, migration from 0100) are in `MEMBERSHIP.md` section 4.
- **Plans page:** shows only measured numbers, worded as "typical limits", with "may change with notice". Footnote: "Further plans are granted by invitation." Terms say a Director-granted invitation plan exists.
- **After expiry:** certificate stays a keepsake; the HALL verify page says "genuine, lapsed", back to "active" on renewal.
- **Fallback to public relays** (cap hit, VPS down): clear notice the first time each fallback starts, plus a line in the account panel; the privacy notice covers other operators seeing connection metadata.
- **Support:** paid questions first, wording "we aim to reply within 3 days", never "guarantee".
- **Where it lives:** a "Plans and payments" section of the Membership Rules (`RULES-DRAFT.md`), linked from HALL legal. HALL Terms stays generic.
- **Polish bar (release gate):** every screen has loading, empty, error and offline states; animations (ceremony, upgrade, splash) stop under "reduce motion"; contrast 4.5:1 in every theme; full keyboard use; works at 360 px and on a Chromebook; tested before release. The design room needs no more work.
- **Legal check:** no outside professional. Boss self-reviews against a stricter checklist before the first sale: refund wording, minors, tax, receipts, no card data, a line that nothing limits rights the law gives, outage credit, snapshot. Tax and local rules remain Boss's risk.
- Design Room III picks (58): `docs/1.0/design/picks-round3.md`.

## 11. Open items
Closed 2026-11-14 (`PLAN.md` 0.2b): placeholder prices (Cardinal $15/yr, Prime $35/yr, Executive per person), number rules, certificate rule (Cardinal and up).
**Placeholder knobs for the build** (all admin settings, replaced by measured numbers before release): slow stage 2 Mbit/s, Prime seats 10, Executive
reserve 20 % of relay bandwidth, top-ups Cardinal 25 GB and Prime 100 GB (prices set by Boss from measurements, none public). Still Boss's alone:
tax and local rules for taking money and minors (self-review checklist, 10c) before "Plans open for sale" is switched on.

Last verified: 2026-11-14
