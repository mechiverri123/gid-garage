# Jarvis Data Coverage Audit

Traced from source on 2026-09-27. The question for each row: can Jarvis get to the real stored facts the owner sees in the admin UI, or does it answer from a shallow field?

Architecture now: **intent → deterministic operation → authoritative result → model explains it.**
The operations are in `functions/_lib/business-data.js`, built on pure rules in `shared/` that the dashboard also uses. The model picks the tool and summarizes the result. It does not do money math or date math, and it doesn't pull facts out of raw rows on its own.

## 1. Source-of-truth map (what actually exists)

Field meanings come from the admin UI labels in `src/JobOps.tsx` and the booking form in `src/BookingWidget.tsx`.

### `bookings` (one row per job)
| Field | What it really is | Jarvis before | Jarvis now |
|---|---|---|---|
| `service` | category id: oil, brakes, diag, suspension, audio, full, **other** | the only description Jarvis saw | category only; flagged as generic when it's "other" |
| `notes` | booking-form string: `Address: … \| Plate/VIN: … \| Brake service: … \| <customer's own words>`; free-form owner notes on admin-created jobs | **ignored** | parsed into address, plate/VIN, selections and free text (`bookingRequest`) |
| `estimate_notes` | **"Scope of Work"**, printed on the estimate and invoice | **ignored** | `scopeOfWork` |
| `garage_notes` | **"Technician Notes"** (internal) | **ignored** | `technicianNotes` |
| `line_items` | billed items `{label, type, amount}` | **ignored** | `lineItems` |
| `inspection_data` | tire pressure and tread per wheel, `dtcCodes[{code, plan}]` | **ignored** | `inspection` (blank readings dropped) |
| `pre_existing_damage` | recorded at signing | **ignored** | `preExistingDamage` |
| `adjustment_amount/_reason` | price adjustment and why | **ignored** | `priceAdjustment` |
| `vin`, `mileage` | vehicle details | ignored (except customer search by VIN) | included |
| `job_photos[].note`, `admin_photos[].note` | photo captions | **ignored** | `photoNotes` (single-job detail only; base64 blobs never fetched into history) |
| `parts_receipts`, `parts_cost` | receipts and actual parts cost | **ignored** | detail view |
| `payments`, `amount_paid`, `paid_at`, `invoice_amount`, `tax_amount`, `estimate_amount` | money | partly; `amount_paid` was overwritten by payments | canonical money rules (see consistency audit) |
| `signed_at`, `invoice_sent_count/_last_sent_at` | signing / invoice status | ignored | included |
| `date_tbd` | date not really agreed | ignored | used (not a visit, not a blocker date) |
| `customer_id` | link to `customers`; null on pre-migration jobs | used for filtering | used, with phone/name fallback for legacy jobs |

### Other tables
| Table | Rich fields | Jarvis before | Jarvis now |
|---|---|---|---|
| `customers` | name, phone, email, vehicle, vin, **notes** | search only | resolved person + `customerRecordNotes` |
| `leads` | requested_service, quote_amount, status, follow_up_at, last_contacted_at, **notes**, raw_payload, booking_id, customer_id | lead tools only, never tied to a customer's history | attached to that customer's history (by id, phone or name) |
| `calls` | direction, outcome, **notes**, lead_id, customer_id | `list_calls` = latest calls for everyone | attached to that customer by customer_id, lead_id or phone |
| `jarvis_business_notes` | raw_text, summary, contact_name, vehicle, service, quoted_amount, preferred_timing, action_needed, due_at | only searchable by keyword | linked to the customer with a **match quality** (`phone`, `full_name`, `mentions_full_name`, `first_name_only`) |
| `jarvis_reminders` | title, notes, due_at, related_lead_id, notified_at | separate | linked via related lead or name |
| `business_settings` | tax rate, owner pay settings (`owner_overhead_items`, …) | owner pay read a column that doesn't exist | shared `ownerPaySettings` |
| `ppi_inspections` | pre-purchase inspections | not exposed | **not exposed** (separate flow, not jobs; see gaps) |

## 2. Question → data → tool coverage

| Category | Example questions | Tables / fields | Tool | Status |
|---|---|---|---|---|
| Customer history | "What have we done for Jill?" "Summarize her history" | bookings (all descriptive fields), leads, calls, notes, reminders, customers.notes | `get_customer_context` | **FIXED**. Before, only `list_jobs` (service/status/amount) |
| Job scope | "What were Jill's jobs about?" "What was included in that brake job?" | estimate_notes, line_items, notes | `get_customer_context`, `get_job_detail` | **FIXED** |
| Diagnostics | "What did we diagnose?" "What was wrong with the F-150?" | garage_notes, inspection_data.dtcCodes, notes | same | **FIXED** |
| Recommendations | "Any unresolved recommendations?" | garage_notes / estimate_notes free text, dtc `plan` | same | **PARTIAL**: no structured recommendation field exists, so the model reads the technician notes and says so |
| Parts / labor | "What parts did that job need?" | line_items (type parts/labor), parts_receipts, parts_cost | `get_job_detail` | **FIXED** |
| Quote / estimate | "Why was that quote so high?" | line_items, estimate_amount, adjustment_*, estimate_notes | `get_job_detail`; `pricing_history` now also searches the scope of work | **FIXED** |
| Invoice / payment | "Did Jill pay?" "Record $200 cash" | amount_paid, payments, paid_at, invoice + tax | `get_job_detail`, `get_unpaid_jobs`, `mark_job_paid` (dashboard rule) | **FIXED** |
| Job status | "Where is Richard's job at?" | job_status, date, signed_at | `get_customer_context` / `list_jobs` | OK |
| Notes | "What did I tell Lisa?" | business notes, lead notes, call notes | `get_customer_context` (+ `list_business_notes`) | **FIXED**: all three sources, with match quality |
| Calls | "When did we last talk to Jill?" | calls, leads.last_contacted_at, notes | `get_customer_context.lastInteraction` | **FIXED** |
| Leads | "Who needs follow-up?" | leads | `list_lead_followups` (shared rule) | OK; rule unified |
| Reminders | "What reminders do I have?" | jarvis_reminders | reminder tools | OK (unchanged) |
| Follow-up / waiting | "What am I waiting on?" "Who should I contact next?" | jobs ESTIMATE_SENT, balances, quoted leads, tentative notes | `get_action_center.waiting_on` | **NEW** |
| Schedule / blockers | "What's blocking tomorrow?" | tomorrow's jobs: time, vehicle, phone, service_address, job_status | `get_action_center.tomorrow_blockers`, briefing | **NEW** |
| Revenue / net profit / take-home | "Revenue this month?" | canonical money rules | `get_revenue_summary`, `get_owner_pay_summary` | FIXED (see consistency audit) |
| Data health | "Anything off in the records?" | bookings, leads, reminders, customers | `get_data_health` (read-only) | **NEW** |

## 3. How deep retrieval works

1. **Intent routing** (`functions/_lib/jarvis-intent.js`): history and depth questions ("what were X's jobs about", "last visit", "what did we diagnose", "what did I tell X", "next action for X", …) route to `customer_history`. That intent only exposes `get_customer_context`, `get_job_detail` and `list_business_notes`, so the model can't fall back to the shallow `list_jobs`. Tested.
2. **Entity resolution** (`resolvePerson`): candidates come from `customers` plus booking rows, merged by customer_id, phone digits and exact name. That merge catches legacy jobs with no customer_id. An exact full-name or phone match wins. Two plausible people give `ambiguous` with the candidates, and the model is told to ask. Nobody matching gives `not_found`.
3. **Targeted fetch**: only that person's bookings (customer_id or exact name, with the full descriptive columns except photo blobs). Leads, calls, notes and reminders are fetched with bounded limits and filtered to that person in code.
4. **Evidence** (`jobEvidence`): each job becomes labeled facts (`scopeOfWork`, `technicianNotes`, `lineItems`, `bookingRequest`, `inspection`, …). It also gets `evidenceFields` (which sources have content), `gaps` (what's missing) and `hints` (a generic category, or a category that none of the notes support).
5. **History** (`buildCustomerHistory`): jobs sorted oldest to newest, `lastVisitJobId` (latest past non-cancelled job), `nextVisitJobId`, vehicles, `openItems` (balance owed, estimate awaiting approval, owner-note actions, reminders), `lastInteraction`, plus the person's leads, calls and owner notes. The newest 15 jobs keep full evidence and older ones are condensed, which keeps payloads bounded.
6. **Referents** ("her last visit", "that job", "the Ranger") are resolved from the conversation, but facts always come from a fresh tool call. The system prompt says chat history is never the source of truth.

## 4. How analysis stays tied to evidence

- The prompt separates **FACT**, **INFERENCE** and **ACTION**. Facts are stated plainly. Inferences give their basis ("based on the scope of work…"). Actions follow the existing confirmation rules.
- The model is told never to describe a job by its category when evidence exists, and never to invent a diagnosis, part, recommendation, vehicle or outcome.
- `gaps` make missing data explicit, so "nothing describes the work beyond the category" is something the model has to say out loud.
- `hints` surface disagreements (category "Brakes" with a scope about a serpentine belt), and the model is told to report what each source says.
- Owner notes carry `match`. A first-name-only match is flagged as possibly a different person.
- Every number the model repeats (balances, totals, revenue) comes from deterministic code with tests.

## 5. Business threads / active context: decision

I checked the existing schema before adding anything. `jarvis_business_notes` already holds the parts of a thread: `contact_name`, `vehicle`, `service`, `quoted_amount`, `preferred_timing` (tentative timing stays tentative), `action_needed`, `due_at` and `status`. Bookings hold state (`ESTIMATE_SENT` = waiting on approval), and leads hold `quoted` + `follow_up_at`.

**No new table was created.** "Threads" are derived at read time:
- `waiting_on` combines estimates awaiting approval, balances owed, quoted leads, and open notes with tentative timing or waiting language.
- `get_customer_context` links a person's jobs, leads, calls, notes and reminders into one history, with `openItems` and `lastInteraction`.

"Richard's Ranger estimate is sent, waiting on him to confirm Tuesday" is captured as a note (routing tested). It shows up in `waiting_on` with `tentative_timing`, and it never books Tuesday.

**Smallest future step if needed:** two nullable columns on `jarvis_business_notes` (`customer_id`, `booking_id`) so a note links to its customer and job by id instead of by name or phone. That's a migration the owner would run. It isn't done here.

## 6. Write-safety invariants (audited and tested)

| Tool | Invariant | Before | Now |
|---|---|---|---|
| `mark_job_paid` (web, Telegram, voice) | appends to `payments[]`; `amount_paid` = previous + this; PAID only when invoice + tax is covered; never double-counts | **overwrote `amount_paid`, skipped payment history, always set PAID**. A partial "paid $290" on a job with $250 already recorded would have set amount_paid to 290 | `planPayment`: same rule as the dashboard's Record a Payment. Refuses duplicates (same amount within 10 min), amounts over the balance, jobs with no invoice, already-PAID or cancelled jobs, and history/amount mismatches. Confirmation-gated. No email sent |
| `update_lead_status` | contact time only when contact happened | stamped `last_contacted_at` on every change (including "lost") | only `contacted`/`quoted` stamp it; status allowlisted (web + voice) |
| `reschedule_job` | real Arizona date, valid stored time format, don't rewrite closed jobs | no validation | `YYYY-MM-DD` validated; time is "11:00 AM", "13:00" or "TBD"; clears `date_tbd`; refuses PAID/cancelled |
| `update_job_status` | allowlisted statuses, never PAID | any string accepted | allowlisted; refuses changing a PAID job |
| `create_reminder` | server-computed time | already correct | unchanged |
| `capture_business_note` | never books or commits | already correct | unchanged; waiting/tentative statements now routed to capture |
| `add_marketing_spend`, `log_call` | allowlisted fields, valid values | no validation | date/amount/direction validated |
| searches | PostgREST filter safety | user text went straight into `or=()` filters | `cleanSearchText` + quoted values |

## 7. Still not covered / known gaps

- **Recommendations** have no structured field, so they're read from technician notes and DTC plans.
- **PPI inspections** (`ppi_inspections`) aren't exposed to Jarvis.
- **Photo contents** are unknown. Only captions are read.
- **Voice** gets the new tools through `/jarvis-business`, but other voice tools (`list_jobs`, `search_customers`, lead analysis, reschedule/undo, email) remain Python-side. Their logic has no money or unpaid rules, but it's still a second implementation.
- **Model**: web and Telegram run `claude-haiku-4-5`. If job summaries read thin in live testing, moving `customer_history` turns to a stronger model is a one-line change (`CLAUDE_MODEL`).
