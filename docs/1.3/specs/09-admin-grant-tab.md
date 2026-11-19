# 09: Admin "Grant plan" tab (spec, 2026-11-19)

Area code **AD**. Asked by Boss on 2026-11-19: a separate tab in the admin panel for granting plans. Type a login name or the member's
name, pick from the autocomplete, pick the plan, pick the amount paid, add notes, confirm. The plan is granted and the tab shows a receipt
text that Boss copies into his own email. Answers (Boss, 2026-11-19): the term defaults to 1 year and can be changed; price buttons plus a
typed amount; an existing plan is detected and the tab says renewal or upgrade before Confirm; the receipt has plan, amount, paid-until,
receipt number, the plan's limits and the refund rule. **Boss's notes stay private** (admin log only, never in the receipt).

Not a speed item. It ships on its own as a Patch (app) plus a small gate release, in the normal release lane. The member-profile
quick grant from 1.2.1 stays as it is.

## 0. What exists (read 2026-11-19)
- Gate route `POST /_lb/admin/api/membership/grant` (`~/limitless-gate/src/membershipadmin.ts` 163): body `{sub, tier, paidUntil?, amount?,
  howPaid?, receiptNote?, number?, kind?: plan|upgrade|renewal}`, answer `{member, certificateCode}`. `Membership.grant` (`membership.ts` 745)
  stacks a renewal by a year (cap 2 years ahead) when `kind: 'renewal'`, the tier is unchanged and `paidUntil` is not sent; Prime needs a
  prime number and Executive a number in the Executive block, else `number_required`; a removed member is refused (`removed`). Every grant
  writes a `purchases` row with a plan snapshot (`snapshot_json`).
- Gate route `GET membership/members?filter=&q=` searches number, decrypted name and login name (GLL ID accounts without a member row show as
  "ceremony not done"). `GET membership/plans` returns the catalog. `src/numbers.ts` `nextFree(tier, rules)` finds a free number.
- App: the admin panel is one script in `index.html` (S7 cards from about line 8700 on `main`), writes go through `write()`/`xdo()` with
  step-up. Cards are stacked; there is no tab bar today.
- Gate catalog still has the old placeholders (Cardinal $15, Prime $35, Executive no price; Cardinal 12 GB a week, Prime 100 GB a month).
  The approved prices (K3, 2026-11-19) are Cardinal $15 (deal $10), Prime $25 (deal $20), Executive $50 (deal $40); caps 10/20/40 GB a
  week (K2). AD-0 moves them.

---

## AD-0 Gate catalog: approved prices, deals and weekly caps
- **Status:** planned (was the open line in SPEED-NEXT K3). **Likely time:** 2 h. Gate release only; `plansOpen` stays false.
- **Rules:**
  1. Catalog fields per paid tier: `priceUsdYear` (15, 25, 50), new `dealUsdYear` (10, 20, 40), `weeklyGb` (10, 20, 40), `monthlyGb` 0.
  2. The `migratePlanNumbers` pattern is reused: a stored value moves only while it still equals the old default (admin edits stay); a
     marker setting `plans_1_3_prices` makes it run once; `limits_version` bumps when anything moved.
  3. Executive seat cap 4: `grant` with tier `executive` for a member who is not already Executive throws `exec_seats_full` when 4 members
     already hold it (Boss's own owner account does not count).
- **Tests (vitest, failing first):** fresh store gets the new numbers; an admin-edited value is kept; the 5th Executive grant throws;
  re-granting an existing Executive is allowed.
- **Rollback:** previous gate image; the marker keeps the migration from running twice.

## AD-1 Gate: receipt number and receipt text
- **Status:** planned. **Likely time:** 3 h.
- **Rules:**
  1. `grant` returns the new purchase row id; the route answers `{member, certificateCode, purchaseId, receipt: {number, text}}`.
  2. Receipt number = `LB-<year of paid_on>-<purchase id, 5 digits, zero padded>`, for example `LB-2026-00042`. Pure function
     `receiptNumber(id, paidOn)` in a new `src/receipt.ts`.
  3. `receiptText(purchase, snapshot, terms)` (pure, same file) builds plain text from the purchase row and its **snapshot** (so a later
     catalog change never alters an old receipt). Layout, plain text, no em dashes:
     ```
     Limitless receipt LB-2026-00042
     Date: 19 November 2026

     Plan: Limitless Prime (renewal)
     Paid: $25.00, cash
     Valid until: 19 November 2027
     Member number: 0047

     What your plan includes
     - Speed on our relay: up to 30 Mbit/s
     - Data: 20 GB a week, resets every Monday
     - Downloads: files up to 1 GB
     - Tabs open at once: 25

     Refunds: Try the plan free for 24 hours. After you pay, ask for a full refund within 3 days. After that there is no refund, unless
     we shut the service down: then you get back the unused months.

     Gamble Limited Ltd.
     ```
     Limit lines come only from snapshot fields that are set (a 0 or missing field prints no line). Executive adds "Load Now: N a day".
     Amount 0 prints `Paid: $0.00 (no charge)`. The refund paragraph is the approved Terms sentence (`docs/1.1/TERMS-DRAFT.md` row
     "Refunds", Boss 2026-11-16), copied verbatim from one constant; legal text is never reworded without Boss.
  4. Never in the text: Boss's notes (`receipt_note`), the login name, email, the certificate code, the GATE sub.
  5. New route `GET membership/receipt/:purchaseId` returns `{number, text}` for a past purchase (so the profile History tab can show
     "Copy receipt" later; owner only, 404 otherwise).
- **Tests:** `receipt.test.ts`: number format and padding; text for Cardinal, Prime renewal, Executive, amount 0; a snapshot with a missing
  field prints no line; notes never appear; the refund paragraph equals the Terms constant; no em dash or en dash in any output.
- **Rollback:** the fields are additive; an old app ignores them.

## AD-2 Gate: number suggestion for Prime and Executive
- **Status:** planned. **Likely time:** 1 h.
- **Rules:** `GET membership/number-suggest?tier=prime|executive&sub=` returns `{fits: boolean, current, suggested}`: `fits` when the
  member's current number already fits the tier (then no number is needed), else `suggested` = `nextFree(tier, rules)`. Read only.
- **Tests:** a Cardinal with number 0100 asked for Prime gets a free prime; a Prime with a prime number gets `fits: true`.

## AD-3 App: the Grant plan tab
- **Status:** planned. **Likely time:** 4 to 5 h. Needs AD-1 (works without AD-0 and AD-2, with the old catalog and a typed number).
- **Where:** a two-tab bar at the top of `limitless://admin` (`#lbAdmTabs`, `role=tablist`): **Grant plan** and **Everything else** (all
  existing cards, unchanged). The last tab used is kept in `limitless:admtab:v1` (default "Everything else", so nothing moves for a first
  open). Card id `lbAdmGrantTab`. Same `.lb-adm-*` styles and tokens; no new colours.
- **Flow (one form, top to bottom):**
  1. **Who** (`#lbGrWho`, combobox, `aria-autocomplete=list`): typing 2 or more characters calls `GET membership/members?q=` after 150 ms
     of no typing; at most 8 rows: name, login name, number, current plan pill, paid-until. Arrow keys and Enter pick; Escape closes.
     Picking shows a member strip (name, login, number, plan, days left, standing). A removed member is shown but cannot be picked
     ("Removed: restore first"). A suspended member can be picked with a warning line.
  2. **Plan** (`#lbGrPlan`, four tiles: Cardinal, Prime, Executive, and Ordinal as "Remove paid plan" in a quiet style). Executive shows
     "Seats used: N of 4" and is disabled at 4 (unless the member is already Executive).
  3. **What happens** line, computed from the member's current plan before anything is sent:
     - same tier, paid-until in the future: "Renewal: adds a year. New paid-until 19 Nov 2027." (`kind: renewal`)
     - higher tier: "Upgrade from Cardinal (paid until 3 Mar 2027). New year starts today." (`kind: upgrade`)
     - lower paid tier: "This lowers their plan." (`kind: plan`; Confirm needs a second click, `arm2`)
     - no paid plan or expired: "New plan, a year from today." (`kind: plan`)
  4. **Term** (`#lbGrTerm`): "1 year" selected by default; chips "30 days", "90 days", "Custom date". For a renewal with "1 year" the app
     sends no `paidUntil` (the gate stacks it); any other choice sends the explicit date. Ordinal hides the term.
  5. **Amount** (`#lbGrAmt`): buttons from the catalog: list price and deal price ("$25 list", "$20 deal") and "$0"; picking one fills the
     number field, which can also be typed (0 to 1000, two decimals). For an upgrade a third button "Prorated $N" = new list price minus
     old list price x days left / 365, rounded to the dollar, never below 0 (a suggestion; Boss decides). "$0" asks "No charge?" on
     Confirm (second click). **How paid**: Cash (default), "No charge", or "Other" with a text field (80 characters).
  6. **Number** (`#lbGrNum`): only for Prime and Executive when AD-2 says the current number does not fit: prefilled with the suggestion,
     editable, 4 digits. Without AD-2: shown after a `number_required` answer, empty.
  7. **Notes (private)** (`#lbGrNotes`, 500 characters): sent as `receiptNote`. Hint under it: "Only you see this. Not on the receipt."
  8. **Confirm** (`#lbGrGo`): a summary box repeats member, plan, kind, paid-until, amount and how paid. The button text says what it does:
     "Grant Prime for $25". It calls `xdo('membership/grant', body)` (step-up unchanged).
- **After success:** the form is replaced by the **receipt panel** (`#lbGrReceipt`): a read-only text area with `receipt.text`, a
  **Copy receipt** button (`navigator.clipboard.writeText`; when the clipboard is refused, the text is selected and the button says
  "Press Ctrl+C"), a **Copy subject** button ("Your Limitless receipt LB-2026-00042"), the certificate code line for Boss, and
  **Grant another** (clears the form, keeps the tab). Nothing is emailed from Limitless.
- **Errors (inline, under Confirm, existing `xerr` map plus):** `number_required` (shows the number field), `number_taken`,
  `number_retired`, `exec_seats_full` ("All 4 Executive seats are taken."), `removed`, `stepup` (dialog as today), network
  ("Not sent. Nothing changed. Try again.").
- **Edge cases:** the member list changes while typing (results are for the last query only, older answers are dropped); a double click on
  Confirm sends once (button disabled while in flight); a grant that succeeds but whose answer has no `receipt` (old gate) shows "Granted.
  Receipt needs the newer gate." and no copy button; owner account: Grant is allowed (owner is Executive by default), standing actions are not part of this tab.
- **Tests (`tests/e2e/admin.spec.js`, new block "Grant tab", mocked routes, failing first):**
  1. tab bar shows, default "Everything else", choice persists over reload;
  2. autocomplete by login name and by name, keyboard pick, at most 8 rows, stale answer dropped;
  3. removed member cannot be picked; suspended shows the warning;
  4. renewal text and body (`kind: renewal`, no `paidUntil`); upgrade text, prorated button value; downgrade needs two clicks;
  5. price buttons fill the amount; $0 needs the second click; "Other" sends its text as `howPaid`;
  6. custom date sends `paidUntil` at 23:59:59 UTC of that day;
  7. `number_required` reveals the number field and a retry sends `number`;
  8. success shows the receipt; Copy puts exactly `receipt.text` on the clipboard (grant clipboard permission in the context);
  9. notes are in the POST body and nowhere in the receipt panel;
  10. every theme at 1366x768 and 390 wide (existing admin theme loop), no horizontal scroll.
- **Rollback:** previous app build; the gate fields are additive.

## Order and release
AD-0 and AD-1 and AD-2 in one gate release (about 6 h with tests), then AD-3 as an app Patch (about 5 h). The gate goes first; the app
handles an old gate (rule above). Prices on the buttons come from the catalog, so they are right only after AD-0.

Last verified: 2026-11-19
