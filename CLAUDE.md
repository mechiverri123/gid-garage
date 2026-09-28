# CLAUDE.md — GID Garage / Jarvis
## Permanent repo instructions + exact current project status

This file is intended to be the primary handoff/instruction file for Claude Code.

The project is a real production system for **GID Garage**, a mobile mechanic business.
Treat all business data, customer data, schedules, payments, outbound messages, and automation as production-critical.

---

# 0. PERMANENT ARCHITECTURE RULE — CLOUDFLARE ZERO TRUST ROUTES

**All Cloudflare Zero Trust protected-hostname/destination slots are used up.** No new destination can be added.

- Any route (UI or API) that needs Cloudflare Access protection **must live under an existing protected tree**:
  - `/jarvis/*`
  - `/admin/*`
  It then inherits the existing Access application automatically.
- **Do not** create new protected top-level routes (`/seo-data`, `/tools`, `/settings`, `/analytics`, `/growth`, …). If it needs Access, nest it: e.g. `functions/jarvis/<name>.js` → `/jarvis/<name>`.
- A top-level route is fine only if it genuinely does **not** need Zero Trust. Examples: public pages, webhooks with their own signature or secret, and cron endpoints like `/seo-sync`.
- Access-protected functions must still verify the Access JWT server-side with `verifyAccess()` in `functions/_lib/access-auth.js` (signature, issuer, audience, expiry). Header presence alone is not auth. Older admin endpoints that only check header presence predate this rule.
- **`/seo-sync` is the deliberate exception.** It's server-to-server: Supabase `pg_cron` calls it with `X-GID-SEO-Secret`, verified in constant time against `SEO_SYNC_SECRET`. It must stay **outside** Access and must never gain a header-based admin bypass.
- **The Access app matches every path that *starts with* `jarvis`,** not only `/jarvis/*`. So `/jarvis-telegram`, `/jarvis-proactive` and `/jarvis-business` get a 302 to the Access login page. That caused the Telegram, reminder and voice-tool outage found on 2026-09-28.
- **Server-to-server hooks live under `/hooks/*`** (outside Access). Each is a one-line re-export of its handler, and its own shared secret is its auth:
  - `/hooks/telegram`: the Telegram webhook URL.
  - `/hooks/proactive`: the `pg_cron` target.
  - `/hooks/business`: the voice agent's business tools.
  Never point a webhook, cron job or agent at a `/jarvis*` path.
- Preserve this rule in every future architecture change or refactor.

# 0.1 SEO / GROWTH MODE — CURRENT STATE

- **Supabase SEO schema is initialized in production.** `seo_migration.sql` ran successfully. The checked-in file is the exact corrected version that ran: plain SQL, and the `seo_gsc_period` / `seo_gsc_service_daily` RPCs have quoted `"position"`, `g.`-qualified columns, `::bigint` sums and explicit aliases. Do not re-run it or change the existing tables casually. Schema changes need a new, additive migration.
- **These Cloudflare Pages variables already exist.** Don't ask the owner to create them again:
  - `CF_ACCESS_TEAM_DOMAIN`
  - `CF_ACCESS_AUD`
  - `SEO_SYNC_SECRET`
- **SEO routes:**
  - `/jarvis/seo-data` (`functions/jarvis/seo-data.js`): admin API, Access plus verified JWT; also runs "Sync now".
  - `/seo-sync`: cron only.
- **Details:** `SEO_SETUP.md`. The architecture is local-first: GID serves about 30 miles around Flagstaff.
  - Every geography decision goes through `isInsideServiceArea()`.
  - Only explicitly offered services (`shared/seo/services.js`) may produce recommendations.

---

# 1. GRAPHIFY — REQUIRED CODEBASE NAVIGATION

This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists.
- Use `graphify path "<A>" "<B>"` for relationships.
- Use `graphify explain "<concept>"` for focused concepts.
- These return a scoped subgraph and should be preferred over broad grep/source crawling.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

Examples relevant to the current work:

```bash
graphify query "How is revenue calculated in the admin dashboard and Jarvis?"
graphify query "Where are amount_paid payments tax_amount parts_cost and paid_at used?"
graphify query "How does Telegram route into admin-ai-chat?"
graphify query "How are proactive reminders delivered?"
graphify query "Where is lead follow-up logic duplicated?"
graphify explain "get_owner_pay_summary"
graphify explain "jarvis-proactive"
graphify path "admin-ai-chat" "BookingWidget"
```

Do not skip Graphify and immediately make broad architectural changes.

---

# 2. FIRST RULE: SOURCE WINS

Before editing:

1. Read this file.
2. Read:
   - `CODEBASE.md`
   - `README.md`
   - `LIVEKIT_JARVIS_SETUP.md`
   - `MANUAL_STEPS.md`
3. Inspect the actual current source.
4. Use Graphify before broad browsing.
5. Run the current validation commands before and after changes:
   - `npm run typecheck`
   - `npm run build`
6. If a document disagrees with source, source wins.
7. If a historical note in this file disagrees with live source or database behavior, verify before changing anything.

Do not rewrite working systems merely because a cleaner architecture is imaginable.

---

# 3. PROJECT GOAL

The target is not "a chatbot with many tools."

The target is an owner-level business operating assistant that is:

- correct
- fast
- concise
- context-aware
- proactive without being annoying
- able to safely act on real business data
- consistent across website, Telegram, proactive automation, and voice
- trustworthy enough to actually help run GID Garage

A great Jarvis should feel like:

```text
business intelligence
+ executive assistant
+ scheduler
+ CRM context
+ safe action layer
+ proactive operations monitor
```

It should NOT feel like:
- a generic chat bot
- a fake sci-fi terminal
- a pile of disconnected tools
- an assistant that invents facts or priorities
- an assistant that gives different numbers depending on interface

---

# 4. CORE STACK

## Website
- React
- TypeScript
- Vite
- Cloudflare Pages
- Cloudflare Pages Functions

## Backend / data
- Supabase / Postgres
- Cloudflare Functions
- Claude API

## Realtime voice
- LiveKit Cloud
- Deepgram Flux STT
- LiveKit inference LLM
- Cartesia TTS

## Text
- Telegram Bot API
- Telegram messages route into the same website/business AI backend

## Business timezone
- `America/Phoenix`

Do not use browser/local-machine time implicitly for production business rules.

---

# 5. IMPORTANT CURRENT FILES

Inspect these first.

```text
functions/admin-ai-chat.js
functions/admin-api-data.js
functions/jarvis-telegram.js
functions/jarvis-proactive.js
functions/jarvis-livekit-token.js
functions/lead-capture.js

src/BookingWidget.tsx
src/JobOps.tsx
src/command-center/CommandCenterPage.tsx
src/command-center/hooks/useAdminAI.ts
src/command-center/hooks/useBusinessSummary.ts
src/command-center/hooks/useLiveKitJarvis.ts
src/command-center/components/RealtimeVoiceControl.tsx
src/command-center/utils/resultRenderer.tsx

jarvis-agent/agent.py
```

Also search the repo for:

```text
revenue
net profit
amount_paid
paid_at
payments
invoice_amount
tax_amount
parts_cost
owner_pay
follow_up_at
unpaid
this month
last 30
reminder
jarvis_notes
jarvis_reminders
```

---

# 6. LIVE / CONFIRMED WORKING STATUS

The following has been confirmed working in production during current development.

## A. Website Jarvis / business AI

Primary backend:
`functions/admin-ai-chat.js`

It:
- calls Claude
- supports real tool-calling into Supabase
- streams NDJSON events
- reads and writes live business data

Important event types:
```text
tool_call
tool_result
data
final
error
```

The frontend consumes the streaming response.

## B. Existing business tools

Working tool areas include:
- business summary
- leads
- lead status updates
- jobs
- customer search
- rescheduling
- job status
- payment recording
- pricing history
- tax/business settings
- marketing spend
- call logging
- owner pay/take-home
- customer email

Do not remove or rename tools casually because frontend, Telegram, voice, or proactive logic may depend on them.

## C. Confirmation-gated actions

These must keep explicit confirmation:
- `mark_job_paid`
- `send_customer_email`

Pattern:
1. tool call without `confirmed=true`
2. tool returns `needs_confirmation`
3. Jarvis explains exactly what will happen
4. owner explicitly confirms
5. tool is called again with `confirmed=true`

Any future irreversible financial or external action should follow this model.

## D. Telegram Jarvis

Confirmed working.

Flow:

```text
owner phone
→ Telegram
→ functions/jarvis-telegram.js
→ admin-ai-chat.js
→ Supabase/business tools
→ Telegram reply
```

Telegram should remain a transport layer, not a separate business brain.

Current owner access is restricted by Telegram chat ID.

Do not log, print, or hard-code Telegram secrets.

## E. Reminders

Confirmed working end-to-end.

Examples:
```text
Remind me tomorrow at 9 AM to check the parts order.
Remind me in 2 minutes to test reminders.
What reminders do I have?
```

The reminder system:
- stores reminders in Supabase
- supports relative reminders
- proactively sends Telegram reminders
- uses Supabase cron to call `functions/jarvis-proactive.js`

A historical bug was fixed:
- model previously guessed current clock time
- relative reminders like "in 2 minutes" were stored hours off
- relative time must be computed from server time, not model-estimated time

## F. Proactive cron

Confirmed working after a configuration mistake was corrected.

Current Supabase cron behavior:
- job runs every minute
- calls `https://gidgarage.com/hooks/proactive` (was `/jarvis-proactive`, which Access now intercepts; see §0)
- authenticates with `X-GID-Proactive-Secret`

During setup, cron job 1 was created with a literal placeholder secret.
It was replaced with working cron job 2.

Do not assume IDs remain permanent; inspect `cron.job` / `cron.job_run_details` if modifying scheduling.

The webhook/proactive secret was exposed during setup and should be rotated when practical.
Do NOT put the secret value in source or documentation.

## G. Proactive business intelligence

Implemented and deployed around:
- due reminder delivery
- morning briefing
- evening/tomorrow preview
- lead follow-up alerts
- unpaid alerts
- duplicate suppression

Behavior goal:
- notify only when useful
- do not repeat the same alert every minute
- do not spam "everything is fine" messages

## H. Owner notes / Action Center

Implemented and working.

Examples:
```text
Jake called, 2013 F150, grinding front brakes, maybe Friday, quoted 350.
What notes do I have about Jake?
What needs my attention?
Lisa might want an oil change sometime next week.
```

Confirmed behavior:
- natural notes can be saved
- notes can be recalled
- action center combines relevant owner attention items
- vague language such as "maybe Friday" does NOT automatically book an appointment

A routing bug was fixed where a natural note about Lisa was initially hijacked by the broad Action Center response.

## I. Focused-response routing

Implemented and working.

Specific requests should stay specific.

Examples:
- reminder request → reminder confirmation only
- lead follow-up question → lead answer only
- money question → financial answer only
- note lookup → notes only
- customer lookup → customer context
- `Brief me` → broad summary
- `What needs my attention?` → broad cross-domain summary

A historical issue existed where Jarvis appended unrelated reminders/jobs/leads to focused requests.
Do not regress this.

## J. Test-reminder cleanup

Command such as:

```text
Clear test reminders
```

was added to remove obvious test reminder clutter without touching normal reminders.

---

# 7. CURRENT FINANCIAL CONSISTENCY ISSUE — HIGHEST PRIORITY

A major inconsistency was discovered.

The admin Schedule dashboard showed approximately:

```text
Jobs This Month: 17
Revenue This Month: $4,414.02
Net Profit This Month: $2,951.80
```

Jarvis previously answered a revenue question with approximately:

```text
gross collected: $2,008.05
```

This is not acceptable when the period/metric should match.

There are two separate issues:

## A. Period mismatch

These are different:
- `this month` = current calendar month in Arizona
- `last 30 days` = rolling 30-day window

Jarvis must preserve the user's requested period exactly.

## B. Formula/source mismatch

The older owner-pay logic in `admin-ai-chat.js` used:

```text
amount_paid
filtered by paid_at
```

The dashboard uses more robust payment logic involving current booking/payment information and fallback behavior.

The old Jarvis logic also allowed a revenue question to be answered via an owner take-home estimator.

That is semantically wrong.

---

# 8. LATEST REVENUE ACCURACY PATCH STATUS

A patch was created to improve this.

Expected/current intent:

## `get_revenue_summary`
Use for:
- revenue
- gross
- sales
- collected
- net profit

It should:
- distinguish period semantics
- match the production Schedule dashboard's collection logic
- handle payment history/fallback logic
- calculate dashboard-style net profit

## `get_owner_pay_summary`
Use ONLY for:
- owner take-home
- after-fees/reserve
- owner pay

It should not be described as:
- revenue
- gross sales
- dashboard net profit

IMPORTANT:
The latest financial patch was created, but if it has not yet been validated against live dashboard values, treat it as **pending validation**, not proven correct.

First manual tests after any finance-related change:

```text
What is my revenue this month?
What is my net profit this month?
What is my revenue for the last 30 days?
What is my take-home for the last 30 days?
```

Compare:
- `revenue this month`
- `net profit this month`

directly against the live Schedule dashboard.

Do not consider the finance work complete until those match.

---

# 9. FINANCIAL DEFINITIONS

These definitions must become explicit and canonical.

## Revenue / Gross / Sales / Collected

Meaning:
**actual customer money collected during the requested period**

Do not substitute:
- owner take-home
- invoice total
- estimates
- future booked value

## Net Profit

Use the exact same definition as the Schedule dashboard.

Do not casually redefine it.

Inspect the production calculation and centralize it.

## Owner Take-Home

Separate metric.

Existing concept:
- gross collected
- minus estimated Stripe fees
- minus owner tax reserve
- minus prorated monthly overhead

This may be useful, but it is not revenue and is not necessarily the dashboard's net profit.

## Ambiguous phrase

User:
```text
What did I actually make this month?
```

Prefer a concise clarification by returning both relevant concepts if available:

```text
Dashboard net profit: $X.
Estimated owner take-home after reserve/fees/overhead: $Y.
```

Do not silently choose the wrong metric.

---

# 10. CANONICAL BUSINESS LOGIC — REQUIRED DIRECTION

The biggest architecture problem now is duplicated business logic.

Jarvis, dashboard, proactive worker, and voice must not each invent their own version of:

- revenue
- net profit
- unpaid
- lead follow-up
- schedule windows
- status normalization
- timezone handling

Create shared canonical logic where practical.

A likely structure:

```text
functions/_lib/
  business-metrics.js
  business-time.js
  business-status.js
```

Names may differ if repo conventions suggest something better.

Possible helpers:

```text
resolvePeriodWindow(period, now, timezone)
computeCollectedRevenue(bookings, window)
computeNetProfit(bookings, window)
computeUnpaidInvoices(bookings)
computeLeadFollowups(leads, now)
computeTodayJobs(bookings, today)
computeTomorrowJobs(bookings, tomorrow)
```

Do not create another copy/paste formula.

Refactor incrementally:
1. identify existing behavior
2. add tests
3. extract helper
4. prove parity
5. replace duplicate logic

---

# 11. REQUIRED CONSISTENCY AUDIT

Create:

`JARVIS_CONSISTENCY_AUDIT.md`

Audit at minimum:

| Concept | Dashboard | admin-ai-chat | proactive | Telegram | LiveKit voice |
|---|---|---|---|---|---|
| revenue | | | | | |
| net profit | | | | | |
| owner take-home | | | | | |
| unpaid | | | | | |
| jobs today | | | | | |
| jobs this month | | | | | |
| lead follow-up | | | | | |
| tomorrow schedule | | | | | |
| customer lookup | | | | | |
| reminder timing | | | | | |

For each:
- table(s)
- fields
- formula
- timezone
- date window
- statuses excluded
- fallback logic
- known edge cases
- whether it can disagree with another surface

Do not trust names like "revenue" without tracing implementation.

---

# 12. AUTOMATED TESTS THAT SHOULD EXIST

Business-critical calculations need deterministic tests.

## Revenue tests
- multiple partial payments
- one full payment
- payment history present
- amount_paid present but payment history incomplete
- tax stored separately
- cancelled job
- exact period boundary
- current month vs last 30 days

## Net profit tests
- parts cost
- no parts cost
- tax handling
- cancelled job
- partial payment behavior
- parity with dashboard formula

## Owner take-home tests
- correct gross base
- Stripe fee percent
- reserve percent
- prorated overhead
- clearly distinct from revenue/net profit

## Follow-up tests
- booked/lost lead excluded
- follow_up_at overdue
- stale uncontacted lead
- fresh lead not flagged

## Reminder tests
- `in 2 minutes`
- tomorrow at exact time
- timezone
- one delivery only

## Intent routing tests
- "revenue this month" → revenue tool
- "take-home this month" → owner-pay tool
- "lead follow-up" → leads only
- "remind me" → reminders only
- "what needs attention" → broad cross-domain logic

Do not use model prose as the assertion for financial calculations.
Assert exact numeric outputs from fixtures.

---

# 13. SOURCE OF TRUTH BY DOMAIN

Use explicit authoritative sources.

```text
Customer identity/contact       -> customers
Lead lifecycle                  -> leads
Booked jobs/workflow            -> bookings
Revenue/payments                -> canonical payment calculation
Owner notes                     -> Jarvis notes table
Reminders                       -> Jarvis reminders table
Calls                           -> calls
Marketing spend                 -> marketing_spend
Business settings               -> business_settings
```

Do not answer live business facts from conversation history if database state exists.

Conversation history is context, not the source of truth.

---

# 14. LIVEKIT / VOICE STATUS

Named LiveKit agent:
`gid-jarvis`

Voice has previously been confirmed working.

Architecture:

```text
browser mic
→ LiveKit WebRTC
→ STT
→ LLM
→ business tools / Jarvis behavior
→ Cartesia TTS
→ browser
```

The exact current `agent.py` must be inspected before changing it.

Known important behavior:
- startup chatter such as "standing by" was intentionally removed
- agent should be silent on connect
- typed website commands should still use the website business AI path
- Quick Commands must not be broken
- voice should not become an independent business-data implementation

Important direction:
Voice must eventually share the same canonical business semantics as text.

If `jarvis-agent/agent.py` duplicates:
- revenue
- follow-up
- unpaid
- scheduling
- customer logic

either route it through authoritative backend logic or maintain parity with tests.

---

# 15. EMAIL STATUS

Jarvis can send real email through Brevo.

Current sender/reply-to behavior has previously been configured.

Do not change live sender behavior without inspecting current code/env.

`send_customer_email` remains confirmation-gated.

---

# 16. META / LEAD ADS STATUS

Direct Meta lead integration was attempted and became a time sink.

Current important status:
- existing `leads` table is the canonical lead database
- website quick quote/booking already creates leads
- `functions/lead-capture.js` exists
- direct Meta webhook/app work was partially configured
- Meta UI/app association became unreliable/confusing
- this is NOT the current priority

Do not spend time rebuilding Meta integration unless explicitly requested.

The leads system itself is useful and should continue to be improved independently of Meta.

---

# 17. LEAD INTELLIGENCE DIRECTION

Jarvis should understand messy lead data safely.

Example:

```text
Hello! I filled out your form...
Full name: Allison Taylor
Issue: Nothing just going bad
Vehicle: Brakes change
Date/time: Whenever
```

Desired interpretation:
- person: Allison Taylor
- likely requested service: brakes
- vehicle info: missing
- issue text: vague
- scheduling intent: flexible
- do NOT auto-book "whenever"
- do NOT invent vehicle
- do NOT claim something is stored unless actually verified

Natural-language interpretation is useful.
Fabrication is not.

---

# 18. ACTION CENTER / NOTES DIRECTION

Current behavior is useful but should evolve.

Jarvis should answer:

```text
What needs my attention?
What am I waiting on?
Who should I contact next?
What's blocking tomorrow?
What is the next action for Richard?
What did I last tell Lisa?
```

The next major feature should be **business threads / active context / next-action intelligence**.

---

# 19. BUSINESS THREADS — NEXT MAJOR PRODUCT DIRECTION

Example owner input:

```text
Richard's Ranger estimate is sent, waiting on him to confirm Tuesday.
```

Desired structured understanding:
- subject: Richard
- vehicle: 2011 Ford Ranger
- current state: estimate sent
- dependency: customer response
- tentative timing: Tuesday
- next action: wait / follow up if no response
- no appointment change unless explicitly instructed

Potential concept:
`jarvis_threads`

But do NOT immediately create a new table.

First inspect whether:
- bookings
- leads
- calls
- notes
- reminders

already contain enough structure.

A thread should link context, not duplicate the CRM.

---

# 20. DATA HEALTH / SELF-AUDIT

Jarvis should eventually detect inconsistencies rather than inherit them.

Useful read-only checks:
- PAID job with no `paid_at`
- PAID job with no payment value/history
- payment total differs materially from invoice
- tax omitted from a revenue path
- invoiced job fully paid but not marked paid
- past appointment still in pre-service state
- lead booked but no booking link
- reminder overdue but notification state inconsistent
- duplicate customer/lead relationships

Build a read-only "data health" tool before considering auto-fixes.

Never auto-repair financial records without explicit confirmation.

---

# 21. TIME HANDLING

Timezone:
`America/Phoenix`

Rules:
- server computes relative time
- model parses intent
- model is not the clock
- do not use UTC dates without converting where business-day semantics matter

Must test:
```text
in 2 minutes
tomorrow at 9
Friday afternoon
midnight boundary
this month
last 30 days
```

---

# 22. RESPONSE STYLE

Default:
- 1–3 useful sentences
- concise
- owner-focused
- no unnecessary recap
- no generic filler
- no "standing by"
- no fake system status language

Specific request → specific answer.

Broad commands allowed to combine domains:
```text
Brief me
What needs my attention?
What am I waiting on?
```

Examples:

Bad:
> No leads need follow-up. You also have three reminders and Richard's job is...

Good:
> No leads need follow-up right now.

---

# 23. PROACTIVE BEHAVIOR

Jarvis should be proactive only when useful.

Good proactive triggers:
- reminder due
- lead follow-up overdue
- important unpaid item
- tomorrow job has unresolved blocker
- morning owner briefing
- evening prep
- meaningful business anomaly

Avoid:
- repeated identical alerts
- "everything is fine" every hour
- generic check-ins
- duplicate morning/evening messages

---

# 24. SAFETY RULES FOR WRITES

## Can usually execute directly
Low-risk reversible writes such as:
- reminder creation
- note creation
- lead status changes
- job pipeline status changes other than paid
- rescheduling
- call logs
- marketing spend logs

Still report exactly what changed.

## Must confirm first
- mark job paid
- send customer email
- future destructive deletes
- future external purchases/financial transactions

## Never silently infer
- tentative date → appointment
- quote → payment
- "maybe" → commitment
- "whenever" → arbitrary scheduled time

---

# 25. WHAT "AMAZING JARVIS" MEANS

The product should eventually behave like this:

Owner:
```text
Brief me.
```

Jarvis:
```text
Two jobs remain today. Richard's 3 PM estimate is overdue for a response.
One lead needs follow-up. $X collected this week. Tomorrow is clear except
the parts-order reminder at 4 PM.
```

Owner:
```text
Richard called. He wants Tuesday but has to check with work.
```

Jarvis:
```text
Saved. Tuesday is tentative; I didn't change his appointment.
```

Later:

Owner:
```text
What am I waiting on?
```

Jarvis:
```text
Richard — waiting on Tuesday confirmation.
Lisa — deciding on an oil change next week.
Parts order — reminder due tomorrow at 4.
```

The impressive part should be correctness and useful context, not visual gimmicks.

---

# 26. DO NOT DO THESE THINGS

- do not create a second independent business brain
- do not duplicate financial formulas again
- do not send all focused questions through `get_business_summary`
- do not rebuild working Telegram transport
- do not rebuild LiveKit unless needed
- do not add generic delete tools
- do not invent business facts
- do not invent priorities without rules
- do not hard-code current dashboard totals
- do not store secrets in repo files
- do not "fix" money records automatically
- do not create more tables before inspecting existing schema
- do not call a take-home estimate "revenue"
- do not treat calendar month and rolling 30 days as equivalent

---

# 27. NEXT CLAUDE CODE WORK ORDER

Execute in this order.

## Phase A — Graphify-driven architecture audit

Use:

```bash
graphify query "How are revenue net profit and owner take-home calculated across the project?"
graphify query "Where are lead follow-up and unpaid-job rules implemented?"
graphify query "How do Telegram proactive and LiveKit connect to business logic?"
graphify query "Where are Phoenix timezone and date window calculations implemented?"
```

Then inspect source.

## Phase B — Produce consistency report

Create:

```text
JARVIS_CONSISTENCY_AUDIT.md
```

Document every mismatch found.

## Phase C — Add tests

Prioritize:
1. revenue
2. net profit
3. take-home distinction
4. period semantics
5. follow-up rules
6. reminder timing
7. intent routing

## Phase D — Centralize proven duplicated rules

Do the smallest safe refactor.

## Phase E — Validate production behavior

Run:

```bash
npm run typecheck
npm run build
graphify update .
```

Then manual Jarvis checks:

```text
What is my revenue this month?
What is my net profit this month?
What is my revenue for the last 30 days?
What is my take-home for the last 30 days?
Brief me.
Who needs a lead follow-up?
What needs my attention?
What notes do I have about Lisa?
Remind me in 2 minutes to test reminders.
```

Revenue/net-profit answers for `this month` must match the live admin dashboard.

## Phase F — Only then design the next capability

Propose and implement the smallest reliable version of:
**business threads / active context / next-action intelligence**

Do not jump into a huge rewrite in the same pass.

---

# 28. FINAL QUALITY BAR

Before saying a change is finished, prove:

1. same data + same period = same answer across dashboard and Jarvis
2. financial terminology is unambiguous
3. focused questions stay focused
4. no relative time is guessed by the model
5. proactive messages do not spam
6. risky writes still require confirmation
7. Telegram still works
8. reminders still deliver
9. voice still works if touched
10. typecheck passes
11. build passes
12. Graphify is updated
13. every changed business rule has a test

The goal is a Jarvis the owner can trust enough to run the business through.
