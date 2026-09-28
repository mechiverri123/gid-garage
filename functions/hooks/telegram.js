// POST /hooks/telegram — the Telegram webhook URL.
// The Cloudflare Access app matches every path starting with "jarvis", so
// /jarvis-telegram gets a 302 login redirect and Telegram never reaches it.
// Server-to-server hooks live under /hooks/* (outside Access) and rely on the
// handler's own shared-secret check. Logic stays in jarvis-telegram.js.
export { onRequestPost } from '../jarvis-telegram.js';
