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


# 0.45 PERMANENT TIME, TIMEZONE & MONEY INTEGRITY RULES

**Production timezone:** GID Garage operates in Arizona. Business-day/month boundaries and human-facing local times use `America/Phoenix`. Never use the browser/server's implicit timezone for business logic.

## Database timestamp contract

- Every column representing a real instant/event MUST be PostgreSQL `timestamptz` (`timestamp with time zone`). Examples: `created_at`, `updated_at`, `paid_at`, `signed_at`, `sent_at`, `completed_at`, `cancelled_at`, webhook/event timestamps, audit timestamps.
- NEVER create or migrate a real event timestamp as `timestamp without time zone`.
- Date-only concepts (scheduled service date, birthday, reporting date when intentionally date-only) may use PostgreSQL `date`.
- A local wall-clock value should only use a timezone-less type when it intentionally has no instant/timezone semantics; document that exception next to the schema.
- Application writes for real instants must be UTC ISO-8601 (`new Date().toISOString()`) or database `now()`. Preserve the offset/`Z` end-to-end.
- Never strip `Z`/offsets before persisting or parsing. Never append `Z` to an unknown timezone-less value as a guess.
- For legacy `timestamp without time zone` migrations, first determine what timezone the stored values actually represent. If they were produced from UTC ISO timestamps, convert with `USING column AT TIME ZONE 'UTC'`. Do not blindly convert historical data.

## Display and business-boundary contract

- Display customer/business times explicitly in `America/Phoenix` unless a feature explicitly requires another zone.
- "Today", "this week", "this month", reports, revenue periods, calendar boundaries and day grouping MUST be resolved in `America/Phoenix`, not UTC and not the runtime machine timezone.
- Do not derive a Phoenix business date with `toISOString().slice(0,10)`; that is a UTC date. Use the project's timezone helpers.
- Do not parse date-only `YYYY-MM-DD` strings through `new Date(dateString)` for calendar logic; JS interprets them as UTC. Keep date-only values as date-only strings or use the shared Phoenix date helpers.
- Centralize timezone conversion. Do not scatter ad-hoc `new Date(...)`, `toLocaleString(...)`, manual `-7 hours`, or offset arithmetic through components. Arizona has no DST, but still use the IANA zone `America/Phoenix`, never a hard-coded `-07:00` as the architecture.

## Canonical money/accounting contract

- `payments[]` payment events are the canonical source for **when cash was collected**. Each payment's timestamp determines the accounting period.
- `paid_at` is job/status metadata (when the job became fully paid), NOT a substitute for individual payment timestamps when allocating revenue by day/month.
- Revenue, sales tax, net profit, paid-job/reporting counts, charts, Jarvis answers, Money mode and exports MUST use the same canonical shared accounting functions. Never implement a second period calculation in a UI component.
- Partial payments that cross day/month/year boundaries must be allocated by their actual payment timestamps. Never assign the whole invoice to the final `paid_at` period.
- If legacy data has `amount_paid` greater than the sum of recorded `payments[]`, synthesize only the missing remainder at the best verified payment timestamp; never double-count the invoice.
- Net profit for a period must be derived from the same collected-payment basis as revenue. Tax and job-level costs must be allocated consistently by the canonical business-metrics logic.
- Card/processing fees must be identified from the actual payment processor/method metadata (including Tap to Pay/Stripe IDs), not one fragile display-string equality.
- Money displayed by Admin, Jarvis, Money mode, reports and exports must reconcile to the same canonical functions.

## Required checks before shipping any time/money change

1. Search schema/migrations for newly introduced `timestamp without time zone`; reject it for real event timestamps.
2. Search changed code for UTC-date shortcuts (`toISOString().slice(0, 10)`), implicit `new Date('YYYY-MM-DD')`, manual timezone offsets, and duplicate revenue/profit math.
3. Run the focused money/time regression tests plus normal typecheck/build/tests.
4. Maintain boundary regression tests covering at minimum:
   - Sep 30 5:xx PM Phoenix represented as Oct 1 00:xxZ stays in September.
   - Oct 1 local payment stays in October.
   - signed/paid timestamps display the original Arizona wall time.
   - partial payments on opposite sides of a month boundary allocate correctly.
   - revenue and net-profit period filters cannot disagree about which payment belongs to the period.
5. For a database migration, provide the owner with additive/safe SQL and a verification query. Never silently reinterpret production timestamps.

**Incident that established this rule (2026-10-01):** `bookings.paid_at`, `signed_at`, and `created_at` were `timestamp without time zone` even though the app wrote UTC ISO timestamps. PostgreSQL/Supabase discarded the timezone semantics. This made Sep 30 Arizona payments appear as Oct 1 to some calculations, caused Revenue and Net Profit to disagree, and displayed a 1:27 PM Arizona signature as 8:27 PM. These columns were migrated to `timestamptz`. Do not reintroduce this class of bug.

---
# 0.4 JARVIS VISUAL-FIRST INTERACTION RULE (permanent)

Jarvis is the interactive command interface for GID Garage, not primarily a chatbot.

- **Show, don't narrate.** When an answer can be shown with a real interface, Jarvis opens it on `/jarvis`. That covers jobs, one job's estimate/payment/inspection/notes/parts, the calendar, revenue for any period, the jobs list and customers.
  - Voice/text gives one short sentence; the screen carries the detail.
  - Examples: "Pull Jill's jobs" opens the job cards. "Revenue this month" opens the chart. "Show the last 13 days" redraws it for exactly today and the 12 days before.
- **One workspace, never stacked modals.** Every view goes through one state machine, `shared/jarvis-workspace.js` (tested in `tests/jarvis-workspace.test.js`):
  - it renders in the lazy overlay `src/command-center/workspace/`;
  - the backend opens views by streaming `{type:'ui', action}` events from the `UI_TOOLS` in `admin-ai-chat.js` (`show_jobs`, `show_revenue`, `show_calendar`, `show_job_list`, `show_customers`, `control_screen`).
  - UI tools are offered only when the request carries `ui.enabled` (the `/jarvis` page), never on Telegram.
- **Context follow-ups.** Each question sends what's on screen (`describeScreen`), so "open the middle one", "its payment" and "close it" act on the visible content.
  - Clear screen commands are handled on the page with no AI round trip (`parseLocalCommand`): close, tabs, positions, day counts, calendar words.
  - Spoken ones work through the LiveKit user transcript.
- **Reuse /admin logic, never redirect or copy data.** Jarvis views read and write the same bookings rows through the same calls as `/admin` (`get-booking`, `list-bookings`, `patch-booking`).
  - Editing reuses the admin panels themselves (`EstimatePanel`, `PaymentPanel`, `InspectionPanel`, `PartsCostPanel`, `JobDetailPanel` as "Full editor", `ExternalLeadModal` as New Job). They're re-themed by the `.jv-skin` CSS, which is scoped so `/admin` looks unchanged.
  - Status clicks use the shared `statusChangeFields` in `shared/business-rules.js`.
  - Don't modify `/admin` for a Jarvis feature unless a truly shared backend abstraction needs a safe refactor.
- **Money on screen is canonical.** `revenueRange` (business-data.js) uses inclusive Arizona day ranges (`resolveDayRange`/`dayRangeWindow`) and the canonical collected / net-profit math.
  - On `/jarvis` the spoken number comes from the same `show_revenue` result as the chart.
  - Test: `revenueRange` this month equals `revenueSummary` this month.
- **Legacy LiveKit path (rollback only):** the LiveKit agent's `show_on_screen` tool calls `/hooks/business` (`show_*`, the same `functions/_lib/jarvis-screen.js` as the chat) and forwards the returned `__ui` actions to the page on the `gid.ui` topic. The page applies them through the same workspace, and on-screen follow-ups use the user transcript. Agent changes need `lk agent deploy` from `jarvis-agent/`.
- **Voice = direct providers (2026-09-28, owner's decision, supersedes "LiveKit only").**
  - **Pipeline:** browser `src/command-center/voice/useDirectVoice.ts`
    - mic → AudioWorklet 16 kHz PCM → local VAD → Deepgram nova-3 WebSocket (only speech plus a 300 ms pre-roll is sent; KeepAlive in silence);
    - the final utterance goes to the SAME `command` path as typing (`parseLocalCommand`: screen, mode and global commands with no AI cost), otherwise to `admin-ai-chat.js` with `voice:true, stream:true`;
    - `say` events stream sentences → Cartesia WebSocket (Benedict) → WebAudio.
  - **Streamed speech guard:** narration Claude writes before a tool call is never spoken, and sentences pass the write-claim guard before they're said.
  - **Barge-in:** stops playback, cancels the Cartesia context, and aborts the chat request.
  - **Tokens:** `functions/jarvis/voice.js` (Access plus verified JWT) mints 10-minute Deepgram/Cartesia tokens; the master keys stay server-side. It resolves Benedict ("Benedict — Measured Mediator") once per isolate unless `CARTESIA_VOICE_ID` is set.
  - **Budget governor:** `functions/_lib/ai-budget.js`, backed by the `jarvis_ai_usage` table and the `jarvis_add_usage` RPC (`jarvis_ai_usage_migration.sql`).
    - Tracks estimated Anthropic, STT and TTS spend against `JARVIS_MONTHLY_AI_BUDGET_USD` (default 25).
    - Thresholds: warn at 80%; cost-conscious at 92% (shorter spoken replies); blocked at 100% (no new Claude turns or voice sessions; screen commands still work). Settings → Usage shows it.
    - It's an estimate, never a billing guarantee.
  - **Failure handling:** provider failures show "Voice unavailable" and typed Jarvis keeps working. Quota errors pause voice (localStorage) with no retry loop. Deepgram reconnects at most 3 times, with backoff.
  - **Rollback:** the LiveKit agent + `useLiveKitJarvis` are the legacy path, off unless `VITE_JARVIS_VOICE=livekit`. Delete them only after the direct stack has run in production for a while.
  - **Fewer Claude calls:** plain "revenue for <period>", "what's on <day/week>" and "pull up <name>'s jobs" are answered with no Claude call (`functions/_lib/jarvis-fastpath.js`; grammar in `shared/jarvis-workspace.js`). The line is built from the same tool result as the screen; anything else goes to Claude.
  - **Prompt cache:** the system prompt is cached for 1 hour (2× write, 0.1× read).
  - **SEO tools:** only offered when the turn is about SEO or the owner is on the SEO page.
  - **Persona:** JARVIS-style British butler, "sir" in every reply (SYSTEM_PROMPT → PERSONA). Instant screen commands get short spoken acknowledgements (`ackFor` in CommandCenterPage).
  - **Tests:** `tests/voice-stack.test.js`, plus the global commands in `tests/jarvis-workspace.test.js`. The dev-only hook `window.__jarvisVoiceUtterance(text)` injects a final utterance for browser regression runs.
- **Feed panels** (`functions/_lib/jarvis-feeds.js`, `/jarvis/feeds`, `workspace/FeedViews.tsx`) are brief, reviews, social and mail.
  - "Brief me", "show me my reviews", "any new followers" and "check my email" are answered by the fast path (`parsePanelRequest` → `show_panel`) with no Claude call.
  - Outside calls are cached in R2 (`GID_PHOTOS`: `cache/`; tokens and history in `private/`, which the photo routes refuse to serve).
  - They're read-only toward Google, Meta and Zoho, with two exceptions:
    - Messenger replies, double-confirmed.
    - SEO link-outreach emails (`functions/_lib/seo/outreach.js`), each reviewed and confirmed. They go only to the address the site publishes, once per site, 10 a day at most, and they need `ZohoMail.messages.CREATE`.
  - The wake word (`voice/wakeWord.tsx`) is the browser's free speech recognition and only starts Deepgram after "Jarvis".
- The only remaining `/admin` link on `/jarvis` is the explicit "Admin dashboard" item in the account menu. Settings opens the admin Hub re-themed; new customers are created with their first job (New Job), same as `/admin`.

# 0.35 MONEY TAB (2026-09-30)

- **Where it lives:** the sidebar "Money" item. It's a mode next to ops and seo (`seo/uiMode.ts` `AppMode`), shown by `src/command-center/money/MoneyMode.tsx`. "Money", "finances" and "the books" open it with no AI call.
  - It replaced the sidebar "Reports" item. The revenue chart is one button away.
  - The dashboard's RevenueTrend panel moved here.
  - Chat turns (`ui_mode: ops`) don't pull the owner off the Money page.
- **Data:** `/jarvis/money` (`functions/jarvis/money.js`, Access plus verified JWT).
  - Uploads: Bluevine "Transactions" CSV and Zoho Books "Expense Details" CSV, told apart by their header row. They're stored in R2 at `private/money/{bluevine,zoho,decisions}.json`.
  - Re-uploading merges rows by id, so nothing is ever counted twice.
- **Reconciliation** (`shared/money.js`, tested in `tests/money.test.js`):
  - A Zoho expense and its bank charge are one entry (same amount; bank date 3 days before to 7 days after the Zoho date).
  - A Zoho receipt that covers several same-merchant charges (Meta ads billing) is also one entry.
  - A second Zoho copy of the same receipt is not counted, and is flagged.
  - Zoho-only expenses dated before the bank export starts count as paid personally, which makes them owner contributions.
  - Zoho-only expenses after that go to review (personal card or business cash?).
  - Ambiguous stores (Walmart, Amazon, Best Buy…) also go to review. Until decided, review items count as business expenses.
  - Every bank row and every Zoho expense lands exactly once, and there's a test for it.
- **Totals:**
  - Revenue is the canonical collected figure from the jobs, not bank deposits.
  - Net = revenue − sales tax collected − expenses + interest.
  - Owner's equity out (Venmo, SoFi, anything marked "Personal") and TPT payments never count as expenses.
- **Decisions:** the owner's choices (`decide`) are kept separately from the uploads.
- **Owner's equity totals come from the admin Owner's Equity ledger** (`equity_entries`, Hub → Banking & Credit). Bank transfers are only matched against it (same amount, ±5 days), and ones missing from the ledger are shown separately. Never compute equity from bank transfers or Zoho funding.
- **"Why net profit isn't your bank balance" card:** net + sales tax still owed + equity net = what the business should have. The remainder beyond the bank balance is cash/Stripe/Venmo in transit or spending after the last upload.

# 0.39 HELPER PAY (2026-10-06)

- **Where it lives:** `/admin/pay` (Access via /admin/*, same PIN as /admin) and the admin "👷 Team" tab. Component `src/pay/HelperPay.tsx`. The older admin "💵 Pay" tab is the owner's own take-home calculator, a different thing.
- **Data:** `pay_migration.sql` (additive; the owner runs it): `pay_people`, `pay_entries` (earned: hours × rate, or a flat amount for a job/bonus, optional `booking_id`), `pay_payouts` (paid: date-only `paid_on`). Owed = earned − paid. Rules `shared/pay.js`; server `functions/_lib/pay.js` (`pay-*` in /admin-api-data). Tests `tests/pay.test.js`.
- **Money (owner decision):** helper PAYOUTS are a business cost on the day paid. `netProfit(jobs, inWindow, payouts)` and `laborPaid` in `shared/business-metrics.js` — dashboard card/breakdown, Hub chart, Owner Pay, Jarvis revenue/compare/take-home all pass payouts. Date-only `paid_on` is tested as noon UTC (same Arizona day).
- **Money tab:** a bank transfer out (Venmo) with the same amount as a logged payout (±5 days) becomes `helper_pay`, not owner equity; "Paid a helper" marks one by hand; the owner's explicit decision wins. Helper pay totals come from the payouts ledger plus marked bank transfers never logged, each once.
- **1099-NEC:** flagged at $2,000+ paid to one person in a calendar year (2026 rule).
- **Team & owner pay (v2):** `pay_people.role` = owner | contractor | employee (one owner). The owner logs labor hours; weeks are Mon–Sun (`weekStart`/`weeklySummary`). GID is a single-owner LLC (owner decision 2026-10-06), so paying the owner is an OWNER'S DRAW: `pay-payout-add` writes an `equity_entries` draw first, then the payout with `owner_draw: true` + `equity_entry_id` (deleting the payout deletes the draw). `laborPaid` and the Money tab skip `owner_draw` payouts. Employees (W-2) need outside payroll; only contractors get the 1099 flag. Admin tab "👷 Team".

# 0.38 TECH APP (2026-10-01)

- **Where it lives:** `/jarvis/tech` (`src/tech/TechApp.tsx`), the phone app saved to the home screen (manifest `public/manifests/tech.json`). It's under /jarvis, so Access protects it.
- **What it does:**
  - Job picker: Today / Upcoming / Recent / Search.
  - Job screen: call / text (open the Google Voice app, work line only; the number or pay message is copied to paste, since `googlevoice://` can't carry it) / drive / copy VIN, one next-status button (`statusChangeFields`), and tabs Job (technician notes = the Estimate tab's Scope Notes / `estimate_notes`; both autosave 3s after typing via `useAutoSave`, patching only that field), Photos (`PhotoPanel`/`VideoPanel`), Next (`NextVisitCheck`), Parts (`PartsCostPanel`) and Pay.
  - Pay shows the balance from `jobMoney`, sends the `/invoice?action=pay` link, and includes `PaymentPanel`.
- **Same data as admin:** the same bookings and calls (`getAllJobs`, `getJobById`, `patchJob`). Admin's UI is unchanged.
- **Tap to Pay:** impossible from a web page (Apple allows it only in native apps). Take it in the Bluevine app and record it in Pay.

# 0.37 NEXT-VISIT CHECK (2026-10-01)

- **What it is:** a free "what's next" checklist on any job (admin → job → Inspection tab → Next-Visit Check, `src/nextVisit/NextVisitCheck.tsx`). Each item is Good / Soon / Now.
- **Recommendations:** Soon and Now items become recommended services on the customer's invoice (`NextVisitInvoice`). There are no prices; they're quoted later.
- **Storage:** `bookings.inspection_data.nextVisit`. The Inspection tab's own Save keeps it, and checklist saves merge into the server's current record.
- **Customer answer:** on the invoice the customer approves or declines every item and picks a slot. `/api-customer` `next-visit-respond`:
  - creates ONE booking (`nextVisitJobRow`) with their details, vehicle/VIN, the slot, the requested services, `"A", "B" were declined at this time.`, and the inspection link;
  - marks the original job answered (answered once; the checklist then locks);
  - leaves a `jarvis_reminders` row, which reaches Telegram through the proactive worker. No Telegram code changed.
- **Slots:** `shared/booking-slots.js`, also used by the booking widget. The slot is re-checked on the server.
- **Pages:** `/inspection?id=` is the inspection-only page (`InspectionPage`), with the same print rules as the invoice.
- **Media:** photos are compressed (1600px JPEG); videos have an 80MB cap. Both use the customer upload routes.
- **Offline:** with no signal, changes go to localStorage and media to IndexedDB, then upload on reconnect.
- **Labor hours:** `suggest-labor-hours` (functions/_lib/labor-hours.js) decodes the VIN with vPIC and asks Haiku for hours only. It's budget-governed and the owner's private number; the public `get-job` strips `laborHours`.
- **Checklist template:** Hub → Next-Visit Checklist (`business_settings.next_visit_checklist`, `next_visit_migration.sql`, which the owner runs). The default list is in `shared/next-visit.js`.
- **Tests:** `tests/next-visit.test.js`, `tests/labor-hours.test.js`.

# 0.36 FLEET (2026-10-01; plan and owner decisions: FLEET_PLAN.md)

- **Hierarchy:** Fleet → Company (permanent 4-digit Fleet #) → Vehicles → Unit #N → its record.
- **Data:** `fleet_migration.sql`, additive; the owner runs it.
  - `fleet_accounts`: `company_number` UNIQUE 1000–9999, assigned by a database trigger and locked against change.
  - `fleet_vehicles`: `unit_number` stored without "#", UNIQUE per fleet (`fleet_id, lower(unit_number)`).
  - Nullable `bookings.fleet_id` / `fleet_vehicle_id`.
- **A fleet job is a normal booking** (`fleetJobRow`), so the job screens, money and time are unchanged. Invoices go to the company. Service history is worked out from bookings, never stored.
- **Code:**
  - `shared/fleet.js` (rules; tests in `tests/fleet.test.js`).
  - `functions/_lib/fleet.js` (the `fleet-*` actions in `/admin-api-data`).
  - `src/fleet/FleetApp.tsx`: one component with skins `admin` (the Fleet tab, `FleetAdminTab`) and `jarvis` (the workspace view `fleet`).
- **Retail views leave fleet jobs out:**
  - admin Schedule (`getSupabaseBookings`);
  - Jarvis calendar;
  - Jarvis Customers.
- **Views that keep fleet jobs:**
  - the Jobs lists (with a Fleet # / unit badge);
  - public booking availability;
  - revenue, Money and net profit.
- **`list-bookings`** adds the fleet columns and falls back to the old select before the migration.
- **Jarvis voice/typed commands** (`parseFleetCommand`, no AI call): "open fleet", "fleet calendar", "pull up truck 36", "what's been done to 36", "add a job for unit 36", "what vehicles does X have", and "open <fleet name>".
  - Several fleets with the same unit → show the choices; never guess.

# 0.3 COMMAND CENTER UI (redesign, 2026-09-28)

- Design system: `src/command-center/ui/` (`theme.ts` palette, `primitives.tsx`, `charts.tsx` custom SVG, `JarvisOrb.tsx`, `useMapLibre.ts`, `command-center.css` scoped to `.cc-root`). Shell in `shell/`, dashboard sections in `dashboard/`, SEO in `seo/`.
- Dashboard extras come from `get-command-center-summary` (`trend`, `activity`, `todayRoute`, `weather`, `monthStats`, `collectedTotals`), built in `functions/_lib/command-center-extras.js`. Headline money totals must use `collectedRevenue`; `collectedByDay` is only for per-day bars (summing days double-counts invoice fallbacks).
- SEO page reads `/jarvis/seo-data?action=queries|technical` plus `overview.series`. Show only measured values; no fabricated ranking grids.
- Rules: no text under 11px, no horizontal scroll. Fix the layout rather than hiding overflow.

# 0.2 OWNER NOTES ↔ CUSTOMER LINKS

- `jarvis_note_links_migration.sql` adds nullable `customer_id` and `booking_id` to `jarvis_business_notes`. It's additive, and the owner runs it.
- The code works before and after the migration. Before it, notes save exactly as they always have.
- **When a note links:** only on strong evidence (`noteLinkFor` in `functions/_lib/business-data.js`):
  - the same 10-digit phone, or
  - a full name that exactly one customer has.
  First-name-only or ambiguous names never link, and name matching keeps working for them.
- **Effect of a link:** a linked note belongs only to that customer (`noteMatch`), and "waiting on" groups by `customer_id`.
- **Backfill:** `node scripts/link-notes.mjs` is a dry run. Add `--apply` to write, which only sets `customer_id` on notes, and the script hard-refuses to write any other table.

# 0.1 SEO / GROWTH MODE — CURRENT STATE

- **Supabase SEO schema is initialized in production.** `seo_migration.sql` ran successfully. The checked-in file is the exact corrected version that ran: plain SQL, and the `seo_gsc_period` / `seo_gsc_service_daily` RPCs have quoted `"position"`, `g.`-qualified columns, `::bigint` sums and explicit aliases. Do not re-run it or change the existing tables casually. Schema changes need a new, additive migration.
- **These Cloudflare Pages variables already exist.** Don't ask the owner to create them again:
  - `CF_ACCESS_TEAM_DOMAIN`
  - `CF_ACCESS_AUD`
  - `SEO_SYNC_SECRET`
- **Local SEO agent** (see `SEO_SETUP.md`): the action queue, Top-5 gap, blueprint, rankings, research and history/learning tabs in SEO Mode.
  - Code: `shared/seo/agent*.js`, `shared/seo/knowledge.js`, `functions/_lib/seo/agent-ops.js`, `seo/SeoAgent.tsx`.
  - Tables: `seo_agent_migration.sql`, additive; the owner runs it.
  - Recommendations cite `knowledge.js` entries.
  - Never scrape Google or auto-publish site changes.
  - **Where you rank** (`whereYouRank` in `shared/seo/agent.js`): local strength, review count and rating vs in-area competitors, best map-pack check and AI mentions. Shown at the top of the Rankings tab; GID also sits in the Competitors table at its place; Jarvis answers "where do I rank" with `get_seo_rankings`.
- **Public pages** (2026-09-29): one page per offered service plus one `/service-area` page.
  - Content is in `shared/site-pages.js`, rendered by `src/ServicePages.tsx`.
  - Pre-rendered at build time by the Vite plugin → `scripts/prerender.mjs`, which also writes `dist/app-shell.html` and a real `dist/404.html`.
  - `dist/404.html` turns off Cloudflare's SPA fallback, so **every client route must be listed in `public/_redirects`** (rewritten to `/app-shell`), or it will 404. Add new app routes there.
  - Old `/service-area/<town>` URLs 301 to `/service-area`.
  - Tests: `tests/site-pages.test.js`.
- **Monitors** (`functions/_lib/seo/monitors.js`, see `SEO_SETUP.md`):
  - `search_news`: daily; Google status plus the Google and Bing blogs.
  - `indexnow`: weekly.
  - `ai_visibility`: weekly; Claude plus web search, ~$0.05 a week in the AI budget.
  - Places also looks up competitor websites.
  - `competitor_listings` (monthly) records where competitors are listed and whether GID is.
  - `link_outreach` (weekly) finds link sites and drafts emails. It never sends; see §0 feed panels.
  - State is kept in R2 `private/`.
  - The site serves `/llms.txt` and per-service JSON-LD, both from `scripts/prerender.mjs`.
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

**VALIDATED 2026-09-28:** the owner confirmed Jarvis's "this month" revenue matches the live Schedule dashboard. Jarvis and voice returned $4,439.02 revenue and $2,976.80 net profit through the canonical `shared/business-metrics.js`. Re-validate after any finance change.

IMPORTANT:
If a later finance change hasn't been validated against live dashboard values, treat it as **pending validation**, not proven correct.

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

## Owner's equity (owner's decision, 2026-09-30)

- **The owner doesn't pay himself a salary or draw.** He paid for GID with his own money, and still does (gas on his personal card, early tools and parts).
- **Transfers from the business account to the owner's personal accounts are repayment of owner's equity** (for example Venmo payments and transfers to his SoFi account). They are:
  - not a business expense;
  - not owner pay or take-home;
  - not a reduction of revenue or net profit.
- **Money the owner deposits into the business is an owner contribution, not revenue.** An example is "miko echiverri – Deposit Account" on the Bluevine export.
- **Any bank or cash-flow feature** (for example a Bluevine CSV import) must classify these as equity movements and never count them as spending.
- **Mileage is tracked in /admin.** Fuel goes on the personal card, so it's missing from the business bank account by design.

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
