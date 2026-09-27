-- GID Garage / Jarvis service dictionary correction
-- Safe/additive data update only. Does NOT alter the bookings table or admin code.

update public.jarvis_schema_dictionary
set
  description = 'Primary booking service/category. Values are the exact IDs used by the current GID Garage admin.',
  allowed_values = '["oil","brakes","diag","suspension","audio","full","other"]'::jsonb,
  examples = '[
    {"value":"oil","label":"Oil Change"},
    {"value":"brakes","label":"Brakes"},
    {"value":"diag","label":"Diagnostics"},
    {"value":"suspension","label":"Suspension"},
    {"value":"audio","label":"Car Audio"},
    {"value":"full","label":"Full Service"},
    {"value":"other","label":"Other / Custom"}
  ]'::jsonb,
  aliases = '["service","job type","repair type","category"]'::jsonb,
  notes = 'Never write display labels like Brakes or Diagnostics into bookings.service. Write the canonical IDs shown in allowed_values.'
where table_name = 'bookings' and column_name = 'service';

delete from public.jarvis_value_aliases
where table_name = 'bookings' and column_name = 'service';

insert into public.jarvis_value_aliases
  (table_name, column_name, canonical_value, alias)
values
  ('bookings','service','oil','oil'),
  ('bookings','service','oil','oil change'),
  ('bookings','service','oil','oil changes'),
  ('bookings','service','brakes','brake'),
  ('bookings','service','brakes','brakes'),
  ('bookings','service','brakes','break'),
  ('bookings','service','brakes','breaks'),
  ('bookings','service','brakes','brake job'),
  ('bookings','service','brakes','brake service'),
  ('bookings','service','diag','diag'),
  ('bookings','service','diag','diagnostic'),
  ('bookings','service','diag','diagnostics'),
  ('bookings','service','suspension','suspension'),
  ('bookings','service','audio','audio'),
  ('bookings','service','audio','car audio'),
  ('bookings','service','full','full'),
  ('bookings','service','full','full service'),
  ('bookings','service','full','maintenance'),
  ('bookings','service','other','other'),
  ('bookings','service','other','something else'),
  ('bookings','service','other','general inquiry'),
  ('bookings','service','other','custom')
on conflict (table_name, column_name, alias)
do update set
  canonical_value = excluded.canonical_value,
  enabled = true;
