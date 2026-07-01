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
