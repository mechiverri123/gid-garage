-- Helper pay (/admin/pay). ADDITIVE ONLY: three new tables. No existing table,
-- column, row, time or money value is changed.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
--   pay_people   who helps (name, contact, default rates, how you pay them)
--   pay_entries  what they EARNED: hours on a day, or a flat amount for a job
--   pay_payouts  what you PAID them (a Venmo, cash…) — this is the business
--                cost that lowers net profit, on the day you paid it
-- Balance owed = earned − paid. Dates are date-only on purpose (work day,
-- pay day: no time of day or timezone); created_at is a real instant.

create extension if not exists pgcrypto;

create table if not exists pay_people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  pay_method text,               -- e.g. "Venmo @name"
  hourly_rate numeric(10,2) check (hourly_rate is null or hourly_rate >= 0),
  job_rate numeric(10,2) check (job_rate is null or job_rate >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists pay_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references pay_people(id) on delete restrict,
  booking_id text,               -- the job they helped on (optional)
  work_date date not null,
  kind text not null check (kind in ('hours', 'job', 'bonus')),
  hours numeric(6,2) check (hours is null or (hours > 0 and hours <= 24)),
  rate numeric(10,2) check (rate is null or rate >= 0),
  amount numeric(10,2) not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists pay_entries_person_idx on pay_entries (person_id, work_date desc);
create index if not exists pay_entries_booking_idx on pay_entries (booking_id);

create table if not exists pay_payouts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references pay_people(id) on delete restrict,
  paid_on date not null,
  amount numeric(10,2) not null check (amount > 0),
  method text,                   -- Venmo, Cash, Zelle, Check…
  reference text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists pay_payouts_person_idx on pay_payouts (person_id, paid_on desc);
create index if not exists pay_payouts_paid_on_idx on pay_payouts (paid_on);

-- Only the server (service key) reads/writes these; no public access.
alter table pay_people enable row level security;
alter table pay_entries enable row level security;
alter table pay_payouts enable row level security;

-- Verify:
--   select count(*) from pay_people; select count(*) from pay_entries; select count(*) from pay_payouts;

-- ---- v2 (2026-10-06): roles + the owner's own pay. Safe to re-run. ----------
-- role: owner (you — your pay is an owner's draw, recorded in equity_entries,
-- never an expense), contractor (1099), employee (W-2; real payroll is done
-- outside this app). At most one owner.
alter table pay_people add column if not exists role text not null default 'contractor';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pay_people_role_check') then
    alter table pay_people add constraint pay_people_role_check check (role in ('owner', 'contractor', 'employee'));
  end if;
end $$;
create unique index if not exists pay_people_one_owner on pay_people (role) where role = 'owner';
-- A payout to the owner is a draw: it doesn't lower net profit, and its
-- matching Owner's Equity ledger row is linked here so deleting one deletes both.
alter table pay_payouts add column if not exists owner_draw boolean not null default false;
alter table pay_payouts add column if not exists equity_entry_id uuid;

-- Verify v2:
--   select column_name from information_schema.columns where table_name in ('pay_people','pay_payouts') and column_name in ('role','owner_draw','equity_entry_id');
