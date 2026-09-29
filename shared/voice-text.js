// What Jarvis says out loud. The screen carries the detail; speech is the
// short conversational part. Nothing that isn't speech (markdown, URLs, JSON,
// tables, ids) is ever sent to text-to-speech — it sounds wrong and it costs
// money. Used by the browser voice pipeline. Tests: tests/voice-text.test.js.

const DEFAULT_MAX = 600;

// Plain, speakable text, cut at a sentence boundary under maxChars.
export function speakable(text, { maxChars = DEFAULT_MAX } = {}) {
  let s = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/\{[^{}]{20,}\}|\[[^[\]]{40,}\]/g, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/[*_#>~]+/g, '')
    .replace(/\b[A-Z]{2,4}-\d{6,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  s = end > maxChars * 0.4 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}.`;
  return s;
}

// Streaming text -> whole sentences, so speech can start on the first one.
// "$4,439.02" and "Sep. 26" don't end a sentence (a sentence end needs a space
// or the end of the stream after it).
export function createSentenceBuffer() {
  let buf = '';
  return {
    push(delta) {
      buf += String(delta || '');
      const out = [];
      const re = /[.!?](?:["')\]]*)\s+(?=\S)/g;
      let last = 0; let m;
      while ((m = re.exec(buf))) {
        const piece = buf.slice(last, m.index + m[0].length).trim();
        if (piece.length >= 2) { out.push(piece); last = m.index + m[0].length; }
      }
      buf = buf.slice(last);
      return out;
    },
    flush() { const rest = buf.trim(); buf = ''; return rest; },
  };
}

// The owner asked to hear everything ("read me the details") — allow a long reply.
export function wantsFullReadout(text) {
  return /\b(read (?:me |it |them |that |those )?(?:all|everything|the details|every|out)|read (?:it|them) (?:all|out)|tell me everything|all the details|go through (?:each|every|all))\b/i.test(String(text || ''));
}
