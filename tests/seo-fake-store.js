// In-memory stand-in for functions/_lib/seo/store.js (same interface).
// Supports eq/neq/gte/lte/lt/gt/in/not.in/is.null/not.is.null and and=(...) filters.

function cond(row, col, expr) {
  const v = row[col];
  const [op, ...rest] = String(expr).split('.');
  const arg = rest.join('.');
  const list = () => arg.replace(/^in\./, '').replace(/^\(|\)$/g, '').split(',');
  switch (op) {
    case 'eq': return String(v) === arg;
    case 'neq': return String(v) !== arg;
    case 'gte': return String(v) >= arg;
    case 'lte': return String(v) <= arg;
    case 'gt': return String(v) > arg;
    case 'lt': return String(v) < arg;
    case 'in': return list().includes(String(v));
    case 'is': return arg === 'null' ? v == null : true;
    case 'not': return arg.startsWith('in.') ? !list().includes(String(v)) : arg === 'is.null' ? v != null : true;
    default: return true;
  }
}

function applyFilters(rows, params) {
  let out = rows;
  for (const [k, expr] of Object.entries(params)) {
    if (['select', 'order', 'limit', 'offset', 'or', 'on_conflict'].includes(k)) continue;
    if (k === 'and') {
      for (const part of String(expr).replace(/^\(|\)$/g, '').split(',')) {
        const [col, ...rest] = part.split('.');
        out = out.filter(r => cond(r, col, rest.join('.')));
      }
      continue;
    }
    out = out.filter(r => cond(r, k, expr));
  }
  if (params.order) {
    const [col, dir] = params.order.split(',')[0].split('.');
    out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
  }
  const offset = Number(params.offset || 0);
  if (params.limit) out = out.slice(offset, offset + Number(params.limit));
  return out;
}

export function fakeSeoStore(seed = {}) {
  const tables = structuredClone(seed);
  let nextId = 1;
  const t = name => (tables[name] ||= []);
  const log = [];
  return {
    tables, log,
    async select(name, params = {}) { return structuredClone(applyFilters(t(name), params)); },
    async selectAll(name, params = {}) { const { limit, offset, ...rest } = params; return structuredClone(applyFilters(t(name), rest)); },
    async upsert(name, rows, onConflict) {
      const keys = onConflict.split(',');
      for (const r of rows) {
        const i = t(name).findIndex(x => keys.every(k => String(x[k]) === String(r[k])));
        if (i >= 0) t(name)[i] = { ...t(name)[i], ...r }; else t(name).push({ ...r });
      }
      log.push({ op: 'upsert', name, count: rows.length });
      return rows.length;
    },
    async insert(name, rows) {
      const saved = rows.map(r => ({ id: r.id ?? nextId++, ...r }));
      t(name).push(...saved);
      log.push({ op: 'insert', name, count: rows.length });
      return structuredClone(saved);
    },
    async patch(name, params, fields) {
      const rows = applyFilters(t(name), params);
      for (const r of rows) Object.assign(r, fields);
      log.push({ op: 'patch', name, count: rows.length });
      return structuredClone(rows);
    },
    async rpc(fn, { p_from, p_to }) {
      const rows = t('seo_gsc_daily').filter(r => r.date >= p_from && r.date <= p_to);
      const groups = new Map();
      const keyOf = fn === 'seo_gsc_period' ? r => `${r.query}|${r.page}|${r.country}` : r => `${r.date}|${r.service || 'none'}|${r.locality}`;
      for (const r of rows) {
        const k = keyOf(r);
        const g = groups.get(k) || { ...r, clicks: 0, impressions: 0, _pos: 0, service: r.service || (fn === 'seo_gsc_period' ? null : 'none') };
        g.clicks += r.clicks; g.impressions += r.impressions; g._pos += (r.position || 0) * r.impressions;
        groups.set(k, g);
      }
      return [...groups.values()].map(({ _pos, ...g }) => (fn === 'seo_gsc_period'
        ? { query: g.query, page: g.page, country: g.country, clicks: g.clicks, impressions: g.impressions, position: g.impressions ? Math.round((_pos / g.impressions) * 10) / 10 : null, intent_class: g.intent_class, locality: g.locality, service: g.service, branded: g.branded }
        : { date: g.date, service: g.service, locality: g.locality, clicks: g.clicks, impressions: g.impressions }));
    },
  };
}
