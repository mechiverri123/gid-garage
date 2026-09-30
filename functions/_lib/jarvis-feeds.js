// Jarvis feed panels: Google reviews, Facebook/Instagram, Meta ads, Zoho Mail,
// and the visual daily brief that combines them with the business briefing.
// Used by /jarvis/feeds (the panels) and admin-ai-chat.js (voice/typed
// "brief me", "show me my reviews", ... answered without Claude).
//
// Free by design: every outside call is cached in R2 (GID_PHOTOS bucket), so the
// page, the brief and voice share one fetch per cache window:
//   Google Places reviews 3 h (well inside the free monthly Places calls),
//   Meta Graph 30 min, Zoho Mail 3 min. Meta and Zoho APIs are free.
//
// Connections (tokens) live in R2 under private/ — written only by the
// Access-protected /jarvis/feeds connect actions, never sent to the browser.
// History snapshots (review totals, follower counts) live next to them, so
// "3 new reviews this week" and "12 new likes overnight" need no new tables.
// Tests: tests/jarvis-feeds.test.js.

import { phoenixYmd } from '../../shared/business-metrics.js';
import { weatherToday } from './command-center-extras.js';
import { normalizeMetaLead } from '../lead-capture.js';

const CONN_KEY = 'private/jarvis-connections.json';
const HISTORY_KEY = 'private/jarvis-feed-history.json';
const ZOHO_TOKEN_KEY = 'private/jarvis-zoho-access.json';
const HOUR = 3600_000;
const DAY = 24 * HOUR;

export const FEED_TTL = { reviews: 3 * HOUR, social: 30 * 60_000, ads: HOUR, mail: 3 * 60_000 };

// ---- R2 json helpers --------------------------------------------------------------------

export async function readJson(bucket, key) {
  if (!bucket) return null;
  try { const o = await bucket.get(key); return o ? await o.json() : null; } catch { return null; }
}
export async function writeJson(bucket, key, value) {
  if (!bucket) return;
  await bucket.put(key, JSON.stringify(value), { httpMetadata: { contentType: 'application/json' } });
}

// Cached fetcher: returns the cached value while fresh, else runs `load` and stores it.
async function cached(bucket, key, ttl, load, { now = Date.now(), force = false } = {}) {
  const hit = force ? null : await readJson(bucket, key);
  if (hit?.at && now - hit.at < ttl) return hit.value;
  const value = await load();
  await writeJson(bucket, key, { at: now, value });
  return value;
}

// History: { reviews: { 'YYYY-MM-DD': total }, social: { 'YYYY-MM-DD': {...} } }, 60 days.
async function recordHistory(bucket, kind, ymd, value) {
  const h = (await readJson(bucket, HISTORY_KEY)) || {};
  h[kind] = { ...(h[kind] || {}), [ymd]: value };
  const keep = Object.keys(h[kind]).sort().slice(-60);
  h[kind] = Object.fromEntries(keep.map(k => [k, h[kind][k]]));
  await writeJson(bucket, HISTORY_KEY, h);
  return h[kind];
}
// The latest snapshot strictly before `ymd` (optionally at or before `atOrBefore`).
export function snapshotBefore(series = {}, ymd, atOrBefore = null) {
  const days = Object.keys(series).filter(d => d < ymd && (!atOrBefore || d <= atOrBefore)).sort();
  const d = days[days.length - 1];
  return d ? { date: d, value: series[d] } : null;
}
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// ---- Google reviews ------------------------------------------------------------------------

// New reviews in the last 7 days: the newest reviews Google returns carry a
// timestamp (up to 5), and the total-count history catches more than 5.
export function newReviewCount(reviews = [], total, history = {}, now = Date.now(), today = phoenixYmd(new Date(now))) {
  const byTime = reviews.filter(r => r.time && now - Date.parse(r.time) <= 7 * DAY).length;
  const weekAgo = snapshotBefore(history, today, addDays(today, -7));
  const byTotal = weekAgo && Number.isFinite(total) ? Math.max(0, total - Number(weekAgo.value)) : 0;
  return Math.max(byTime, byTotal);
}

export async function reviewsFeed({ env, bucket, now = Date.now(), force = false, fetchImpl = (...a) => fetch(...a) }) {
  const key = env.GOOGLE_PLACES_API_KEY; const placeId = env.GOOGLE_PLACE_ID;
  if (!key || !placeId) return { connected: false, reason: 'GOOGLE_PLACES_API_KEY / GOOGLE_PLACE_ID not set' };
  const data = await cached(bucket, 'cache/jarvis-reviews.json', FEED_TTL.reviews, async () => {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total,reviews,url&reviews_sort=newest&key=${key}`;
    const res = await fetchImpl(url);
    const body = await res.json();
    if (body.status !== 'OK') throw new Error(`Google Places: ${body.status} ${body.error_message || ''}`.trim());
    const r = body.result || {};
    return {
      rating: r.rating ?? null, total: r.user_ratings_total ?? null, mapsUrl: r.url || null,
      reviews: (r.reviews || []).map(v => ({
        author: v.author_name, photo: v.profile_photo_url || null, rating: v.rating,
        text: v.text || '', relative: v.relative_time_description || '', time: v.time ? new Date(v.time * 1000).toISOString() : null,
      })),
    };
  }, { now, force });
  const today = phoenixYmd(new Date(now));
  const history = Number.isFinite(data.total) ? await recordHistory(bucket, 'reviews', today, data.total) : {};
  const new7 = newReviewCount(data.reviews, data.total, history, now, today);
  return {
    connected: true, ...data, new7,
    reviewsUrl: `https://search.google.com/local/reviews?placeid=${encodeURIComponent(placeId)}`,
    writeReviewUrl: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`,
  };
}

// ---- Meta: Facebook page, Instagram, ads ---------------------------------------------------

const graphBase = env => `https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v23.0'}`;
async function graph(env, path, token, fetchImpl, params = {}) {
  const q = new URLSearchParams({ ...params, access_token: token });
  const res = await fetchImpl(`${graphBase(env)}/${path}${path.includes('?') ? '&' : '?'}${q}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Meta: ${body.error?.message || `HTTP ${res.status}`}`);
  return body;
}

// One pasted token (plus app id/secret to make it long-lived) -> the page token
// (never expires when made from a long-lived user token), Instagram account and ad account.
export async function connectMeta({ env, bucket, token, appId, appSecret, now = Date.now(), fetchImpl = (...a) => fetch(...a) }) {
  if (!token) throw new Error('Paste an access token.');
  let userToken = token; let expiresAt = null;
  if (appId && appSecret) {
    const ex = await graph(env, 'oauth/access_token', token, fetchImpl, { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: token });
    userToken = ex.access_token; expiresAt = ex.expires_in ? new Date(now + ex.expires_in * 1000).toISOString() : null;
  }
  const pages = await graph(env, 'me/accounts', userToken, fetchImpl, { fields: 'id,name,link,access_token,instagram_business_account{id,username}', limit: '25' }).catch(() => ({ data: [] }));
  const page = (pages.data || []).find(p => /gid/i.test(p.name)) || (pages.data || [])[0] || null;
  // A page token pasted directly: /me is the page itself.
  let direct = null;
  if (!page) direct = await graph(env, 'me', userToken, fetchImpl, { fields: 'id,name,link,instagram_business_account{id,username}' }).catch(() => null);
  const src = page || direct;
  const ads = await graph(env, 'me/adaccounts', userToken, fetchImpl, { fields: 'id,name,account_status', limit: '25' }).catch(() => ({ data: [] }));
  const ad = (ads.data || []).find(a => a.account_status === 1) || (ads.data || [])[0] || null;
  if (!src && !ad) throw new Error('That token can’t see a Facebook page or ad account. Give it pages_show_list, pages_read_engagement, instagram_basic, instagram_manage_insights and ads_read.');
  const meta = {
    userToken, userTokenExpires: expiresAt, connectedAt: new Date(now).toISOString(),
    pageId: src?.id || null, pageName: src?.name || null, pageLink: src?.link || (src ? `https://www.facebook.com/${src.id}` : null),
    pageToken: page?.access_token || (direct ? userToken : null),
    igId: src?.instagram_business_account?.id || null, igUsername: src?.instagram_business_account?.username || null,
    adAccountId: ad?.id || null, adAccountName: ad?.name || null,
  };
  const conn = (await readJson(bucket, CONN_KEY)) || {};
  await writeJson(bucket, CONN_KEY, { ...conn, meta });
  return publicMeta(meta);
}
const publicMeta = m => (m ? { connected: true, page: m.pageName, instagram: m.igUsername, adAccount: m.adAccountName, tokenExpires: m.userTokenExpires } : { connected: false });

// Snapshot deltas: today's numbers vs the latest snapshot from an earlier day.
export function socialDeltas(current, prev) {
  if (!prev) return null;
  const d = k => (current[k] != null && prev.value?.[k] != null ? current[k] - prev.value[k] : null);
  return { since: prev.date, fbFollowers: d('fbFollowers'), fbPageLikes: d('fbPageLikes'), fbPostReactions: d('fbPostReactions'), igFollowers: d('igFollowers'), igPostLikes: d('igPostLikes') };
}

export async function socialFeed({ env, bucket, now = Date.now(), force = false, fetchImpl = (...a) => fetch(...a) }) {
  const m = (await readJson(bucket, CONN_KEY))?.meta;
  if (!m?.pageToken && !m?.igId) return { connected: false };
  const data = await cached(bucket, 'cache/jarvis-social.json', FEED_TTL.social, async () => {
    const tok = m.pageToken || m.userToken;
    const [fb, posts, ig, media] = await Promise.all([
      m.pageId ? graph(env, m.pageId, tok, fetchImpl, { fields: 'name,link,fan_count,followers_count,picture{url}' }).catch(e => ({ error: e.message })) : null,
      m.pageId ? graph(env, `${m.pageId}/posts`, tok, fetchImpl, { fields: 'message,created_time,permalink_url,full_picture,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)', limit: '5' }).catch(() => null) : null,
      m.igId ? graph(env, m.igId, tok, fetchImpl, { fields: 'username,followers_count,media_count,profile_picture_url' }).catch(e => ({ error: e.message })) : null,
      m.igId ? graph(env, `${m.igId}/media`, tok, fetchImpl, { fields: 'caption,media_type,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp', limit: '6' }).catch(() => null) : null,
    ]);
    const fbPosts = (posts?.data || []).map(p => ({ text: (p.message || '').slice(0, 200), at: p.created_time, url: p.permalink_url, image: p.full_picture || null, reactions: p.reactions?.summary?.total_count ?? 0, comments: p.comments?.summary?.total_count ?? 0 }));
    const igPosts = (media?.data || []).map(p => ({ text: (p.caption || '').slice(0, 200), at: p.timestamp, url: p.permalink, image: p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url, likes: p.like_count ?? 0, comments: p.comments_count ?? 0 }));
    return {
      facebook: fb && !fb.error ? { name: fb.name, url: fb.link || m.pageLink, picture: fb.picture?.data?.url || null, followers: fb.followers_count ?? null, pageLikes: fb.fan_count ?? null, posts: fbPosts } : fb?.error ? { error: fb.error } : null,
      instagram: ig && !ig.error ? { username: ig.username, url: `https://www.instagram.com/${ig.username}/`, picture: ig.profile_picture_url || null, followers: ig.followers_count ?? null, posts: igPosts } : ig?.error ? { error: ig.error } : null,
    };
  }, { now, force });
  const today = phoenixYmd(new Date(now));
  const snap = {
    fbFollowers: data.facebook?.followers ?? null, fbPageLikes: data.facebook?.pageLikes ?? null,
    fbPostReactions: data.facebook?.posts ? data.facebook.posts.reduce((t, p) => t + p.reactions, 0) : null,
    igFollowers: data.instagram?.followers ?? null,
    igPostLikes: data.instagram?.posts ? data.instagram.posts.reduce((t, p) => t + p.likes, 0) : null,
  };
  const series = await recordHistory(bucket, 'social', today, snap);
  return { connected: true, ...data, changes: socialDeltas(snap, snapshotBefore(series, today)), tokenExpires: m.userTokenExpires, leadSync: await leadSyncStatus(bucket) };
}

export async function adsFeed({ env, bucket, now = Date.now(), force = false, fetchImpl = (...a) => fetch(...a) }) {
  const m = (await readJson(bucket, CONN_KEY))?.meta;
  const token = m?.adAccountId ? m.userToken : env.META_ADS_ACCESS_TOKEN;
  const account = m?.adAccountId || (env.META_AD_ACCOUNT_ID ? `act_${String(env.META_AD_ACCOUNT_ID).replace(/^act_/, '')}` : null);
  if (!token || !account) return { connected: false };
  return { connected: true, ...(await cached(bucket, 'cache/jarvis-ads.json', FEED_TTL.ads, async () => {
    const pick = async preset => {
      const r = await graph(env, `${account}/insights`, token, fetchImpl, { date_preset: preset, fields: 'spend,impressions,clicks,actions' });
      const row = r.data?.[0] || {};
      const leads = (row.actions || []).filter(a => /lead/.test(a.action_type)).reduce((t, a) => Math.max(t, Number(a.value) || 0), 0);
      return { spend: Number(row.spend || 0), impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0), leads };
    };
    const [yesterday, last7] = await Promise.all([pick('yesterday'), pick('last_7d')]);
    return { yesterday, last7 };
  }, { now, force })) };
}

// ---- Facebook / Instagram lead forms -> leads ------------------------------------------------
// Polled (every 5 min from the proactive cron) with the connected page token,
// so no Meta webhook or App Review is needed. Same row shape as the Meta
// webhook in lead-capture.js (normalizeMetaLead); deduped on external_lead_id.
const LEADS_KEY = 'private/jarvis-meta-leads.json';
const LEAD_FIELDS = 'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data';

// sbGet(table, params) -> rows; sbInsert(table, row) -> inserted row.
export async function pollMetaLeads({ env, bucket, sbGet, sbInsert, now = Date.now(), fetchImpl = (...a) => fetch(...a) }) {
  const m = (await readJson(bucket, CONN_KEY))?.meta;
  if (!m?.pageId || !m?.pageToken) return { connected: false, imported: [] };
  const state = (await readJson(bucket, LEADS_KEY)) || {};
  // First run looks back 7 days (imported quietly); later runs overlap 15 min.
  const since = Math.floor((state.checkedAt ? Date.parse(state.checkedAt) - 15 * 60_000 : now - 7 * DAY) / 1000);
  const save = extra => writeJson(bucket, LEADS_KEY, { ...state, ...extra });
  try {
    const forms = await graph(env, `${m.pageId}/leadgen_forms`, m.pageToken, fetchImpl, { fields: 'id,name,status', limit: '50' });
    const found = [];
    for (const f of (forms.data || []).filter(x => x.status !== 'ARCHIVED' && x.status !== 'DELETED')) {
      const res = await graph(env, `${f.id}/leads`, m.pageToken, fetchImpl, {
        fields: LEAD_FIELDS, limit: '50',
        filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]),
      });
      for (const lead of res.data || []) found.push({ ...lead, form_name: f.name });
    }
    const ids = [...new Set(found.map(l => String(l.id)))];
    const existing = ids.length ? await sbGet('leads', { select: 'external_lead_id', external_lead_id: `in.(${ids.join(',')})` }) : [];
    const have = new Set(existing.map(r => String(r.external_lead_id)));
    const imported = [];
    for (const lead of found) {
      const id = String(lead.id);
      if (have.has(id)) continue;
      have.add(id);
      const row = normalizeMetaLead(lead, { leadgen_id: id, form_id: lead.form_id });
      row.source = 'meta_ads';
      if (lead.form_name) row.campaign = row.campaign || lead.form_name;
      const saved = await sbInsert('leads', row);
      // The first run's 7-day backfill is quiet; after that every imported lead is new (alert).
      imported.push({ ...saved, fresh: !!state.checkedAt });
    }
    await save({ checkedAt: new Date(now).toISOString(), lastError: null, forms: (forms.data || []).length, lastImported: imported.length ? new Date(now).toISOString() : state.lastImported || null });
    return { connected: true, forms: (forms.data || []).length, imported };
  } catch (e) {
    await save({ lastError: e.message, errorAt: new Date(now).toISOString() });
    throw e;
  }
}
export const leadSyncStatus = bucket => readJson(bucket, LEADS_KEY);

export function newLeadAlert(lead) {
  const name = `${lead.fname || ''} ${lead.lname || ''}`.trim() || 'Someone';
  const bits = [lead.requested_service, lead.vehicle, lead.phone].filter(Boolean).join(' · ');
  return `New Facebook lead, sir: ${name}${bits ? ` — ${bits}` : ''}. It's in your leads.`;
}

// ---- Messenger: page conversations + replies ---------------------------------------------------
// Reads the page inbox (Conversations API) and replies as the page (Send API),
// with the connected page token (needs pages_messaging). Lead-form leads show
// up here when Facebook opened a Messenger thread for them (as in Business Suite).
const BUSINESS_INBOX = 'https://business.facebook.com/latest/inbox/messenger';

export async function messengerFeed({ env, bucket, now = Date.now(), force = false, fetchImpl = (...a) => fetch(...a) }) {
  const m = (await readJson(bucket, CONN_KEY))?.meta;
  if (!m?.pageId || !m?.pageToken) return { connected: false };
  const data = await cached(bucket, 'cache/jarvis-messenger.json', 60_000, async () => {
    const r = await graph(env, `${m.pageId}/conversations`, m.pageToken, fetchImpl, {
      platform: 'messenger', limit: '25',
      fields: 'id,updated_time,unread_count,link,participants,messages.limit(1){message,from,created_time}',
    });
    return (r.data || []).map(c => {
      const them = (c.participants?.data || []).find(p => String(p.id) !== String(m.pageId)) || {};
      const last = c.messages?.data?.[0] || {};
      return {
        id: c.id, psid: them.id || null, name: them.name || 'Facebook user', updated: c.updated_time, unread: Number(c.unread_count) || 0,
        snippet: String(last.message || '').slice(0, 200), lastFromPage: String(last.from?.id) === String(m.pageId), lastAt: last.created_time || c.updated_time,
        link: c.link ? `https://www.facebook.com${c.link}` : BUSINESS_INBOX,
      };
    });
  }, { now, force });
  return { connected: true, inboxUrl: BUSINESS_INBOX, unreadCount: data.reduce((t, c) => t + (c.unread ? 1 : 0), 0), conversations: data };
}

export async function messengerThread({ env, bucket, id, fetchImpl = (...a) => fetch(...a) }) {
  const m = (await readJson(bucket, CONN_KEY))?.meta;
  if (!m?.pageToken) return { connected: false };
  if (!/^t_[\w-]+$/.test(String(id))) throw new Error('Bad conversation id.');
  const r = await graph(env, id, m.pageToken, fetchImpl, { fields: 'messages.limit(25){message,from,created_time}' });
  const messages = (r.messages?.data || []).map(x => ({ text: x.message || '', fromPage: String(x.from?.id) === String(m.pageId), from: x.from?.name || '', at: x.created_time })).reverse();
  return { connected: true, id, messages };
}

// Lead <-> conversation: only an exact full-name match (never a first name alone).
export function conversationForLead(lead, conversations = []) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  const full = norm(`${lead.fname || ''} ${lead.lname || ''}`);
  if (!full.includes(' ')) return null;
  const hits = conversations.filter(c => norm(c.name) === full);
  return hits.length === 1 ? hits[0] : null;
}

// Sends as the page. The page shows the exact text twice (review, then "send now?");
// the server still refuses without both confirmations. Inside Facebook's 24-hour
// window it's a normal reply; after that it tries the human-agent tag (7 days),
// which Facebook may refuse without approval — then the owner uses Business Suite.
export async function sendMessenger({ env, bucket, psid, text, reviewed, confirmed, leadId = null, sbGet, sbPatch, now = Date.now(), fetchImpl = (...a) => fetch(...a) }) {
  if (reviewed !== true || confirmed !== true) return { needs_confirmation: true, error: 'Review the message and confirm twice before sending.' };
  const m = (await readJson(bucket, CONN_KEY))?.meta;
  if (!m?.pageToken || !m?.pageId) throw new Error('Facebook is not connected.');
  const msg = String(text || '').trim();
  if (!msg) throw new Error('The message is empty.');
  if (msg.length > 2000) throw new Error('Messenger messages are limited to 2,000 characters.');
  if (!/^\d+$/.test(String(psid))) throw new Error('No Messenger conversation for this person.');
  const post = body => graph(env, `${m.pageId}/messages`, m.pageToken, (url, init) => fetchImpl(url, { ...init, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const base = { recipient: { id: String(psid) }, message: { text: msg } };
  let sent;
  try {
    sent = await post({ ...base, messaging_type: 'RESPONSE' });
  } catch (e) {
    if (!/24|window|outside|allowed|policy/i.test(e.message)) throw e;
    try { sent = await post({ ...base, messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }); } catch {
      throw new Error('Facebook only allows page replies within 24 hours of their last message. Reply in Business Suite instead — nothing was sent.');
    }
  }
  await writeJson(bucket, 'cache/jarvis-messenger.json', null).catch(() => {}); // next read shows the reply
  let lead = null;
  if (leadId && sbGet && sbPatch) {
    [lead] = await sbGet('leads', { select: 'id,status,notes', id: `eq.${leadId}`, limit: '1' });
    if (lead) await markLeadContacted({ sbPatch, lead, note: `Messaged on Messenger ${new Date(now).toISOString().slice(0, 10)}`, now });
  }
  return { ok: true, messageId: sent?.message_id || null, leadStatus: lead ? (['new', 'no_response'].includes(lead.status) ? 'contacted' : lead.status) : null };
}

export function messagesLine(f) {
  if (!f?.connected) return "Facebook isn't connected yet, sir.";
  if (f.error) return /permission|pages_messaging/i.test(f.error) ? "I need the pages_messaging permission to read your Facebook messages, sir. The steps are on screen." : "I couldn't reach Facebook just now, sir.";
  const unread = (f.conversations || []).filter(c => c.unread);
  if (!unread.length) return 'No unread Facebook messages, sir.';
  return `${cap(count(unread.length, 'unread conversation'))}, sir — the latest from ${unread[0].name}.`;
}

// After a reply: new / no-response leads become "contacted" (same fields as the
// admin status change); later stages are left alone. The reply is noted on the lead.
export async function markLeadContacted({ sbPatch, lead, note, now = Date.now() }) {
  const fields = { last_contacted_at: new Date(now).toISOString(), notes: [lead.notes, note].filter(Boolean).join('\n') };
  if (['new', 'no_response'].includes(lead.status)) fields.status = 'contacted';
  await sbPatch('leads', `id=eq.${encodeURIComponent(lead.id)}`, fields);
  return fields;
}

// ---- Zoho Mail ----------------------------------------------------------------------------

const ZOHO_DCS = ['com', 'eu', 'in', 'com.au', 'jp', 'ca', 'sa', 'com.cn'];
const zohoAccounts = dc => (dc === 'ca' ? 'https://accounts.zohocloud.ca' : `https://accounts.zoho.${dc}`);
const zohoMailHost = dc => (dc === 'ca' ? 'https://mail.zohocloud.ca' : `https://mail.zoho.${dc}`);

// Self Client: client id + secret + the one-time code (scope
// ZohoMail.accounts.READ,ZohoMail.messages.READ,ZohoMail.messages.CREATE — CREATE is only
// used by the owner-confirmed SEO outreach emails). The data center is found by trying each.
export async function connectZoho({ bucket, clientId, clientSecret, code, now = Date.now(), fetchImpl = (...a) => fetch(...a) }) {
  if (!clientId || !clientSecret || !code) throw new Error('Client ID, client secret and the generated code are all needed.');
  let tok = null; let dc = null; let lastErr = 'no response';
  for (const d of ZOHO_DCS) {
    const q = new URLSearchParams({ code: code.trim(), client_id: clientId.trim(), client_secret: clientSecret.trim(), grant_type: 'authorization_code' });
    const res = await fetchImpl(`${zohoAccounts(d)}/oauth/v2/token?${q}`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (body.refresh_token) { tok = body; dc = d; break; }
    lastErr = body.error || `HTTP ${res.status}`;
    if (lastErr !== 'invalid_code' && lastErr !== 'invalid_client') break; // right DC, other problem
  }
  if (!tok) throw new Error(`Zoho refused the code (${lastErr}). Codes expire after a few minutes: generate a new one and paste it right away.`);
  const acc = await zohoGet(dc, '/api/accounts', tok.access_token, fetchImpl);
  const a = acc.data?.[0];
  if (!a?.accountId) throw new Error('Zoho connected, but no mail account was found.');
  const zoho = { clientId: clientId.trim(), clientSecret: clientSecret.trim(), refreshToken: tok.refresh_token, dc, accountId: a.accountId, email: a.primaryEmailAddress || a.mailboxAddress || null, connectedAt: new Date(now).toISOString() };
  const conn = (await readJson(bucket, CONN_KEY)) || {};
  await writeJson(bucket, CONN_KEY, { ...conn, zoho });
  await writeJson(bucket, ZOHO_TOKEN_KEY, { token: tok.access_token, exp: now + (Number(tok.expires_in) || 3600) * 1000 - 120_000 });
  return { connected: true, email: zoho.email };
}

async function zohoGet(dc, path, token, fetchImpl) {
  const res = await fetchImpl(`${zohoMailHost(dc)}${path}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Zoho Mail: ${body.data?.errorCode || body.status?.description || `HTTP ${res.status}`}`);
  return body;
}
async function zohoToken(z, bucket, now, fetchImpl) {
  const t = await readJson(bucket, ZOHO_TOKEN_KEY);
  if (t?.token && t.exp > now) return t.token;
  const q = new URLSearchParams({ refresh_token: z.refreshToken, client_id: z.clientId, client_secret: z.clientSecret, grant_type: 'refresh_token' });
  const res = await fetchImpl(`${zohoAccounts(z.dc)}/oauth/v2/token?${q}`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!body.access_token) throw new Error(`Zoho sign-in expired (${body.error || res.status}). Reconnect Zoho Mail.`);
  await writeJson(bucket, ZOHO_TOKEN_KEY, { token: body.access_token, exp: now + (Number(body.expires_in) || 3600) * 1000 - 120_000 });
  return body.access_token;
}

export const isPartsEmail = m => /o'?reilly|oreillyauto|firstcall/i.test(`${m.from} ${m.fromName} ${m.subject}`);

export async function mailFeed({ bucket, now = Date.now(), force = false, fetchImpl = (...a) => fetch(...a) }) {
  const z = (await readJson(bucket, CONN_KEY))?.zoho;
  if (!z?.refreshToken) return { connected: false };
  const data = await cached(bucket, 'cache/jarvis-mail.json', FEED_TTL.mail, async () => {
    const token = await zohoToken(z, bucket, now, fetchImpl);
    const base = `/api/accounts/${z.accountId}/messages/view`;
    const [all, unread] = await Promise.all([
      zohoGet(z.dc, `${base}?limit=25&sortorder=false`, token, fetchImpl),
      zohoGet(z.dc, `${base}?limit=100&status=unread&sortorder=false`, token, fetchImpl).catch(() => ({ data: [] })),
    ]);
    const unreadIds = new Set((unread.data || []).map(m => String(m.messageId)));
    const messages = (all.data || []).map(m => ({
      id: String(m.messageId), folderId: String(m.folderId || ''), subject: m.subject || '(no subject)',
      from: m.fromAddress || '', fromName: String(m.sender || m.fromAddress || '').replace(/&quot;|"/g, '').trim(),
      at: m.receivedTime ? new Date(Number(m.receivedTime)).toISOString() : null, summary: String(m.summary || '').slice(0, 280),
      unread: unreadIds.has(String(m.messageId)), attachments: m.hasAttachment === '1' || m.hasAttachment === true,
    })).map(m => ({ ...m, parts: isPartsEmail(m) }));
    return { email: z.email, unreadCount: unreadIds.size, messages };
  }, { now, force });
  const last24 = data.messages.filter(m => m.at && now - Date.parse(m.at) <= DAY);
  return { connected: true, ...data, last24: last24.length, partsEmails: data.messages.filter(m => m.parts && m.at && now - Date.parse(m.at) <= 2 * DAY) };
}

// One email's text (HTML stripped; the page renders it as plain text).
export async function mailMessage({ bucket, id, folderId, now = Date.now(), fetchImpl = (...a) => fetch(...a) }) {
  const z = (await readJson(bucket, CONN_KEY))?.zoho;
  if (!z?.refreshToken) return { connected: false };
  if (!/^\d+$/.test(String(id)) || !/^\d+$/.test(String(folderId))) throw new Error('Bad message id.');
  const token = await zohoToken(z, bucket, now, fetchImpl);
  const body = await zohoGet(z.dc, `/api/accounts/${z.accountId}/folders/${folderId}/messages/${id}/content`, token, fetchImpl);
  return { id, text: htmlToText(body.data?.content || '') };
}
// Send one plain-text email from the connected Zoho mailbox. Callers own the
// confirmation (SEO link outreach: functions/_lib/seo/outreach.js). Needs the
// ZohoMail.messages.CREATE scope; a read-only connection gets a clear error.
export async function sendZohoMail({ bucket, to, subject, text, now = Date.now(), fetchImpl = (...a) => fetch(...a) }) {
  const z = (await readJson(bucket, CONN_KEY))?.zoho;
  if (!z?.refreshToken) throw new Error('Zoho Mail is not connected.');
  const token = await zohoToken(z, bucket, now, fetchImpl);
  const res = await fetchImpl(`${zohoMailHost(z.dc)}/api/accounts/${z.accountId}/messages`, {
    method: 'POST', headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromAddress: z.email, toAddress: to, subject, content: text, mailFormat: 'plaintext' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String(body.data?.errorCode || body.status?.description || `HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403 || /scope|permission|INVALID_OAUTHSCOPE/i.test(code)) throw new Error('Zoho Mail can read but not send yet. In Jarvis say \"check my email\", click Reconnect, and use the scope ZohoMail.accounts.READ,ZohoMail.messages.READ,ZohoMail.messages.CREATE.');
    throw new Error(`Zoho Mail: ${code}`);
  }
  return { from: z.email, messageId: body.data?.messageId || null };
}

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim().slice(0, 20000);
}

// ---- connection status + the brief ----------------------------------------------------------

export async function feedStatus({ env, bucket }) {
  const conn = (await readJson(bucket, CONN_KEY)) || {};
  return {
    storage: !!bucket,
    reviews: { connected: !!(env.GOOGLE_PLACES_API_KEY && env.GOOGLE_PLACE_ID) },
    meta: publicMeta(conn.meta),
    ads: { connected: !!(conn.meta?.adAccountId || (env.META_ADS_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID)) },
    mail: conn.zoho ? { connected: true, email: conn.zoho.email } : { connected: false },
  };
}

export async function disconnectFeed({ bucket, which }) {
  const conn = (await readJson(bucket, CONN_KEY)) || {};
  if (which !== 'meta' && which !== 'zoho') throw new Error('Unknown connection.');
  delete conn[which];
  await writeJson(bucket, CONN_KEY, conn);
  return { ok: true };
}

const safe = p => p.catch(e => ({ connected: true, error: e?.message || String(e) }));

// business: ops.ownerBriefing() (functions/_lib/business-data.js); weather: weatherToday() shape.
export async function buildBrief({ env, bucket, business, weather = null, now = Date.now(), fetchImpl }) {
  const args = { env, bucket, now, fetchImpl };
  const [reviews, social, mail, ads, messenger] = await Promise.all([safe(reviewsFeed(args)), safe(socialFeed(args)), safe(mailFeed(args)), safe(adsFeed(args)), safe(messengerFeed(args))]);
  return { at: new Date(now).toISOString(), business, weather, reviews, social, mail, ads, messenger };
}

// Everything the brief needs, from one call: ops = createBusinessOps(...), sbGet(table, params).
export async function loadBrief({ env, ops, sbGet, now = Date.now(), fetchImpl }) {
  const today = phoenixYmd(new Date(now));
  const [business, forecast] = await Promise.all([
    ops.ownerBriefing().catch(e => ({ error: e.message })),
    sbGet('seo_weather_forecast', { select: 'date,tmin_f,tmax_f,short_forecast', date: `gte.${today}`, order: 'date.asc', limit: '5' }).catch(() => []),
  ]);
  const brief = await buildBrief({ env, bucket: env.GID_PHOTOS, business, weather: weatherToday(forecast, new Date(now)), now, fetchImpl });
  // Google ranking updates rolling out now (written by the SEO search_news monitor).
  const news = (await readJson(env.GID_PHOTOS, 'private/seo-search-news.json'))?.items || [];
  brief.searchUpdates = news.filter(i => i.source === 'google_status' && i.kind && i.kind !== 'incident' && !i.end).map(i => ({ title: i.title, started: i.date }));
  return brief;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n, one, many = `${one}s`) => `${WORDS[n] ?? n} ${n === 1 ? one : many}`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const clock = t => { const [h, m] = String(t || '').split(':').map(Number); if (!Number.isFinite(h)) return null; return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'a.m.' : 'p.m.'}`; };

// The spoken brief: short, JARVIS-styled, facts only; the screen carries the detail.
export function briefLine(b, hour = 9) {
  const parts = [];
  const greet = hour < 12 ? 'Good morning, sir.' : hour < 17 ? 'Good afternoon, sir.' : 'Good evening, sir.';
  const biz = b.business || {};
  const jobs = biz.todayJobs || [];
  if (jobs.length) {
    const first = jobs[0]; const at = clock(first.time);
    parts.push(`${cap(count(jobs.length, 'job'))} today${at && first.customer ? `, the first at ${at} with ${first.customer.split(' ')[0]}` : ''}.`);
  } else parts.push((biz.tomorrowJobs || []).length ? `Nothing booked today; ${count(biz.tomorrowJobs.length, 'job')} tomorrow.` : 'The schedule is clear today.');
  const w = b.weather?.today;
  if (w?.summary) parts.push(`${w.summary}${w.highF != null ? `, high of ${Math.round(w.highF)}` : ''}.`);
  const todo = [];
  if (biz.leadsNeedingAttention?.length) todo.push(`${count(biz.leadsNeedingAttention.length, 'lead')} to follow up`);
  if (biz.unpaid?.length) todo.push(`${count(biz.unpaid.length, 'unpaid job')}`);
  if (biz.remindersNeedingAttention?.length) todo.push(`${count(biz.remindersNeedingAttention.length, 'reminder')}`);
  if (todo.length) parts.push(`${cap(todo.join(', '))}.`);
  const r = b.reviews;
  if (r?.connected && !r.error && r.new7 > 0) parts.push(`You've had ${count(r.new7, 'new review')} in the past week${r.rating ? `, holding at ${r.rating} stars` : ''}.`);
  const c = b.social?.changes;
  if (b.social?.connected && c) {
    const likes = (c.fbPostReactions > 0 ? c.fbPostReactions : 0) + (c.igPostLikes > 0 ? c.igPostLikes : 0) + (c.fbPageLikes > 0 ? c.fbPageLikes : 0);
    const followers = (c.fbFollowers > 0 ? c.fbFollowers : 0) + (c.igFollowers > 0 ? c.igFollowers : 0);
    if (likes || followers) parts.push(`Overnight: ${[likes && count(likes, 'new like'), followers && count(followers, 'new follower')].filter(Boolean).join(' and ')}.`);
  }
  const fbUnread = b.messenger?.connected && !b.messenger.error ? (b.messenger.conversations || []).filter(c => c.unread) : [];
  if (fbUnread.length) parts.push(`${cap(count(fbUnread.length, 'unread Facebook message'))}${fbUnread.length === 1 ? `, from ${fbUnread[0].name}` : ''}.`);
  const m = b.mail;
  if (m?.connected && !m.error) {
    if (m.unreadCount) parts.push(`${cap(count(m.unreadCount, 'unread email'))}${m.partsEmails?.length ? `, including ${m.partsEmails.length === 1 ? "one from O'Reilly" : `${count(m.partsEmails.length, "O'Reilly email")}`}` : ''}.`);
  }
  const up = (b.searchUpdates || [])[0];
  if (up) parts.push(`Google's ${up.title} is still rolling out, so search positions may wobble this week.`);
  const a = b.ads;
  if (a?.connected && !a.error && a.yesterday?.spend > 0) parts.push(`Ads spent $${a.yesterday.spend.toFixed(2)} yesterday${a.yesterday.leads ? ` for ${count(a.yesterday.leads, 'lead')}` : ''}.`);
  return [greet, ...parts].join(' ');
}

export function reviewsLine(r) {
  if (!r?.connected) return "Google reviews aren't connected, sir.";
  if (r.error) return `I couldn't reach Google just now, sir.`;
  const lead = `${r.rating ?? '—'} stars across ${r.total ?? 0} reviews, sir.`;
  return r.new7 > 0 ? `${lead} ${cap(count(r.new7, 'new one'))} this past week.` : `${lead} Nothing new this week.`;
}
export function socialLine(s) {
  if (!s?.connected) return "Facebook and Instagram aren't connected yet, sir. The connect button is on screen.";
  if (s.error) return "I couldn't reach Meta just now, sir.";
  const c = s.changes; const bits = [];
  if (s.facebook?.followers != null) bits.push(`${s.facebook.followers} on Facebook`);
  if (s.instagram?.followers != null) bits.push(`${s.instagram.followers} on Instagram`);
  const since = c ? [c.fbFollowers, c.igFollowers].filter(v => v > 0).reduce((t, v) => t + v, 0) : 0;
  const likes = c ? [c.fbPostReactions, c.igPostLikes, c.fbPageLikes].filter(v => v > 0).reduce((t, v) => t + v, 0) : 0;
  const delta = since || likes ? ` Since yesterday: ${[likes && count(likes, 'new like'), since && count(since, 'new follower')].filter(Boolean).join(' and ')}.` : '';
  return `${bits.length ? `Followers: ${bits.join(', ')}, sir.` : 'Your pages, sir.'}${delta}`;
}
export function mailLine(m) {
  if (!m?.connected) return "Zoho Mail isn't connected yet, sir. The connect button is on screen.";
  if (m.error) return "I couldn't reach Zoho just now, sir.";
  if (!m.unreadCount) return 'No unread email, sir.';
  const parts = m.partsEmails?.length ? `, ${m.partsEmails.length === 1 ? "one from O'Reilly" : `${count(m.partsEmails.length, "from O'Reilly", "from O'Reilly")}`}` : '';
  return `${cap(count(m.unreadCount, 'unread email'))}${parts}, sir.`;
}

export function leadsLine(leads = []) {
  const open = leads.filter(l => ['new', 'no_response'].includes(l.status));
  if (!open.length) return leads.length ? 'No new leads waiting, sir.' : 'No leads yet, sir.';
  const first = open[0]; const name = `${first.fname || ''} ${first.lname || ''}`.trim() || 'someone';
  return `${cap(count(open.length, 'new lead'))}, sir${open.length > 1 ? ` — the newest is ${name}` : `: ${name}`}.`;
}
