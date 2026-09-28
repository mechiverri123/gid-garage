-- Link owner notes (jarvis_business_notes) to the customer / job they're about.
-- ADDITIVE ONLY: two nullable columns + an index. No existing row is changed,
-- and no other table is modified (the foreign keys only reference them).
-- Deleting a customer or job never deletes a note: the link is just cleared.
-- Safe to run more than once.

alter table public.jarvis_business_notes
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists booking_id text references public.bookings(id) on delete set null;

create index if not exists jarvis_business_notes_customer_id_idx
  on public.jarvis_business_notes (customer_id)
  where customer_id is not null;

-- Check: both columns exist and every note is still unlinked (nothing was rewritten).
select count(*) as notes, count(customer_id) as linked_to_customer, count(booking_id) as linked_to_job
from public.jarvis_business_notes;
