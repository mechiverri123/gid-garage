# Fleet — approved plan (2026-09-30)

The owner approved this architecture and all 4 recommendations. **Built 2026-10-01 (all 3 steps).** The owner runs `fleet_migration.sql` once; before that, Fleet shows a "run the migration" message and nothing else changes. Current summary: CLAUDE.md §0.36.

## What exists today
- There's no fleet code.
- `customers` is one row per person, with one VIN, vehicle and mileage.
- `bookings` is one row per job. It has customer_id, vehicle, vin, mileage, service_address, date, time, date_tbd, job_status, line_items, estimate, invoice, payments, parts_cost, photos and inspection.
- **Where jobs are read:**
  - Admin (`src/BookingWidget.tsx` admin tabs jobs/schedule/customers/mileage/hub/pay; `src/JobOps.tsx`) goes through `/admin-api-data` (`list-bookings`, `insert-booking`, `patch-booking`, `list-customers`).
  - Public slots come from `booked-slots` (`functions/api-customer.js`).
  - The Jarvis calendar and Customers views are in `src/command-center/workspace/`.
  - Revenue, Money and net profit add up every booking.

## Data model (one additive migration: `fleet_migration.sql`, run by the owner)
- **`fleet_accounts`**
  - Columns: id uuid pk, `company_number` int NOT NULL UNIQUE CHECK 1000–9999, name, contact_name, phone, email, address, notes, status (active/archived), created_at, updated_at.
  - A BEFORE INSERT trigger fills company_number with a random unused number. The UNIQUE constraint is the final guard; the API retries on 23505 (at most 5 times) and never reuses or overwrites a number.
- **`fleet_vehicles`**
  - Columns: id uuid pk, fleet_id FK, `unit_number` text NOT NULL, year, make, model, engine, vin, plate, mileage int, status (active/attention/service_due/out_of_service/retired), next_service_label, next_service_miles, next_service_date, notes, timestamps.
  - Constraint: UNIQUE (fleet_id, lower(unit_number)).
- **`bookings`** gets two nullable columns: `fleet_id` and `fleet_vehicle_id` (FKs).

## Approved decisions
1. **Unit numbers:** letters are allowed (A12, T-4). Strip a leading "#" when saving and show `#<unit>` everywhere. The field is required. Suggesting the next free number is fine; never renumber.
2. **Fleet job invoices:** addressed to the company and sent to its contact email. The booking gets fname = company name and the company's phone/email, with customer_id = NULL.
3. **Fleet Service Day:** a booking with fleet_id set and fleet_vehicle_id NULL (service "Fleet Service Day"). Its list of vehicles is worked out from that company's vehicle jobs on the same date. There's no new table.
4. **Fleet jobs stay in the Jobs list** with a "Fleet #4827 · #36" badge.

## Rules
- **Add Job** (from the vehicle page) inserts a normal booking with fleet_id, fleet_vehicle_id, company name/contact, "year make model", vin, current mileage and location. After that, the existing job screens handle estimate, parts, inspection, photos, invoice and payments. There's no second repair-order system.
- **Service history** is worked out from bookings, never stored:
  - For a vehicle: bookings for that fleet_vehicle_id, newest first.
  - For a company: bookings for that fleet_id.
  - Each row shows date, mileage, work done (from line items), total (shared money math) and status.
  - The All / Maintenance / Repairs / Inspections filter comes from a small shared rule with tests.
- **Retail views filter `fleet_id IS NULL`:** the admin Schedule, the Jarvis calendar, the Jarvis Customers view and Jarvis customer search.
- **Views that deliberately do NOT filter:**
  - Public booking availability (fleet jobs still take up the owner's time).
  - The Jobs list (fleet jobs show there with the badge).
  - Revenue, net profit and Money.
- **Fleet calendar:** bookings with `fleet_id IS NOT NULL`. There's an all-fleets calendar and one per company. Service days and individual vehicle jobs look clearly different.
- **API:** `functions/jarvis/fleet.js` with Access plus `verifyAccess`, used by both admin and Jarvis.
- **Search:** `36`, `#36`, VIN or partial VIN, plate, make/model/year.

## Screens
- **Admin:** a **Fleet** tab next to Customers.
  - Fleet home lists companies (whole card clickable): name, Fleet #, vehicle count, needs attention, service due, contact.
  - Company page: header, then Add Vehicle / Add Job / Schedule Fleet Day / Edit, then tabs Overview / Vehicles / Service History / Calendar.
  - Unit page: Overview (next service, open items, recent service) / Service History (timeline) / Inspections.
  - Breadcrumbs: `Fleet / Company / Vehicles / #36`.
  - Desktop uses a dense table; mobile uses cards.
- **Jarvis:** the same structure in the Command Center style.
  - Commands like "open fleet", "pull up truck 36", "unit 36" and "what's been done to 36" are handled locally with no AI call.
  - If more than one company has that unit, show the choices; never guess.

## Build order
1. **Migration + `/jarvis/fleet` API + tests:** number generator and retry, per-company unit uniqueness, history rules, and the retail filters. Stop there and ask the owner to run the SQL.
2. **Admin Fleet screens**, plus the retail-calendar filter.
3. **Jarvis fleet views and voice commands.**
