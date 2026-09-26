# CODEBASE.md — orientation for AI assistants working on this repo

Read this before making changes. It exists specifically so a new AI session
(or a different AI entirely) doesn't have to re-derive context that already
cost real debugging time to learn. If you're an AI reading this because
something broke, jump to "Known gotchas" first.

## What this project is

GID Garage — a real, live mobile mechanic business in Flagstaff, AZ
(gidgarage.com). This is production code serving real customers and real
money, not a demo. React/TypeScript/Vite frontend, Cloudflare Pages
Functions backend, Supabase/Postgres database.

The owner (Michael) runs this solo. Build recommendations should assume one
person maintaining this evenings/weekends alongside actually running the
business — not a team with dedicated QA.

## The two systems under the "Jarvis" name

1. **Website AI ("Ask GID" / the Command Center at gidgarage.com/jarvis)** —
   active, in production, actively developed. This is what "Jarvis" now
   refers to going forward.
2. **A local desktop voice assistant** (treevu-ai/jarvis base, Ollama,
   Windows) — was built earlier in this project's history, is **no longer
   being used or developed**. If you see references to `gemma4:e2b`,
   Whisper, Piper TTS, or a Python `tools/builtin/gid_garage.py` file, that's
   this old, inactive system. Don't build on it unless explicitly asked to
   revive it.

## Architecture map

```
functions/                    Cloudflare Pages Functions (backend)
  admin-api-data.js           Main CRUD API — bookings, customers, leads,
                               calls, marketing_spend, business_settings.
                               Action-router pattern: POST {action, ...args}
                               switch(action) { case 'foo': ... }
                               Requires Cf-Access-Jwt-Assertion header.
  admin-ai-chat.js            The real Claude-powered agent ("Ask GID").
                               Streams NDJSON (tool_call/tool_result/data/
                               final/error events). Tool-calling into the
                               same Supabase tables via direct REST calls
                               (not routed through admin-api-data.js).
  api-customer.js             Public-facing (no Access gate) — booking
                               flow, quick-quote form. Also auto-creates
                               `leads` rows on submission.
  lead-capture.js             Public webhook for external lead sources
                               (Facebook/Google via Zapier). Shared-secret
                               auth via ?key= query param.

src/
  App.tsx                     Top-level router — checks window.location.
                               pathname against a flat list of routes
                               (isAdmin, isJarvis, isEstimate, etc.), each
                               lazy-loaded. Add new routes here.
  JarvisPage.tsx               /jarvis route. Own password gate (shares
                               sessionStorage key with /admin), renders
                               CommandCenterPage full-screen.
  BookingWidget.tsx            /admin route (AdminSchedule component) —
                               Jobs/Schedule/Customers/Mileage/Hub/Pay tabs.
                               Also exports AdminPasswordGate, reused by
                               JarvisPage.tsx.
  JobOps.tsx                   Customer-facing document pages (estimate/
                               invoice/PPI) + JobsTab/CustomersTab/etc used
                               inside BookingWidget. Also home to the
                               client-side reportError() Sentry helper.
  command-center/              The Command Center — see below.
```

## command-center/ structure (Phase 1 of a larger planned rebuild)

```
command-center/
  CommandCenterPage.tsx       Top-level composition — the actual page.
  types.ts                    Shared types (ChatMsg, DataCard, JarvisState,
                               CommandCenterSummary, Lead, etc.)
  tokens.ts                   Design tokens — colors, panel styles, TOOL_LABELS
  api.ts                      adminPost() helper for admin-api-data.js
  hooks/
    useBusinessSummary.ts     Summary + leads data loading
    useAdminAI.ts             The NDJSON stream reader + JarvisState machine
  components/                 Dashboard panels (BusinessMetrics, Attention-
                               Panel, LeadPipeline, UpcomingJobs, Marketing-
                               Panel, CommandInput, ActivityFeed, JarvisStatus,
                               Workspace)
    cards/                    Per-tool-type result cards (CustomerCard,
                               JobCard, LeadCard, etc.)
  utils/
    formatters.ts             money(), fmtDate(), etc.
    resultRenderer.tsx        RESULT_COMPONENTS registry — maps a tool name
                               to its card component. MUST stay in sync with
                               PRESENTABLE_TOOLS in admin-ai-chat.js (see
                               below) or a tool's result silently gets no
                               card, just plain text.
```

**Build phases** (from the original design spec): Phase 1 (this structure +
tokens + grid, done), Phase 2 (activity system polish, partially done),
Phase 3 (React Three Fiber Jarvis Core orb, **not started**), Phase 4
(dynamic result cards, done early since it was cheap), Phase 5 (Motion
animations/microinteractions/skeletons, **not started**), Phase 6
(voice-ready event abstraction, **not started**). No new npm dependencies
(motion, three, @react-three/fiber, recharts) have been added yet — Phase 1
was deliberately built with zero new dependencies so it stayed low-risk.

## The tool/card pairing rule

`admin-ai-chat.js` has a `PRESENTABLE_TOOLS` Set — tools in it stream a
`data` event with their raw result, which the frontend renders as a card.
`resultRenderer.tsx`'s `RESULT_COMPONENTS` maps each of those tool names to
the component that renders it. **These two lists must be kept in sync.**
Adding a new tool to `PRESENTABLE_TOOLS` without adding a matching entry to
`RESULT_COMPONENTS` doesn't break anything (it falls back to `GenericCard`,
a plain key-value grid) but won't look as good as a dedicated card would.

## The confirmation-gate pattern (safety-critical, don't remove)

Two tools — `mark_job_paid` and `send_customer_email` — require explicit
confirmation before they write/send. The pattern: call without
`confirmed: true` → the tool returns `{ needs_confirmation: true, summary }`
without writing anything. The system prompt instructs Claude to relay that
summary in plain language and wait for the user's next message. Only a
clear yes triggers a second call with `confirmed: true`, which actually
executes.

This exists because `update_job_status` used to silently allow setting
`job_status='PAID'` without ever touching `amount_paid`/`paid_at` — a job
would look paid in the UI but be invisible to both revenue tracking and the
unpaid-invoice detector. Any new tool that touches money or sends something
externally and irreversibly should follow this same two-call pattern.

**Never add a delete/destructive-write tool.** This boundary has been
explicit and repeated throughout this project — read-only and small
corrective writes only.

## Known gotchas (things that already cost real debugging time)

- **Git diff is misleading in this repo.** Most files show as "changed"
  with huge line counts even when untouched, due to CRLF vs LF line-ending
  noise from how files get edited across different tools. Don't trust
  `git diff --stat` to tell you what actually changed — track your own edit
  list explicitly instead.
- **Two files can have very similar names in different folders** —
  `tools/__init__.py` (empty) vs `tools/builtin/__init__.py` (has real
  content) in the old local Jarvis project caused a real deploy break when
  a file got placed one directory too high. When giving file placement
  instructions, always give the full path, and if a person reports a
  `ModuleNotFoundError` or similar, check for exactly this kind of
  misplaced-file mixup before looking anywhere else.
- **Cloudflare Access path coverage isn't automatic for new routes.**
  `admin-api-data.js` and `admin-ai-chat.js` both require a
  `Cf-Access-Jwt-Assertion` header, which Cloudflare Access only attaches
  when its Application's path rule actually covers the requesting page. If
  a new frontend route is added (like `/jarvis` was), the Access
  Application protecting `/admin` needs its path pattern checked/widened —
  this can't be verified from the codebase, only from the Cloudflare Zero
  Trust dashboard.
- **`sessionStorage['gg_admin_auth']`** is the shared login flag between
  `/admin` and `/jarvis` (same origin, so it's naturally shared) — don't
  invent a second auth mechanism for a new admin-facing route, reuse this.
- **The revenue calc needs `tax_amount` included explicitly** —
  `invoice_amount`/`estimate_amount` alone excludes tax, which is a
  separate column. Once a job is `paid_at`-stamped, prefer `amount_paid`
  over the estimate/invoice figures — it's the real collected number.
- **Name search needs first/last splitting.** A naive
  `ilike.*{full name}*` against a single `fname` or `lname` column will
  never match a two-word name. Split on whitespace and match
  `fname` against the first token, `lname` against the rest.

## Verifying a change before calling it done

```bash
npm run typecheck   # tsc --noEmit — must show zero errors
npm run build        # vite build — must complete with no errors (warnings
                      # about chunk size are pre-existing and fine)
```

Both must pass clean before considering any change finished. `npm run lint`
also exists but the repo already carries ~200 pre-existing
`no-explicit-any` warnings across older files — new `any` usage in tool-call
payload types matches that existing pattern and isn't a regression to fix.

## Error reporting

Client-side errors report directly to Sentry via the raw envelope API (no
SDK dependency) — see `reportError()` in `JobOps.tsx` and its usage in
`ErrorBoundary.tsx`. The error boundary's fallback screen also has a "Copy
Debug Info" button that puts a structured report (error, stack, URL,
timestamp) on the clipboard — ask the person to use that and paste the
result directly into a chat when debugging a crash.
