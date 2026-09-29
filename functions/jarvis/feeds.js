// Cloudflare Pages Function — /jarvis/feeds  (owner only)
// Under /jarvis/* so it inherits the Cloudflare Access app (CLAUDE.md §0); the
// Access JWT is verified here too (verifyAccess).
// GET  ?action=status|brief|reviews|social|ads|mail|messages[&force=1]   ?action=message&id=&folder=   ?action=thread&id=
// POST { action: 'send_messenger', psid, text, reviewed: true, confirmed: true, leadId? }
// POST { action: 'connect_meta', token, appId?, appSecret? }   { action: 'check_leads' }
//      { action: 'connect_zoho', clientId, clientSecret, code }
//      { action: 'disconnect', which: 'meta' | 'zoho' }
// Logic and caching: functions/_lib/jarvis-feeds.js. Read-only toward Google,
// Meta and Zoho: nothing here posts, replies or sends anything.
import { verifyAccess } from '../_lib/access-auth.js';
import { createBusinessOps } from '../_lib/business-data.js';
import { reviewsFeed, socialFeed, adsFeed, mailFeed, mailMessage, feedStatus, loadBrief, connectMeta, connectZoho, disconnectFeed, pollMetaLeads, leadSyncStatus, messengerFeed, messengerThread, sendMessenger } from '../_lib/jarvis-feeds.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function handleFeeds({ request, env, verify = verifyAccess, fetchImpl = (...a) => fetch(...a) }) {
  const auth = await verify(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const bucket = env.GID_PHOTOS;
  const url = new URL(request.url);
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const sbGet = async (table, params) => {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${table}?${new URLSearchParams(params)}`, { headers });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };
  const sbPatch = async (table, filter, fields) => {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(fields) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };
  const sbInsert = async (table, row) => {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${table}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(row) });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json())[0] || row;
  };
  try {
    if (request.method === 'GET') {
      const action = url.searchParams.get('action') || 'status';
      const force = url.searchParams.get('force') === '1';
      const args = { env, bucket, force, fetchImpl };
      switch (action) {
        case 'status': return json(await feedStatus({ env, bucket }));
        case 'reviews': return json(await reviewsFeed(args));
        case 'social': return json(await socialFeed(args));
        case 'ads': return json(await adsFeed(args));
        case 'mail': return json(await mailFeed(args));
        case 'messages': return json(await messengerFeed(args));
        case 'thread': return json(await messengerThread({ env, bucket, id: url.searchParams.get('id'), fetchImpl }));
        case 'message': return json(await mailMessage({ bucket, id: url.searchParams.get('id'), folderId: url.searchParams.get('folder'), fetchImpl }));
        case 'brief': {
          const ops = createBusinessOps({ sbGet, sbPatch: async () => { throw new Error('read only'); } });
          return json(await loadBrief({ env, ops, sbGet, fetchImpl }));
        }
        default: return json({ error: 'Unknown action' }, 400);
      }
    }
    const body = await request.json().catch(() => ({}));
    if (!bucket) return json({ error: 'R2 bucket GID_PHOTOS is not bound.' }, 500);
    const s = v => (v == null ? '' : String(v).trim());
    switch (body.action) {
      case 'connect_meta': return json(await connectMeta({ env, bucket, token: s(body.token), appId: s(body.appId), appSecret: s(body.appSecret), fetchImpl }));
      case 'connect_zoho': return json(await connectZoho({ bucket, clientId: s(body.clientId), clientSecret: s(body.clientSecret), code: s(body.code), fetchImpl }));
      // "Check now" in the Facebook panel: the same import the cron runs (no Telegram alert; you're looking at it).
      case 'check_leads': {
        try {
          const out = await pollMetaLeads({ env, bucket, sbGet, sbInsert, fetchImpl });
          return json({ imported: out.imported.length, connected: out.connected, status: await leadSyncStatus(bucket) });
        } catch (e) {
          return json({ error: e.message, status: await leadSyncStatus(bucket) });
        }
      }
      // Messenger reply as the page — only after the page's two confirmations (reviewed + confirmed).
      case 'send_messenger':
        return json(await sendMessenger({ env, bucket, psid: s(body.psid), text: String(body.text ?? ''), reviewed: body.reviewed === true, confirmed: body.confirmed === true, leadId: s(body.leadId) || null, sbGet, sbPatch, fetchImpl }));
      case 'disconnect': return json(await disconnectFeed({ bucket, which: s(body.which) }));
      default: return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ error: e?.message || String(e) }, 502);
  }
}

export const onRequest = ctx => handleFeeds(ctx);
