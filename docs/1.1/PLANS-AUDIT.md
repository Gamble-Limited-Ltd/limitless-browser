# Limitless 1.1 plans audit (2026-11-16)

Every plan rule checked against what is built. Base: `release/1.1.0` (d057301) for Browser, `~/limitless-gate` main (read-only here).
Sources, newest wins: (A) Boss's artifact "Limitless Plan Numbers" (2026-11-16, a menu of options, most limits still NOT decided), (B) `PAID-TIERS-PLAN.md` (PT), (C) `MEMBERSHIP.md` (MB), (D) `PLAN.md` 0.2b to 0.2d, (E) `picks-round3.md` (R3). Status: OK, missing, wrong. "Gate" = `~/limitless-gate/src`.

## 1. Rules per tier

| # | Rule | Source | Built where | Status |
|---|---|---|---|---|
| 1 | Ordinal 4 open tabs | PT 2, A | gate `membership.ts:67`; Browser `ui.js` `LB_tabGate` (~382) | OK (value) |
| 2 | Ordinal 5th tab hard-redirects to the buy page (`limitless://plans`) | PT 2 (Boss 2026-11-16) | `ui.js` `LB_tabGate` only showed a "That is all your tabs" card | wrong, FIXED (F1) |
| 3 | Cardinal 15 tabs, card at the cap with plans line | PT 2 | gate `:84`; `ui.js` tab gate | OK |
| 4 | Prime 25 tabs, no buy nag, joke heading "Why are you using so many tabs!?" | PT 2, R3, 1.1 PLAN | gate `:101`; `ui.js` tab gate (no plans line for prime) | OK |
| 5 | Executive 50 tabs | PT 2 | gate `:118`; `ui.js` tab gate | OK |
| 6 | Ordinal about 4 h a day, app-side only | PT 2, A | gate `:68` (240); `ui.js` `dayState`/`dayAdd` (counts only while the window is focused) | OK |
| 7 | Other tiers: no daily time | PT 2 | gate `:85,102,119` = 0; `dayState` returns null unless tier is ordinal | OK |
| 8 | Notice at 15 min left (Ordinal) | PT 2, R3 | `ui.js` `dayCheck` (once a day, dismissable) | OK |
| 9 | "Day finished" card and start-page line when time is up | R3 | `ui.js` `dayCheck`, `paintStart` | OK |
| 10 | Ordinal speed: public relays plus a speed limit inside the app (Boss's pick, A: 3 Mbit/s recommended, number NOT decided) | A | nothing. Gate `speedMbps` 0 for ordinal; no throttle in `main.js` | missing, NOT built: the number is Boss's and a client throttle is a pipeline change (section 3) |
| 11 | Cardinal speed cap | PT 2, A (C1 10 / C2 15 / C3 20, none decided) | gate `:88` = 20 (C3 draft) | OK as placeholder, flagged (section 4) |
| 12 | Prime speed cap | A (P1 25 / P2 30 / P3 40) | gate `:105` = 40 (P3 draft) | OK as placeholder, flagged |
| 13 | Executive speed, then slow stage | A (E2 80 / E3 80 then 3 Mbit/s) | gate `:122` = 80, knob `slow_stage_mbps` = 2 (`:139`) | OK as placeholder, flagged |
| 14 | Cardinal weekly allowance, resets Monday | PT 2, A | gate `:86` = 20 (A: C2 12, C4 15, C3 20), `selling.ts` cap state | OK as placeholder, flagged |
| 15 | Prime monthly allowance | PT 2, A | gate `:104` = 100 (A P2 100) | OK |
| 16 | Executive monthly fast stage, then slow stage that never stops | PT 2, A | gate `:121` = 250 (A: E2 250, E3 200), `selling.ts:266-290` (exec slows, never stops) | OK as placeholder, flagged |
| 17 | At the cap: Cardinal and Prime fall back to public relays, note in account panel | PT 2 | gate `selling.ts:293` `fallbackOf`; `main.js:3984` panel line | OK |
| 18 | Fallback notice the first time each fallback starts (cap, brake) | PT 10c | `main.js:4095` `lbPlansFallbackNotice` (once per kind per month) | OK |
| 19 | VPS down: paid fall back to public relays with the notice | PT 8 | `main.js` relay notice + 4095 | OK |
| 20 | Transfer brake 70 / 85 / 95 % | PT 8 | gate `selling.ts:249-257` | OK |
| 21 | Ordinal downloads 10 MB a file, 10 a day (app side) | PT 2, A | gate `:72-73`; `main.js` `LB_downloads` `vet`/`dayMsg` (~18285) | OK |
| 22 | Cardinal downloads 25 MB (A: 100 MB recommended, not decided), any number a day, count against weekly | PT 2, A | gate `:89-90` | OK as placeholder, flagged |
| 23 | Prime downloads: larger files, separate allowance (A: D-P2 1 GB and 20 GB a month) | PT 2, A | gate `:106` = 500 MB, `downloadGbMonth` 20 (`:114`): mixes D-P1 and D-P2 | OK as placeholder, flagged |
| 24 | Executive downloads best (A: D-E2 4 GB and 75 GB a month) | PT 2, A | gate `:123` = 2048 MB, 75 GB (`:131`); Browser refuses anything over 2 GB (`main.js` `HARD`) | OK as placeholder; 4 GB needs a Browser change (in-memory limit), flagged |
| 25 | Download split: 1 / 2 / 4 / 8 parts (files over about 20 MB) | D 0.2d | gate `:79,96,113,130`; `main.js:18301` `parts()`, `SPLIT_MIN` | OK |
| 26 | Downloads yield to page loads; check Content-Length first and refuse early with message and plans link | D 0.2b, 0.2d | `main.js` `vet`, `refuse` | OK (link target wrong, see 27) |
| 27 | Plans link in the refusal and cap cards goes to the buy page | PT 10 item 3, Boss | `ui.js` `plansLine` and `main.js` downloads `PLANS` pointed at `hall.taps-holdings.org` | wrong, FIXED (F2) |
| 28 | Plans link in the menu | PT 2 (Ordinal extras), 10 | `ui.js` `ITEMS`: no entry (only the About page link `lbAboutPlans`) | missing, FIXED (F3) |
| 29 | Line on the new-tab page ("Plans line on start page") | PT 2, R3 | `ui.js` `paintStart` `.lb-planline` | OK |
| 30 | "Coming soon" while `plans_open` is OFF | D 0.2b | `ui.js` `plansLine`; gate `plansOpen` | OK |
| 31 | Video cap: Ordinal 480p, Cardinal 720p, Prime 1080p, Executive none | D 0.2d | gate `:78,95,112,129`; `ui.js` `videoCap`, `LB_videoRuntime` | OK |
| 32 | One video at a time | D 0.2d | `ui.js` `LB_videoConfig.one` | OK |
| 33 | Data saver on by itself at 90 % of the allowance, with a note | D 0.2d | `ui.js` `autoSaver` (~542) | OK |
| 34 | Data meter in the menu (allowance and separate download allowance) | D 0.2d | `ui.js` `paintMeter`; gate `memberroutes.ts:86` adds `plan.download` | OK |
| 35 | Per-site usage report, on the device only | D 0.2d | `ui.js` `siteCard` | OK |
| 36 | Account panel shows limits (tabs, time, data, speed, downloads) | PT 7 | `ui.js` `limitLines` | wrong for downloads ("0 a day" shown when 0 means any number), missing Load Now and video lines: FIXED (F4) |
| 37 | Account panel: tier, paid until, GB used, trial, fallback, top-up | PT 7 | `ui.js` `paintMembership`; `main.js:3982-3985` `lbPlansAccount` | OK |
| 38 | Themes: Cardinal badge and theme, Prime theme, Executive extra themes; lapse falls back to last free theme | PT 2, D 0.2b | `index.html:21` `NEEDS` (vault/ink/silver 1, garnet 2, gilt/onyx 3), `LBTheme.member` | OK |
| 39 | Certificate: Ordinal none (member card only, line says so), Cardinal silver no QR, Prime and Executive QR | PT 2b | `ui.js` `paintMembership` line "Certificates begin at the Cardinal plan"; PDF is gate-side | OK (Browser); PDF design is gate item G1 |
| 40 | Numbers: four digits, Boss 0000, Executive block, Prime primes only | PT 10c, MB 4 | gate `numbers.ts`; Browser shows `No. 0047` (`pad`) | OK |
| 41 | Load Now: Executive only, 10 a day, page loads only, first claim on bandwidth | PT 2 | gate `:128`, `selling.ts:299-325` (60 s boost, weight x2, cap 10); `main.js:3987` button | OK |
| 42 | Trial: Ordinal gets Cardinal 24 h, Cardinal gets Prime 24 h, once a month, account 7 days old, signed, good standing, only when plans are open | PT 5, D 0.2b | gate `selling.ts:111-128`; `main.js:4039` `lbPlansTrial` | OK |
| 43 | Relay access: Ordinal public relays only, paid our relay | PT 2 | gate `relay` flags (`:66,83,100,117`) | OK |
| 44 | Expiry notices 14 days and 3 days before, in app only (start page and account panel) | D 0.2b, PT 3 | `ui.js` `expiry`, `paintStart`, `paintMembership`; `main.js:4086` banner | OK |
| 45 | After expiry the member drops to Ordinal | PT 3 | gate `effectiveTier` | OK |
| 46 | Prime: no moderation immunity | PT 2 | `RULES-DRAFT.md` (docs); no code | OK |
| 47 | Plans page: only measured numbers, "typical limits", footnote "Further plans are granted by invitation.", no card fields | PT 10c | `main.js:4060-4070`; `plans.spec.js` | OK (numbers shown are placeholders until Boss decides) |
| 48 | Weights: Cardinal 1.5, Prime 2, Executive 3 | A | gate `:82,99,116` | OK |
| 49 | Top-ups Cardinal 25 GB, Prime 100 GB, none for Executive | A, PT 3 | gate `:85,102`, `selling.ts:202` | OK |
| 50 | Prices Cardinal $15, Prime $35, Executive custom | A, D 0.2b | gate `priceUsdYear` | OK (A: $15/$35/$90 are "middle", not final) |

## 2. Counts

50 rules. Browser side: OK 44, wrong and fixed 3 (rules 2, 27, 36), missing and fixed 1 (rule 28), missing and not built 1 (rule 10, needs Boss's number). Gate side: no wrong code; every open item is a number or a catalog field (section 4).

## 3. Fixes on branch `slice/1.1-plans`

- F1 Ordinal tab cap: with 4 tabs open, a new tab is not refused any more. It opens as the 5th tab on `limitless://plans`; later new-tab requests switch to that plans tab (never a 6th tab). If the member navigates that tab elsewhere, the next new tab opens plans again (known limit: client side only, PLAN 0.3 item 2). Other tiers keep the card.
- F2 `plansLine` and the downloads refusal link to `limitless://plans` in the app (the buy page with the request form) instead of the HALL home page.
- F3 Menu entry "Plans" opens `limitless://plans`.
- F4 Membership page limits: downloads line handles 0 as "any number a day"; adds Video and Load Now lines.
- Rule 10 (Ordinal app throttle, Boss's pick): not built. The mechanism would sit in the fetch pipeline for every proxied response (a token bucket on the response reader) and the number (A: 2, 3 or 5 Mbit/s) is not set. Proposed once Boss picks: gate `ordinal.speedMbps` = chosen value (the field already reaches `/_lb/me`), Browser reads `limits.speedMbps` when `relay` is false.

## 4. Gate-side gaps (not edited; exact proposed changes)

All are in `src/membership.ts`, and the number changes wait for Boss (A is a menu, not a decision):
1. `DEFAULT_PLANS.ordinal.speedMbps: 0` -> Boss's pick (A recommends 3), once the Browser throttle exists (rule 10).
2. `cardinal.weeklyGb: 20` -> 12 (A: C2); `speedMbps: 20` -> 15; `downloadMbPerFile: 25` -> 100 (D-C2).
3. `prime.speedMbps: 40` -> 30 (P2); `downloadMbPerFile: 500` -> 1024 (D-P2, matches the 20 GB allowance already set).
4. `executive.monthlyGb: 250` -> 200 and knob `slow_stage_mbps` `'2'` -> `'3'` (E3); `downloadMbPerFile: 2048` -> 4096 (D-E2) only after the Browser 2 GB in-memory limit is lifted, so keep 2048 for now.
5. Not a number: the plans catalog in `me()` (`membership.ts` ~1010) omits `dailyMinutes`, `downloadsPerDay`, `videoMaxP`, `loadNowPerDay`. Add them so the plans page can show Ordinal's 4 h and 10 a day.

## 5. Conflicts between sources (Boss to decide)

- A (numbers artifact) vs gate defaults: A lists "recommended" sets (C2, P2 + D-P2, E3 + D-E2) but `PLAN.md` 0.2d says limits and prices are NOT decided. The gate still holds older drafts (C3, P3, E2). Nothing was changed.
- Prices: A $15 / $35 / $90 equal the placeholders except Executive ($90 vs "per person" in the gate and PT). Kept per person.
- PT 2 says Executive "about 500 GB" and Prime "about 250 GB"; the gate (250 / 100) and A (200 or 250 / 100) are lower. PT 11 already says they shrink. Newest wins: A and gate.
- PT 9 puts the pricing page on HALL; PT 10 item 4 and Boss's note say the buy page is the in-app `limitless://plans`. Taken: in-app.
- Executive download cap 4 GB (A D-E2) is above the Browser's 2 GB in-memory limit.

Last verified: 2026-11-16
