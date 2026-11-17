# Plain-words terms: draft for Boss (HELD, not shipped)

Source: Design Room III, "Plain-words terms" (the design's wording, verbatim). Boss held this copy on 2026-11-16 (`docs/1.1/PLAN.md`):
it makes legal-adjacent promises (refunds, endings). The Plans page layout (`#lbPlansTerms`, `lbPlansTerms()` in `app/main.js`) is built and shows only
the wording that is already approved in the app today (limits may change with notice, we aim to reply within 3 days, payment in person and no card
details, further plans by invitation). To ship this draft: Boss reads it, `docs/1.0/MEMBERSHIP.md` and the Terms say the same, then replace the rows
in `lbPlansTerms()` and update `tests/e2e/wp4.spec.js`. The prices and the 24 hour trial lines also depend on plans being open for sale.

| Row | Draft text |
|---|---|
| What you get | One year of the plan from the day it is granted. After that you drop back to Ordinal and keep your settings. |
| Refunds | Try the plan free for 24 hours. After you pay, ask for a full refund within 3 days. After that there is no refund, unless we shut the service down: then you get back the unused months. |
| Extra data | Not refundable. It lasts to the end of your plan and carries over if you renew. |
| When a plan can end | With no refund: a ban for breaking the rules, sharing or selling your account, or abusing the relay. If it ends by mistake, you get back the unused months. |
| Changes | Limits can change, and you are told first. Under 18: a parent or guardian needs to agree. |
| Paying | Cash, in person. We never ask for card details or a bank account. |

Related lines in the design that are also held: the line under the plan cards ("One year from the day it is granted", "24 hour trial, then a full
refund within 3 days", "Cash, in person"), the guardian tick box ("I am under 18 and a parent or guardian agrees"; the app keeps "I am allowed to do
this"), and the four steps copy "Your year and your 3-day refund window start that day" (the app says "Your plan is switched on and the page here shows it").

Last verified: 2026-11-16
