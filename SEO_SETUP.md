# SEO / Growth Mode — Setup

GID Garage is a **mobile, service-area business** covering roughly **30 miles around Flagstaff, AZ**. SEO Mode is built local-first:

> qualified local discovery → local leads → booked jobs → profitable local revenue

Raw national or global traffic is shown last and is never treated as success on its own.

Everything below is optional and incremental. With no credentials at all, SEO Mode still works from first-party data: customer geography from your bookings, local leads and bookings, and the service-area guard. Every unconnected source shows its honest status on **SEO Mode → Connections**.

---

## 0. One-time: auth, database + cron

### Auth (done: env vars set)
| Route | Called by | Protection |
|---|---|---|
| `/jarvis/seo-data` | SEO Mode in `/jarvis`: reads, recommendation actions, **Sync now** | Inherits the existing Cloudflare Access application that already covers `/jarvis/*`, **plus** server-side verification of the Access JWT (signature, issuer, audience, expiry, in `functions/_lib/access-auth.js`). A spoofed header gets 403. |
| `/seo-sync` | Supabase `pg_cron` only | Exact `X-GID-SEO-Secret` = `SEO_SYNC_SECRET`, compared in constant time. Missing gets 401, wrong gets 403. There's no other way in. It must **not** be behind Access, because cron can't log in. |

**No new Access rule is needed.** The endpoint lives under `/jarvis/*`, which the existing Access application already protects. Zero Trust destination slots are exhausted, so any future protected route must also go under `/jarvis/*` or `/admin/*` (see CLAUDE.md).

`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` and `SEO_SYNC_SECRET` are already set in Cloudflare Pages. If either Access variable were missing, `/jarvis/seo-data` would fail closed (500).

**Sync now** calls `/jarvis/seo-data` (`action: sync_now`). It runs the sync server-side for the verified admin, and the cron secret never reaches the browser.
- **Bounded calls.** Cloudflare fails a request after 50 subrequests, and Supabase calls count too. So each call makes at most 20 external fetches and 45 subrequests in total.
- **A sync is a run of several calls.** PageSpeed pages, site-audit pages and the competitor crawl (capped at 15) resume from a cursor, and analysis gets its own call. The button keeps calling until the run finishes.
- **What gets re-pulled.** Manual sync re-pulls any provider last pulled more than an hour ago.
- **The result line lists** what was pulled, what was skipped and why, and what failed.

### Database + cron

1. **Migration — done.** `seo_migration.sql` has been run successfully in Supabase (the checked-in file is the exact corrected version). Don't re-run it casually; it's idempotent, but there's no need.
   - It's additive only: it creates new `seo_*` tables and two read-only aggregation functions, and it doesn't touch any existing table.
   - RLS is on and there are no public policies, so only the server-side service key can read or write these tables.
2. **Sync secret — done.** `SEO_SYNC_SECRET` is already set in Cloudflare Pages. It's used only by the cron job; paste the same value into the cron SQL below (never commit it).
3. **Schedule the sync.** Use Supabase `pg_cron` (the same mechanism as the proactive worker), replacing `<SEO_SYNC_SECRET>` in the SQL editor. Don't commit the value anywhere.
   - It runs every 15 minutes because each call is one bounded slice.
   - A call continues an unfinished run, or starts a new run about once a day. Otherwise it's a one-read no-op.
   - Weekly providers keep their weekly cadence.
   ```sql
   select cron.schedule('gid-seo-sync', '*/15 * * * *',
     $$ select net.http_post(
          url := 'https://gidgarage.com/seo-sync',
          headers := jsonb_build_object('Content-Type','application/json','X-GID-SEO-Secret','<SEO_SYNC_SECRET>'),
          body := '{"mode":"incremental"}'::jsonb) $$);
   ```
4. **Load history (backfill).** Each backfill call pulls the next 30 days of history per provider and remembers where it stopped. Either click **Connections → Backfill** repeatedly, or schedule it for a few days:
   ```sql
   select cron.schedule('gid-seo-backfill', '*/20 * * * *',
     $$ select net.http_post(url := 'https://gidgarage.com/seo-sync',
          headers := jsonb_build_object('Content-Type','application/json','X-GID-SEO-Secret','<SEO_SYNC_SECRET>'),
          body := '{"mode":"backfill"}'::jsonb) $$);
   -- when Connections shows history back ~16 months for Search Console:
   select cron.unschedule('gid-seo-backfill');
   ```
5. **Weekly Telegram SEO briefing.** Once search data exists it sends automatically on Mondays at 9:00 Arizona time, or set `JARVIS_SEO_BRIEF_HOUR`. It stays silent when there is nothing real to say.

## Provider statuses

| Status | Meaning |
|---|---|
| `connected` | Credentials present; syncing. |
| `ready_limited` | Works without a key at a low quota (PageSpeed). |
| `not_configured` | Required environment variables are missing; the Connections screen lists them. |
| `needs_authorization` | Credentials exist but can't access the property: grant access, or complete the OAuth consent step. |
| `pending_approval` | Google or Meta must approve API access before data flows. |
| `manual_only` | No usable API; managed by hand (Apple Business Connect). |
| `error` | The last sync failed; the error is shown. |

## Environment variables

| Variable | Needed for |
|---|---|
| `SEO_SYNC_SECRET` | cron → `/seo-sync` (**already set**) |
| `VITE_MAP_STYLE_URL` | *optional* build variable: a MapLibre style URL for the Service Area map. Leave it unset to use OpenFreeMap's free "dark" OpenStreetMap style, which needs no key. |
| `CF_ACCESS_TEAM_DOMAIN` | `/jarvis/seo-data` Access JWT verification (**already set**), e.g. `yourteam.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | `/jarvis/seo-data` Access JWT verification (**already set**): the Access application's AUD tag |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Search Console + GA4 (the full key-file JSON) |
| `GSC_SITE_URL` | Search Console property: `sc-domain:gidgarage.com` or `https://gidgarage.com/` |
| `GA4_PROPERTY_ID` | GA4 (numeric property id) |
| `GBP_OAUTH_CLIENT_ID`, `GBP_OAUTH_CLIENT_SECRET`, `GBP_OAUTH_REFRESH_TOKEN` | Business Profile (OAuth as the profile owner) |
| `GBP_LOCATION_NAME` | `locations/<id>` |
| `GBP_API_APPROVED` | set to `true` only after Google approves Business Profile API access |
| `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID` | **already set** (homepage reviews); reused for own-review tracking + competitor discovery |
| `PAGESPEED_API_KEY` | optional (raises quota) |
| `BING_WEBMASTER_API_KEY`, `BING_SITE_URL` | optional |
| `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `META_GRAPH_VERSION` | optional; `META_GRAPH_VERSION` may already exist for lead capture |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_OAUTH_CLIENT_ID`, `GOOGLE_ADS_OAUTH_CLIENT_SECRET`, `GOOGLE_ADS_OAUTH_REFRESH_TOKEN`, `GOOGLE_ADS_API_VERSION`, (`GOOGLE_ADS_LOGIN_CUSTOMER_ID`) | optional |
| `META_ADS_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` | optional |
| `NOAA_CDO_TOKEN`, (`NOAA_STATION_ID`) | optional weather history for seasonality |
| `SEO_CONTACT_EMAIL` | optional contact in the weather.gov User-Agent |
| `JARVIS_SEO_BRIEF_HOUR` | optional (default 9) |

Put each secret in **Cloudflare Pages → Environment variables** (Production), never in the repo. Voice needs nothing new. Its one backend secret, `GID_INTERNAL_JARVIS_SECRET`, is a **LiveKit agent secret**, not a Cloudflare variable: it lives in `jarvis-agent/secrets.env` and is set with `lk agent update-secrets`. It must equal Cloudflare's `TELEGRAM_WEBHOOK_SECRET`.

---

## search-console — Google Search Console
1. Google Cloud Console → create a project (or reuse one) → enable the **Google Search Console API**.
2. Create a **service account** → Keys → add a JSON key. The whole file goes into `GOOGLE_SERVICE_ACCOUNT_JSON`.
3. In Search Console → Settings → Users and permissions, add the service account's email as a **Restricted** user.
4. Set `GSC_SITE_URL` to the property: `sc-domain:gidgarage.com` for a Domain property (a bare `gidgarage.com` is treated the same way), or `https://gidgarage.com/` for a URL-prefix property. A 403 error names the property it tried, and the service account must be a user on exactly that property.

**What locality means here:** Search Console never reports where a searcher is. Rows are labeled **likely local** only when the query itself names a Flagstaff-area place or says "near me". Rows with no signal are **unknown**, and rows naming a place outside the area, or from a non-US country, are **nonlocal**. Search Console rows are never labeled "confirmed local". Google also hides rare queries, and the overview shows that hidden share.

## business-profile — Google Business Profile Performance
1. **Request API access.** Google gates the Business Profile APIs behind an access request (Google Business Profile API "application for basic access"). Until it's approved the status stays `pending_approval`. After approval, set `GBP_API_APPROVED=true`.
2. **Enable the API.** In the same Cloud project, enable the **Business Profile Performance API**.
3. **Create an OAuth client.** Create an OAuth client (Web). Authorize once as the Google account that owns the profile, with scope `https://www.googleapis.com/auth/business.manage`, and store the refresh token as `GBP_OAUTH_REFRESH_TOKEN`.
4. **Set the location.** Set `GBP_LOCATION_NAME` to `locations/<numeric id>`. You can find the id with the Business Information API or in the profile's URL.

What you get:
- Daily: Maps/Search impressions, call clicks, website clicks, direction requests, messages and bookings.
- Monthly: the search keywords people used. Low counts are reported by Google only as a threshold (e.g. "<15") and are stored that way.

## ga4 — Google Analytics 4
Enable the **Google Analytics Data API**, then add the same service-account email as a **Viewer** on the GA4 property, and set `GA4_PROPERTY_ID`.

GA4's city is IP-derived, so in-area cities are labeled **likely local** at best. Phoenix is treated as **unknown**, because mobile carriers often route Flagstaff phones through Phoenix. Sessions from ChatGPT, Perplexity, Gemini, Copilot and Claude are counted as AI-assistant referrals, which is the measurable part of "AI visibility". GID doesn't scrape or guess AI answers.

## pagespeed — PageSpeed Insights
This works with no key at a low quota. Add `PAGESPEED_API_KEY` (Cloud project → enable the PageSpeed Insights API → create a key) for reliability. The pages it checks come from `seo_settings.key_pages`.

## site-audit — own-site technical audit
This one needs no setup. Weekly, it reads the public HTML of your key pages and checks:
- the title (and whether it mentions Flagstaff)
- the meta description, viewport, canonical URL and noindex
- AutoRepair/LocalBusiness schema with `areaServed`
- storefront language and NAU-affiliation claims

It also lists which places your pages advertise as served. The site currently lists **Winslow**, about 55 miles away, so it will be flagged for an explicit expand-or-remove decision. Content rendered only by JavaScript isn't executed.

## places — reviews + competitor discovery
This uses the existing `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID`. Weekly, it records your rating and review count (for review velocity) and searches "mobile mechanic" and "auto repair" around Flagstaff. Each result is classified as:
- **primary:** mobile mechanic
- **secondary:** local shop
- **tertiary:** dealer or chain

Anything outside the radius gets weight 0. Mobile mechanics that hide their address may not appear, so add them in SEO Mode or through `POST /jarvis/seo-data {action:"add_competitor"}`.

## competitors — website monitoring
This needs no setup. Weekly, it fetches each active competitor's website (public HTML only) and records changes to titles, headlines and the services they promote.

## bing — Bing Webmaster Tools (optional)
In Bing Webmaster Tools → Settings → API access, generate a key, and set `BING_WEBMASTER_API_KEY` and `BING_SITE_URL`.

## apple — Apple Business Connect (research / manual)
- **Status: `manual_only`.** Apple exposes place-card insights in the Business Connect web dashboard. The programmatic Business Connect API is offered to partners and large organizations, not to a single small business, so there is nothing to sync.
- **Before creating a listing:** confirm that Apple currently accepts service-area businesses without a public street address. Never list a fake or private address. The goal is only that people in the Flagstaff service area can find and call GID in Apple Maps.
- **Verify as of your setup date:** Apple's rules for service-area businesses have changed over time.

## instagram — Instagram insights (optional)
You need an Instagram **business or creator** account linked to a Facebook Page, plus a Meta app with `instagram_basic` and `instagram_manage_insights`. Set:
- `INSTAGRAM_ACCESS_TOKEN` (a long-lived token)
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`
- `META_GRAPH_VERSION` (set explicitly; metric names change between versions)

Audience-by-city requires enough followers. SEO Mode shows the **local follower share** (followers in cities inside the area), not raw follower count.

## google-ads — Google Ads (optional)
A developer token needs Google approval (Basic access) before it can read a live account; until then the status is `pending_approval`. You also need OAuth as a user with access to the account, the customer id (no dashes), and `GOOGLE_ADS_API_VERSION` (e.g. the current `vNN`).

Spend is reported by the **physical city of users**. Rows outside the 30-mile radius are flagged as wasted spend, and Jarvis suggests "presence"-only radius targeting.

## meta-ads — Meta Ads (optional)
Set `META_ADS_ACCESS_TOKEN` (with `ads_read`), `META_AD_ACCOUNT_ID` (without `act_`) and `META_GRAPH_VERSION`. Meta only reports location by region or DMA. Non-Arizona regions are flagged as outside the area, but Arizona can't be narrowed to the 30-mile radius, so it stays **unknown**. This is stated in the UI.

## weather — seasonality
- **Forecast:** `api.weather.gov`, free, no key, used to anticipate cold snaps.
- **History:** optional NOAA Climate Data Online token (`NOAA_CDO_TOKEN`, free). It defaults to Flagstaff Pulliam Airport, `GHCND:USW00003103`; verify the station id and override it with `NOAA_STATION_ID` if needed.

## Services GID offers (what SEO may optimize)
Only services GID **explicitly** offers can produce SEO recommendations. One gate, in `shared/seo/services.js`, applies to every detector.
- **Offered** (from the booking widget and the site's schema): mobile mechanic (general), brakes, oil change, diagnostics, suspension, car audio, full service / multi-point inspection.
- **Referred out** (never recommended): A/C, alignment, transmission overhauls, welding.
- **Unconfirmed** (shown as "confirm first", never recommended): battery / no-start, pre-purchase inspection, other component repairs, tires, body, towing.

To confirm or deny a service:
`POST /jarvis/seo-data {"action":"update_settings","services":[{"id":"battery","offered":true}]}`
`offered` may be `true`, `false` or `"unknown"`.

## NAU / college-town seasonality
Until you add real dates, the engine uses **approximate** NAU calendar patterns, labeled approximate everywhere: fall move-in (mid-Aug), Thanksgiving, winter break, spring start, spring break, and move-out/graduation (early May). Add the official dates with `POST /jarvis/seo-data {action:"add_calendar_event", kind, label, start_date, end_date}`.

A pattern is only reported when local searches or leads during that window clearly differ from the surrounding weeks, with enough volume. Nothing ever implies an NAU affiliation: suggested copy is filtered by a guard that blocks "official/preferred/partnered NAU" and on-campus claims.

---

## How it fits together
- **Code layout:**
  - `shared/seo/*`: pure, tested logic — service area, intent, scoring, detectors, lifecycle, KPIs.
  - `functions/_lib/seo/*`: providers, Google auth, sync, and ops, the one read/analysis layer.
- **Endpoints:**
  - `/jarvis/seo-data`: the admin API, under the existing `/jarvis/*` Access application, plus server-side verification of the Access JWT. It also runs **Sync now**.
  - `/seo-sync`: cron only, exact `SEO_SYNC_SECRET`.
- **Jarvis:** SEO questions route to SEO tools only. Answers move the Command Center into green SEO Mode and focus the matching panel through `ui_focus` events. Voice gets read-only SEO tools through `/jarvis-business`.
- **The 30-mile guard:** `isInsideServiceArea()` in `shared/seo/service-area.js` decides every geographic question. Anything outside the radius is an **expansion decision**, never a recommendation.
- **Tests:** `npm test`, covering `tests/seo-*.test.js` plus the Jarvis end-to-end SEO cases.

## Not deployed
Nothing here has been deployed, pushed or committed. To go live:
1. Review the diff and commit.
2. ~~Run `seo_migration.sql`~~ — done (Supabase, corrected version checked in).
3. Deploy Pages by pushing.
4. Add the cron job.
5. Add provider credentials one at a time, checking Connections after each.


---

## Local SEO agent (action queue, Top-5 gap, learning)

Answers **"what should I do next to rank higher?"**, from GID's own data plus cited Google guidance.

It's layered on the sync above; nothing here edits the website.

- **Where.** `/jarvis` → SEO Mode shows the status strip and the HIGH-priority actions at the top.
  - Tabs: **Actions · Top-5 gap · Blueprint · Rankings · Research · History & learning**.
  - Deep link: `/jarvis#seo/actions`, `#seo/top5`, and so on.
  - Jarvis: "what should I do for SEO?" (`get_seo_actions`) and "why aren't we top 5?" (`get_seo_top5_gap`).
- **Code.**
  - `shared/seo/agent.js`: playbook, GID Opportunity Score, priorities, learning, horizons, Top-5 gap, blueprint, change detection, job candidates, rank CSV.
  - `shared/seo/agent-detectors.js`: site structure, service-page gaps, review gap, case studies, guidance changes.
  - `shared/seo/knowledge.js`: cited guidance.
  - `functions/_lib/seo/agent-ops.js`: data and views.
  - `src/command-center/seo/SeoAgent.tsx`: the screens.
  - Tests: `tests/seo-agent.test.js`.
- **GID Opportunity Score** is GID's own prioritisation number, never a Google ranking score:
  `100 × impact × confidence × value × learning ÷ effort`.
  - HIGH is 55 or more with at least medium confidence; MEDIUM is 30 or more.
  - Findings that share one fix are one card, for example all the searches that need the homepage title rewritten.
- **Learning.**
  - **Done** records a baseline. The effect is then measured at 7/30/90/180 days as positive correlation, negative correlation, no clear change, or insufficient data.
  - Once a category has 3 or more measured results, its priority moves by at most ±20%. GID's own results never override Google's guidance.
- **Site crawl.** The `site_audit` provider now reads every sitemap URL's raw HTML, which is what crawlers see before JavaScript runs.
  - It also requests a URL that can't exist, to detect soft 404s.
  - Analysis turns these into site-level findings: canonical conflicts, duplicate raw titles, no H1, doorway risk, and offered services without a page.
- **Knowledge base.**
  - Claims are sourced from Google docs retrieved on 2026-09-29.
  - A weekly sync step re-checks each Google page. If its text changes by more than 3%, it's flagged "changed — review".
  - Superseded guidance is never cited.
- **Rankings.** Manual entries or CSV (`keyword,area,rank,date,in_local_pack,competitors`) per area in the service radius.
  - There's no Google scraping.
  - A rank-tracker export can be imported the same way.
- **Implement.** For website findings this copies a precise brief for Claude Code, which shows the diff before changing anything.
  - Nothing is published automatically.
- **Setup (once).** Run `seo_agent_migration.sql` in the Supabase SQL editor. It's additive: `seo_snapshots`, `seo_knowledge` and `seo_rank_observations`.
  - Until it's run, the queue and Top-5 gap work, while History, Rankings and the weekly research check say "not set up".
  - The next analysis after the migration saves **Baseline #1**.


---

## Outside-world monitors (search engine changes, competitors, AI assistants)

All of these run inside the existing sync (`functions/_lib/seo/monitors.js`). Their state lives in R2 under `private/`, and tests are in `tests/seo-monitors.test.js`.

| Monitor | Cadence | What it does |
|---|---|---|
| `search_news` | daily | Reads the Google Search Status Dashboard (core, spam and ranking updates, with start and end dates), the Google Search Central blog and the Bing Webmaster blog. Each item is classified as high, medium, low or info for a local mobile-mechanic site. |
| `indexnow` | weekly | Submits the sitemap pages to IndexNow (Bing, Yandex and others; Bing feeds ChatGPT search and Copilot). The key file is `public/<key>.txt`. Google doesn't use IndexNow. |
| `ai_visibility` | weekly | Asks Claude Haiku with live web search (location set to Flagstaff) 3 questions local customers ask. It records whether GID Garage is named, at what position, who else is named, and which sources were cited. Cost is about $0.05 a week, recorded in the Jarvis AI budget. |
| `competitor_listings` | monthly | Searches the top 6 competitors (mobile first) and GID by name, using Claude with web search. Records which directories and sites list them and whether GID is on them. Search noise is dropped: a site is kept only if it's a known listing site or lists 2+ competitors. About $0.15 a month. Code: `functions/_lib/seo/outreach.js`. |
| `link_outreach` | weekly | Finds up to 5 new Flagstaff/Arizona sites that could link to GID. It reads the contact email each site publishes (home page, `/contact`, `/contact-us`) and drafts an email that starts "Hello, this is Michael with GID Garage,". **Nothing is sent by the sync.** |
| `places` (extended) | weekly | Looks up up to 6 competitor websites per run (Places Details `website`), so `competitor_pages` can monitor their pages. `website = 'none'` means checked, has none. |

**Outreach sending rules** (`sendOutreach`):
- Sending happens only from SEO → Research → Link outreach, through Review & send and then "Yes, send it" (`reviewed` + `confirmed`).
- It goes only to the address the site publishes, and each site is emailed at most once.
- The cap is 10 a day, and the opt-out line is always kept.
- Mail goes out through Zoho (`sendZohoMail`), which needs the `ZohoMail.messages.CREATE` scope. Reconnect Zoho with the scope `ZohoMail.accounts.READ,ZohoMail.messages.READ,ZohoMail.messages.CREATE`.
- The owner's decisions (sent/skipped) are kept in `private/seo-outreach-decisions.json`, apart from the found list, so a sync never overwrites them.

**Where it shows up:**
- **Banner:** on the SEO status strip while a Google update is rolling out.
- **Research tab:** "Search engine updates" and "AI assistant answers".
- **Top-5 gap:** an "AI assistants" section.
- **Recommendations:** `search_update` (informational) and `ai_visibility`.
- **Telegram:** one message when a new Google ranking update starts (checked every 30 minutes, 7 AM to 9 PM).
- **Jarvis brief:** a line while an update is rolling out.

**What the site gives AI crawlers:**
- **Pre-rendered HTML**, since AI crawlers don't run JavaScript.
- **`/llms.txt`:** services, prices, hours, area and pages, generated from `shared/site-pages.js`.
- **Service JSON-LD** on each service page.
- **Opening hours and service URLs** in the AutoRepair schema.
- **Crawler access:** every AI crawler user-agent was checked and gets 200.
- **Owner check:** in Cloudflare → Security → Bots, keep "Block AI bots" / AI Crawl Control off (allow).
