# Jarvis Consistency Audit

Traced from source and updated on 2026-09-27, after the second pass. Status per row: **FIXED** (shared code + tests), **OK** (one rule everywhere), **OPEN**.

Canonical code (pure, tested with `npm test`):
- `shared/business-metrics.js`: periods (Arizona), revenue, net profit, card revenue, owner take-home, owner-pay settings.
- `shared/business-rules.js`: statuses, cancelled, balance, unpaid, lead follow-up, lead status writes, the payment-write plan, data health, the action queue.
- `shared/job-context.js`: job evidence, entity resolution, customer history.
- `functions/_lib/business-data.js`: the Supabase operations built on the above. Web and Telegram chat (`admin-ai-chat.js`) and voice (`jarvis-business.js`) both call it.

## Summary table

| Concept | Dashboard (`JobOps.tsx`) | admin-ai-chat (web + Telegram) | jarvis-proactive | LiveKit voice | Status |
|---|---|---|---|---|---|
| Revenue | shared `collectedRevenue` | `get_revenue_summary` → ops | 7-day total → shared | `/jarvis-business` → ops | **FIXED** |
| Net profit | shared `netProfit` | `get_revenue_summary` → ops | — | `/jarvis-business` | **FIXED** |
| Owner take-home | Owner Pay panel → shared `ownerTakeHome` | `get_owner_pay_summary` → ops | — | `/jarvis-business` | **FIXED** |
| Unpaid | `isAwaitingPayment` (Unpaid / Due count) | `get_unpaid_jobs`, action center, briefing, summary → `unpaidJobs` | alerts + briefs → `unpaidJobs` | `/jarvis-business` | **FIXED** |
| Jobs today / tomorrow | — | `jobsOnDate` (cancelled by `status` **or** `job_status`) | `isCancelled` | via briefing | **FIXED** |
| Jobs this month | PAID with paidAt in the Arizona month | — | — | — | OK |
| Lead follow-up | — | `leadFollowUpReason` (list, action center, summary) | `leadFollowUpReason` | via action center | **FIXED** |
| Lead status write | — | `leadStatusUpdate` | — | same rule in Python | **FIXED** |
| Payment write | Record a Payment | `mark_job_paid` → `planPayment` | — | `/jarvis-business` → `planPayment` | **FIXED** |
| Customer / job context | job detail view | `get_customer_context`, `get_job_detail` | — | `/jarvis-business` | **FIXED** (new) |
| "Booked today" value | Command Center (`admin-api-data` `jobRevenue`) | `get_business_summary.today.bookedValue` → `bookedValue` | — | via summary | **FIXED** (labels) |
| Reminder timing | — | server-computed `due_in_minutes` | due ≤ now, sent once | — | OK |

Telegram is transport only (`jarvis-telegram.js` → `admin-ai-chat.onRequestPost`), so it always matches web.

## Canonical definitions

- **Revenue / collected**: `payments[]` entries dated in the window. A PAID job closed in the window whose payment log doesn't cover invoice + tax counts as invoice + tax, replacing its logged entries rather than adding to them. Cancelled jobs' collected money still counts.
- **Net profit**: PAID jobs closed in the window: `(amount_paid ?? invoice + tax) − tax − parts_cost`.
- **Owner take-home**: net profit − Stripe fee % × card payments − monthly overhead × days/30, then the tax reserve % comes out of what's left. A deficit gives $0.
- **Periods**: Arizona calendar `today`, `this_month`, `last_month`, `this_year`; rolling `last_N_days` (`this_week` = last 7 days). Unknown periods are labeled "the last 30 days".
- **Unpaid**: COMPLETED or INVOICED, not cancelled, with balance = (invoice, or estimate if not invoiced) + tax − amount paid > $0.01. The dashboard count still shows every COMPLETED + INVOICED job. Jarvis lists only those with a balance, and `get_data_health` flags the difference as `fully_paid_not_marked_paid`.
- **Lead needs follow-up**: not booked or lost, and either `follow_up_at` ≤ now, or never contacted and more than 24h old.
- **Cancelled**: `status = 'cancelled'` **or** `job_status = 'CANCELLED'`.

## Mismatches fixed

First pass:
- **F1.** Take-home ignored overhead: it read a column that doesn't exist.
- **F2.** Take-home used a different formula from the Owner Pay panel.
- **F3.** Cancelled jobs were treated differently in revenue.
- **F4.** The dashboard's months used the browser timezone.
- **F5.** Jarvis fetched bookings with no order or limit.
- **F6.** "Collected last 7 days" ignored partial payments.
- **F7.** A failed load read as $0.

Second pass:
- **V1/V2. Voice money was a different metric** (appointment-date based) and had its own take-home. The Python revenue, take-home, business-summary and mark-paid code is deleted. Voice calls `/jarvis-business`, which runs the same operations as web.
- **U1. Unpaid** differed (dashboard COMPLETED + INVOICED; Jarvis, proactive and voice INVOICED only). There's now one `unpaidJobs` rule everywhere.
- **U2. Amount owed ignored tax** (`invoice − amount_paid`). Balance now includes tax, and a partially paid taxed job no longer drops off the list.
- **L1. The stale-lead threshold** was 1 day in some places and 2 in others. It's 24h everywhere now (`leadFollowUpReason`).
- **J1.** "Jobs today" ignored `job_status = CANCELLED`. `jobsOnDate` / `isCancelled` now check both columns.
- **R1. "Revenue today"** was the booked value of today's jobs, estimates included. The chat tool now returns `bookedValue` and `collected` separately, and the Command Center labels read "Booked".
- **Q1. Action center and briefing fetched the *oldest* 100–150 bookings** (`order=date.asc&limit=…`), so as history grew, today's and tomorrow's jobs and unpaid jobs would silently drop out. They now query open (non-PAID, non-cancelled) jobs and today/tomorrow by date.
- **W1. `mark_job_paid` overwrote `amount_paid`**, skipped `payments[]`, and always set PAID, on both web and voice. It now uses `planPayment`, the dashboard's Record a Payment rule, with duplicate, over-balance and mismatch guards.
- **W2. `update_lead_status` stamped `last_contacted_at` on every change**, which broke the follow-up rule. Only `contacted`/`quoted` stamp it now.

## Still open

- **Dashboard vs Jarvis unpaid count:** the dashboard's "Unpaid / Due" counts COMPLETED + INVOICED jobs even when the balance is $0, and Jarvis lists only jobs with a balance. Both come from the same `isAwaitingPayment`, and the zero-balance ones show up in data health. If the owner wants the dashboard count to exclude $0 balances too, it's a one-line change in `JobOps.tsx`.
- **Command Center's `today.revenue` key** still carries booked value (relabeled "Booked" in the UI). Renaming the key in `admin-api-data.js` and the four readers is cosmetic.
- **Voice non-money tools** (`list_jobs`, `search_customers`, lead analysis, reschedule/undo, email) are still Python.
- **Proactive's first run after deploy** will send one new unpaid alert, because the fingerprint format changed and COMPLETED jobs with balances now count.

## Third pass (2026-09-27): Telegram production bugs

| # | Bug | Root cause | Fix (code, not prompt) | Tests |
|---|---|---|---|---|
| 1 | "Which jobs make the difference?": Jarvis guessed | Money functions returned totals only | `jobContribution` / `revenueContributions` / `compareRevenuePeriods` (totals are sums of contributions); `compare_revenue_periods` tool; `money_compare` intent | business-metrics, business-data 1 |
| 2 | Hallucinated 2013 Civic | Only prose survived between turns; tool results (ids, vehicles) were discarded | `_lib/jarvis-context.js`: structured context (customer, active booking, result set, pending action) returned as a `context` event, stored per Telegram chat (`jarvis_proactive_state`) and by the web hook; "that/it/her" re-reads the anchored record before Claude answers | jarvis-context, admin-ai-chat e2e |
| 3 | "No VIN" for Jill | Model read `customers.vin` (blank); VINs live on bookings | `vehicleRecords`: VIN/mileage/address reconciled per vehicle across bookings + customer record, conflicts reported | job-context, business-data |
| 4 | Lisa "not a customer" | Resolution only searched customers/bookings | `resolvePerson` searches customers, bookings, leads; note subjects as fallback; note-history intent searches notes first; `person_followup` intent | jarvis-context, job-context, business-data |
| 5 | Stale subject / "each one" | No entity state; no result-set memory; stale context outranked new names | `planTurn`: explicit name/vehicle > active record > previous result set > ask | jarvis-context, e2e |
| 6 | "Red" not found | Routed to `search_customers` (customers table only) | history intent covers "come in for"; `search_customers` = all-domain `findPeople` | job-context, business-data, e2e |
| 7/14 | Sergei = "General Inquiry" | Photo captions/scans never fetched; only "other" counted as generic | photo captions + scan documents in evidence; any non-specific category is generic, with a "never describe as X" hint | business-data, job-context |
| 8 | Estimate $392.40 instead of $409.11 | Tools exposed raw pre-tax `estimate_amount` | `jobMoney`: `estimateSubtotal/Tax/Total`, `invoiceSubtotal/Tax/Total`, `balanceDue`; raw fields removed from tool output; JobCard shows totals | business-rules, business-data |
| 9 | No cancel ability | No tool; `update_job_status` couldn't cancel correctly | `cancel_job` / `reopen_job` = admin button fields (`job_status` + `status`), confirmation-gated; reason saved as a Jarvis note | business-rules, business-data, e2e |
| 10 | "Done" without a write | No tool was called, and writes used `return=minimal`, so a PATCH matching 0 rows looked successful | all writes go through `patchVerified` (exactly 1 row, values read back); structured `{ok, verified, changed}` results; `guardFinalText` replaces success claims without a successful write this turn; plain "yes" executes the pending action deterministically | business-data 10, jarvis-context, e2e |
| 12 | Lisa leaked into revenue | Full history was sent for every question | self-contained intents send only the current message and no context | jarvis-context, e2e |
| 13 | Duplicate phone stated as fact | Findings had no confidence | every finding has `severity`, `confidence`, `evidence`, `suggested_manual_check`; shared phone = `possible` | business-rules, business-data |
