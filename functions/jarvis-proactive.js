// Cloudflare Pages Function — POST /jarvis-proactive
// Scheduled/proactive delivery for GID Jarvis.
//
// Expected caller: Supabase pg_cron + pg_net (see 02_schedule_proactive.sql).
// The caller must send X-GID-Proactive-Secret matching TELEGRAM_WEBHOOK_SECRET.
//
// Existing Cloudflare env vars reused:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_WEBHOOK_SECRET
//   TELEGRAM_OWNER_CHAT_ID
//   SUPABASE_URL (or VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_KEY
//   ANTHROPIC_API_KEY
//
// Optional env vars:
//   JARVIS_MORNING_BRIEF_HOUR=8          (America/Phoenix, default 8)
//   JARVIS_EVENING_PREVIEW_HOUR=19       (America/Phoenix; unset = disabled)
//
// Behavior:
// - Sends due owner reminders once, then sets jarvis_reminders.notified_at.
// - Sends one morning owner briefing each day.
// - Sends lead-attention alerts only when the attention set changes, and only
//   between 08:00 and 20:59 Phoenix time.
// - Optional evening tomorrow preview, once daily, if configured.

import { onRequestPost as runAdminAI } from './admin-ai-chat.js';

const TZ = 'America/Phoenix';
const HISTORY_TEXT_LIMIT = 12000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function normalizeId(value) {
  return String(value ?? '').trim();
}

function supabaseConfig(env) {
  return {
    url: env.SUPABASE_URL ?? env.VITE_SUPABASE_URL,
    key: env.SUPABASE_SERVICE_KEY,
  };
}

function phoenixParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

function phoenixDateString(date = new Date()) {
  const p = phoenixParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function configuredHour(value, fallback = null) {
  if (value == null || String(value).trim() === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
}

async function telegramRequest(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(`Telegram ${method} failed: ${data?.description || `HTTP ${res.status}`}`);
  }
  return data.result;
}

async function sendTelegramText(token, chatId, text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  // Keep proactive messages comfortably below Telegram's 4096-char limit.
  const chunks = [];
  for (let i = 0; i < clean.length; i += 3900) chunks.push(clean.slice(i, i + 3900));
  for (const chunk of chunks) {
    await telegramRequest(token, 'sendMessage', {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    });
  }
}

async function sbRequest(env, path, options = {}) {
  const { url, key } = supabaseConfig(env);
  if (!url || !key) throw new Error('Supabase environment variables are incomplete.');
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sbGet(env, table, params) {
  const qs = new URLSearchParams(params).toString();
  return (await sbRequest(env, `${table}?${qs}`)) || [];
}

async function sbPatch(env, table, filter, fields) {
  return sbRequest(env, `${table}?${filter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(fields),
  });
}

async function getState(env, key) {
  const rows = await sbGet(env, 'jarvis_proactive_state', {
    select: 'key,value,updated_at',
    key: `eq.${key}`,
    limit: '1',
  });
  return rows[0] || null;
}

async function setState(env, key, value) {
  const encoded = encodeURIComponent(key);
  const existing = await getState(env, key);
  if (existing) {
    await sbPatch(env, 'jarvis_proactive_state', `key=eq.${encoded}`, {
      value,
      updated_at: new Date().toISOString(),
    });
    return;
  }
  await sbRequest(env, 'jarvis_proactive_state', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
}

async function saveAssistantHistory(env, chatId, content) {
  const clean = String(content || '').trim();
  if (!clean) return;
  await sbRequest(env, 'jarvis_text_messages', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      chat_id: String(chatId),
      role: 'assistant',
      content: clean.slice(0, HISTORY_TEXT_LIMIT),
      telegram_message_id: null,
    }),
  }).catch(() => {});
}

async function extractFinalText(response) {
  const raw = await response.text();
  let finalText = '';
  let errorText = '';
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'final' && event.text) finalText = String(event.text);
      if (event.type === 'error' && event.message) errorText = String(event.message);
    } catch {
      // admin-ai-chat normally emits NDJSON; ignore malformed lines.
    }
  }
  if (!response.ok && !errorText) errorText = `Jarvis request failed (${response.status}).`;
  if (errorText) throw new Error(errorText);
  return finalText.trim();
}

async function askJarvis(env, prompt) {
  const internalRequest = new Request('https://internal.gidgarage/admin-ai-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GID-Internal-Jarvis': env.TELEGRAM_WEBHOOK_SECRET,
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
  });
  return extractFinalText(await runAdminAI({ request: internalRequest, env }));
}

function leadName(lead) {
  return `${lead.fname || ''} ${lead.lname || ''}`.trim() || lead.email || lead.phone || 'Unnamed lead';
}

function leadAttentionRows(rows, now) {
  const nowMs = now.getTime();
  return rows
    .filter(l => !['booked', 'lost'].includes(String(l.status || '').toLowerCase()))
    .filter(l => {
      const followMs = l.follow_up_at ? new Date(l.follow_up_at).getTime() : null;
      const createdMs = new Date(l.created_at).getTime();
      const staleUncontacted = !l.last_contacted_at && Number.isFinite(createdMs) && nowMs - createdMs > 86400000;
      return (followMs != null && followMs <= nowMs) || staleUncontacted;
    })
    .sort((a, b) => {
      const av = a.follow_up_at ? new Date(a.follow_up_at).getTime() : new Date(a.created_at).getTime();
      const bv = b.follow_up_at ? new Date(b.follow_up_at).getTime() : new Date(b.created_at).getTime();
      return av - bv;
    });
}

function leadFingerprint(rows) {
  return rows
    .map(l => `${l.id}|${l.follow_up_at || ''}|${l.last_contacted_at || ''}|${l.status || ''}`)
    .sort()
    .join('||');
}

function formatLeadAlert(rows) {
  if (rows.length === 1) {
    const l = rows[0];
    const reason = l.follow_up_at ? 'follow-up is due' : 'has not been contacted in over 24 hours';
    return `Lead follow-up: ${leadName(l)} ${reason}.`;
  }
  const shown = rows.slice(0, 5).map(l => `• ${leadName(l)}${l.requested_service ? ` — ${l.requested_service}` : ''}`);
  const extra = rows.length > 5 ? `\n+${rows.length - 5} more` : '';
  return `You have ${rows.length} leads needing follow-up:\n${shown.join('\n')}${extra}`;
}

async function deliverDueReminders(env, botToken, chatId, now, actions) {
  const rows = await sbGet(env, 'jarvis_reminders', {
    select: 'id,title,notes,due_at,status,notified_at',
    status: 'eq.open',
    notified_at: 'is.null',
    due_at: `lte.${now.toISOString()}`,
    order: 'due_at.asc',
    limit: '20',
  });
  if (!rows.length) return;

  const text = rows.length === 1
    ? `Reminder: ${rows[0].title}${rows[0].notes ? `\n${rows[0].notes}` : ''}`
    : `Reminders due:\n${rows.map(r => `• ${r.title}`).join('\n')}`;

  await sendTelegramText(botToken, chatId, text);
  await saveAssistantHistory(env, chatId, text);

  const notifiedAt = new Date().toISOString();
  for (const row of rows) {
    await sbPatch(env, 'jarvis_reminders', `id=eq.${encodeURIComponent(row.id)}`, {
      notified_at: notifiedAt,
      updated_at: notifiedAt,
    });
  }
  actions.push(`reminders:${rows.length}`);
}

async function maybeMorningBrief(env, botToken, chatId, parts, actions) {
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const configured = configuredHour(env.JARVIS_MORNING_BRIEF_HOUR, 8);
  if (hour !== configured || minute > 29) return;

  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const stateKey = `morning_brief:${date}`;
  if (await getState(env, stateKey)) return;

  const text = await askJarvis(env,
    'Give me my morning owner briefing for today. Use get_owner_briefing. Keep it to the important business facts and action items only. Do not add generic encouragement or filler.'
  );
  if (!text) return;
  await sendTelegramText(botToken, chatId, text);
  await saveAssistantHistory(env, chatId, text);
  await setState(env, stateKey, { sent_at: new Date().toISOString() });
  actions.push('morning_brief');
}

async function maybeEveningPreview(env, botToken, chatId, parts, actions) {
  const configured = configuredHour(env.JARVIS_EVENING_PREVIEW_HOUR, null);
  if (configured == null) return;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (hour !== configured || minute > 29) return;

  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const stateKey = `evening_preview:${date}`;
  if (await getState(env, stateKey)) return;

  const text = await askJarvis(env,
    'Give me a concise preview for tomorrow. Use get_owner_briefing and focus on tomorrow jobs plus anything I should handle before the day starts. Do not include unrelated filler.'
  );
  if (!text) return;
  await sendTelegramText(botToken, chatId, text);
  await saveAssistantHistory(env, chatId, text);
  await setState(env, stateKey, { sent_at: new Date().toISOString() });
  actions.push('evening_preview');
}

async function maybeLeadAlert(env, botToken, chatId, now, parts, actions) {
  const hour = Number(parts.hour);
  // Do not proactively nag about leads overnight.
  if (hour < 8 || hour > 20) return;

  const rows = await sbGet(env, 'leads', {
    select: 'id,created_at,fname,lname,phone,email,vehicle,requested_service,status,follow_up_at,last_contacted_at',
    order: 'created_at.desc',
    limit: '200',
  });
  const attention = leadAttentionRows(rows, now);
  const fingerprint = leadFingerprint(attention);
  const stateKey = 'lead_attention_fingerprint';
  const prior = await getState(env, stateKey);
  const priorFingerprint = String(prior?.value?.fingerprint || '');

  // Keep state synchronized when everything becomes clear so the next future
  // attention item can trigger normally.
  if (!attention.length) {
    if (priorFingerprint) await setState(env, stateKey, { fingerprint: '', count: 0 });
    return;
  }
  if (fingerprint === priorFingerprint) return;

  const text = formatLeadAlert(attention);
  await sendTelegramText(botToken, chatId, text);
  await saveAssistantHistory(env, chatId, text);
  await setState(env, stateKey, {
    fingerprint,
    count: attention.length,
    sent_at: new Date().toISOString(),
  });
  actions.push(`lead_alert:${attention.length}`);
}

export async function onRequestPost({ request, env }) {
  const supplied = request.headers.get('X-GID-Proactive-Secret') || '';
  if (!env.TELEGRAM_WEBHOOK_SECRET || supplied !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ ok: false }, 403);
  }

  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = normalizeId(env.TELEGRAM_OWNER_CHAT_ID);
  const { url, key } = supabaseConfig(env);
  if (!botToken || !chatId || !url || !key) {
    return json({ ok: false, error: 'Required Telegram/Supabase environment variables are incomplete.' }, 500);
  }

  const now = new Date();
  const parts = phoenixParts(now);
  const actions = [];
  const errors = [];

  // Each section is isolated: a failure in one proactive feature must not stop
  // reminders or another feature from delivering.
  for (const task of [
    () => deliverDueReminders(env, botToken, chatId, now, actions),
    () => maybeMorningBrief(env, botToken, chatId, parts, actions),
    () => maybeLeadAlert(env, botToken, chatId, now, parts, actions),
    () => maybeEveningPreview(env, botToken, chatId, parts, actions),
  ]) {
    try {
      await task();
    } catch (error) {
      console.error('jarvis-proactive task error:', error);
      errors.push(String(error?.message || error));
    }
  }

  return json({
    ok: errors.length === 0,
    phoenix_time: `${phoenixDateString(now)} ${parts.hour}:${parts.minute}`,
    actions,
    errors,
  }, errors.length ? 500 : 200);
}
