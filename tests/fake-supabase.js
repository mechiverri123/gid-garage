// In-memory stand-in for Supabase PostgREST. Applies simple column filters
// (eq/neq/in/not.in/gte/lte/is.null); ignores or=()/and=() name searches, so
// resolution/attribution code has to pick the right rows itself. PATCH returns
// the updated rows like Prefer: return=representation (so [] when nothing
// matched — exactly the case that used to read as success).

function match(row, key, cond) {
  const col = key.replace(/\.\d+$/, '');
  const v = row[col];
  const [op, ...rest] = String(cond).split('.');
  const arg = rest.join('.');
  const list = () => arg.replace(/^in\./, '').replace(/^\(|\)$/g, '').split(',');
  if (op === 'eq') return String(v) === arg;
  if (op === 'neq') return String(v) !== arg;
  if (op === 'in') return list().includes(String(v));
  if (op === 'not' && arg.startsWith('in.')) return !list().includes(String(v));
  if (op === 'gte') return String(v) >= arg;
  if (op === 'lte') return String(v) <= arg;
  if (op === 'is' && arg === 'null') return v == null;
  return true;
}

const SKIP = new Set(['select', 'order', 'limit', 'or', 'and', 'on_conflict']);
const filterRows = (rows, params) => Object.entries(params).reduce((acc, [k, c]) => (SKIP.has(k) ? acc : acc.filter(r => match(r, k, c))), rows);

export function fakeSupabase(seed) {
  const tables = structuredClone(seed);
  const writes = [];
  let nextId = 1;
  const table = t => (tables[t] ||= []);
  const api = {
    tables,
    writes,
    failPatch: false,
    sbGet: async (t, params = {}) => structuredClone(filterRows(table(t), params)),
    sbPatch: async (t, filter, fields) => {
      if (api.failPatch) throw new Error('simulated database error');
      const params = Object.fromEntries(new URLSearchParams(filter));
      const rows = filterRows(table(t), params);
      for (const r of rows) Object.assign(r, fields);
      writes.push({ op: 'patch', table: t, filter, fields, matched: rows.length });
      return structuredClone(rows);
    },
    sbInsert: async (t, row) => {
      const saved = { id: `new-${nextId++}`, created_at: new Date().toISOString(), ...row };
      table(t).push(saved);
      writes.push({ op: 'insert', table: t, row: saved });
      return structuredClone(saved);
    },
  };
  return api;
}

// A fetch() that serves Supabase REST from the fake and Claude from a script.
export function fakeFetch(db, claudeScript) {
  const claudeRequests = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.hostname === 'api.anthropic.com') {
      const body = JSON.parse(init.body);
      claudeRequests.push(body);
      const next = claudeScript.shift();
      if (!next) throw new Error('Claude script exhausted');
      return json(typeof next === 'function' ? next(body) : next);
    }
    const t = u.pathname.replace('/rest/v1/', '');
    const params = Object.fromEntries(u.searchParams);
    const method = init.method || 'GET';
    if (method === 'GET') return json(await db.sbGet(t, params));
    if (method === 'PATCH') return json(await db.sbPatch(t, u.searchParams.toString(), JSON.parse(init.body)));
    if (method === 'POST') {
      const row = JSON.parse(init.body);
      if (t === 'jarvis_proactive_state') {
        const existing = db.tables.jarvis_proactive_state.find(r => r.key === row.key);
        if (existing) Object.assign(existing, row); else db.tables.jarvis_proactive_state.push(row);
        return new Response(null, { status: 201 });
      }
      // PostgREST accepts one object or an array of rows.
      if (Array.isArray(row)) return json(await Promise.all(row.map(r => db.sbInsert(t, r))), 201);
      return json([await db.sbInsert(t, row)], 201);
    }
    return json({ error: 'unsupported' }, 400);
  };
  return { fetchImpl, claudeRequests };
}

// Claude API response helpers for scripts.
export const claudeText = text => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });
export const claudeTool = (name, input, id = `tu_${name}`) => ({ content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' });
