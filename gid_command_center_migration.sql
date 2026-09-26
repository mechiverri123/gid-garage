-- ============================================================================
-- GID Garage — Command Center migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query > Run).
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- leads — every inbound contact before (or instead of) it becomes a booking.
-- A lead is NOT a booking. Once a lead books, we link booking_id/customer_id
-- but keep the lead row so the funnel (lead -> booking) stays measurable.
-- ---------------------------------------------------------------------------
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  fname text,
  lname text,
  phone text,
  email text,

  -- Where this lead came from. Free text on purpose (not an enum) so new
  -- channels don't require a migration — but the app's Ask GID / marketing
  -- views expect lowercase snake_case values like:
  --   google_ads, meta_ads, gbp (Google Business Profile), facebook_organic,
  --   referral, organic_search, craigslist, phone, website_form,
  --   website_booking, walk_in, other
  source text not null default 'other',
  campaign text,               -- ad campaign name/id, if applicable

  vehicle text,
  requested_service text,
  quote_amount numeric,

  -- new -> contacted -> quoted -> booked
  --                  -> lost (explicitly declined/price-shopped away)
  --                  -> no_response (went cold)
  status text not null default 'new',

  booking_id text references bookings(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,

  follow_up_at timestamptz,     -- when this lead should be followed up next
  last_contacted_at timestamptz,
  notes text,

  raw_payload jsonb             -- original webhook body, when applicable (Zapier/Facebook Lead Ads/etc.) — kept for debugging source mapping
);

create index if not exists leads_status_idx on leads (status);
create index if not exists leads_source_idx on leads (source);
create index if not exists leads_created_at_idx on leads (created_at desc);
create index if not exists leads_follow_up_at_idx on leads (follow_up_at) where follow_up_at is not null;
create index if not exists leads_booking_id_idx on leads (booking_id);
create index if not exists leads_customer_id_idx on leads (customer_id);

-- Keep updated_at current on every write.
create or replace function leads_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_updated_at_trigger on leads;
create trigger leads_updated_at_trigger
  before update on leads
  for each row execute function leads_set_updated_at();

-- ---------------------------------------------------------------------------
-- calls — a log of phone contact, linkable to a lead and/or customer, so we
-- can compute "which marketing channel actually produces calls that book."
-- ---------------------------------------------------------------------------
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  phone text,
  direction text not null default 'inbound',   -- inbound | outbound

  -- booked | quote_requested | price_shopper | no_answer | missed | spam | other
  outcome text not null default 'other',

  source text,                                  -- which channel this call is attributed to, if known
  lead_id uuid references leads(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,

  duration_seconds integer,
  notes text
);

create index if not exists calls_created_at_idx on calls (created_at desc);
create index if not exists calls_outcome_idx on calls (outcome);
create index if not exists calls_lead_id_idx on calls (lead_id);

-- ---------------------------------------------------------------------------
-- marketing_spend — manual (for now) daily/campaign spend entries. Lets the
-- Command Center compute cost-per-lead / cost-per-booking per channel even
-- before a live Google/Meta Ads API integration exists (see MANUAL_STEPS.md
-- for that phase-2 note).
-- ---------------------------------------------------------------------------
create table if not exists marketing_spend (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  date date not null,
  channel text not null,        -- google_ads | meta_ads | gbp | referral | organic | other
  campaign text,
  amount numeric not null default 0,
  clicks integer,
  calls integer,
  notes text
);

create index if not exists marketing_spend_date_idx on marketing_spend (date desc);
create index if not exists marketing_spend_channel_idx on marketing_spend (channel);

-- ---------------------------------------------------------------------------
-- RLS: same posture as bookings/customers elsewhere in this schema — the
-- anon key gets no access at all. Every read/write goes through
-- admin-api-data.js (Cloudflare Access + Supabase service key, which
-- bypasses RLS entirely). Enabling RLS with zero policies means "deny
-- everyone except the service key."
-- ---------------------------------------------------------------------------
alter table leads enable row level security;
alter table calls enable row level security;
alter table marketing_spend enable row level security;

-- ---------------------------------------------------------------------------
-- Done. Verify with:
--   select count(*) from leads;
--   select count(*) from calls;
--   select count(*) from marketing_spend;
-- All three should return 0 (empty, no errors) on a fresh run.
-- ---------------------------------------------------------------------------
