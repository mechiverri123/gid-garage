// Shared backup logic used by both:
//   - functions/cron-backup-database.js  (external scheduler hits this daily)
//   - the "run-backup" / "backup-status" actions in admin-api-data.js
//     (the "Run Backup Now" button + status card in Admin → Hub → Recovery)
//
// Reuses the R2 bucket already bound as GID_PHOTOS (same one photos live in)
// under a separate backups/ prefix — no new binding needed.
//
// ---------------------------------------------------------------------------
// CHANGES FROM THE PREVIOUS VERSION (three fixes, explained):
//
// 1. TABLE COVERAGE. The old list was ['bookings','hub_notes','business_settings'].
//    The app writes to 13 tables. `customers` — the table at the centre of the
//    Mark Hartley merge — was NOT backed up at all, so there was nothing to
//    restore from. Neither were payment_events (your payment trail),
//    mileage_logs (IRS deduction records), or equity_entries.
//
// 2. PAGINATION. The old code did `select=*` with no limit. PostgREST caps
//    responses, so on a large table the backup would silently save only the
//    first page and still report ok:true with a plausible-looking row count.
//    A later "replace" restore would then wipe the table and reinstate only
//    that truncated slice. Now it pages until the table is exhausted.
//
// 3. RESTORE ORDER. bookings.customer_id points at customers.id. Restoring
//    bookings before customers exist violates the foreign key. Tables are now
//    listed parents-first for insert, and deleted children-first in replace
//    mode. Without this, adding `customers` to the list would have broken
//    restore rather than fixed it.
// ---------------------------------------------------------------------------

// Order matters: parents first. Insert runs in this order, delete runs reversed.
const TABLES = [
  'business_settings',   // no dependencies
  'customers',           // no dependencies — parent of bookings
  'bookings',            // -> customers.id
  'payment_events',      // -> bookings.id
  'mileage_logs',        // -> bookings.id (job_id)
  'ppi_inspections',     // standalone
  'equity_entries',      // standalone
  'hub_notes',           // standalone
];

// If one of these can't be read, the backup is not trustworthy — fail loudly
// rather than writing a partial snapshot you might later restore from.
const CRITICAL_TABLES = ['bookings', 'customers'];

const STATUS_KEY = 'backups/_last-success.json';
const RETENTION_DAYS = 30;
const PAGE = 1000;

// Pulls every row from a table, paging until exhausted.
// Ordered by id so paging is stable — without an ORDER BY, offset paging can
// skip or duplicate rows if anything writes mid-backup.
async function fetchAllRows(supabaseUrl, headers, table) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/${table}?select=*&order=id.asc&limit=${PAGE}&offset=${offset}`,
      { headers }
    );

    if (!res.ok) {
      const body = await res.text();
      // Table doesn't exist on this project yet — skip it rather than killing
      // the whole backup. Returns null so the caller can record the skip.
      if (res.status === 404 || /does not exist|Could not find the table/i.test(body)) {
        return null;
      }
      throw new Error(`Backup fetch failed for ${table}: ${res.status} ${body}`);
    }

    const rows = await res.json();
    out.push(...rows);

    // Short page means we've reached the end.
    if (rows.length < PAGE) return out;

    // Sanity valve — something is very wrong if we blow past this.
    if (offset > 500000) {
      throw new Error(`Backup for ${table} exceeded 500k rows — aborting`);
    }
  }
}

export async function runBackup(env) {
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  const bucket = env.GID_PHOTOS;
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase env vars missing');
  if (!bucket) throw new Error('R2 bucket GID_PHOTOS not bound');

  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
  const dump = {};
  const rowCounts = {};
  const skipped = [];
  let totalRows = 0;

  for (const table of TABLES) {
    const rows = await fetchAllRows(supabaseUrl, headers, table);

    if (rows === null) {
      if (CRITICAL_TABLES.includes(table)) {
        throw new Error(`Backup aborted: critical table "${table}" is missing or unreadable`);
      }
      skipped.push(table);
      continue;
    }

    dump[table] = rows;
    rowCounts[table] = rows.length;
    totalRows += rows.length;
  }

  const now = new Date();
  const body = JSON.stringify(dump);
  const key = `backups/${now.toISOString().slice(0, 10)}-${now.getTime()}.json`;
  await bucket.put(key, body, { httpMetadata: { contentType: 'application/json' } });

  const status = {
    lastBackupAt: now.toISOString(),
    key,
    rowCounts,
    skippedTables: skipped,   // shows in Hub → Recovery so a silent skip is visible
    totalRows,
    sizeBytes: body.length,
    ok: true,
  };
  await bucket.put(STATUS_KEY, JSON.stringify(status), { httpMetadata: { contentType: 'application/json' } });

  // Prune anything older than RETENTION_DAYS so R2 usage doesn't grow forever.
  try {
    const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const listed = await bucket.list({ prefix: 'backups/' });
    for (const obj of listed.objects) {
      if (obj.key === STATUS_KEY) continue;
      const m = obj.key.match(/-(\d{13})\.json$/);
      if (m && Number(m[1]) < cutoff) await bucket.delete(obj.key);
    }
  } catch { /* pruning is best-effort — never fail the backup over it */ }

  return status;
}

export async function readBackupStatus(env) {
  const bucket = env.GID_PHOTOS;
  if (!bucket) return null;
  const obj = await bucket.get(STATUS_KEY);
  if (!obj) return null;
  try { return JSON.parse(await obj.text()); } catch { return null; }
}

// Lists past backups (newest first) so the Recovery tab can offer a
// "restore from a specific date" picker rather than only ever the latest.
export async function listBackups(env) {
  const bucket = env.GID_PHOTOS;
  if (!bucket) return [];
  const listed = await bucket.list({ prefix: 'backups/' });
  return listed.objects
    .filter(o => o.key !== STATUS_KEY)
    .map(o => ({ key: o.key, uploaded: o.uploaded, sizeBytes: o.size }))
    .sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime());
}

// Restores a specific backup file back into Supabase.
//   mode 'merge'   (default, safe) — upserts every row from the backup back
//                  in by id. Fixes/undoes bad edits or accidental deletes
//                  without touching anything created *after* the backup.
//                  NOTE: any row edited since the backup gets reverted to the
//                  backup's version. Merge is safe against deletion, not
//                  against overwriting newer edits.
//   mode 'replace' (danger)        — wipes each table completely first, then
//                  inserts exactly what's in the backup. Destroys anything
//                  created since the backup ran. Now that `customers` is in
//                  the table list, replace mode wipes customer files too.
//
// WARNING, unchanged from before: this is not a transaction. If a batch fails
// partway through a replace, the table is left wiped and only partly restored,
// with no rollback. Use merge unless you specifically want to roll back time.
export async function restoreBackup(env, key, mode = 'merge') {
  const bucket = env.GID_PHOTOS;
  if (!bucket) throw new Error('R2 bucket GID_PHOTOS not bound');
  const obj = await bucket.get(key);
  if (!obj) throw new Error(`Backup not found: ${key}`);
  const dump = JSON.parse(await obj.text());

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase env vars missing');
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' };

  const rowCounts = {};
  const BATCH = 200;

  // Replace mode: delete children before parents, or the foreign keys block it.
  if (mode === 'replace') {
    for (const table of [...TABLES].reverse()) {
      if (!Array.isArray(dump[table])) continue;
      const delRes = await fetch(`${supabaseUrl}/rest/v1/${table}?id=not.is.null`, {
        method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' },
      });
      if (!delRes.ok) throw new Error(`Failed to clear ${table} before restore: ${delRes.status} ${await delRes.text()}`);
    }
  }

  // Insert parents before children.
  for (const table of TABLES) {
    const rows = dump[table];
    if (!Array.isArray(rows)) continue;

    let restored = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      if (!batch.length) continue;
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(`Restore failed for ${table} (rows ${i}-${i + batch.length}): ${res.status} ${await res.text()}`);
      restored += batch.length;
    }
    rowCounts[table] = restored;
  }

  return { key, mode, restoredAt: new Date().toISOString(), rowCounts };
}

// Read-only peek into a single past backup — pulls specific booking rows
// (by id) out of an old snapshot WITHOUT touching the live database at all.
// Built for data-recovery investigations: e.g. a booking's identity fields
// got overwritten by a bad customer-merge, and we need to see what it
// looked like before that happened, without risking a live restore.
export async function inspectBackupBookings(env, key, bookingIds) {
  const bucket = env.GID_PHOTOS;
  if (!bucket) throw new Error('R2 bucket GID_PHOTOS not bound');
  const obj = await bucket.get(key);
  if (!obj) throw new Error(`Backup not found: ${key}`);
  const dump = JSON.parse(await obj.text());
  const rows = Array.isArray(dump.bookings) ? dump.bookings : [];
  const idSet = new Set(bookingIds);
  return rows.filter(r => idSet.has(r.id));
}

// Same idea, for customer files. Now possible because `customers` is finally
// in the backup — previously there was no snapshot of that table to look at.
export async function inspectBackupCustomers(env, key, customerIds) {
  const bucket = env.GID_PHOTOS;
  if (!bucket) throw new Error('R2 bucket GID_PHOTOS not bound');
  const obj = await bucket.get(key);
  if (!obj) throw new Error(`Backup not found: ${key}`);
  const dump = JSON.parse(await obj.text());
  const rows = Array.isArray(dump.customers) ? dump.customers : [];
  const idSet = new Set(customerIds);
  return rows.filter(r => idSet.has(r.id));
}
