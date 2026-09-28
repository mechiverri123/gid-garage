-- GID Garage — SEO / Growth Mode (local-first) schema.

-- ADDITIVE ONLY: creates new seo_* tables; touches no existing table.

-- Run once in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS).

-- Access is server-side only (service key): RLS on, no public policies.



-- ---- settings / connections ----------------------------------------------------------

create table if not exists seo_settings (

  id text primary key default 'default',

  canonical_name text default 'GID Garage',

  canonical_phone text default '480-757-0476',

  canonical_website text default 'https://gidgarage.com',

  hide_address boolean default true,              -- mobile service-area business

  service_radius_miles numeric default 30,

  brand_terms jsonb,                              -- override BRAND_TERMS

  services jsonb,                                 -- override SERVICES offered flags

  key_pages jsonb default '["https://gidgarage.com/"]'::jsonb,

  competitor_urls jsonb,

  updated_at timestamptz default now()

);

insert into seo_settings (id) values ('default') on conflict (id) do nothing;



create table if not exists seo_provider_status (

  provider text primary key,

  status text not null,                           -- connected | not_configured | needs_authorization | pending_approval | manual_only | ready_limited | error

  detail text,

  cursor jsonb,                                   -- backfill/incremental position

  last_sync_at timestamptz,

  last_error text,

  updated_at timestamptz default now()

);



create table if not exists seo_sync_runs (

  id bigserial primary key,

  provider text not null,

  mode text not null,                             -- incremental | backfill

  range_from date,

  range_to date,

  status text not null,                           -- ok | skipped | error

  rows_written integer default 0,

  detail text,

  started_at timestamptz default now(),

  finished_at timestamptz

);

create index if not exists seo_sync_runs_started_idx on seo_sync_runs (started_at desc);



-- ---- Search Console ----------------------------------------------------------------------

create table if not exists seo_gsc_daily (

  date date not null,

  query text not null,

  page text not null,

  country text not null default '',

  device text not null default '',

  clicks integer not null default 0,

  impressions integer not null default 0,

  position numeric,

  intent_class text,

  locality text,                                  -- likely_local | unknown | nonlocal  (never confirmed_local: GSC has no city data)

  service text,

  branded boolean,

  primary key (date, query, page, country, device)

);

create index if not exists seo_gsc_daily_date_idx on seo_gsc_daily (date);

create index if not exists seo_gsc_daily_locality_idx on seo_gsc_daily (locality, intent_class);



-- Date-level totals (includes anonymized queries Search Console hides from query rows).

create table if not exists seo_gsc_totals (

  date date primary key,

  clicks integer not null default 0,

  impressions integer not null default 0

);



-- ---- Google Business Profile --------------------------------------------------------------

create table if not exists seo_gbp_daily (

  date date not null,

  metric text not null,                           -- BUSINESS_IMPRESSIONS_*, CALL_CLICKS, WEBSITE_CLICKS, ...

  value integer not null default 0,

  primary key (date, metric)

);

create table if not exists seo_gbp_keywords (

  month date not null,                            -- first of month

  keyword text not null,

  impressions integer,                            -- null when Google reports only a threshold

  threshold integer,                              -- e.g. "<15"

  intent_class text,

  service text,

  primary key (month, keyword)

);



-- ---- GA4 -------------------------------------------------------------------------------------

create table if not exists seo_ga4_daily (

  date date not null,

  landing_page text not null default '',

  source text not null default '',

  medium text not null default '',

  city text not null default '',

  region text not null default '',

  country text not null default '',

  sessions integer default 0,

  engaged_sessions integer default 0,

  key_events integer default 0,

  locality text,                                  -- likely_local | unknown | nonlocal (IP-derived city: never confirmed)

  ai_assistant text,

  primary key (date, landing_page, source, medium, city, region, country)

);



-- ---- Bing (optional) -------------------------------------------------------------------------

create table if not exists seo_bing_daily (

  date date not null,

  query text not null,

  clicks integer default 0,

  impressions integer default 0,

  position numeric,

  intent_class text,

  locality text,

  primary key (date, query)

);



-- ---- technical ---------------------------------------------------------------------------------

create table if not exists seo_pagespeed_runs (

  id bigserial primary key,

  fetched_at timestamptz default now(),

  url text not null,

  strategy text not null,                         -- mobile | desktop

  perf_score integer,

  seo_score integer,

  lcp_ms integer,

  cls numeric,

  inp_ms integer,

  field_data boolean default false

);

create index if not exists seo_pagespeed_url_idx on seo_pagespeed_runs (url, strategy, fetched_at desc);



create table if not exists seo_page_audits (

  id bigserial primary key,

  fetched_at timestamptz default now(),

  url text not null,

  title text,

  meta_description text,

  h1 text,

  canonical text,

  schema_types jsonb,

  advertised_places jsonb,

  issues jsonb

);



-- ---- reviews / competitors -----------------------------------------------------------------------

create table if not exists seo_review_snapshots (

  id bigserial primary key,

  captured_at timestamptz default now(),

  subject text not null,                          -- 'own' or a competitor id

  rating numeric,

  review_count integer

);

create index if not exists seo_review_snapshots_idx on seo_review_snapshots (subject, captured_at);



create table if not exists seo_competitors (

  id text primary key,                            -- place_id or 'manual:<slug>'

  name text not null,

  website text,

  domain text,

  kind text not null,                             -- business | search_result

  tier text,                                      -- primary (mobile) | secondary (local shop) | tertiary (dealer/chain)

  is_mobile boolean default false,

  weight numeric,

  lat numeric,

  lng numeric,

  distance_miles numeric,

  inside_service_area boolean,

  rating numeric,

  review_count integer,

  services jsonb,

  source text,                                    -- places_api | manual

  status text default 'active',                   -- active | ignored

  first_seen timestamptz default now(),

  last_seen timestamptz default now()

);



create table if not exists seo_competitor_snapshots (

  id bigserial primary key,

  competitor_id text not null references seo_competitors(id) on delete cascade,

  fetched_at timestamptz default now(),

  url text,

  title text,

  meta_description text,

  h1s jsonb,

  services jsonb,

  content_hash text

);

create index if not exists seo_competitor_snapshots_idx on seo_competitor_snapshots (competitor_id, fetched_at desc);



create table if not exists seo_competitor_changes (

  id bigserial primary key,

  competitor_id text not null references seo_competitors(id) on delete cascade,

  detected_at timestamptz default now(),

  change_type text not null,

  detail jsonb

);



-- ---- local authority / citations ------------------------------------------------------------------

create table if not exists seo_citations (

  id bigserial primary key,

  platform text not null,

  url text,

  observed_name text,

  observed_phone text,

  observed_website text,

  observed_address_shown boolean,

  checked_at timestamptz default now(),

  notes text

);

create table if not exists seo_authority_opportunities (

  id bigserial primary key,

  name text not null,

  url text,

  kind text,                                      -- core_listing | chamber | local_news | community | local_org | local_supplier | directory

  local boolean default true,

  relevance numeric default 0.5,

  effort numeric default 0.5,

  status text default 'idea',                     -- idea | in_progress | done | rejected

  notes text,

  created_at timestamptz default now()

);



-- ---- seasonality / weather ------------------------------------------------------------------------

create table if not exists seo_calendar_events (

  id bigserial primary key,

  kind text not null,                             -- nau_fall_move_in, nau_spring_break, holiday, ...

  label text not null,

  start_date date not null,

  end_date date not null,

  approximate boolean default false,

  source text

);

create table if not exists seo_weather_daily (

  date date primary key,

  tmin_f numeric,

  tmax_f numeric,

  snow_in numeric,

  precip_in numeric,

  source text

);

create table if not exists seo_weather_forecast (

  date date primary key,

  tmin_f numeric,

  tmax_f numeric,

  short_forecast text,

  fetched_at timestamptz default now()

);



-- ---- social / ads -----------------------------------------------------------------------------------

create table if not exists seo_instagram_daily (

  date date primary key,

  followers integer,

  reach integer,

  profile_views integer,

  website_clicks integer

);

create table if not exists seo_instagram_audience (

  captured_at date not null,

  city text not null,

  followers integer,

  locality text,

  primary key (captured_at, city)

);

create table if not exists seo_ads_location_daily (

  date date not null,

  platform text not null,                         -- google_ads | meta_ads

  campaign text not null default '',

  location_label text not null default '',

  granularity text,                               -- city | zip | region | dma

  inside_area boolean,                            -- null when the platform's granularity can't tell (e.g. state/DMA)

  clicks integer default 0,

  cost numeric default 0,

  conversions numeric default 0,

  primary key (date, platform, campaign, location_label)

);



-- ---- recommendations / memory ---------------------------------------------------------------------------

create table if not exists seo_recommendations (

  id text primary key,                            -- deterministic "<type>:<key>"

  type text not null,

  title text not null,

  detail text,

  evidence jsonb,

  service text,

  score integer default 0,

  confidence text,

  status text not null default 'open',            -- open | accepted | rejected | dismissed | applied | measured | expired

  requires_decision boolean default false,

  informational boolean default false,

  metric jsonb,

  baseline jsonb,

  outcome jsonb,

  rejected_reason text,

  applied_note text,

  applied_at timestamptz,

  monitor_until timestamptz,

  created_at timestamptz default now(),

  updated_at timestamptz default now()

);

create index if not exists seo_recommendations_status_idx on seo_recommendations (status, score desc);



create table if not exists seo_preferences (

  id bigserial primary key,

  kind text not null,                             -- reject_rec | mute_type | mute_service

  key text not null,

  reason text,

  expires_at timestamptz,

  created_at timestamptz default now()

);



-- ---- RLS: server-side (service key) only ------------------------------------------------------------------

do $$

declare t text;

begin

  foreach t in array array['seo_settings','seo_provider_status','seo_sync_runs','seo_gsc_daily','seo_gsc_totals','seo_gbp_daily','seo_gbp_keywords',

    'seo_ga4_daily','seo_bing_daily','seo_pagespeed_runs','seo_page_audits','seo_review_snapshots','seo_competitors','seo_competitor_snapshots',

    'seo_competitor_changes','seo_citations','seo_authority_opportunities','seo_calendar_events','seo_weather_daily','seo_weather_forecast',

    'seo_instagram_daily','seo_instagram_audience','seo_ads_location_daily','seo_recommendations','seo_preferences']

  loop

    execute format('alter table %I enable row level security', t);

  end loop;

end $$;



-- ---- read-only aggregation RPCs (PostgREST caps plain selects at 1,000 rows) ----------------------------

create or replace function seo_gsc_period(p_from date, p_to date)
returns table (
  query text,
  page text,
  country text,
  clicks bigint,
  impressions bigint,
  "position" numeric,
  intent_class text,
  locality text,
  service text,
  branded boolean
)
language sql
stable
as $$
  select
    g.query,
    g.page,
    g.country,
    sum(g.clicks)::bigint as clicks,
    sum(g.impressions)::bigint as impressions,
    round(
      sum(g.position * g.impressions) / nullif(sum(g.impressions), 0),
      1
    ) as "position",
    max(g.intent_class) as intent_class,
    max(g.locality) as locality,
    max(g.service) as service,
    bool_or(g.branded) as branded
  from seo_gsc_daily as g
  where g.date between p_from and p_to
  group by g.query, g.page, g.country
$$;

create or replace function seo_gsc_service_daily(p_from date, p_to date)
returns table (
  date date,
  service text,
  locality text,
  clicks bigint,
  impressions bigint
)
language sql
stable
as $$
  select
    g.date as date,
    coalesce(g.service, 'none') as service,
    g.locality as locality,
    sum(g.clicks)::bigint as clicks,
    sum(g.impressions)::bigint as impressions
  from seo_gsc_daily as g
  where g.date between p_from and p_to
  group by g.date, coalesce(g.service, 'none'), g.locality
$$;

-- Only the service role may call these (anon/authenticated revoked).
revoke all on function seo_gsc_period(date, date) from public, anon, authenticated;
revoke all on function seo_gsc_service_daily(date, date) from public, anon, authenticated;
