// Thin Supabase REST store for SEO tables (server-side, service key).
// Same interface as the in-memory test store (tests/seo-fake-store.js).

export function createSeoStore({ supabaseUrl, serviceKey, fetchImpl = fetch }) {
  const base = `${supabaseUrl}/rest/v1`;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const check = async (res, what) => { if (!res.ok) throw new Error(`${what}: ${await res.text()}`); return res; };
  return {
    async select(table, params = {}) {
      const res = await check(await fetchImpl(`${base}/${table}?${new URLSearchParams(params)}`, { headers }), `select ${table}`);
      return res.json();
    },
    // Paginates past PostgREST's 1,000-row response cap.
    async selectAll(table, params = {}, max = 20000) {
      const out = [];
      for (let offset = 0; offset < max; offset += 1000) {
        const res = await check(await fetchImpl(`${base}/${table}?${new URLSearchParams({ ...params, limit: '1000', offset: String(offset) })}`, { headers }), `select ${table}`);
        const rows = await res.json();
        out.push(...rows);
        if (rows.length < 1000) break;
      }
      return out;
    },
    async rpc(fn, args) {
      const res = await check(await fetchImpl(`${base}/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) }), `rpc ${fn}`);
      return res.json();
    },
    async upsert(table, rows, onConflict) {
      for (let i = 0; i < rows.length; i += 500) {
        await check(await fetchImpl(`${base}/${table}?on_conflict=${encodeURIComponent(onConflict)}`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) }), `upsert ${table}`);
      }
      return rows.length;
    },
    async insert(table, rows) {
      if (!rows.length) return [];
      const res = await check(await fetchImpl(`${base}/${table}`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(rows) }), `insert ${table}`);
      return res.json();
    },
    // Returns updated rows so callers can verify the write happened.
    async patch(table, params, fields) {
      const res = await check(await fetchImpl(`${base}/${table}?${new URLSearchParams(params)}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(fields) }), `patch ${table}`);
      return res.json();
    },
  };
}
