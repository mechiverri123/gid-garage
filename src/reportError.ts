// Minimal Sentry reporter — raw envelope POST, no @sentry/* SDK dependency
// (keeps bundle size down). Mirrors functions/_lib/sentry.js on the server
// side. Set VITE_SENTRY_DSN (Cloudflare Pages → env vars, build-time) to a
// Sentry project DSN to turn this on; no-ops silently if unset.
export const SENTRY_DSN = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined;

export async function reportError(error: unknown, extra: Record<string, any> = {}) {
  try {
    if (!SENTRY_DSN) return;
    const m = SENTRY_DSN.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
    if (!m) return;
    const [, publicKey, host, projectId] = m;
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const err = error instanceof Error ? error : new Error(String(error));
    const payload = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      platform: 'javascript',
      exception: { values: [{ type: err.name || 'Error', value: err.message, stacktrace: err.stack ? { frames: [{ filename: 'client', function: 'unknown', context_line: err.stack }] } : undefined }] },
      extra: { ...extra, url: typeof location !== 'undefined' ? location.href : '', ua: typeof navigator !== 'undefined' ? navigator.userAgent : '' },
    };
    const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() });
    const itemHeader = JSON.stringify({ type: 'event' });
    const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(payload)}`;
    await fetch(`https://${host}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' }, body,
    });
  } catch { /* error reporting must never itself break the UI */ }
}
