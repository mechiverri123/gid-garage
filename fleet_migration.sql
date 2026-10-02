-- Fleet accounts + fleet vehicles (FLEET_PLAN.md). ADDITIVE ONLY: two new
-- tables and two new nullable columns on bookings. No existing column, row,
-- time or money value is changed. Every existing booking keeps fleet_id NULL,
-- so every retail screen shows exactly what it shows today.
-- Run once in the Supabase SQL editor. Safe to re-run.

create extension if not exists pgcrypto;

-- ---- fleet companies ---------------------------------------------------------
create table if not exists fleet_accounts (
  id uuid primary key default gen_random_uuid(),
  -- Permanent 4-digit GID Garage Fleet number, assigned by the trigger below.
  company_number int not null,
  name text not null check (length(trim(name)) > 0),
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_accounts_company_number_range check (company_number between 1000 and 9999),
  constraint fleet_accounts_company_number_key unique (company_number)
);

-- Random unused number on insert. The UNIQUE constraint above is the real
-- guard; the API retries if two inserts race for the same number.
create or replace function fleet_assign_company_number() returns trigger
language plpgsql as $$
declare
  n int;
  tries int := 0;
begin
  if new.company_number is not null then
    return new;
  end if;
  loop
    n := 1000 + floor(random() * 9000)::int;
    exit when not exists (select 1 from fleet_accounts where company_number = n);
    tries := tries + 1;
    if tries > 500 then
      raise exception 'No free fleet company number';
    end if;
  end loop;
  new.company_number := n;
  return new;
end $$;

-- The number never changes once assigned.
create or replace function fleet_lock_company_number() returns trigger
language plpgsql as $$
begin
  if new.company_number is distinct from old.company_number then
    raise exception 'A fleet company number is permanent and cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists fleet_accounts_assign_number on fleet_accounts;
create trigger fleet_accounts_assign_number before insert on fleet_accounts
  for each row execute function fleet_assign_company_number();
drop trigger if exists fleet_accounts_lock_number on fleet_accounts;
create trigger fleet_accounts_lock_number before update on fleet_accounts
  for each row execute function fleet_lock_company_number();

-- ---- fleet vehicles ----------------------------------------------------------
create table if not exists fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  fleet_id uuid not null references fleet_accounts(id) on delete restrict,
  -- The customer's own unit number, stored without "#" (shown as #36).
  unit_number text not null check (length(trim(unit_number)) between 1 and 20 and unit_number !~ '^#'),
  year int check (year is null or year between 1900 and 2100),
  make text,
  model text,
  engine text,
  vin text,
  plate text,
  mileage int check (mileage is null or mileage >= 0),
  status text not null default 'active' check (status in ('active', 'attention', 'service_due', 'out_of_service', 'retired')),
  next_service_label text,
  next_service_miles int check (next_service_miles is null or next_service_miles >= 0),
  next_service_date date,           -- date-only (a due day, not an instant)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Unit numbers are unique WITHIN a fleet (another fleet may also have #36).
create unique index if not exists fleet_vehicles_fleet_unit_key on fleet_vehicles (fleet_id, lower(unit_number));
create index if not exists fleet_vehicles_fleet_idx on fleet_vehicles (fleet_id);

-- ---- link jobs to fleets (nullable; existing rows stay NULL) ---------------------
alter table bookings add column if not exists fleet_id uuid;
alter table bookings add column if not exists fleet_vehicle_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_fleet_id_fkey') then
    alter table bookings add constraint bookings_fleet_id_fkey foreign key (fleet_id) references fleet_accounts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_fleet_vehicle_id_fkey') then
    alter table bookings add constraint bookings_fleet_vehicle_id_fkey foreign key (fleet_vehicle_id) references fleet_vehicles(id) on delete set null;
  end if;
end $$;
create index if not exists bookings_fleet_id_idx on bookings (fleet_id) where fleet_id is not null;
create index if not exists bookings_fleet_vehicle_id_idx on bookings (fleet_vehicle_id) where fleet_vehicle_id is not null;

-- Server-only tables (the service key bypasses RLS; the anon key gets nothing).
alter table fleet_accounts enable row level security;
alter table fleet_vehicles enable row level security;

-- Let the API see the new tables/columns right away.
notify pgrst, 'reload schema';

-- ---- verification (run after; expected results in comments) ----------------------
-- select count(*) from bookings where fleet_id is not null;          -- 0 (no existing job changed)
-- select data_type from information_schema.columns
--   where table_name = 'fleet_accounts' and column_name = 'created_at'; -- timestamp with time zone
-- insert into fleet_accounts (name) values ('Test Fleet') returning company_number; -- a number 1000–9999
-- delete from fleet_accounts where name = 'Test Fleet';
