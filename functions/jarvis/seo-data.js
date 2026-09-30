// Cloudflare Pages Function — /jarvis/seo-data  (admin only)
// Lives under /jarvis/* so it inherits the existing Cloudflare Access
// application (Zero Trust destination slots are exhausted — see CLAUDE.md).
// Auth: a VERIFIED Access JWT (signature, issuer, audience, expiry —
// functions/_lib/access-auth.js), not mere header presence.
// Missing token -> 401, invalid -> 403.
// GET  ?action=overview|opportunities|demand|competitors|seasonality|geography|authority|connections|briefing|queries|technical
//            |actions|top5|blueprint|history|knowledge|ranks|jobs|news|ai   (Local SEO agent)
//            |listings|outreach   (competitor listings; link outreach: functions/_lib/seo/outreach.js)
// POST { action, ...args }  — allowlisted writes only:
//   update_recommendation { id, action: accept|reject|dismiss|mark_applied|reopen, reason?, note? }
//   add_competitor { name, website }            set_competitor_status { id, status: active|ignored }
//   add_citation { platform, url, observed_* }   add_calendar_event { kind, label, start_date, end_date }
//   add_authority { name, url, kind, local }     update_settings { key_pages?, canonical_*?, services?: [{id, offered}] }
//   sync_now { mode?: incremental|backfill }      one budget-bounded sync call; the UI repeats while `more` (sync.js)
//   add_rank { keyword, area, rank|null, date?, in_local_pack?, competitors? }   import_ranks { csv }
//   set_knowledge_status { id, status: active|superseded }
//   run_monitor { id: competitor_listings|link_outreach }   run that finder now
//   outreach_skip { site }
//   outreach_send { site, subject, body, reviewed: true, confirmed: true }   the ONE outside send:
//     a reviewed + confirmed email to the address the site publishes, from the Zoho mailbox
// Apart from outreach_send, nothing here publishes anything outside GID's own database.

import { createSeoStore } from '../_lib/seo/store.js';
import { createSeoOps } from '../_lib/seo/ops.js';
import { runSeoSync } from '../_lib/seo/sync.js';
import { verifyAccess } from '../_lib/access-auth.js';
import { isInsideServiceArea } from '../../shared/seo/service-area.js';
import { classifyCompetitor } from '../../shared/seo/competitors.js';
import { SERVICE_CATALOG } from '../../shared/seo/services.js';
import { OUTREACH_PROVIDERS, outreachState, listingsState, sendOutreach, skipOutreach } from '../_lib/seo/outreach.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const str = (v, n = 300) => (v == null ? null : String(v).trim().slice(0, n) || null);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export async function handleSeoData({ request, env, store, now = new Date(), runSync = runSeoSync }) {
  const ops = createSeoOps({ store, env, now });
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const action = url.searchParams.get('action') || 'overview';
    const days = Math.min(Math.max(Number(url.searchParams.get('days') || 28), 7), 180);
    const reads = {
      overview: () => ops.overview({ days }),
      opportunities: () => ops.opportunities({ status: url.searchParams.get('status') || 'active', limit: 50 }), // the panel shows accepted/applied too
      demand: () => ops.localDemand({ days }),
      competitors: () => ops.competitors(),
      seasonality: () => ops.seasonality(),
      geography: () => ops.customerGeography({}),
      authority: () => ops.authority(),
      connections: () => ops.connections(),
      queries: () => ops.queries({ days }),
      technical: () => ops.technical(),
      briefing: () => ops.briefing(),
      // Local SEO agent (functions/_lib/seo/agent-ops.js)
      actions: () => ops.agent().actions(),
      top5: () => ops.agent().top5(),
      blueprint: () => ops.agent().blueprint(),
      history: () => ops.agent().history(),
      knowledge: () => ops.agent().knowledge(),
      ranks: () => ops.agent().ranks(),
      jobs: () => ops.agent().jobs(),
      news: () => ops.agent().news(),
      ai: () => ops.agent().aiVisibility(),
      listings: () => listingsState(env.GID_PHOTOS),
      outreach: () => outreachState(env.GID_PHOTOS, now.getTime()),
    };
    if (!reads[action]) return json({ error: `Unknown action. Use one of: ${Object.keys(reads).join(', ')}` }, 400);
    return json(await reads[action]());
  }

  const body = await request.json().catch(() => null);
  if (!body?.action) return json({ error: 'Missing action' }, 400);
  switch (body.action) {
    case 'update_recommendation':
      return json(await ops.updateRecommendation({ id: str(body.id, 200), action: str(body.recAction || body.status_action || body.to, 30), reason: str(body.reason, 500) || '', note: str(body.note, 500) || '' }));
    case 'add_competitor': {
      const name = str(body.name, 120);
      if (!name) return json({ error: 'name is required' }, 400);
      const website = str(body.website, 300);
      const c = classifyCompetitor({ name, website: website || '', description: str(body.description, 300) || '', location: str(body.location, 120) || 'Flagstaff' });
      const [row] = await store.insert('seo_competitors', [{ id: `manual:${slug(name)}`, name, website, domain: c.domain, kind: c.kind, tier: c.tier, is_mobile: c.isMobile, weight: c.weight, inside_service_area: c.insideServiceArea, source: 'manual' }]);
      return json({ ok: true, competitor: row });
    }
    case 'set_competitor_status': {
      if (!['active', 'ignored'].includes(body.status)) return json({ error: 'status must be active or ignored' }, 400);
      const rows = await store.patch('seo_competitors', { id: `eq.${str(body.id, 200)}` }, { status: body.status });
      return rows.length === 1 ? json({ ok: true, id: body.id, status: body.status }) : json({ error: 'No competitor with that id' }, 404);
    }
    case 'add_citation': {
      const platform = str(body.platform, 80);
      if (!platform) return json({ error: 'platform is required' }, 400);
      const [row] = await store.insert('seo_citations', [{ platform, url: str(body.url), observed_name: str(body.observed_name), observed_phone: str(body.observed_phone, 40), observed_website: str(body.observed_website), observed_address_shown: !!body.observed_address_shown, notes: str(body.notes, 500) }]);
      return json({ ok: true, citation: row });
    }
    case 'add_calendar_event': {
      if (!isDate(body.start_date) || !isDate(body.end_date) || !str(body.label)) return json({ error: 'label, start_date and end_date (YYYY-MM-DD) are required' }, 400);
      const [row] = await store.insert('seo_calendar_events', [{ kind: str(body.kind, 60) || 'custom', label: str(body.label, 160), start_date: body.start_date, end_date: body.end_date, approximate: !!body.approximate, source: str(body.source, 200) || 'owner' }]);
      return json({ ok: true, event: row });
    }
    case 'add_authority': {
      const name = str(body.name, 160);
      if (!name) return json({ error: 'name is required' }, 400);
      const [row] = await store.insert('seo_authority_opportunities', [{ name, url: str(body.url), kind: str(body.kind, 40) || 'other', local: body.local !== false, relevance: Math.min(1, Math.max(0, Number(body.relevance ?? 0.5))), effort: Math.min(1, Math.max(0, Number(body.effort ?? 0.5))), notes: str(body.notes, 500) }]);
      return json({ ok: true, opportunity: row });
    }
    case 'update_settings': {
      const fields = {};
      if (Array.isArray(body.key_pages)) fields.key_pages = body.key_pages.map(u => str(u)).filter(u => /^https:\/\//.test(u || '')).slice(0, 20);
      for (const k of ['canonical_name', 'canonical_phone', 'canonical_website']) if (body[k] != null) fields[k] = str(body[k], 200);
      if (typeof body.hide_address === 'boolean') fields.hide_address = body.hide_address;
      if (Array.isArray(body.competitor_urls)) fields.competitor_urls = body.competitor_urls.map(u => str(u)).filter(Boolean).slice(0, 30);
      // Confirm or deny services: known catalog ids, offered true | false | 'unknown' only.
      if (Array.isArray(body.services)) {
        const ids = new Set(SERVICE_CATALOG.map(s => s.id));
        fields.services = body.services.filter(s => s && ids.has(s.id) && [true, false, 'unknown'].includes(s.offered)).map(s => ({ id: s.id, offered: s.offered }));
      }
      if (!Object.keys(fields).length) return json({ error: 'Nothing to update' }, 400);
      const rows = await store.patch('seo_settings', { id: 'eq.default' }, { ...fields, updated_at: now.toISOString() });
      return rows.length === 1 ? json({ ok: true, updated: Object.keys(fields) }) : json({ error: 'Settings row missing — run seo_migration.sql' }, 500);
    }
    case 'add_rank':
      return json(await ops.agent().addRank({ keyword: str(body.keyword, 120), area: str(body.area, 80), rank: body.rank === '' || body.rank == null ? null : Number(body.rank), date: isDate(body.date) ? body.date : undefined, inLocalPack: !!body.in_local_pack, competitors: Array.isArray(body.competitors) ? body.competitors.map(c => str(c, 80)).filter(Boolean).slice(0, 10) : [], note: str(body.note, 300) || '' }));
    case 'import_ranks':
      if (typeof body.csv !== 'string' || body.csv.length > 200000) return json({ error: 'csv (text, under 200 KB) is required' }, 400);
      return json(await ops.agent().importRanks(body.csv));
    case 'set_knowledge_status':
      return json(await ops.agent().setKnowledgeStatus({ id: str(body.id, 80), status: str(body.status, 20) }));
    case 'run_monitor': {
      const p = OUTREACH_PROVIDERS.find(x => x.id === body.id);
      if (!p) return json({ error: 'Unknown monitor' }, 400);
      if (p.status(env).status !== 'connected') return json({ error: p.status(env).missing.join(', ') || 'Not configured' }, 400);
      return json({ ok: true, ...(await p.sync({ env, store, fetch: (...a) => fetch(...a), now })) });
    }
    case 'outreach_skip':
      return json(await skipOutreach({ bucket: env.GID_PHOTOS, site: str(body.site, 200), now: now.getTime() }));
    case 'outreach_send':
      return json(await sendOutreach({ bucket: env.GID_PHOTOS, site: str(body.site, 200), subject: body.subject, body: body.body, reviewed: body.reviewed, confirmed: body.confirmed, now: now.getTime() }));
    case 'check_location':
      return json(isInsideServiceArea(str(body.location, 200) || ''));
    case 'sync_now': {
      // Manual sync from the authenticated UI, run server-side (the cron secret
      // is never involved or exposed). The shared run gate (sync.js) blocks a
      // concurrent run and throttles only after a *completed* sync; a failed or
      // partial run can be retried right away.
      const mode = body.mode === 'backfill' ? 'backfill' : 'incremental';
      const result = await runSync({ env, store, mode, now, manual: true });
      if (result.blocked) return json({ ok: false, error: result.error, runStatus: result.runStatus }, result.status);
      return json({ ok: true, ...result });
    }
    default:
      return json({ error: 'Unknown action' }, 400);
  }
}

export async function onRequest({ request, env }) {
  const auth = await verifyAccess(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !env.SUPABASE_SERVICE_KEY) return json({ error: 'Server not configured' }, 500);
  try {
    return await handleSeoData({ request, env, store: createSeoStore({ supabaseUrl, serviceKey: env.SUPABASE_SERVICE_KEY }) });
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
