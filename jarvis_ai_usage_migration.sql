-- Jarvis AI budget tracking (additive; run once in the Supabase SQL editor).
-- One row per month per provider (anthropic | stt | tts) with running totals.
-- Estimates only — see functions/_lib/ai-budget.js. Server (service key) only.

create table if not exists jarvis_ai_usage (
  month text not null,            -- 'YYYY-MM' (Arizona calendar)
  provider text not null,         -- anthropic | stt | tts
  units numeric not null default 0,  -- tokens | seconds | characters
  usd numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month, provider)
);

alter table jarvis_ai_usage enable row level security;

-- Atomic increment, so simultaneous requests never lose usage.
create or replace function jarvis_add_usage(p_month text, p_provider text, p_units numeric, p_usd numeric)
returns void
language sql
security definer
set search_path = public
as $$
  insert into jarvis_ai_usage (month, provider, units, usd)
  values (p_month, p_provider, coalesce(p_units, 0), coalesce(p_usd, 0))
  on conflict (month, provider) do update
    set units = jarvis_ai_usage.units + excluded.units,
        usd = jarvis_ai_usage.usd + excluded.usd,
        updated_at = now();
$$;

revoke all on function jarvis_add_usage(text, text, numeric, numeric) from public, anon, authenticated;
