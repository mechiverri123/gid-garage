// POST /hooks/proactive — pg_cron target (X-GID-Proactive-Secret).
// Outside the Access "jarvis*" match; see hooks/telegram.js. Logic stays in jarvis-proactive.js.
export { onRequestPost } from '../jarvis-proactive.js';
