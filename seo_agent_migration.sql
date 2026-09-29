-- Local SEO agent: additive tables only. Safe to run once in the Supabase SQL editor.
-- Doesn't touch any existing table. Before this runs, the SEO page still works:
-- History / Research / Rankings show "not set up" and recommendations keep working.

-- Analysis snapshots: "Baseline #1", then one per analysis (for "changes since last analysis").
create table if not exists seo_snapshots (
  id bigserial primary key,
  label text not null,
  data jsonb not null,
  created_at timestamptz default now()
);
create index if not exists seo_snapshots_created_idx on seo_snapshots (created_at desc);

-- Knowledge base status. The claims themselves live in code (shared/seo/knowledge.js);
-- this stores the weekly check of each Google source and the owner's review.
create table if not exists seo_knowledge (
  id text primary key,
  status text not null default 'active',          -- active | changed | superseded
  content_hash text,
  content_length integer,
  retrieved_at date,
  last_checked_at timestamptz,
  changed_at timestamptz
);

-- Local rank observations by keyword and place (manual, CSV or a future API).
create table if not exists seo_rank_observations (
  id bigserial primary key,
  keyword text not null,
  area_name text not null,
  lat numeric,
  lng numeric,
  observed_on date not null,
  rank integer,                                    -- null = not in the results checked
  in_local_pack boolean default false,
  competitors jsonb default '[]'::jsonb,
  method text not null default 'manual',           -- manual | csv | api
  note text,
  created_at timestamptz default now()
);
create index if not exists seo_rank_obs_idx on seo_rank_observations (keyword, area_name, observed_on desc);

-- Server-side (service key) only, like every other seo_* table.
alter table seo_snapshots enable row level security;
alter table seo_knowledge enable row level security;
alter table seo_rank_observations enable row level security;
