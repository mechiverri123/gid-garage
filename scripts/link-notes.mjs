// Link existing owner notes to customer records (jarvis_business_notes.customer_id).
//
//   node scripts/link-notes.mjs            DRY RUN: prints every proposed link, writes nothing
//   node scripts/link-notes.mjs --apply    writes customer_id on the linked notes only
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment, and
// jarvis_note_links_migration.sql already run. Only jarvis_business_notes is
// ever written — never customers, bookings, leads or payments. A note links
// only on a matching phone or a full name exactly one customer has.
// Same logic as live note capture: functions/_lib/business-data.js (noteLinkFor).
import { createBusinessOps } from '../functions/_lib/business-data.js';

const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY first.'); process.exit(1); }
const apply = process.argv.includes('--apply');
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const sbGet = async (table, params) => {
  const res = await fetch(`${url}/rest/v1/${table}?${new URLSearchParams(params)}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};
const sbPatch = async (table, filter, fields) => {
  if (table !== 'jarvis_business_notes') throw new Error(`refusing to write ${table}`); // hard guard
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(fields) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const ops = createBusinessOps({ sbGet, sbPatch });
const proposals = await ops.planNoteLinks(); // works before the migration too (preview)

const linked = proposals.filter(p => p.linked);
console.log(`${proposals.length} unlinked notes: ${linked.length} would link, ${proposals.length - linked.length} stay unlinked.\n`);
for (const p of proposals) {
  console.log(`${p.linked ? 'LINK ' : 'skip '} ${p.note_id}  ${String(p.created_at || '').slice(0, 10)}  ${(p.contact_name || '(no name)').padEnd(22)} ${p.linked ? `→ ${p.customer} (by ${p.by})` : `(${p.reason})`}`);
}
if (!apply) { console.log('\nDry run — nothing was written. Re-run with --apply to write these links.'); process.exit(0); }

let results;
try {
  results = await ops.applyNoteLinks(proposals);
} catch (e) { console.error(e.message); process.exit(1); }
if (results.some(r => !r.ok && /customer_id/.test(r.error))) { console.error('The link columns do not exist yet — run jarvis_note_links_migration.sql in Supabase first. Nothing was written.'); process.exit(1); }
const ok = results.filter(r => r.ok).length;
console.log(`\nApplied: ${ok} of ${results.length} notes linked (each verified by re-reading the row).`);
for (const r of results.filter(x => !x.ok)) console.log(`FAILED ${r.note_id}: ${r.error}`);
