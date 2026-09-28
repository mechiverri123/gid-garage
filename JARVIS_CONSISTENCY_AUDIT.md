# Jarvis Consistency Audit

Traced from source on 2026-09-27. Status per row: **FIXED** (shared code + tests),
**MISMATCH** (still disagrees, not fixed yet), **OK** (same rule everywhere).

Canonical money code: `shared/business-metrics.js` (tests: `tests/business-metrics.test.js`, `npm test`).
It lives outside `functions/` so Pages doesn't route it; the dashboard and the functions both import it.

## Summary table

| Concept | Dashboard (`src/JobOps.tsx`) | admin-ai-chat (web + Telegram) | jarvis-proactive | LiveKit voice (`agent.py`) | Status |
|---|---|---|---|---|---|
| Revenue | shared `collectedRevenue` | `get_revenue_summary` → shared | 7-day brief total → shared | own formula (see V1) | FIXED except voice |
| Net profit | shared `netProfit` | `get_revenue_summary` → shared | not shown | not implemented | FIXED |
| Owner take-home | Owner Pay panel → shared `ownerTakeHome` | `get_owner_pay_summary` → shared | not shown | own formula (see V2) | FIXED except voice |
| Unpaid | count of COMPLETED + INVOICED | INVOICED, no paid_at, invoice > amount_paid | same as chat | same as chat | MISMATCH (U1, U2) |
| Jobs today | n/a | `date == AZ today`, `status != 'cancelled'` | same | same | OK-ish (J1) |
| Jobs this month | PAID jobs with paidAt in AZ month | not exposed | n/a | n/a | OK |
| Lead follow-up | n/a | action center: stale > **1 day**; business summary: stale > **2 days** | stale > 1 day | stale > **2 days** | MISMATCH (L1) |
| Tomorrow schedule | n/a | `addPhoenixDays(today, 1)` | `addDate(today, 1)` | own | OK (Telegram = chat) |
| Customer lookup | n/a | tools in chat | n/a | own Supabase queries | not audited in depth |
| Reminder timing | n/a | server computes relative time | due_at ≤ now, sent once | n/a | OK (fixed earlier) |

Telegram is a transport layer only (`jarvis-telegram.js` → `admin-ai-chat.onRequestPost`), so it always matches the web chat.

## Money definitions (canonical, `shared/business-metrics.js`)

- **Revenue / collected**: every `payments[]` entry whose `at` is in the window. For a `PAID` job whose `paid_at` is in the window **and** whose payment log totals less than `invoice_amount + tax_amount`, the job counts as `invoice + tax` (this replaces its logged entries and is not added on top). Cancelled jobs are **not** excluded: a kept deposit is still collected money. This matches the dashboard.
- **Net profit**: `PAID` jobs with `paid_at` in the window: `(amount_paid ?? invoice + tax) − tax_amount − parts_cost`.
- **Owner take-home** (the Hub Owner Pay panel): net profit − Stripe fee % × card (`'Card (Stripe)'`) payments − monthly overhead × days / 30, then the tax reserve % comes out of what's left. A deficit gives $0 take-home. Settings come from `business_settings` `owner_tax_reserve_pct` (default 0.3), `owner_stripe_fee_pct` (default 0.02928), and `owner_overhead_items` (summed).
- **Periods** (`resolvePeriodWindow`), all on the America/Phoenix calendar: `today`, `this_month`, `last_month`, `this_year`, and rolling windows `last_N_days` (`this_week` = last 7 days). Anything unrecognized is labeled "the last 30 days", so an answer never claims a period it didn't compute.

## Mismatches fixed in this pass

- **F1. Jarvis take-home ignored overhead entirely.** It read `business_settings.owner_monthly_overhead`, but the dashboard saves overhead in `owner_overhead_items`, so overhead was always $0.
- **F2. Jarvis take-home used a different formula from the Owner Pay panel.** It worked off gross (sales tax and parts cost included), charged the Stripe fee on all revenue instead of card payments only, took the reserve from gross, and used a 2.85% default fee instead of 2.928%. Now it's the same function the panel uses. The default period changed from 7 to 30 days, which is what the panel shows.
- **F3. Revenue excluded cancelled jobs in Jarvis but not on the dashboard.** Both now include them (a kept deposit is collected money).
- **F4. The dashboard used the browser's timezone for "this month" and "this year".** Both now use Arizona. The numbers only change if the admin browser is outside Arizona.
- **F5. Jarvis fetched bookings with no order or limit** (Supabase's default row cap, arbitrary rows). It now uses the same query as the dashboard: newest 2000 by date.
- **F6. "Collected last 7 days"** (action center and the morning brief) summed `amount_paid` for jobs whose `paid_at` fell in the last 7 days. That missed partial payments and counted the whole job total on the day it closed. It now uses the shared revenue calculation.
- **F7. A failed load read as $0.** Revenue and take-home tools returned $0 when Supabase errored (`.catch(() => [])`). They now return an error, and the 7-day total says "unknown".

## Open mismatches (not fixed yet)

- **V1. Voice revenue is a different metric.** `agent.py get_revenue_summary` filters bookings by **appointment date** (Monday to Sunday for `this_week`) and sums `amount_paid`. That's "paid-to-date on this week's appointments", not money collected this week. It has no `this_month` and no net profit.
- **V2. Voice take-home is also different:** `amount_paid` by `paid_at`, rolling days, and it doesn't match the panel.
  - **Fix direction:** voice shouldn't carry its own money math. Add a backend endpoint that runs the shared functions and have `agent.py` call it, or port the math to Python with the same fixtures. Needs a voice deploy and a live test.
- **R1. `get_business_summary` labels today's booked value as `today.revenue`.** It's `amount_paid` if paid, otherwise invoice or **estimate** + tax, for jobs *scheduled* today. That's booked value, not revenue. Four UI components read `today.revenue` (BusinessMetrics, BusinessSummaryCard, OwnerBriefing ×2), so the rename needs a coordinated UI change.
- **U1. Unpaid means different things on different surfaces.** The dashboard counts COMPLETED + INVOICED jobs. Jarvis, proactive and voice only count INVOICED jobs with no `paid_at` and invoice > amount paid. A COMPLETED job that was never invoiced shows as unpaid on the dashboard and not in Jarvis.
- **U2. Amount owed ignores tax.** It's calculated as `invoice_amount − amount_paid`, but `amount_paid` includes tax, so a partly paid taxed job under-reports what's owed by the tax amount. A job with `amount_paid ≥ invoice_amount` but less than invoice + tax disappears from the unpaid list.
- **L1. The stale-lead threshold differs:** 1 day in the action center and proactive, 2 days in `get_business_summary` and voice. "Who needs follow-up?" and "Brief me" can disagree for leads that are 1–2 days old.
- **J1. "Jobs today" filters out cancelled jobs by the `status` column only.** Jobs cancelled only through `job_status = CANCELLED` still count.

## Next steps (in order)

1. Deploy, then check "revenue this month" and "net profit this month" in Jarvis against the Schedule dashboard (manual).
2. Unpaid and lead follow-up: add shared rules (`computeUnpaid`, `leadNeedsFollowUp`) plus tests, and settle U1, U2 and L1 with the owner, since each one changes numbers someone may rely on.
3. Voice: route money questions through the backend (V1, V2).
4. R1: rename `today.revenue` to `today.bookedValue` across the chat tool and UI.
