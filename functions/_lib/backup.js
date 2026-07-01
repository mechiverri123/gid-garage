// Shared backup logic used by both:
//   - functions/cron-backup-database.js  (external scheduler hits this daily)
//   - the "run-backup" / "backup-status" actions in admin-api-data.js
//     (the "Run Backup Now" button + status card in Admin → Hub → Recovery)
//
// Reuses the R2 bucket already bound as GID_PHOTOS (same one photos live in)
// under a separate backups/ prefix — no new binding needed.

const TABLES = ['bookings', 'hub_notes', 'business_settings'];
const STATUS_KEY = 'backups/_last-success.json';
const RETENTION_DAYS = 30;

export async function runBackup(env) {
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;
  const bucket = env.GID_PHOTOS;
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase env vars missing');
  if (!bucket) throw new Error('R2 bucket GID_PHOTOS not bound');

  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
  const dump = {};
  const rowCounts = {};
  let totalRows = 0;

  for (const table of TABLES) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, { headers });
    if (!res.ok) throw new Error(`Backup fetch failed for ${table}: ${res.status} ${await res.text()}`);
    const rows = await res.json();
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
//   mode 'replace' (danger)        — wipes each table completely first, then
//                  inserts exactly what's in the backup. True point-in-time
//                  restore, but destroys anything created since the backup
//                  ran. Only use this if you actually want to roll back time.
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

  for (const table of TABLES) {
    const rows = dump[table];
    if (!Array.isArray(rows)) continue;

    if (mode === 'replace') {
      const delRes = await fetch(`${supabaseUrl}/rest/v1/${table}?id=not.is.null`, {
        method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' },
      });
      if (!delRes.ok) throw new Error(`Failed to clear ${table} before restore: ${delRes.status} ${await delRes.text()}`);
    }

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
