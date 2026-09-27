// Cloudflare Pages Function — POST /jarvis-telegram
// Private Telegram text bridge for GID Jarvis.
//
// Required Cloudflare environment variables:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_WEBHOOK_SECRET
//   TELEGRAM_OWNER_CHAT_ID
//   SUPABASE_URL (or VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_KEY
//   ANTHROPIC_API_KEY (already used by admin-ai-chat.js)
//
// This function reuses the existing /admin-ai-chat agent directly, so Telegram
// gets the same Claude prompt, business tools, safety checks, and Supabase data
// as the Command Center. It does NOT route through LiveKit or alter voice.

import { onRequestPost as runAdminAI } from './admin-ai-chat.js';

const HISTORY_LIMIT = 12;
const TELEGRAM_TEXT_LIMIT = 3900;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function normalizeId(value) {
  return String(value ?? '').trim();
}

async function telegramRequest(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const detail = data?.description || `HTTP ${res.status}`;
    throw new Error(`Telegram ${method} failed: ${detail}`);
  }
  return data.result;
}

async function sendTelegramText(token, chatId, text, replyToMessageId = null) {
  const clean = String(text || '').trim() || 'I could not produce a response.';
  const chunks = [];
  for (let i = 0; i < clean.length; i += TELEGRAM_TEXT_LIMIT) {
    chunks.push(clean.slice(i, i + TELEGRAM_TEXT_LIMIT));
  }

  for (let i = 0; i < chunks.length; i++) {
    await telegramRequest(token, 'sendMessage', {
      chat_id: chatId,
      text: chunks[i],
      ...(i === 0 && replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {}),
      disable_web_page_preview: true,
    });
  }
}

function supabaseConfig(env) {
  return {
    url: env.SUPABASE_URL ?? env.VITE_SUPABASE_URL,
    key: env.SUPABASE_SERVICE_KEY,
  };
}

async function loadHistory(env, chatId) {
  const { url, key } = supabaseConfig(env);
  if (!url || !key) return [];

  const endpoint = new URL(`${url}/rest/v1/jarvis_text_messages`);
  endpoint.searchParams.set('select', 'role,content,created_at');
  endpoint.searchParams.set('chat_id', `eq.${chatId}`);
  endpoint.searchParams.set('order', 'created_at.desc');
  endpoint.searchParams.set('limit', String(HISTORY_LIMIT));

  const res = await fetch(endpoint.toString(), {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!res.ok) return [];

  const rows = await res.json().catch(() => []);
  return rows
    .reverse()
    .filter(row => row?.role === 'user' || row?.role === 'assistant')
    .map(row => ({ role: row.role, content: String(row.content || '') }))
    .filter(row => row.content);
}

async function saveMessage(env, chatId, role, content, telegramMessageId = null) {
  const { url, key } = supabaseConfig(env);
  if (!url || !key) return;

  await fetch(`${url}/rest/v1/jarvis_text_messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      chat_id: String(chatId),
      role,
      content: String(content || '').slice(0, 12000),
      telegram_message_id: telegramMessageId == null ? null : String(telegramMessageId),
    }),
  }).catch(() => {});
}

async function clearHistory(env, chatId) {
  const { url, key } = supabaseConfig(env);
  if (!url || !key) return;

  await fetch(`${url}/rest/v1/jarvis_text_messages?chat_id=eq.${encodeURIComponent(String(chatId))}`, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=minimal',
    },
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
      // Ignore malformed/non-NDJSON lines; the admin endpoint normally emits NDJSON.
    }
  }

  if (!response.ok && !errorText) errorText = `Jarvis request failed (${response.status}).`;
  if (errorText) throw new Error(errorText);
  return finalText || 'I completed the request but did not get a text response.';
}

export async function onRequestPost({ request, env }) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
  const ownerChatId = normalizeId(env.TELEGRAM_OWNER_CHAT_ID);

  if (!botToken || !webhookSecret || !ownerChatId) {
    return json({ ok: false, error: 'Telegram environment variables are incomplete.' }, 500);
  }

  const suppliedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (suppliedSecret !== webhookSecret) return json({ ok: false }, 403);

  const update = await request.json().catch(() => null);
  const message = update?.message;
  if (!message) return json({ ok: true });

  const chatId = normalizeId(message.chat?.id);
  const messageId = message.message_id;
  const text = String(message.text || '').trim();

  // Completely ignore every Telegram chat except the configured owner chat.
  if (!chatId || chatId !== ownerChatId) return json({ ok: true });
  if (!text) {
    await sendTelegramText(botToken, chatId, 'Text messages only for now.', messageId);
    return json({ ok: true });
  }

  if (text === '/start') {
    await sendTelegramText(botToken, chatId, 'Jarvis text link is online. Ask me about GID Garage the same way you do in Command Center.', messageId);
    return json({ ok: true });
  }

  if (text === '/clear') {
    await clearHistory(env, chatId);
    await sendTelegramText(botToken, chatId, 'Conversation context cleared.', messageId);
    return json({ ok: true });
  }

  try {
    await telegramRequest(botToken, 'sendChatAction', { chat_id: chatId, action: 'typing' });

    const history = await loadHistory(env, chatId);
    const messages = [...history, { role: 'user', content: text }].slice(-HISTORY_LIMIT);

    // Call the existing business agent in-process. No public HTTP round-trip,
    // no Cloudflare Access issue, and no duplicated business-tool logic.
    const internalRequest = new Request('https://internal.gidgarage/admin-ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    const aiResponse = await runAdminAI({ request: internalRequest, env });
    const finalText = await extractFinalText(aiResponse);

    await Promise.all([
      saveMessage(env, chatId, 'user', text, messageId),
      saveMessage(env, chatId, 'assistant', finalText, null),
    ]);

    await sendTelegramText(botToken, chatId, finalText, messageId);
    return json({ ok: true });
  } catch (error) {
    const publicMessage = 'Jarvis hit an error processing that message. Nothing was changed unless I explicitly confirmed it.';
    await sendTelegramText(botToken, chatId, publicMessage, messageId).catch(() => {});
    console.error('jarvis-telegram error:', error);
    return json({ ok: true }); // Return 200 so Telegram does not retry the same update repeatedly.
  }
}
