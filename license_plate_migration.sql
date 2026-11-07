-- License plate on a job (Job Overview). Additive: two new nullable columns, nothing
-- existing changes. Safe to run more than once. Run in the Supabase SQL editor.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS license_plate text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS plate_state text;

-- Verify: should list both columns.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'bookings' AND column_name IN ('license_plate', 'plate_state');
