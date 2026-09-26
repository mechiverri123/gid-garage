// fixed
// Cloudflare Pages Function — POST /admin-api/data
// All ADMIN reads/writes go through here using the Supabase SERVICE key.
// The public anon key can no longer read the bookings table at all.
//
// SECURITY: This route MUST be covered by your Cloudflare Access application
// (the same one protecting /admin). Access blocks unauthenticated requests
// before they reach this function. As defense-in-depth we also require the
// Cf-Access-Jwt-Assertion header to be present (Access injects it on every
// authenticated request).
//
// Body: { action: string, ...args }
//   list-bookings                          -> Booking[]   (full rows)
//   get-booking         { id }             -> Booking | null
//   patch-booking       { id, fields }     -> { ok }
//   patch-by-customer   { customerId, fields } -> { ok }   (e.g. update stripe_last4 on all rows)
//   list-customers            {}                              -> Customer[]
//   find-or-create-customer   { fname, lname, phone, email, vin?, vehicle?, mileage?, service_address? }
//                                                              -> { customer, isNew, possibleDuplicates }
//   patch-customer            { id, fields }                  -> { ok }  (cascades identity fields to that customer's bookings)
//   list-payment-events { limit? }         -> PaymentEvent[]
//   write-payment-event { booking_id, event_type, amount, error_message } -> { ok }
//   list-blackout-dates {}                 -> BlackoutDate[]   (requires a `blackout_dates` table: date text PK, reason text)
//   add-blackout-date   { date, reason? }  -> BlackoutDate
//   remove-blackout-date{ date }           -> { ok }
//   run-backup           {}                -> BackupStatus     (manual "Run Backup Now" from Hub → Recovery)
//   backup-status         {}                -> BackupStatus | null
//   list-backups          {}                -> { key, uploaded, sizeBytes }[]
//   restore-backup        { key, mode, confirm } -> RestoreResult  (mode: 'merge' | 'replace', confirm: true required)
//   inspect-backup-bookings { key, bookingIds }  -> Booking[]  (READ-ONLY — no live writes)
//   list-ppi              { status? }            -> PPIRecord[]   (pre-purchase inspections, own table)
//   get-ppi               { id }                  -> PPIRecord | null
//   insert-ppi            { row }                 -> PPIRecord
//   patch-ppi             { id, fields }          -> { ok }
//   send-ppi              { record, toEmail }     -> { ok }        (emails the PrePI link)
//   list-mileage-job-ids   {}                     -> string[]       (job_ids with a logged mileage entry)
//   list-mileage          { year?, job_id? }     -> MileageLog[]  (business drive-time log, own table)
//   upsert-job-mileage    { job_id, fields }     -> MileageLog     (one entry per job — internal only)
//   get-home-address       {}                     -> { homeAddress }
//   set-home-address       { homeAddress }        -> { ok }
//   calc-distance           { origin, destination } -> { miles }  (one-way; Google Distance Matrix, uses GOOGLE_DISTANCE_API_KEY)
//   add-mileage           { row }                -> MileageLog
//   patch-mileage         { id, fields }          -> { ok }
//   delete-mileage        { id }                  -> { ok }
//   get-tax-rate             {}                     -> { taxRate }
//   set-tax-rate             { taxRate }            -> { ok }
//   get-owner-pay-settings   {}                     -> { taxReservePct, payAnchorDate, overheadItems, stripeFeePct }
//   set-owner-pay-settings   { taxReservePct, payAnchorDate, overheadItems, stripeFeePct } -> { ok }

import { runBackup, readBackupStatus, listBackups, restoreBackup, inspectBackupBookings } from './_lib/backup.js';
import { reportError } from './_lib/sentry.js';

const GBP_REVIEW_URL = 'https://g.page/r/CdERSypGqVdlEBM/review';



function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// A phone number match alone is never enough to say two customer records
// are the same person (see: the Mark Hartley / Julie Heal / Timothy
// Pagliarulo merge — a shared phone silently welded 3 unrelated customer
// files together). This adds a name sanity check on top of a phone match.
// Deliberately permissive about missing data (an existing file with no
// name on record, or this submission having no last name, still counts
// as a match) but strict about an actual conflicting name.
function namesLikelyMatch(fnameA, lnameA, fnameB, lnameB) {
  const norm = s => (s || '').trim().toLowerCase();
  const fa = norm(fnameA), fb = norm(fnameB);
  const la = norm(lnameA), lb = norm(lnameB);
  if (!fb && !lb) return true; // existing file has no name on record — don't block on it
  if (fa !== fb) return false; // first name must match when both are present
  if (!la || !lb) return true; // either side missing a last name — inconclusive, allow it
  return la === lb;
}

export async function onRequestPost({ request, env }) {
  // Defense-in-depth: require the Access JWT. Access normally blocks this route
  // entirely, but if the route is ever mis-scoped this prevents open access.
  const accessJwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!accessJwt) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  const brevoKey = env.BREVO_API_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server not configured' }, 500);
  }

  // Shared Brevo sender helper
  async function brevoSend(payload) {
    if (!brevoKey) { throw new Error('BREVO_API_KEY not set on the server — email was not sent.'); }
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('Brevo send failed:', r.status, detail);
      throw new Error(`Brevo rejected the email (${r.status}): ${detail}`);
    }
  }

  const base = `${supabaseUrl}/rest/v1`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // Current AZ TPT rate as a decimal (e.g. 0.09386 for 9.386%) — falls back
  // to the historical Flagstaff rate if the settings row is ever missing.
  async function fetchCurrentTaxRate() {
    try {
      const r = await fetch(`${base}/business_settings?id=eq.default&select=tax_rate`, { headers });
      if (!r.ok) return 0.09386;
      const rows = await r.json();
      return rows?.[0]?.tax_rate != null ? Number(rows[0].tax_rate) : 0.09386;
    } catch {
      return 0.09386;
    }
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { action } = payload;

  try {
    switch (action) {
      case 'list-bookings': {
        const limit = Number(payload.limit) || 2000;
        // Only the columns the job LIST view actually renders (name, vehicle,
        // date, status, amounts, search fields), plus line_items — needed by
        // the Net Profit Breakdown panel (Labor/Parts/Mobile billed). It's
        // small JSON (a handful of line items per job), unlike job_photos /
        // admin_photos / inspection_data, which stay excluded here since
        // those can be large (especially older jobs with legacy base64
        // photos) and are only needed when a specific job is opened, via
        // get-booking.
        const listColumns = [
          'id', 'service', 'date', 'time', 'fname', 'lname', 'phone', 'email',
          'vehicle', 'vin', 'mileage', 'service_address', 'customer_id', 'notes', 'garage_notes', 'status', 'job_status', 'created_at',
          'estimate_amount', 'tax_amount', 'customer_agreed', 'signed_at', 'line_items',
          'invoice_amount', 'stripe_transaction_id', 'stripe_customer_id',
          'stripe_last4', 'paid_at', 'adjustment_amount', 'amount_paid', 'payments',
          'invoice_sent_count', 'invoice_last_sent_at', 'parts_cost', 'parts_receipts',
          'review_left_at', 'date_tbd',
        ].join(',');
        const res = await fetch(
          `${base}/bookings?select=${listColumns}&order=date.desc,time.desc&limit=${limit}`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'get-booking': {
        const { id } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        const res = await fetch(
          `${base}/bookings?id=eq.${encodeURIComponent(id)}&select=*`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(rows[0] ?? null);
      }

      case 'patch-booking': {
        const { id, fields } = payload;
        if (!id || !fields) return json({ error: 'Missing id or fields' }, 400);
        const res = await fetch(
          `${base}/bookings?id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(fields) }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      case 'patch-by-customer': {
        const { customerId, fields } = payload;
        if (!customerId || !fields) return json({ error: 'Missing customerId or fields' }, 400);
        // Same protection as patch-customer's cascade — never bulk-touch an
        // already-signed booking (see the note on patch-customer below).
        const res = await fetch(
          `${base}/bookings?stripe_customer_id=eq.${encodeURIComponent(customerId)}&signed_at=is.null`,
          { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(fields) }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      // ---- Customers (one file per real person — see customers_migration.sql) ----
      // list-customers          {}                          -> Customer[]
      // find-or-create-customer { fname, lname, phone, email } -> { customer, isNew, possibleDuplicates }
      //   Dedupe key: phone digits if present, else lower(fname+lname+email).
      //   Same rule the old ExternalLeadModal previous-customer search used,
      //   kept identical so behavior doesn't silently shift. Never merges a
      //   name-only match onto an existing record with a DIFFERENT phone —
      //   that ambiguous case comes back as `possibleDuplicates` for the
      //   admin to eyeball, and a fresh customer is created instead of
      //   guessing.
      // patch-customer          { id, fields }               -> { ok }
      //   Updates the customer row AND cascades identity fields (fname,
      //   lname, phone, email) to every booking with that customer_id —
      //   this is what actually keeps name/phone/email in sync across a
      //   customer's jobs. vin, vehicle, mileage, and service_address are
      //   per-job values and never cascade — a customer can have multiple
      //   vehicles across different jobs — even though they can still be
      //   passed in `fields` to update just this customer row (e.g. to set
      //   their "last known" vehicle for new-booking prefill).
      case 'list-customers': {
        const res = await fetch(`${base}/customers?select=*&order=lname.asc,fname.asc`, { headers });
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'find-or-create-customer': {
        const { fname, lname, phone, email, vin, vehicle, mileage, service_address } = payload;
        if (!fname) return json({ error: 'Missing fname' }, 400);
        const phoneDigits = (phone || '').replace(/\D/g, '');

        let existing = [];
        let phoneMatchedDifferentName = [];
        if (phoneDigits) {
          const res = await fetch(
            `${base}/customers?select=*&phone=not.is.null`,
            { headers }
          );
          if (!res.ok) return json({ error: await res.text() }, 502);
          const all = await res.json();
          const byPhone = all.filter(c => (c.phone || '').replace(/\D/g, '') === phoneDigits);
          // A shared phone number alone is NOT proof of the same person —
          // landlines, business lines, and placeholder numbers get reused
          // across genuinely different customers. Only auto-merge onto an
          // existing file when the name also reasonably matches (or the
          // existing file has no name on record yet). A phone match with a
          // clearly different name is surfaced as a possible duplicate
          // instead of silently overwriting someone else's customer file —
          // this is what a name/VIN overwrite bug traced back to.
          existing = byPhone.filter(c => namesLikelyMatch(fname, lname, c.fname, c.lname));
          phoneMatchedDifferentName = byPhone.filter(c => !namesLikelyMatch(fname, lname, c.fname, c.lname));
        } else {
          const res = await fetch(
            `${base}/customers?select=*&fname=ilike.${encodeURIComponent(fname)}&lname=ilike.${encodeURIComponent(lname || '')}&email=ilike.${encodeURIComponent(email || '')}`,
            { headers }
          );
          if (!res.ok) return json({ error: await res.text() }, 502);
          existing = await res.json();
        }

        if (existing.length > 0) {
          return json({ customer: existing[0], isNew: false, possibleDuplicates: [] });
        }

        // No safe match by phone+name, or by name+email. Check for
        // collisions so the admin can be warned, but still create a
        // distinct customer rather than guessing.
        let possibleDuplicates = phoneMatchedDifferentName.map(c => ({ id: c.id, fname: c.fname, lname: c.lname, phone: c.phone, email: c.email }));
        if (fname) {
          const res = await fetch(
            `${base}/customers?select=id,fname,lname,phone,email&fname=ilike.${encodeURIComponent(fname)}&lname=ilike.${encodeURIComponent(lname || '')}`,
            { headers }
          );
          if (res.ok) possibleDuplicates = await res.json();
        }

        const insertRes = await fetch(`${base}/customers`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({
            fname, lname: lname || '', phone: phone || null, email: email || null,
            vin: vin || null, vehicle: vehicle || null, mileage: mileage || null,
            service_address: service_address || null,
          }),
        });
        if (!insertRes.ok) return json({ error: await insertRes.text() }, 502);
        const rows = await insertRes.json();
        return json({ customer: Array.isArray(rows) ? rows[0] : rows, isNew: true, possibleDuplicates });
      }

      case 'patch-customer': {
        const { id, fields } = payload;
        if (!id || !fields) return json({ error: 'Missing id or fields' }, 400);
        const patchFields = { ...fields, updated_at: new Date().toISOString() };
        const custRes = await fetch(
          `${base}/customers?id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(patchFields) }
        );
        if (!custRes.ok) return json({ error: await custRes.text() }, 502);

        // Cascade the same customer-identity fields to every booking under
        // this customer, so name/phone/email stay in sync across all their
        // jobs. vin, vehicle, mileage, and service_address are deliberately
        // excluded — all four are per-visit values (a customer can bring
        // different vehicles to different jobs), not customer identity, so
        // they must never cascade.
        const cascadeFields = {};
        for (const k of ['fname', 'lname', 'phone', 'email']) {
          if (k in fields) cascadeFields[k] = fields[k];
        }
        // Never cascade onto a booking that's already been signed — that's
        // a completed, e-signed (and often paid) record, and silently
        // rewriting the customer's name/phone/email on it after the fact
        // would alter a signed audit trail. Also avoids bulk-PATCHing a
        // completed/paid row alongside active ones in the same statement.
        if (Object.keys(cascadeFields).length > 0) {
          const bookingRes = await fetch(
            `${base}/bookings?customer_id=eq.${encodeURIComponent(id)}&signed_at=is.null`,
            { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(cascadeFields) }
          );
          if (!bookingRes.ok) return json({ error: await bookingRes.text() }, 502);
        }
        return json({ ok: true });
      }

      case 'merge-customers': {
        const { keepId, mergeId } = payload;
        if (!keepId || !mergeId) return json({ error: 'Missing keepId or mergeId' }, 400);
        if (keepId === mergeId) return json({ error: 'Cannot merge a customer into itself' }, 400);

        const bothRes = await fetch(
          `${base}/customers?id=in.(${encodeURIComponent(keepId)},${encodeURIComponent(mergeId)})&select=*`,
          { headers }
        );
        if (!bothRes.ok) return json({ error: await bothRes.text() }, 502);
        const both = await bothRes.json();
        const keep = both.find((c) => c.id === keepId);
        const merge = both.find((c) => c.id === mergeId);
        if (!keep || !merge) return json({ error: 'One or both customers not found' }, 404);

        // Reassign every booking under the merged-away customer to the
        // keeper FIRST. This must happen before the delete below — deleting
        // the customer row first would leave those bookings pointing at a
        // customer_id that no longer exists.
        const jobsRes = await fetch(
          `${base}/bookings?customer_id=eq.${encodeURIComponent(mergeId)}&select=id`,
          { headers }
        );
        if (!jobsRes.ok) return json({ error: await jobsRes.text() }, 502);
        const movedJobs = await jobsRes.json();

        if (movedJobs.length > 0) {
          // Only customer_id changes here — never fname/lname/phone/email,
          // which is the exact cascade that caused the earlier bug. A job's
          // own identity fields are untouched; it just now belongs to a
          // different (correct) customer file.
          const reassignRes = await fetch(
            `${base}/bookings?customer_id=eq.${encodeURIComponent(mergeId)}`,
            { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ customer_id: keepId }) }
          );
          if (!reassignRes.ok) return json({ error: await reassignRes.text() }, 502);
        }

        // Fill any blanks on the keeper from the record being merged away —
        // never overwrite a value the keeper already has.
        const fillFields = {};
        for (const k of ['fname', 'lname', 'phone', 'email', 'vin', 'vehicle', 'mileage', 'service_address']) {
          if (!keep[k] && merge[k]) fillFields[k] = merge[k];
        }
        if (Object.keys(fillFields).length > 0) {
          const fillRes = await fetch(
            `${base}/customers?id=eq.${encodeURIComponent(keepId)}`,
            { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ ...fillFields, updated_at: new Date().toISOString() }) }
          );
          if (!fillRes.ok) return json({ error: await fillRes.text() }, 502);
        }

        // Only delete the merged-away customer once its bookings are safely
        // repointed and any useful fields have been copied over.
        const deleteRes = await fetch(
          `${base}/customers?id=eq.${encodeURIComponent(mergeId)}`,
          { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
        );
        if (!deleteRes.ok) return json({ error: await deleteRes.text() }, 502);

        return json({ ok: true, movedJobs: movedJobs.length });
      }

      // ---- Safe merge: snapshot-before-merge, and its undo --------------
      // merge-customers-safe   { keepId, mergeId }  -> { ok, movedJobs, snapshotKey }
      //   Does exactly what merge-customers does (reassign bookings, fill
      //   blanks on the keeper, delete the loser) but first writes a
      //   snapshot of everything about to change to the same R2 bucket the
      //   daily backup uses, under merge-snapshots/. The returned
      //   snapshotKey is what undo-merge needs to reverse it.
      // undo-merge             { snapshotKey }      -> { ok, restoredJobs }
      //   Re-inserts the deleted customer row exactly as it was, restores
      //   customer_id on every job that moved, and restores any keeper
      //   fields the merge had filled in — to their pre-merge value (blank
      //   or whatever they held before). Only works while the snapshot
      //   still exists (30-day retention, same as backups) and only if the
      //   keeper id wasn't itself deleted since (e.g. by a later merge).
      case 'merge-customers-safe': {
        const { keepId, mergeId } = payload;
        if (!keepId || !mergeId) return json({ error: 'Missing keepId or mergeId' }, 400);
        if (keepId === mergeId) return json({ error: 'Cannot merge a customer into itself' }, 400);

        const bucket = env.GID_PHOTOS;
        if (!bucket) return json({ error: 'R2 bucket GID_PHOTOS not bound — cannot snapshot, refusing to merge without one' }, 500);

        const bothRes = await fetch(
          `${base}/customers?id=in.(${encodeURIComponent(keepId)},${encodeURIComponent(mergeId)})&select=*`,
          { headers }
        );
        if (!bothRes.ok) return json({ error: await bothRes.text() }, 502);
        const both = await bothRes.json();
        const keep = both.find((c) => c.id === keepId);
        const merge = both.find((c) => c.id === mergeId);
        if (!keep || !merge) return json({ error: 'One or both customers not found' }, 404);

        const jobsRes = await fetch(
          `${base}/bookings?customer_id=eq.${encodeURIComponent(mergeId)}&select=*`,
          { headers }
        );
        if (!jobsRes.ok) return json({ error: await jobsRes.text() }, 502);
        const movedJobs = await jobsRes.json(); // full rows — this is the undo's source of truth for customer_id

        // Same fill-only rule as merge-customers: never overwrite a value
        // the keeper already has.
        const fillFields = {};
        for (const k of ['fname', 'lname', 'phone', 'email', 'vin', 'vehicle', 'mileage', 'service_address']) {
          if (!keep[k] && merge[k]) fillFields[k] = merge[k];
        }

        // Snapshot BEFORE any write — this is what makes the merge reversible.
        const now = new Date();
        const snapshotKey = `merge-snapshots/${now.toISOString().slice(0, 10)}-${now.getTime()}-${mergeId}.json`;
        const snapshot = {
          mergedAt: now.toISOString(),
          keepId, mergeId,
          keepBefore: keep,       // full keeper row, pre-merge — undoes fillFields
          mergeCustomer: merge,   // full deleted row — undo re-inserts this exact row
          movedJobs,               // full booking rows, pre-merge — undo restores customer_id
        };
        await bucket.put(snapshotKey, JSON.stringify(snapshot), { httpMetadata: { contentType: 'application/json' } });

        if (movedJobs.length > 0) {
          const reassignRes = await fetch(
            `${base}/bookings?customer_id=eq.${encodeURIComponent(mergeId)}`,
            { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ customer_id: keepId }) }
          );
          if (!reassignRes.ok) return json({ error: await reassignRes.text() }, 502);
        }

        if (Object.keys(fillFields).length > 0) {
          const fillRes = await fetch(
            `${base}/customers?id=eq.${encodeURIComponent(keepId)}`,
            { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ ...fillFields, updated_at: now.toISOString() }) }
          );
          if (!fillRes.ok) return json({ error: await fillRes.text() }, 502);
        }

        const deleteRes = await fetch(
          `${base}/customers?id=eq.${encodeURIComponent(mergeId)}`,
          { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
        );
        if (!deleteRes.ok) return json({ error: await deleteRes.text() }, 502);

        return json({ ok: true, movedJobs: movedJobs.length, snapshotKey });
      }

      // list-merge-snapshots {} -> { snapshotKey, mergedAt, keptName, mergedName, jobCount }[]
      // Read-only. Lists recent merge snapshots straight from R2 so Undo
      // works from ANY browser/session, not just the one that did the
      // merge (the in-page "this session" list is just a shortcut on top
      // of this — closing the modal never loses the ability to undo, only
      // the 30-day snapshot retention does).
      case 'list-merge-snapshots': {
        const bucket = env.GID_PHOTOS;
        if (!bucket) return json({ error: 'R2 bucket GID_PHOTOS not bound' }, 500);
        const listed = await bucket.list({ prefix: 'merge-snapshots/' });
        const sorted = listed.objects.sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime()).slice(0, 20);
        const out = [];
        for (const obj of sorted) {
          try {
            const file = await bucket.get(obj.key);
            if (!file) continue;
            const snap = JSON.parse(await file.text());
            out.push({
              snapshotKey: obj.key,
              mergedAt: snap.mergedAt,
              keptName: `${snap.keepBefore?.fname ?? ''} ${snap.keepBefore?.lname ?? ''}`.trim(),
              mergedName: `${snap.mergeCustomer?.fname ?? ''} ${snap.mergeCustomer?.lname ?? ''}`.trim(),
              jobCount: Array.isArray(snap.movedJobs) ? snap.movedJobs.length : 0,
            });
          } catch { /* skip an unreadable snapshot rather than fail the whole list */ }
        }
        return json(out);
      }

      case 'undo-merge': {
        const { snapshotKey } = payload;
        if (!snapshotKey) return json({ error: 'Missing snapshotKey' }, 400);
        const bucket = env.GID_PHOTOS;
        if (!bucket) return json({ error: 'R2 bucket GID_PHOTOS not bound' }, 500);

        const obj = await bucket.get(snapshotKey);
        if (!obj) return json({ error: 'Snapshot not found — it may have expired (30-day retention) or already been used.' }, 404);
        const snap = JSON.parse(await obj.text());

        // Re-insert the deleted customer row exactly as it was. If a row
        // with this id somehow already exists (e.g. undo run twice), upsert
        // rather than fail.
        const insertRes = await fetch(`${base}/customers`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(snap.mergeCustomer),
        });
        if (!insertRes.ok) return json({ error: `Could not restore the deleted customer file: ${await insertRes.text()}` }, 502);

        // Put every moved job's customer_id back, one at a time (not a bulk
        // filter) since each job needs its own id, not a shared condition.
        let restoredJobs = 0;
        for (const j of snap.movedJobs) {
          const r = await fetch(`${base}/bookings?id=eq.${encodeURIComponent(j.id)}`, {
            method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({ customer_id: snap.mergeId }),
          });
          if (r.ok) restoredJobs++;
        }

        // Restore the keeper's fields to their pre-merge values (this
        // undoes fillFields — a blank goes back to blank, not "null"
        // forced onto something the customer may have since typed in for
        // real, so only revert fields still equal to what the merge set).
        const keepFieldsToRestore = {};
        for (const k of ['fname', 'lname', 'phone', 'email', 'vin', 'vehicle', 'mileage', 'service_address']) {
          if (snap.keepBefore[k] !== undefined) keepFieldsToRestore[k] = snap.keepBefore[k];
        }
        if (Object.keys(keepFieldsToRestore).length > 0) {
          await fetch(`${base}/customers?id=eq.${encodeURIComponent(snap.keepId)}`, {
            method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({ ...keepFieldsToRestore, updated_at: new Date().toISOString() }),
          });
        }

        // Snapshot is single-use — delete it so a stale undo can't be
        // replayed later against a keeper that has since changed again.
        try { await bucket.delete(snapshotKey); } catch { /* best-effort */ }

        return json({ ok: true, restoredJobs });
      }

      case 'list-payment-events': {
        const limit = Number(payload.limit) || 20;
        const res = await fetch(
          `${base}/payment_events?select=*&order=created_at.desc&limit=${limit}`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'write-payment-event': {
        const { booking_id, event_type, amount, error_message } = payload;
        if (!booking_id || !event_type) return json({ error: 'Missing fields' }, 400);
        const res = await fetch(`${base}/payment_events`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            booking_id,
            event_type,
            amount: amount ?? null,
            error_message: error_message ?? null,
          }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      // ---- Blackout dates (days unavailable for booking — W2 shifts, vacation) ----
      case 'list-blackout-dates': {
        const res = await fetch(
          `${base}/blackout_dates?select=*&order=date.asc`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'add-blackout-date': {
        const { date, reason } = payload;
        if (!date) return json({ error: 'Missing date' }, 400);
        const res = await fetch(`${base}/blackout_dates`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation,resolution=merge-duplicates' },
          body: JSON.stringify({ date, reason: reason || null }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(Array.isArray(rows) ? rows[0] : rows);
      }

      case 'remove-blackout-date': {
        const { date } = payload;
        if (!date) return json({ error: 'Missing date' }, 400);
        const res = await fetch(
          `${base}/blackout_dates?date=eq.${encodeURIComponent(date)}`,
          { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      // ---- Admin manual booking insert (returns the inserted row) ----------
      case 'insert-booking': {
        const { row } = payload;
        if (!row) return json({ error: 'Missing row' }, 400);
        const res = await fetch(`${base}/bookings`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify(row),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(Array.isArray(rows) ? rows[0] : rows);
      }

      // ---- Pre-Purchase Inspections (PrePI) — own table, own lifecycle ------
      // Deliberately separate from `bookings` so a PPI never has to become a
      // job and can't collide with revenue/job-status accounting.
      case 'list-ppi': {
        const { status } = payload;
        const filter = status ? `&status=eq.${encodeURIComponent(status)}` : '';
        const res = await fetch(
          `${base}/ppi_inspections?select=*&order=updated_at.desc${filter}`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'get-ppi': {
        const { id } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        const res = await fetch(
          `${base}/ppi_inspections?id=eq.${encodeURIComponent(id)}&select=*`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(rows[0] ?? null);
      }

      case 'insert-ppi': {
        const { row } = payload;
        if (!row) return json({ error: 'Missing row' }, 400);
        const res = await fetch(`${base}/ppi_inspections`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ created_at: new Date().toISOString(), ...row }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(Array.isArray(rows) ? rows[0] : rows);
      }

      case 'patch-ppi': {
        const { id, fields } = payload;
        if (!id || !fields) return json({ error: 'Missing id or fields' }, 400);
        const res = await fetch(
          `${base}/ppi_inspections?id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(fields) }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      // ---- Mileage log — business drive-time tracking for the IRS deduction -
      // Own table (`mileage_logs`), independent of bookings so it also covers
      // non-job driving (parts runs, bank trips, etc). One row per trip.
      // Lightweight — just the job_ids that already have a mileage entry, for
      // the Jobs list badge. Avoids pulling full mileage rows for every job.
      case 'list-mileage-job-ids': {
        const res = await fetch(
          `${base}/mileage_logs?select=job_id&job_id=not.is.null`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(rows.map((r) => r.job_id));
      }

      case 'list-mileage': {
        const { year, job_id } = payload;
        let filter = year ? `&date=gte.${year}-01-01&date=lte.${year}-12-31` : '';
        if (job_id) filter += `&job_id=eq.${encodeURIComponent(job_id)}`;
        const res = await fetch(
          `${base}/mileage_logs?select=*&order=date.desc${filter}`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      // One mileage entry per job — internal only, never surfaced to the
      // customer. Looks up any existing row for this job_id and patches it,
      // otherwise inserts a new one.
      case 'upsert-job-mileage': {
        const { job_id, fields } = payload;
        if (!job_id || !fields) return json({ error: 'Missing job_id or fields' }, 400);
        const existingRes = await fetch(
          `${base}/mileage_logs?job_id=eq.${encodeURIComponent(job_id)}&select=id&limit=1`,
          { headers }
        );
        if (!existingRes.ok) return json({ error: await existingRes.text() }, 502);
        const existing = await existingRes.json();
        if (existing[0]) {
          const res = await fetch(
            `${base}/mileage_logs?id=eq.${encodeURIComponent(existing[0].id)}`,
            { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(fields) }
          );
          if (!res.ok) return json({ error: await res.text() }, 502);
          const rows = await res.json();
          return json(Array.isArray(rows) ? rows[0] : rows);
        } else {
          const res = await fetch(`${base}/mileage_logs`, {
            method: 'POST',
            headers: { ...headers, Prefer: 'return=representation' },
            body: JSON.stringify({ created_at: new Date().toISOString(), job_id, ...fields }),
          });
          if (!res.ok) return json({ error: await res.text() }, 502);
          const rows = await res.json();
          return json(Array.isArray(rows) ? rows[0] : rows);
        }
      }

      case 'add-mileage': {
        const { row } = payload;
        if (!row || !row.date || row.miles == null) return json({ error: 'Missing date or miles' }, 400);
        const res = await fetch(`${base}/mileage_logs`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ created_at: new Date().toISOString(), ...row }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(Array.isArray(rows) ? rows[0] : rows);
      }

      case 'patch-mileage': {
        const { id, fields } = payload;
        if (!id || !fields) return json({ error: 'Missing id or fields' }, 400);
        const res = await fetch(
          `${base}/mileage_logs?id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(fields) }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      case 'delete-mileage': {
        const { id } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        const res = await fetch(
          `${base}/mileage_logs?id=eq.${encodeURIComponent(id)}`,
          { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      case 'send-ppi': {
        const { record, toEmail } = payload;
        if (!record || !toEmail) return json({ error: 'Missing record or toEmail' }, 400);
        const ppiUrl = `https://gidgarage.com/ppi?id=${record.id}`;
        await brevoSend({
          sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
          to: [{ email: toEmail, name: `${record.fname || ''} ${record.lname || ''}`.trim() }],
          subject: `Pre-Purchase Inspection — ${record.vehicle || 'Vehicle'} — GID Garage`,
          htmlContent: `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;background:#0f0f0f;color:#fff;">
            <div style="background:#111827;border-bottom:3px solid #2563eb;">
              <img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;"/>
            </div>
            <div style="padding:32px;">
              <h2 style="color:#fff;font-size:24px;font-weight:900;margin:0 0 6px;letter-spacing:-0.5px;">Pre-Purchase Inspection</h2>
              <p style="color:#6b7280;font-size:14px;margin:0 0 28px;">Hi ${record.fname || ''} — here's the inspection report for ${record.vehicle || 'the vehicle'}.</p>
              <div style="background:#1f2937;border:1px solid #374151;border-left:4px solid #2563eb;padding:16px 20px;margin-bottom:28px;">
                <table style="width:100%;border-collapse:collapse;">
                  ${record.vin ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">VIN</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;font-family:monospace;">${record.vin}</td></tr>` : ''}
                  ${record.vehicle ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Vehicle</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${record.vehicle}</td></tr>` : ''}
                </table>
              </div>
              <p style="margin:28px 0 8px;text-align:center;">
                <a href="${ppiUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:16px 36px;letter-spacing:0.08em;text-transform:uppercase;">View Inspection →</a>
              </p>
            </div>
            <div style="background:#111827;padding:20px 32px;border-top:1px solid #1f2937;">
              <p style="color:#4b5563;font-size:11px;margin:0;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> or reply to this email.</p>
              <p style="color:#374151;font-size:11px;margin:4px 0 0;">GID Garage · Mobile Auto Repair &amp; Car Audio · Flagstaff, AZ</p>
            </div>
          </div>`,
        });
        return json({ ok: true });
      }

      // ---- Paid bookings (tax/revenue summary) -----------------------------
      // ---- AZ TPT tax rate (editable, applies going forward only) ----------
      // ---- Home base address (for auto-calculating job trip mileage) ------
      case 'get-home-address': {
        const res = await fetch(
          `${base}/business_settings?id=eq.default&select=home_address`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json({ homeAddress: rows?.[0]?.home_address || '' });
      }

      case 'set-home-address': {
        const { homeAddress } = payload;
        if (typeof homeAddress !== 'string') return json({ error: 'Invalid homeAddress' }, 400);
        const res = await fetch(`${base}/business_settings`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ id: 'default', home_address: homeAddress, updated_at: new Date().toISOString() }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true, homeAddress });
      }

      // ---- Driving distance between two addresses (Google Distance Matrix) -
      // Reuses GOOGLE_PLACES_API_KEY — the "Distance Matrix API" must also be
      // enabled for that key in Google Cloud Console (Places API alone isn't
      // enough). Returns one-way driving miles; caller doubles for round trip.
      case 'calc-distance': {
        const { origin, destination } = payload;
        if (!origin || !destination) return json({ error: 'Missing origin or destination' }, 400);
        // Separate key from GOOGLE_PLACES_API_KEY on purpose — that key powers
        // the review-request feature and shouldn't be touched. Falls back to
        // it only if a distance-specific key was never configured.
        const apiKey = env.GOOGLE_DISTANCE_API_KEY || env.GOOGLE_PLACES_API_KEY;
        if (!apiKey) return json({ error: 'GOOGLE_DISTANCE_API_KEY not configured' }, 500);
        console.log('calc-distance: starting lookup', origin, '->', destination);
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${apiKey}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        let res;
        try {
          res = await fetch(url, { signal: controller.signal });
          console.log('calc-distance: got response', res.status);
        } catch (fetchErr) {
          console.log('calc-distance: fetch threw', String(fetchErr));
          return json({ error: `Distance lookup timed out or failed to reach Google: ${fetchErr.message}` }, 502);
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) {
          const bodyText = await res.text();
          console.log('calc-distance: non-ok body', bodyText.slice(0, 300));
          return json({ error: `Google returned ${res.status}: ${bodyText}` }, 502);
        }
        const data = await res.json();
        const el = data?.rows?.[0]?.elements?.[0];
        if (data.status !== 'OK' || !el || el.status !== 'OK') {
          console.log('calc-distance: bad status', data.status, el?.status);
          return json({ error: `Distance lookup failed: ${el?.status || data.status || 'unknown error'}` }, 502);
        }
        const miles = el.distance.value / 1609.344; // meters -> miles
        console.log('calc-distance: success', miles);
        return json({ miles: Math.round(miles * 10) / 10 });
      }

      case 'get-tax-rate': {
        const res = await fetch(
          `${base}/business_settings?id=eq.default&select=tax_rate`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        const taxRate = rows?.[0]?.tax_rate != null ? Number(rows[0].tax_rate) : 0.09386;
        return json({ taxRate });
      }

      case 'set-tax-rate': {
        const { taxRate } = payload;
        if (typeof taxRate !== 'number' || !(taxRate >= 0) || taxRate > 1) {
          return json({ error: 'Invalid tax rate — expected a decimal like 0.09386 for 9.386%' }, 400);
        }
        const res = await fetch(`${base}/business_settings`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ id: 'default', tax_rate: taxRate, updated_at: new Date().toISOString() }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true, taxRate });
      }

      // ---- Owner pay settings — the inputs the biweekly draw calculator
      // can't get from job data alone: itemized monthly overhead (insurance,
      // subscriptions, licensing — anything not already captured as a job's
      // parts_cost), an estimated Stripe fee %, a tax-reserve percentage,
      // and an anchor date used to compute the "every 2nd Tuesday" cadence.
      case 'get-owner-pay-settings': {
        const res = await fetch(
          `${base}/business_settings?id=eq.default&select=owner_tax_reserve_pct,owner_pay_anchor_date,owner_overhead_items,owner_stripe_fee_pct`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        const row = rows?.[0] || {};
        return json({
          taxReservePct: row.owner_tax_reserve_pct != null ? Number(row.owner_tax_reserve_pct) : 0.3,
          payAnchorDate: row.owner_pay_anchor_date || null,
          overheadItems: Array.isArray(row.owner_overhead_items) ? row.owner_overhead_items : [],
          stripeFeePct: row.owner_stripe_fee_pct != null ? Number(row.owner_stripe_fee_pct) : 0.02928,
        });
      }

      case 'set-owner-pay-settings': {
        const { taxReservePct, payAnchorDate, overheadItems, stripeFeePct } = payload;
        if (typeof taxReservePct !== 'number' || !(taxReservePct >= 0) || taxReservePct > 1) {
          return json({ error: 'Invalid taxReservePct — expected a decimal like 0.3 for 30%' }, 400);
        }
        if (payAnchorDate != null && typeof payAnchorDate !== 'string') {
          return json({ error: 'Invalid payAnchorDate' }, 400);
        }
        if (!Array.isArray(overheadItems) || overheadItems.some(i => typeof i.name !== 'string' || typeof i.amount !== 'number')) {
          return json({ error: 'Invalid overheadItems — expected [{ id, name, amount }]' }, 400);
        }
        if (typeof stripeFeePct !== 'number' || !(stripeFeePct >= 0) || stripeFeePct > 1) {
          return json({ error: 'Invalid stripeFeePct — expected a decimal like 0.0285 for 2.85%' }, 400);
        }
        const res = await fetch(`${base}/business_settings`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            id: 'default',
            owner_tax_reserve_pct: taxReservePct,
            owner_pay_anchor_date: payAnchorDate || null,
            owner_overhead_items: overheadItems,
            owner_stripe_fee_pct: stripeFeePct,
            updated_at: new Date().toISOString(),
          }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true, taxReservePct, payAnchorDate, overheadItems, stripeFeePct });
      }

      case 'paid-bookings': {
        const res = await fetch(
          `${base}/bookings?job_status=eq.PAID&select=*&order=paid_at.desc`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      // ---- Recovery / backups (Hub → Recovery) ------------------------------
      case 'run-backup': {
        const status = await runBackup(env);
        return json(status);
      }
      case 'backup-status': {
        const status = await readBackupStatus(env);
        return json(status);
      }
      case 'list-backups': {
        const list = await listBackups(env);
        return json(list);
      }
      case 'restore-backup': {
        const { key, mode, confirm } = payload;
        if (!key) return json({ error: 'Missing key' }, 400);
        if (confirm !== true) return json({ error: 'Missing confirmation' }, 400);
        const result = await restoreBackup(env, key, mode === 'replace' ? 'replace' : 'merge');
        return json(result);
      }
      // inspect-backup-bookings { key, bookingIds: string[] } -> Booking[]
      //   READ-ONLY — pulls specific booking rows out of an old backup
      //   snapshot without touching the live database. For data-recovery
      //   investigations (e.g. checking what a booking looked like before
      //   a bad edit overwrote it), so you can see the old values before
      //   deciding whether/how to fix the live rows.
      case 'inspect-backup-bookings': {
        const { key, bookingIds } = payload;
        if (!key) return json({ error: 'Missing key' }, 400);
        if (!Array.isArray(bookingIds) || bookingIds.length === 0) return json({ error: 'Missing bookingIds' }, 400);
        const rows = await inspectBackupBookings(env, key, bookingIds);
        return json(rows);
      }

      // ---- Business Hub notes (admin-only) ---------------------------------
      // ---- Owner's Equity ledger (Hub → Banking & Credit) -------------------
      // Requires a Supabase table `equity_entries`:
      //   id uuid primary key default gen_random_uuid(),
      //   entry_type text not null check (entry_type in ('contribution','draw')),
      //   amount numeric not null,
      //   note text,
      //   entry_date date not null,
      //   created_at timestamptz not null default now()
      case 'list-equity-entries': {
        const res = await fetch(
          `${base}/equity_entries?select=*&order=entry_date.asc,created_at.asc`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'add-equity-entry': {
        const { entryType, amount, note, entryDate } = payload;
        if (entryType !== 'contribution' && entryType !== 'draw') {
          return json({ error: 'entryType must be "contribution" or "draw"' }, 400);
        }
        if (typeof amount !== 'number' || !(amount > 0)) {
          return json({ error: 'amount must be a positive number' }, 400);
        }
        if (!entryDate) return json({ error: 'Missing entryDate' }, 400);
        const res = await fetch(`${base}/equity_entries`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ entry_type: entryType, amount, note: note ?? '', entry_date: entryDate }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(Array.isArray(rows) ? rows[0] : rows);
      }

      case 'patch-equity-entry': {
        const { id, entryType, amount, note, entryDate } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        if (entryType !== 'contribution' && entryType !== 'draw') {
          return json({ error: 'entryType must be "contribution" or "draw"' }, 400);
        }
        if (typeof amount !== 'number' || !(amount > 0)) {
          return json({ error: 'amount must be a positive number' }, 400);
        }
        if (!entryDate) return json({ error: 'Missing entryDate' }, 400);
        const res = await fetch(
          `${base}/equity_entries?id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=representation' },
            body: JSON.stringify({ entry_type: entryType, amount, note: note ?? '', entry_date: entryDate }),
          }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(Array.isArray(rows) ? rows[0] : rows);
      }

      case 'delete-equity-entry': {
        const { id } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        const res = await fetch(
          `${base}/equity_entries?id=eq.${encodeURIComponent(id)}`,
          { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      case 'list-notes': {
        const { categoryId } = payload;
        if (!categoryId) return json({ error: 'Missing categoryId' }, 400);
        const res = await fetch(
          `${base}/hub_notes?category_id=eq.${encodeURIComponent(categoryId)}&order=created_at.asc`,
          { headers }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'add-note': {
        const { id, categoryId, content } = payload;
        if (!id || !categoryId) return json({ error: 'Missing fields' }, 400);
        const res = await fetch(`${base}/hub_notes`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ id, category_id: categoryId, content: content ?? '' }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(Array.isArray(rows) ? rows[0] : rows);
      }

      case 'update-note': {
        const { id, content } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        const res = await fetch(
          `${base}/hub_notes?id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ content: content ?? '' }) }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      case 'delete-note': {
        const { id } = payload;
        if (!id) return json({ error: 'Missing id' }, 400);
        const res = await fetch(
          `${base}/hub_notes?id=eq.${encodeURIComponent(id)}`,
          { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      case 'clear-notes': {
        const res = await fetch(
          `${base}/hub_notes?id=neq.placeholder`,
          { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
        );
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      // ---- Send estimate email (admin-triggered) -------------------------
      case 'send-estimate': {
        const { job, shopAvg } = payload;
        if (!job) return json({ error: 'Missing job' }, 400);
        const savings = shopAvg > 0 ? shopAvg - (job.estimateAmount || 0) : 0;
        const estTaxPct = ((await fetchCurrentTaxRate()) * 100).toFixed(3);
        // Shop comparison block — moved to bottom, shows "They'd charge ~$X / You save $Y"
        const savingsHtml = savings > 10 ? `
          <table style="width:100%;background:#052e16;border:1px solid #166534;border-collapse:collapse;margin-bottom:0;"><tr><td style="padding:16px 20px;">
            <p style="color:#86efac;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 10px;">vs. Flagstaff Shops</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="color:#6b7280;font-size:12px;padding:3px 0;">They'd charge ~</td>
                <td style="color:#9ca3af;font-size:13px;font-weight:700;text-align:right;padding:3px 0;">$${Number(shopAvg).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="color:#6b7280;font-size:12px;padding:3px 0;">GID Garage</td>
                <td style="color:#fff;font-size:13px;font-weight:700;text-align:right;padding:3px 0;">$${(Number(job.estimateAmount||0)+Number(job.taxAmount||0)).toFixed(2)}</td>
              </tr>
              <tr>
                <td colspan="2" style="color:#86efac;font-size:11px;font-weight:700;padding:6px 0 2px;">and we come to you!</td>
              </tr>
              <tr style="border-top:1px solid #166534;">
                <td style="color:#4ade80;font-size:13px;font-weight:900;padding-top:8px;">You Save!</td>
                <td style="color:#4ade80;font-size:22px;font-weight:900;text-align:right;padding-top:8px;">$${savings.toFixed(2)}</td>
              </tr>
            </table>
          </td></tr></table>` : '';
        const lineItemsHtml = job.lineItems?.length
          ? job.lineItems.map(i => `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${i.label}</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;white-space:nowrap;">${i.amount === 0 ? 'FREE' : (i.amount < 0 ? '-$' + Math.abs(Number(i.amount)).toFixed(2) : '$' + Number(i.amount).toFixed(2))}</td></tr>`).join('')
          : `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${job.service}</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;">$${Number(job.estimateAmount || 0).toFixed(2)}</td></tr>`;
        const estimateUrl = `https://gidgarage.com/estimate?id=${job.id}`;
        await brevoSend({
          sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
          to: [{ email: job.email, name: `${job.fname} ${job.lname}` }],
          subject: `Your GID Garage Estimate — ${job.vehicle}`,
          htmlContent: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:0;overflow:hidden;"><img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;"/><div style="padding:28px 32px 32px;"><h2 style="color:#fff;font-size:22px;margin:0 0 8px;">Your Estimate is Ready</h2><p style="color:#9ca3af;margin:0 0 20px;">Hi ${job.fname}, here's your quote for the upcoming appointment.</p><table style="width:100%;border-collapse:collapse;margin-bottom:8px;">${lineItemsHtml}</table><table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <tr style="border-top:2px solid #374151;"><td style="padding:12px 0 4px;color:#9ca3af;font-size:13px;">Subtotal</td><td style="padding:12px 0 4px;color:#fff;font-size:13px;text-align:right;">$${Number(job.estimateAmount||0).toFixed(2)}</td></tr>
              <tr><td style="padding:4px 0;color:#9ca3af;font-size:13px;">AZ TPT (${estTaxPct}%)</td><td style="padding:4px 0;color:#fff;font-size:13px;text-align:right;">$${Number(job.taxAmount||0).toFixed(2)}</td></tr>
              <tr style="background:#111827;"><td style="padding:10px 0 10px 0;color:#fff;font-size:14px;font-weight:700;border-top:1px solid #374151;">Total</td><td style="padding:10px 0;color:#fff;font-size:15px;font-weight:900;text-align:right;border-top:1px solid #374151;">$${(Number(job.estimateAmount||0)+Number(job.taxAmount||0)).toFixed(2)}</td></tr>
            </table><p style="margin:20px 0;"><a href="${estimateUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:bold;font-size:13px;padding:14px 28px;letter-spacing:0.05em;text-transform:uppercase;">REVIEW &amp; APPROVE ESTIMATE →</a></p>${savingsHtml}<p style="color:#4b5563;font-size:11px;margin-top:24px;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> — GID Garage, Flagstaff AZ</p></div></div>`,
        });
        return json({ ok: true });
      }

      // ---- Send invoice email (admin-triggered) ---------------------------
      case 'send-invoice': {
        const { job } = payload;
        if (!job) return json({ error: 'Missing job' }, 400);
        // action=pay is what tells InvoicePage to render the self-pay card-entry
        // form. Without it, "PAY INVOICE →" lands on a read-only invoice — the
        // exact bug this was missing before.
        const invoiceUrl = `https://gidgarage.com/invoice?id=${job.id}&action=pay`;
        const subtotalInv = job.lineItems?.reduce((s, i) => s + Number(i.amount || 0), 0) || Number(job.estimateAmount || 0);
        const currentRateForInvoice = await fetchCurrentTaxRate();
        const taxInv = job.taxAmount ? Number(job.taxAmount) : Math.round(subtotalInv * currentRateForInvoice * 100) / 100;
        const totalInv = subtotalInv + taxInv;
        const taxPctInv = (currentRateForInvoice * 100).toFixed(3);
        const lineItemsHtml = job.lineItems?.length
          ? job.lineItems.map(i => `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${i.label}</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;font-family:monospace;white-space:nowrap;">${i.amount === 0 ? 'FREE' : (i.amount < 0 ? '-$' + Math.abs(Number(i.amount)).toFixed(2) : '$' + Number(i.amount).toFixed(2))}</td></tr>`).join('')
          : '';
        const serviceDateInv = job.date ? new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
        await brevoSend({
          sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
          to: [{ email: job.email, name: `${job.fname} ${job.lname}` }],
          subject: `Invoice — ${job.vehicle || 'Your Vehicle'} — GID Garage`,
          htmlContent: `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;background:#0f0f0f;color:#fff;">
            <div style="background:#111827;border-bottom:3px solid #dc2626;">
              <img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;"/>
            </div>
            <div style="padding:32px;">
              <h2 style="color:#fff;font-size:24px;font-weight:900;margin:0 0 6px;letter-spacing:-0.5px;">Invoice Ready for Review</h2>
              <p style="color:#6b7280;font-size:14px;margin:0 0 28px;">Hi ${job.fname} — your service has been completed. Please review and pay your invoice below.</p>

              <div style="background:#1f2937;border:1px solid #374151;border-left:4px solid #dc2626;padding:16px 20px;margin-bottom:28px;">
                <table style="width:100%;border-collapse:collapse;">
                  ${job.vehicle ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Vehicle</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.vehicle}</td></tr>` : ''}
                  ${serviceDateInv ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Service Date</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${serviceDateInv}</td></tr>` : ''}
                  ${job.service ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Service</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.serviceIcon || ''} ${job.service.charAt(0).toUpperCase() + job.service.slice(1)}</td></tr>` : ''}
                  ${job.serviceAddress ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Location</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.serviceAddress}</td></tr>` : ''}
                </table>
              </div>

              <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
                <tr><td colspan="2" style="padding:0 0 8px;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #374151;">Services &amp; Parts</td></tr>
                ${lineItemsHtml}
                <tr><td style="padding:10px 0 6px;color:#9ca3af;font-size:13px;">Subtotal</td><td style="padding:10px 0 6px;color:#fff;font-size:13px;text-align:right;font-family:monospace;">$${subtotalInv.toFixed(2)}</td></tr>
                <tr><td style="padding:4px 0;color:#9ca3af;font-size:13px;">AZ TPT (${taxPctInv}%)</td><td style="padding:4px 0;color:#fff;font-size:13px;text-align:right;font-family:monospace;">$${taxInv.toFixed(2)}</td></tr>
                <tr style="border-top:2px solid #374151;"><td style="padding:14px 0 0;color:#fff;font-size:16px;font-weight:900;">Total Due</td><td style="padding:14px 0 0;color:#dc2626;font-size:22px;font-weight:900;text-align:right;font-family:monospace;">$${totalInv.toFixed(2)}</td></tr>
              </table>

              <p style="margin:28px 0 8px;text-align:center;">
                <a href="${invoiceUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:16px 36px;letter-spacing:0.08em;text-transform:uppercase;">PAY INVOICE →</a>
              </p>
              <p style="color:#4b5563;font-size:11px;text-align:center;margin:12px 0 0;">Secure payment powered by Stripe</p>
            </div>
            <div style="background:#111827;padding:20px 32px;border-top:1px solid #1f2937;">
              <p style="color:#4b5563;font-size:11px;margin:0;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> or reply to this email.</p>
              <p style="color:#374151;font-size:11px;margin:4px 0 0;">GID Garage · Mobile Auto Repair &amp; Car Audio · Flagstaff, AZ</p>
            </div>
          </div>`,
        });
        return json({ ok: true });
      }

      // ---- Send receipt email (after payment) -----------------------------
      case 'send-receipt': {
        const { job, adjustmentReason, adjustmentAmount } = payload;
        if (!job) return json({ error: 'Missing job' }, 400);
        const invoiceUrl = `https://gidgarage.com/invoice?id=${job.id}`;
        const subtotal = Number(job.invoiceAmount || 0);
        const tax = Number(job.taxAmount || 0);
        const total = subtotal + tax;
        const taxPctRcpt = ((await fetchCurrentTaxRate()) * 100).toFixed(3);
        const hasAdjustment = adjustmentReason && adjustmentAmount !== undefined && Math.abs(adjustmentAmount) > 0.001;
        const adjustmentHtml = hasAdjustment
          ? `<tr style="background:#1a1a2e;"><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#818cf8;font-size:13px;font-style:italic;">Price Adjustment — ${adjustmentReason}</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#818cf8;font-size:13px;text-align:right;font-weight:700;font-family:monospace;">${Number(adjustmentAmount) < 0 ? '-' : '+'}$${Math.abs(Number(adjustmentAmount)).toFixed(2)}</td></tr>`
          : '';
        const lineItemsHtml = job.lineItems?.length
          ? job.lineItems.map(i => `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:13px;">${i.label}</td><td style="padding:8px 0;border-bottom:1px solid #1f2937;color:#fff;font-size:13px;text-align:right;font-family:monospace;white-space:nowrap;">${i.amount === 0 ? 'FREE' : (i.amount < 0 ? '-$' + Math.abs(Number(i.amount)).toFixed(2) : '$' + Number(i.amount).toFixed(2))}</td></tr>`).join('')
          : '';
        const serviceDateRcpt = job.date ? new Date(job.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
        await brevoSend({
          sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
          to: [{ email: job.email, name: `${job.fname} ${job.lname}` }],
          subject: `Payment Receipt — ${job.vehicle || 'GID Garage'}`,
          htmlContent: `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;background:#0f0f0f;color:#fff;">
            <div style="background:#111827;border-bottom:3px solid #16a34a;">
              <img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;"/>
            </div>
            <div style="padding:32px;">
              <h2 style="color:#4ade80;font-size:24px;font-weight:900;margin:0 0 6px;letter-spacing:-0.5px;">✅ Payment Confirmed</h2>
              <p style="color:#6b7280;font-size:14px;margin:0 0 28px;">Hi ${job.fname} — thanks for your business. Here's your receipt.</p>

              <div style="background:#1f2937;border:1px solid #374151;border-left:4px solid #16a34a;padding:16px 20px;margin-bottom:28px;">
                <table style="width:100%;border-collapse:collapse;">
                  ${job.vehicle ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Vehicle</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.vehicle}</td></tr>` : ''}
                  ${serviceDateRcpt ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Service Date</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${serviceDateRcpt}</td></tr>` : ''}
                  ${job.service ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Service</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.serviceIcon || ''} ${job.service.charAt(0).toUpperCase() + job.service.slice(1)}</td></tr>` : ''}
                  ${job.serviceAddress ? `<tr><td style="color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 0;">Location</td><td style="color:#fff;font-size:13px;text-align:right;padding:3px 0;">${job.serviceAddress}</td></tr>` : ''}
                </table>
              </div>

              <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
                <tr><td colspan="2" style="padding:0 0 8px;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #374151;">Services &amp; Parts</td></tr>
                ${lineItemsHtml}${adjustmentHtml}
                <tr><td style="padding:10px 0 6px;color:#9ca3af;font-size:13px;">Subtotal</td><td style="padding:10px 0 6px;color:#fff;font-size:13px;text-align:right;font-family:monospace;">$${subtotal.toFixed(2)}</td></tr>
                <tr><td style="padding:4px 0;color:#9ca3af;font-size:13px;">AZ TPT (${taxPctRcpt}%)</td><td style="padding:4px 0;color:#fff;font-size:13px;text-align:right;font-family:monospace;">$${tax.toFixed(2)}</td></tr>
                <tr style="border-top:2px solid #374151;"><td style="padding:14px 0 0;color:#fff;font-size:16px;font-weight:900;">Total Paid</td><td style="padding:14px 0 0;color:#4ade80;font-size:22px;font-weight:900;text-align:right;font-family:monospace;">$${total.toFixed(2)}</td></tr>
              </table>

              <p style="margin:28px 0 8px;text-align:center;">
                <a href="${invoiceUrl}" style="display:inline-block;background:#1f2937;color:#fff;text-decoration:none;font-weight:700;font-size:12px;padding:14px 32px;letter-spacing:0.08em;text-transform:uppercase;border:1px solid #374151;">🧾 VIEW / SAVE RECEIPT →</a>
              </p>
              ${job.stripeTransactionId ? `<p style="color:#4b5563;font-size:11px;text-align:center;margin:8px 0 0;">Transaction ID: ${job.stripeTransactionId}</p>` : ''}
              <div style="margin-top:24px;padding-top:20px;border-top:1px solid #1f2937;text-align:center;">
                <p style="color:#9ca3af;font-size:12px;margin:0 0 10px;">Happy with the work? A quick review helps a lot:</p>
                <a href="${GBP_REVIEW_URL}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-weight:700;font-size:11px;padding:10px 24px;letter-spacing:0.05em;text-transform:uppercase;">⭐ Leave a Review</a>
              </div>
            </div>
            <div style="background:#111827;padding:20px 32px;border-top:1px solid #1f2937;">
              <p style="color:#4b5563;font-size:11px;margin:0;">Questions? Call or text <strong style="color:#9ca3af;">480-757-0476</strong> or reply to this email.</p>
              <p style="color:#374151;font-size:11px;margin:4px 0 0;">GID Garage · Mobile Auto Repair &amp; Car Audio · Flagstaff, AZ</p>
            </div>
          </div>`,
        });
        return json({ ok: true });
      }

      // ---- Send payment-declined email ------------------------------------
      case 'send-decline': {
        const { job, reason } = payload;
        if (!job) return json({ error: 'Missing job' }, 400);
        const retryUrl = `https://gidgarage.com/invoice?id=${job.id}&action=pay`;
        await brevoSend({
          sender: { name: 'GID Garage', email: 'bookings@gidgarage.com' },
          to: [{ email: job.email, name: `${job.fname} ${job.lname}` }],
          subject: 'Payment Declined — GID Garage',
          htmlContent: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:32px;"><img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;margin-bottom:24px;"/><h2 style="color:#ef4444;font-size:22px;margin:0 0 8px;">⚠️ Payment Declined</h2><p style="color:#9ca3af;margin:0 0 16px;">Hi ${job.fname}, your payment for ${job.vehicle} was declined${reason ? ': ' + reason : '.'} No worries — you can try again below with the same card or a different one.</p><p style="margin:24px 0;text-align:center;"><a href="${retryUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:bold;font-size:13px;padding:14px 28px;letter-spacing:0.05em;text-transform:uppercase;">TRY PAYMENT AGAIN →</a></p><p style="color:#4b5563;font-size:11px;margin-top:24px;">Or call or text <strong style="color:#9ca3af;">480-757-0476</strong> — GID Garage, Flagstaff AZ</p></div>`,
        });
        return json({ ok: true });
      }

      // ---- Push notification subscriptions (admin device registering for alerts) ----
      case 'add-push-subscription': {
        const { endpoint, subscription } = payload;
        if (!endpoint || !subscription) return json({ error: 'Missing endpoint or subscription' }, 400);
        const res = await fetch(`${base}/push_subscriptions`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ endpoint, subscription }),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      // ==================================================================
      // ---- GID Command Center: Leads ----------------------------------
      // list-leads    { status?, source?, limit? }        -> Lead[]
      // upsert-lead   { row }                              -> Lead   (row.id present = update, else insert)
      // patch-lead    { id, fields }                       -> { ok }
      // ==================================================================
      case 'list-leads': {
        const { status, source, limit } = payload;
        let url = `${base}/leads?select=*&order=created_at.desc&limit=${Number(limit) || 200}`;
        if (status) url += `&status=eq.${encodeURIComponent(status)}`;
        if (source) url += `&source=eq.${encodeURIComponent(source)}`;
        const res = await fetch(url, { headers });
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'upsert-lead': {
        const { row } = payload;
        if (!row) return json({ error: 'Missing row' }, 400);
        if (row.id) {
          const { id, ...fields } = row;
          const res = await fetch(`${base}/leads?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(fields),
          });
          if (!res.ok) return json({ error: await res.text() }, 502);
          const rows = await res.json();
          return json(rows[0] ?? null);
        }
        const res = await fetch(`${base}/leads`, {
          method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(row),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(rows[0] ?? null);
      }

      case 'patch-lead': {
        const { id, fields } = payload;
        if (!id || !fields) return json({ error: 'Missing id or fields' }, 400);
        const res = await fetch(`${base}/leads?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(fields),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json({ ok: true });
      }

      // ==================================================================
      // ---- GID Command Center: Calls -----------------------------------
      // list-calls { limit? }   -> Call[]
      // log-call   { row }      -> Call
      // ==================================================================
      case 'list-calls': {
        const limit = Number(payload.limit) || 200;
        const res = await fetch(`${base}/calls?select=*&order=created_at.desc&limit=${limit}`, { headers });
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'log-call': {
        const { row } = payload;
        if (!row) return json({ error: 'Missing row' }, 400);
        const res = await fetch(`${base}/calls`, {
          method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(row),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(rows[0] ?? null);
      }

      // ==================================================================
      // ---- GID Command Center: Marketing spend -------------------------
      // list-marketing-spend { sinceDate? }  -> MarketingSpend[]
      // add-marketing-spend  { row }         -> MarketingSpend
      // ==================================================================
      case 'list-marketing-spend': {
        const since = payload.sinceDate; // 'YYYY-MM-DD'
        let url = `${base}/marketing_spend?select=*&order=date.desc`;
        if (since) url += `&date=gte.${encodeURIComponent(since)}`;
        const res = await fetch(url, { headers });
        if (!res.ok) return json({ error: await res.text() }, 502);
        return json(await res.json());
      }

      case 'add-marketing-spend': {
        const { row } = payload;
        if (!row || !row.date || !row.channel) return json({ error: 'Missing date or channel' }, 400);
        const res = await fetch(`${base}/marketing_spend`, {
          method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(row),
        });
        if (!res.ok) return json({ error: await res.text() }, 502);
        const rows = await res.json();
        return json(rows[0] ?? null);
      }

      // ==================================================================
      // ---- GID Command Center: Summary (Today / Needs Attention / --
      // ---- Leads / Marketing funnel / Schedule bar in one call)     --
      // get-command-center-summary { windowDays? }  -> CommandCenterSummary
      // ==================================================================
      case 'get-command-center-summary': {
        const windowDays = Number(payload.windowDays) || 30;
        const now = new Date();
        const phoenixToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
        const windowStart = new Date(now.getTime() - windowDays * 86400000).toISOString().slice(0, 10);
        const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
        const nextWeekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

        const [bookingsRes, leadsRes, callsRes, spendRes] = await Promise.all([
          fetch(`${base}/bookings?select=id,fname,lname,vehicle,service,date,time,job_status,status,estimate_amount,invoice_amount,tax_amount,amount_paid,paid_at,created_at&date=gte.${weekStart}&date=lte.${nextWeekEnd}`, { headers }),
          fetch(`${base}/leads?select=*&created_at=gte.${windowStart}`, { headers }),
          fetch(`${base}/calls?select=*&created_at=gte.${windowStart}`, { headers }),
          fetch(`${base}/marketing_spend?select=*&date=gte.${windowStart}`, { headers }),
        ]);
        if (!bookingsRes.ok) return json({ error: await bookingsRes.text() }, 502);
        if (!leadsRes.ok) return json({ error: await leadsRes.text() }, 502);
        if (!callsRes.ok) return json({ error: await callsRes.text() }, 502);
        if (!spendRes.ok) return json({ error: await spendRes.text() }, 502);

        const bookings = await bookingsRes.json();
        const leads = await leadsRes.json();
        const calls = await callsRes.json();
        const spend = await spendRes.json();

        // ---- Today ----
        const todaysJobs = bookings.filter(b => b.date === phoenixToday && b.status !== 'cancelled');
        // Prefer what was actually collected (amount_paid) once paid — that's
        // the real number. Before payment, use invoice or estimate PLUS tax
        // (tax_amount is tracked as its own column, separate from
        // invoice_amount/estimate_amount, and was previously left out of
        // every revenue sum here — reported as "the number was pretax").
        function jobRevenue(b) {
          if (b.paid_at && b.amount_paid != null) return Number(b.amount_paid);
          const base = Number(b.invoice_amount ?? b.estimate_amount ?? 0);
          const tax = Number(b.tax_amount ?? 0);
          return base + tax;
        }

        const todaysRevenue = todaysJobs.reduce((sum, b) => sum + jobRevenue(b), 0);
        const newLeadsToday = leads.filter(l => (l.created_at || '').slice(0, 10) === phoenixToday);
        const missedCallsToday = calls.filter(c => (c.created_at || '').slice(0, 10) === phoenixToday && (c.outcome === 'missed' || c.outcome === 'no_answer'));

        // Next open-ish day in the coming week: first day (excluding today)
        // in range with zero jobs booked.
        const jobDatesSet = new Set(bookings.filter(b => b.status !== 'cancelled').map(b => b.date));
        let nextOpenDay = null;
        for (let i = 1; i <= 7; i++) {
          const d = new Date(now.getTime() + i * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
          if (!jobDatesSet.has(d)) { nextOpenDay = d; break; }
        }

        // ---- Needs Attention ----
        const needsAttention = [];
        for (const l of leads) {
          if (l.status === 'booked' || l.status === 'lost') continue;
          const ageMs = now.getTime() - new Date(l.created_at).getTime();
          const overdueFollowUp = l.follow_up_at && new Date(l.follow_up_at).getTime() <= now.getTime();
          const staleNoContact = !l.last_contacted_at && ageMs > 2 * 86400000; // 2+ days, never contacted
          if (overdueFollowUp || staleNoContact) {
            needsAttention.push({
              type: 'lead_follow_up',
              label: `${l.fname || ''} ${l.lname || ''}`.trim() || l.phone || 'Unknown lead',
              detail: overdueFollowUp ? 'Follow-up is due' : `No contact in ${Math.floor(ageMs / 86400000)}d`,
              leadId: l.id,
            });
          }
        }
        for (const c of missedCallsToday) {
          needsAttention.push({ type: 'missed_call', label: c.phone || 'Unknown number', detail: 'Missed call today', callId: c.id });
        }
        const unpaidInvoices = bookings.filter(b => b.job_status === 'INVOICED' && !b.paid_at && Number(b.invoice_amount || 0) > Number(b.amount_paid || 0));
        for (const b of unpaidInvoices) {
          const owed = Number(b.invoice_amount || 0) - Number(b.amount_paid || 0);
          needsAttention.push({ type: 'unpaid_invoice', label: `${b.fname || ''} ${b.lname || ''}`.trim(), detail: `$${owed.toFixed(2)} owed`, bookingId: b.id });
        }

        // ---- Leads funnel (this window) ----
        const leadsContacted = leads.filter(l => l.status !== 'new').length;
        const leadsBooked = leads.filter(l => l.status === 'booked').length;
        const conversionRate = leads.length ? (leadsBooked / leads.length) * 100 : 0;

        // ---- Marketing funnel by channel ----
        const byChannel = {};
        for (const s of spend) {
          const ch = s.channel || 'other';
          byChannel[ch] ??= { channel: ch, spend: 0, calls: 0, leads: 0, bookings: 0, revenue: 0 };
          byChannel[ch].spend += Number(s.amount || 0);
          byChannel[ch].calls += Number(s.clicks ? 0 : 0); // clicks tracked separately below if needed
        }
        for (const l of leads) {
          const ch = l.source || 'other';
          byChannel[ch] ??= { channel: ch, spend: 0, calls: 0, leads: 0, bookings: 0, revenue: 0 };
          byChannel[ch].leads += 1;
          if (l.status === 'booked') {
            byChannel[ch].bookings += 1;
            const b = bookings.find(bb => bb.id === l.booking_id);
            byChannel[ch].revenue += b ? jobRevenue(b) : Number(l.quote_amount ?? 0);
          }
        }
        for (const c of calls) {
          const ch = c.source || 'other';
          byChannel[ch] ??= { channel: ch, spend: 0, calls: 0, leads: 0, bookings: 0, revenue: 0 };
          byChannel[ch].calls += 1;
        }
        const marketingFunnel = Object.values(byChannel).map(row => ({
          ...row,
          costPerBooking: row.bookings > 0 ? row.spend / row.bookings : null,
          costPerLead: row.leads > 0 ? row.spend / row.leads : null,
        }));

        // ---- Upcoming jobs (real per-job records, today through +7 days) ----
        // Reuses the same `bookings` fetch as scheduleBar below — no extra
        // Supabase query. This is the actual list, not just day counts.
        const upcomingJobs = bookings
          .filter(b => b.date >= phoenixToday && b.status !== 'cancelled')
          .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
          .slice(0, 20)
          .map(b => ({
            id: b.id,
            date: b.date,
            time: b.time,
            customer: `${b.fname || ''} ${b.lname || ''}`.trim(),
            vehicle: b.vehicle,
            service: b.service,
            job_status: b.job_status,
            amount: b.invoice_amount ?? b.estimate_amount ?? null,
          }));

        // ---- Schedule bar (next 7 days, job count + scheduled revenue) ----
        const scheduleBar = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(now.getTime() + i * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
          const dayJobs = bookings.filter(b => b.date === d && b.status !== 'cancelled');
          scheduleBar.push({
            date: d,
            jobCount: dayJobs.length,
            revenue: dayJobs.reduce((sum, b) => sum + jobRevenue(b), 0),
          });
        }

        return json({
          today: {
            date: phoenixToday,
            jobCount: todaysJobs.length,
            revenue: todaysRevenue,
            newLeads: newLeadsToday.length,
            missedCalls: missedCallsToday.length,
            nextOpenDay,
          },
          needsAttention,
          upcomingJobs,
          leadsSummary: {
            windowDays,
            total: leads.length,
            contacted: leadsContacted,
            booked: leadsBooked,
            conversionRatePct: Math.round(conversionRate * 10) / 10,
          },
          marketingFunnel,
          scheduleBar,
        });
      }

      // ==================================================================
      // ---- GID Command Center: Ask GID (deterministic, read-only) -----
      // Intentionally does NOT execute writes (e.g. "move this job to
      // Thursday") in this pass — a small keyword matcher misfiring on a
      // write action against the live schedule is a much worse failure
      // mode than a wrong-sounding read-only answer. See MANUAL_STEPS.md
      // for how to extend this into an LLM-backed version later.
      // ask-gid { query }  -> { text }
      // ==================================================================
      case 'ask-gid': {
        const q = String(payload.query || '').toLowerCase().trim();
        if (!q) return json({ text: "Ask me something like: who needs follow-up, how are my ads doing, show leads from Facebook, or what's unpaid." });

        const taxRes = await fetch(`${base}/business_settings?id=eq.default&select=tax_rate`, { headers });
        const taxRows = taxRes.ok ? await taxRes.json() : [];

        if (q.includes('tax rate') || q.includes('tax percent')) {
          const rate = taxRows?.[0]?.tax_rate;
          return json({ text: rate != null ? `Tax rate is ${(Number(rate) * 100).toFixed(3)}%.` : "I couldn't find the tax rate." });
        }

        if (q.includes('follow up') || q.includes('follow-up') || q.includes("hasn't replied") || q.includes('havent replied') || q.includes('who needs')) {
          const res = await fetch(`${base}/leads?select=fname,lname,phone,status,follow_up_at,last_contacted_at,created_at&status=neq.booked&status=neq.lost&order=created_at.asc&limit=10`, { headers });
          const rows = res.ok ? await res.json() : [];
          const now = Date.now();
          const due = rows.filter(l => (l.follow_up_at && new Date(l.follow_up_at).getTime() <= now) || (!l.last_contacted_at && now - new Date(l.created_at).getTime() > 2 * 86400000));
          if (!due.length) return json({ text: 'Nobody is currently overdue for follow-up.' });
          const names = due.slice(0, 8).map(l => `${l.fname || ''} ${l.lname || ''}`.trim() || l.phone || 'unknown').join(', ');
          return json({ text: `${due.length} lead(s) need follow-up: ${names}.` });
        }

        if (q.includes('unpaid') || q.includes('invoice')) {
          const res = await fetch(`${base}/bookings?select=fname,lname,invoice_amount,amount_paid&job_status=eq.INVOICED&paid_at=is.null`, { headers });
          const rows = res.ok ? await res.json() : [];
          const owedRows = rows.filter(b => Number(b.invoice_amount || 0) > Number(b.amount_paid || 0));
          if (!owedRows.length) return json({ text: 'No unpaid invoices right now.' });
          const total = owedRows.reduce((s, b) => s + (Number(b.invoice_amount || 0) - Number(b.amount_paid || 0)), 0);
          return json({ text: `${owedRows.length} unpaid invoice(s) totaling $${total.toFixed(2)}: ${owedRows.slice(0, 6).map(b => `${b.fname || ''} ${b.lname || ''}`.trim()).join(', ')}.` });
        }

        if (q.includes('ads') || q.includes('marketing') || q.includes('google ads') || q.includes('facebook ads') || q.includes('meta ads')) {
          const windowStart = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
          const [spendRes, leadsRes] = await Promise.all([
            fetch(`${base}/marketing_spend?select=*&date=gte.${windowStart}`, { headers }),
            fetch(`${base}/leads?select=source,status,quote_amount,booking_id&created_at=gte.${windowStart}`, { headers }),
          ]);
          const spend = spendRes.ok ? await spendRes.json() : [];
          const leads = leadsRes.ok ? await leadsRes.json() : [];
          const channelFilter = q.includes('google') ? 'google_ads' : q.includes('facebook') || q.includes('meta') ? 'meta_ads' : null;
          const relevantSpend = channelFilter ? spend.filter(s => s.channel === channelFilter) : spend;
          const relevantLeads = channelFilter ? leads.filter(l => l.source === channelFilter) : leads;
          const totalSpend = relevantSpend.reduce((s, r) => s + Number(r.amount || 0), 0);
          const totalLeads = relevantLeads.length;
          const totalBooked = relevantLeads.filter(l => l.status === 'booked').length;
          if (!totalSpend && !totalLeads) return json({ text: 'No marketing spend or leads logged for that channel in the last 30 days yet — add spend entries in the Marketing tab to see this.' });
          const costPerBooking = totalBooked > 0 ? totalSpend / totalBooked : null;
          return json({
            text: `Last 30 days${channelFilter ? ` (${channelFilter.replace('_', ' ')})` : ''}: $${totalSpend.toFixed(2)} spent, ${totalLeads} lead(s), ${totalBooked} booked.` +
              (costPerBooking != null ? ` Cost per booking: $${costPerBooking.toFixed(2)}.` : ''),
          });
        }

        if (q.includes('leads from') || q.includes('show leads') || q.includes('show me leads')) {
          let src = null;
          if (q.includes('facebook')) src = 'facebook_organic';
          else if (q.includes('google ads')) src = 'google_ads';
          else if (q.includes('google')) src = 'google_ads';
          else if (q.includes('referral')) src = 'referral';
          else if (q.includes('website')) src = 'website_form';
          const url = src ? `${base}/leads?select=fname,lname,status,created_at&source=eq.${src}&order=created_at.desc&limit=10` : `${base}/leads?select=fname,lname,status,created_at&order=created_at.desc&limit=10`;
          const res = await fetch(url, { headers });
          const rows = res.ok ? await res.json() : [];
          if (!rows.length) return json({ text: src ? `No leads found from ${src.replace('_', ' ')}.` : 'No leads found.' });
          return json({ text: `${rows.length} lead(s)${src ? ` from ${src.replace('_', ' ')}` : ''}: ${rows.map(l => `${l.fname || ''} ${l.lname || ''}`.trim() || 'unknown').join(', ')}.` });
        }

        if (q.includes('today') || q.includes('schedule') || q.includes('open') || q.includes('slot')) {
          const phoenixToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
          const res = await fetch(`${base}/bookings?select=fname,lname,service,time&date=eq.${phoenixToday}&status=neq.cancelled`, { headers });
          const rows = res.ok ? await res.json() : [];
          if (!rows.length) return json({ text: 'Nothing scheduled today.' });
          return json({ text: `${rows.length} job(s) today: ${rows.map(b => `${b.time || ''} ${b.fname || ''} ${b.lname || ''} (${b.service || 'job'})`.trim()).join('; ')}.` });
        }

        return json({ text: "I didn't catch that. Try asking about: tax rate, follow-ups, unpaid invoices, marketing/ads performance, leads from a specific source, or today's schedule." });
      }


      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    await reportError(env, err, { source: 'admin-api-data', action: payload?.action });
    return json({ error: err.message ?? 'Unknown error' }, 500);
  }
}
