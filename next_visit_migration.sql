-- Next-visit checklist template, editable in Hub → Next-Visit Checklist.
-- ADDITIVE: one nullable column. NULL = use the built-in default list.
-- Run once in the Supabase SQL editor. Safe to re-run.
alter table business_settings add column if not exists next_visit_checklist jsonb;
notify pgrst, 'reload schema';
-- verify: select next_visit_checklist from business_settings where id = 'default';  -- NULL until you save one
