# Jarvis feeds: brief, reviews, Facebook/Instagram, email, wake word

All free, and there's nothing to set in Cloudflare. Tokens are stored in the R2 bucket under `private/`, which only the Access-protected `/jarvis/feeds` can read.

- **Wake word "Jarvis".** On /jarvis, turn on "Wake word" under the voice button. Use Chrome or Edge.
  - The browser listens only for "Jarvis"; paid voice starts after it hears it, then sleeps after 45 s of quiet.
  - Chrome's mic indicator stays on while it listens.
- **Google reviews** use the existing `GOOGLE_PLACES_API_KEY` / `GOOGLE_PLACE_ID` and need nothing new.
  - They appear at the top of SEO. Ask "Jarvis, show me my reviews" to open them.
  - The brief counts new reviews from the last 7 days.
- **Facebook + Instagram (+ Meta ads)**, one time: say "Jarvis, show me my Facebook". The panel has the steps.
  - Graph API Explorer token with pages_show_list, pages_read_engagement, instagram_basic, instagram_manage_insights and ads_read.
  - Also paste the app ID and secret, so the page token doesn't expire.
  - The ads part uses a 60-day user token. Re-paste it when the panel says it has expired.
- **Zoho Mail**, one time: say "Jarvis, check my email". The panel has the steps.
  - api-console.zoho.com → Self Client.
  - Scope `ZohoMail.accounts.READ,ZohoMail.messages.READ`.
  - Paste the ID, secret and code within 10 minutes.
  - O'Reilly emails are flagged as parts orders. The access is read-only.
- **Brief:** "Jarvis, brief me" or "good morning". It shows today's jobs, weather, what needs you, reviews, overnight likes and followers, email, and ads. Telegram briefings are unchanged.

# Jarvis voice (direct Deepgram + Claude + Cartesia) — setup

Voice no longer uses LiveKit Inference. The page talks to Deepgram (hearing)
and Cartesia (Benedict's voice) directly with short-lived tokens; Claude answers
through the same Jarvis backend as typing. Nothing runs on your computer.

1. **Keys.** Get three API keys:
   - Anthropic: console.anthropic.com. The key you already have is fine.
   - Deepgram: console.deepgram.com. New accounts get free credit.
   - Cartesia: play.cartesia.ai → API keys.
2. **Cloudflare Pages.** Go to the project → Settings → Environment variables (Production) and add:
   - `DEEPGRAM_API_KEY`
   - `CARTESIA_API_KEY`
   - `ANTHROPIC_API_KEY` (already set)
   - Optional: `JARVIS_MONTHLY_AI_BUDGET_USD=25` (25 is the default).
   - Optional: `CARTESIA_VOICE_ID` (see "Benedict" below).
3. **Supabase.** Go to SQL Editor, then paste and run `jarvis_ai_usage_migration.sql`. It's one small table for the budget counter. Without it, Jarvis still works, but usage isn't tracked.
4. **Deploy.** Push, or press "Retry deployment" in Cloudflare.

**Benedict.** He's picked automatically: Jarvis looks up the Cartesia voice named
"Benedict — Measured Mediator" once and caches it. To pin it, open
`gidgarage.com/jarvis/voice?action=voice` while logged in and copy the `id` into
`CARTESIA_VOICE_ID`.

**Spending safety net.** The in-app budget is an estimate; also set limits at the providers:
- Anthropic: Settings → Limits → set a monthly spend limit (e.g. $10), and leave auto-reload off.
- Deepgram: Billing → keep auto-recharge off, so the prepaid/free balance is the cap.
- Cartesia: Billing → stay on the free or Pro plan. If an overage or usage-based billing option is offered, turn it off.

**Test voice.** Open `/jarvis` → Start voice, then say each of these:
1. "Pull all three of Jill's jobs side by side"
2. "Open the middle one"
3. "Show the payment"
4. "Show revenue this month"
5. "Show the last 13 days"
6. "Switch to SEO"
7. "Back to Jarvis"
8. "Show bookings this week"
9. "Cancel Nate Lima's job". It should ask you to confirm. Say no.

Then talk while Benedict is speaking; he should stop immediately.
Settings → Usage shows this month's estimated spend and the last voice timings.

**Rollback to LiveKit.** Set `VITE_JARVIS_VOICE=livekit` in Cloudflare and redeploy. That uses the old LiveKit agent, which is still deployed and needs LiveKit credits.

---

# GID Command Center — What was built, what you need to do

## Files changed (this is the real list — ignore your diff tool if it shows
## every file as changed; the zip you got back has different line endings
## on files I never touched, which makes diffs noisy. These are the only
## files actually touched.)

**New files:**
- `gid_command_center_migration.sql` — run this first (see Step 1)
- `functions/lead-capture.js` — public webhook for Facebook/Google leads
- `src/CommandCenter.tsx` — the new dashboard

**Modified files:**
- `functions/admin-api-data.js` — added 9 new actions (leads, calls, marketing spend, summary, ask-gid)
- `functions/api-customer.js` — quote-form and booking submissions now also create a `leads` row automatically
- `src/BookingWidget.tsx` — new "🎯 Command" tab, now the default landing tab in `/admin`
- `src/JobOps.tsx` — one unrelated pre-existing TypeScript error fixed (line 4586, `accentFor` call), found while running `npm run typecheck`

Both `npm run typecheck` and `npm run build` pass clean with these changes.

---

## Step 1 — Run the SQL migration (required, do this first)

Open Supabase Dashboard → SQL Editor → New query, paste the contents of
`gid_command_center_migration.sql`, and run it. It creates three tables
(`leads`, `calls`, `marketing_spend`) with indexes and RLS enabled (same
security posture as your existing tables — service key only, no anon
access). Safe to re-run if you're unsure whether it already ran.

Without this, the Command Center tab will show a "Failed to load" error —
that error message tells you to do exactly this.

## Step 2 — Deploy

Commit and push as usual (or however you deploy to Cloudflare Pages). No
new npm packages were added — `package.json` is untouched.

## Step 3 — (Optional) Enable the external lead webhook

Only needed if you want Facebook Lead Ads / Google Forms / any other
external source to feed leads in automatically.

1. In Cloudflare Pages → your project → Settings → Environment variables,
   add `LEAD_WEBHOOK_SECRET` with any random string value (e.g. generate
   one at randomkeygen.com).
2. Your webhook URL is:
   `https://gidgarage.com/lead-capture?key=YOUR_SECRET_HERE`
3. In Zapier (or similar): trigger on new Facebook Lead Ad / Google Form
   response, action = Webhooks by Zapier → POST to that URL with JSON body:
   ```json
   { "name": "{{full_name}}", "phone": "{{phone}}", "email": "{{email}}", "source": "facebook_organic" }
   ```
   Set `source` explicitly per webhook you configure (`facebook_organic`,
   `google_ads`, etc.) — that's what makes the Marketing tab's attribution
   correct. If you skip this step entirely, the site still works exactly
   as before; you just won't get external leads auto-logged.

## Step 4 — Test

1. Open `/admin`, confirm the new "🎯 Command" tab loads (it's now the
   default tab) and shows Today / Needs Attention / Leads / Marketing /
   the 7-day bar, all at zero since there's no data yet.
2. Submit a real Quick Quote on the live site (or a test booking) — refresh
   the Command tab, confirm a new lead shows up with source
   `website_form` (quote) or `website_booking` (a real booking).
3. In the Marketing panel, add a manual spend entry (any channel, any
   amount) and confirm it appears in the table.
4. Try Ask GID with: "what's our tax rate", "who needs follow-up", "how
   are my ads doing", "show leads from Facebook", "what's unpaid",
   "what's scheduled today".
5. Change a lead's status in the Leads table dropdown, confirm it saves
   (refresh the page, check it stuck).

---

## What's intentionally NOT built yet, and why

**Ask GID is read-only.** It answers questions but never executes a
change (no "move John's brakes to Thursday" actually moving anything).
This was a deliberate safety call: a small keyword-matcher confidently
executing the wrong write against your live schedule is a much worse
failure than it just answering a question wrong. If you want write actions
later, the cleanest path is wiring Ask GID to a real LLM (Anthropic/OpenAI)
with a small, explicit set of tool calls it's allowed to make (reschedule,
send text, close lead) — each one still requiring you to confirm before
it executes. That's a follow-up project, not a quick add.

**No automatic Google Ads / Meta Ads data pull.** Marketing spend is
manually entered in the dashboard for now. A live pull requires registering
an app with Google Ads API and/or Meta Marketing API, OAuth-connecting your
ad accounts, and a scheduled Cloudflare cron function to sync spend/clicks
daily — real setup work on accounts I don't have access to. The
`marketing_spend` table is already shaped to accept that data the moment
you're ready to build the sync (same columns: date, channel, campaign,
amount, clicks).

**No automatic missed-call texting, review-request automation beyond what
already exists, or SMS at all.** That needs a texting provider (Twilio or
similar) wired up — you don't have one connected yet. The `calls` table
is ready to log outcomes manually or from a future Twilio webhook; the
"missed call → draft a text" flow from your spec is a good phase-2 item
once you have a texting provider.

**Lead source attribution is only as good as what tags each lead.**
Website form/booking submissions are auto-tagged correctly. Phone calls
you take directly aren't automatically linked to a source unless you log
them — use the `log-call` action (or I can add a quick "Log Call" button
to the dashboard next) and pick the right source/outcome.

---

## Where things live, if you want to extend this yourself

- All new backend logic is in `functions/admin-api-data.js`, added as new
  `case` blocks right before the `default:` — same pattern as every
  existing action in that file (look at `list-bookings` as the reference
  shape).
- The dashboard component is a single new file, `src/CommandCenter.tsx` —
  no changes needed elsewhere in the UI layer besides the one import + tab
  wire-up in `BookingWidget.tsx`.
- Ask GID's keyword matching lives in the `ask-gid` case in
  `admin-api-data.js` — it's a plain if/else chain on the lowercased query
  string. Adding a new question type is adding one more `if (q.includes(...))`
  block.
