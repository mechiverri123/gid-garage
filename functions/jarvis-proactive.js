// Cloudflare Pages Function — POST /jarvis-proactive
// GID Jarvis proactive owner assistant.
//
// Called once per minute by the existing Supabase pg_cron job.
// Caller must send X-GID-Proactive-Secret matching TELEGRAM_WEBHOOK_SECRET.
//
// Existing Cloudflare env vars reused:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_WEBHOOK_SECRET
//   TELEGRAM_OWNER_CHAT_ID
//   SUPABASE_URL (or VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_KEY
//
// Optional env vars:
//   JARVIS_MORNING_BRIEF_HOUR=8       (America/Phoenix, default 8)
//   JARVIS_EVENING_PREVIEW_HOUR=19    (America/Phoenix, default 19)
//
// Behavior:
// - Due reminders are pushed exactly once.
// - Morning brief is sent once/day only when there is something useful to say.
// - Lead alerts are sent only when the set of leads needing attention changes.
// - Unpaid-invoice alerts are sent only when the outstanding set changes.
// - Evening preview is sent once/day only when tomorrow/action items exist.
// - Proactive business alerts are quiet overnight.

import { resolvePeriodWindow, collectedRevenue, jobFromRow } from '../shared/business-metrics.js';
import { leadFollowUpReason, unpaidJobs, isCancelled } from '../shared/business-rules.js';
import { createSeoStore } from './_lib/seo/store.js';
import { createSeoOps } from './_lib/seo/ops.js';

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

function money(value) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function addDate(dateString, days) {
  const [y, m, d] = String(dateString).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function localDayEndIso(dateString) {
  // Arizona/Phoenix stays UTC-07:00 year-round.
  return new Date(`${dateString}T23:59:59.999-07:00`).toISOString();
}

function configuredHour(value, fallback) {
  if (value == null || String(value).trim() === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
}

function cleanTime(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

function personName(row) {
  return `${row?.fname || ''} ${row?.lname || ''}`.trim() || row?.email || row?.phone || 'Unnamed';
}

function jobLine(job) {
  const time = cleanTime(job.time);
  const pieces = [time, personName(job), job.vehicle, job.service].filter(Boolean);
  return `• ${pieces.join(' — ')}`;
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
  for (let i = 0; i < clean.length; i += 3900) {
    await telegramRequest(token, 'sendMessage', {
      chat_id: chatId,
      text: clean.slice(i, i + 3900),
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

// Same follow-up rule as Jarvis chat and the action center (shared/business-rules.js).
function leadAttentionRows(rows, now) {
  return rows
    .map(l => ({ ...l, followUpReason: leadFollowUpReason(l, now) }))
    .filter(l => l.followUpReason)
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

function unpaidFingerprint(rows) {
  return rows
    .map(j => `${j.id}|${j.balance}|${j.job_status || ''}`)
    .sort()
    .join('||');
}

async function loadSnapshot(env, now) {
  const today = phoenixDateString(now);
  const tomorrow = addDate(today, 1);

  const [todayJobsRaw, tomorrowJobsRaw, leads, reminders, invoicedJobs, paidJobs] = await Promise.all([
    sbGet(env, 'bookings', {
      select: 'id,fname,lname,vehicle,service,date,time,job_status,status,estimate_amount,invoice_amount,amount_paid,paid_at',
      date: `eq.${today}`,
      order: 'time.asc',
      limit: '40',
    }),
    sbGet(env, 'bookings', {
      select: 'id,fname,lname,vehicle,service,date,time,job_status,status,estimate_amount,invoice_amount,amount_paid,paid_at',
      date: `eq.${tomorrow}`,
      order: 'time.asc',
      limit: '40',
    }),
    sbGet(env, 'leads', {
      select: 'id,created_at,fname,lname,phone,email,vehicle,requested_service,status,follow_up_at,last_contacted_at',
      order: 'created_at.desc',
      limit: '200',
    }),
    sbGet(env, 'jarvis_reminders', {
      select: 'id,title,notes,due_at,status,notified_at',
      status: 'eq.open',
      order: 'due_at.asc',
      limit: '100',
    }),
    // Unpaid = COMPLETED or INVOICED with a balance incl. tax (shared/business-rules.js).
    sbGet(env, 'bookings', {
      select: 'id,fname,lname,vehicle,service,job_status,status,estimate_amount,invoice_amount,tax_amount,amount_paid,paid_at,date,time',
      job_status: 'in.(COMPLETED,INVOICED)',
      order: 'date.desc',
      limit: '100',
    }),
    // Same rows as the dashboard so "collected" matches it (shared/business-metrics.js).
    // ponytail: full slim bookings scan every minute; gate to briefing times if it gets slow.
    sbGet(env, 'bookings', {
      select: 'id,job_status,status,paid_at,amount_paid,invoice_amount,tax_amount,parts_cost,payments',
      order: 'date.desc,time.desc',
      limit: '2000',
    }),
  ]);

  const activeJob = job => !isCancelled(jobFromRow(job)); // status OR job_status cancelled
  const todayJobs = todayJobsRaw.filter(activeJob);
  const tomorrowJobs = tomorrowJobsRaw.filter(activeJob);
  const leadAttention = leadAttentionRows(leads, now);
  const unpaidById = new Map(unpaidJobs(invoicedJobs.map(jobFromRow)).map(u => [u.job.id, u.balance]));
  const unpaid = invoicedJobs.filter(j => unpaidById.has(j.id)).map(j => ({ ...j, balance: unpaidById.get(j.id) }));
  const todayEnd = new Date(localDayEndIso(today)).getTime();
  const tomorrowEnd = new Date(localDayEndIso(tomorrow)).getTime();
  const remindersToday = reminders.filter(r => new Date(r.due_at).getTime() <= todayEnd);
  const remindersByTomorrow = reminders.filter(r => new Date(r.due_at).getTime() <= tomorrowEnd);
  const collected7d = collectedRevenue(paidJobs.map(jobFromRow), resolvePeriodWindow('last_7_days', now).inWindow).total;
  const unpaidTotal = unpaid.reduce((sum, j) => sum + j.balance, 0);

  return {
    today,
    tomorrow,
    todayJobs,
    tomorrowJobs,
    leadAttention,
    unpaid,
    remindersToday,
    remindersByTomorrow,
    collected7d,
    unpaidTotal,
  };
}

function formatLeadAlert(rows) {
  if (rows.length === 1) {
    const l = rows[0];
    const reason = l.followUpReason === 'follow_up_due' ? 'follow-up is due' : 'has not been contacted in over 24 hours';
    const service = l.requested_service ? ` (${l.requested_service})` : '';
    return `Lead follow-up: ${personName(l)}${service} — ${reason}.`;
  }
  const shown = rows.slice(0, 5).map(l => `• ${personName(l)}${l.requested_service ? ` — ${l.requested_service}` : ''}`);
  const extra = rows.length > 5 ? `\n+${rows.length - 5} more` : '';
  return `Lead follow-ups (${rows.length}):\n${shown.join('\n')}${extra}`;
}

function formatUnpaidAlert(rows) {
  const total = rows.reduce((sum, j) => sum + j.balance, 0);
  if (rows.length === 1) return `Payment outstanding: ${personName(rows[0])} — ${money(rows[0].balance)}.`;
  const shown = rows.slice(0, 5).map(j => `• ${personName(j)} — ${money(j.balance)}`);
  const extra = rows.length > 5 ? `\n+${rows.length - 5} more` : '';
  return `Outstanding balances: ${rows.length} totaling ${money(total)}\n${shown.join('\n')}${extra}`;
}

function formatMorningBrief(snapshot) {
  const lines = ['Morning brief'];

  if (snapshot.todayJobs.length) {
    lines.push('', `Today — ${snapshot.todayJobs.length} job${snapshot.todayJobs.length === 1 ? '' : 's'}`);
    lines.push(...snapshot.todayJobs.slice(0, 6).map(jobLine));
    if (snapshot.todayJobs.length > 6) lines.push(`+${snapshot.todayJobs.length - 6} more`);
  }

  const attention = [];
  if (snapshot.leadAttention.length) attention.push(`${snapshot.leadAttention.length} lead follow-up${snapshot.leadAttention.length === 1 ? '' : 's'}`);
  if (snapshot.remindersToday.length) attention.push(`${snapshot.remindersToday.length} reminder${snapshot.remindersToday.length === 1 ? '' : 's'} due/overdue`);
  if (snapshot.unpaid.length) attention.push(`${snapshot.unpaid.length} unpaid (${money(snapshot.unpaidTotal)})`);
  if (attention.length) lines.push('', `Needs attention — ${attention.join(' · ')}`);

  if (snapshot.tomorrowJobs.length) {
    lines.push('', `Tomorrow — ${snapshot.tomorrowJobs.length} job${snapshot.tomorrowJobs.length === 1 ? '' : 's'}`);
    lines.push(...snapshot.tomorrowJobs.slice(0, 3).map(jobLine));
    if (snapshot.tomorrowJobs.length > 3) lines.push(`+${snapshot.tomorrowJobs.length - 3} more`);
  }

  lines.push('', `Collected last 7 days — ${money(snapshot.collected7d)}`);
  return lines.join('\n');
}

function formatEveningPreview(snapshot) {
  const lines = ['Tomorrow preview'];

  if (snapshot.tomorrowJobs.length) {
    lines.push('', `${snapshot.tomorrowJobs.length} job${snapshot.tomorrowJobs.length === 1 ? '' : 's'} scheduled`);
    lines.push(...snapshot.tomorrowJobs.slice(0, 8).map(jobLine));
    if (snapshot.tomorrowJobs.length > 8) lines.push(`+${snapshot.tomorrowJobs.length - 8} more`);
  }

  const actionItems = [];
  if (snapshot.leadAttention.length) actionItems.push(`${snapshot.leadAttention.length} lead follow-up${snapshot.leadAttention.length === 1 ? '' : 's'}`);
  if (snapshot.remindersByTomorrow.length) actionItems.push(`${snapshot.remindersByTomorrow.length} open reminder${snapshot.remindersByTomorrow.length === 1 ? '' : 's'} due by tomorrow`);
  if (snapshot.unpaid.length) actionItems.push(`${snapshot.unpaid.length} unpaid`);
  if (actionItems.length) lines.push('', `Still open — ${actionItems.join(' · ')}`);

  return lines.join('\n');
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

// Weekly local-SEO briefing: Mondays at JARVIS_SEO_BRIEF_HOUR (default 9),
// once per week, only when there is real local data to report.
async function maybeSeoWeeklyBrief(env, botToken, chatId, parts, snapshot, actions, now) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
  if (weekday !== 'Mon' || Number(parts.hour) !== configuredHour(env.JARVIS_SEO_BRIEF_HOUR, 9) || Number(parts.minute) > 29) return;
  const stateKey = `seo_weekly:${snapshot.today}`;
  if (await getState(env, stateKey)) return;
  const { url, key } = supabaseConfig(env);
  const { text } = await createSeoOps({ store: createSeoStore({ supabaseUrl: url, serviceKey: key }), env, now }).briefing();
  if (!text) {
    await setState(env, stateKey, { skipped: true, reason: 'no_local_seo_data', checked_at: new Date().toISOString() });
    actions.push('seo_weekly:quiet');
    return;
  }
  const message = `Local SEO — last 7 days

${text}`;
  await sendTelegramText(botToken, chatId, message);
  await saveAssistantHistory(env, chatId, message);
  await setState(env, stateKey, { sent_at: new Date().toISOString() });
  actions.push('seo_weekly:sent');
}

async function maybeMorningBrief(env, botToken, chatId, parts, snapshot, actions) {
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const configured = configuredHour(env.JARVIS_MORNING_BRIEF_HOUR, 8);
  if (hour !== configured || minute > 29) return;

  const stateKey = `morning_brief:${snapshot.today}`;
  if (await getState(env, stateKey)) return;

  // A completely empty day does not deserve a notification just to say it is empty.
  const meaningful = snapshot.todayJobs.length || snapshot.tomorrowJobs.length || snapshot.leadAttention.length || snapshot.remindersToday.length || snapshot.unpaid.length;
  if (!meaningful) {
    await setState(env, stateKey, { skipped: true, reason: 'nothing_meaningful', checked_at: new Date().toISOString() });
    actions.push('morning_brief:quiet');
    return;
  }

  const text = formatMorningBrief(snapshot);
  await sendTelegramText(botToken, chatId, text);
  await saveAssistantHistory(env, chatId, text);
  await setState(env, stateKey, { sent_at: new Date().toISOString() });

  // The morning brief already surfaced these two attention sets. Seed their
  // fingerprints so the same minute does not immediately send duplicate alerts.
  await setState(env, 'lead_attention_fingerprint', {
    fingerprint: leadFingerprint(snapshot.leadAttention),
    count: snapshot.leadAttention.length,
    synced_by: 'morning_brief',
  });
  await setState(env, 'unpaid_attention_fingerprint', {
    fingerprint: unpaidFingerprint(snapshot.unpaid),
    count: snapshot.unpaid.length,
    synced_by: 'morning_brief',
  });

  actions.push('morning_brief');
}

async function maybeLeadAlert(env, botToken, chatId, parts, snapshot, actions) {
  const hour = Number(parts.hour);
  if (hour < 8 || hour > 20) return;

  const attention = snapshot.leadAttention;
  const fingerprint = leadFingerprint(attention);
  const stateKey = 'lead_attention_fingerprint';
  const prior = await getState(env, stateKey);
  const priorFingerprint = String(prior?.value?.fingerprint || '');

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

async function maybeUnpaidAlert(env, botToken, chatId, parts, snapshot, actions) {
  const hour = Number(parts.hour);
  if (hour < 8 || hour > 20) return;

  const unpaid = snapshot.unpaid;
  const fingerprint = unpaidFingerprint(unpaid);
  const stateKey = 'unpaid_attention_fingerprint';
  const prior = await getState(env, stateKey);
  const priorFingerprint = String(prior?.value?.fingerprint || '');

  if (!unpaid.length) {
    if (priorFingerprint) await setState(env, stateKey, { fingerprint: '', count: 0 });
    return;
  }
  if (fingerprint === priorFingerprint) return;

  const text = formatUnpaidAlert(unpaid);
  await sendTelegramText(botToken, chatId, text);
  await saveAssistantHistory(env, chatId, text);
  await setState(env, stateKey, {
    fingerprint,
    count: unpaid.length,
    total: snapshot.unpaidTotal,
    sent_at: new Date().toISOString(),
  });
  actions.push(`unpaid_alert:${unpaid.length}`);
}

async function maybeEveningPreview(env, botToken, chatId, parts, snapshot, actions) {
  const configured = configuredHour(env.JARVIS_EVENING_PREVIEW_HOUR, 19);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (hour !== configured || minute > 29) return;

  const stateKey = `evening_preview:${snapshot.today}`;
  if (await getState(env, stateKey)) return;

  const meaningful = snapshot.tomorrowJobs.length || snapshot.leadAttention.length || snapshot.remindersByTomorrow.length || snapshot.unpaid.length;
  if (!meaningful) {
    await setState(env, stateKey, { skipped: true, reason: 'nothing_meaningful', checked_at: new Date().toISOString() });
    actions.push('evening_preview:quiet');
    return;
  }

  const text = formatEveningPreview(snapshot);
  await sendTelegramText(botToken, chatId, text);
  await saveAssistantHistory(env, chatId, text);
  await setState(env, stateKey, { sent_at: new Date().toISOString() });
  actions.push('evening_preview');
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

  // Reminders are independent of the business-intelligence snapshot so a
  // temporary problem with bookings/leads never blocks a due reminder.
  try {
    await deliverDueReminders(env, botToken, chatId, now, actions);
  } catch (error) {
    console.error('jarvis-proactive reminder error:', error);
    errors.push(`reminders: ${String(error?.message || error)}`);
  }

  let snapshot = null;
  try {
    snapshot = await loadSnapshot(env, now);
  } catch (error) {
    console.error('jarvis-proactive snapshot error:', error);
    errors.push(`snapshot: ${String(error?.message || error)}`);
  }

  if (snapshot) {
    for (const task of [
      () => maybeMorningBrief(env, botToken, chatId, parts, snapshot, actions),
      () => maybeLeadAlert(env, botToken, chatId, parts, snapshot, actions),
      () => maybeUnpaidAlert(env, botToken, chatId, parts, snapshot, actions),
      () => maybeEveningPreview(env, botToken, chatId, parts, snapshot, actions),
      () => maybeSeoWeeklyBrief(env, botToken, chatId, parts, snapshot, actions, now),
    ]) {
      try {
        await task();
      } catch (error) {
        console.error('jarvis-proactive intelligence task error:', error);
        errors.push(String(error?.message || error));
      }
    }
  }

  return json({
    ok: errors.length === 0,
    phoenix_time: `${phoenixDateString(now)} ${parts.hour}:${parts.minute}`,
    actions,
    errors,
  }, errors.length ? 500 : 200);
}
