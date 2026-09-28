// POST /hooks/business — voice agent (jarvis-agent/agent.py) business tools (X-GID-Internal-Jarvis).
// Outside the Access "jarvis*" match; see hooks/telegram.js. Logic stays in jarvis-business.js.
export { onRequestPost } from '../jarvis-business.js';
