// Minimal Sentry error reporter — no SDK dependency, just a raw envelope POST.
// Works identically in Cloudflare Functions (this file) and the browser
// (see reportError() near the top of src/JobOps.tsx).
//
// Setup:
//   1. Create a free Sentry account + project (platform: JavaScript).
//   2. Copy the DSN it gives you (looks like https://KEY@oXXXX.ingest.sentry.io/PROJECT_ID).
//   3. Cloudflare Pages → Settings → Environment variables → add SENTRY_DSN
//      (server-side functions) — this file reads env.SENTRY_DSN.
//   4. Also add VITE_SENTRY_DSN (same value) for the client build to pick up
//      via import.meta.env — see JobOps.tsx.
export async function reportError(env, error, extra = {}) {
  try {
    const dsn = env?.SENTRY_DSN;
    if (!dsn) return; // not configured — silently no-op
    const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
    if (!m) return;
    const [, publicKey, host, projectId] = m;
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const message = error?.message ?? String(error);
    const payload = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      platform: 'javascript',
      server_name: 'gid-garage-functions',
      exception: {
        values: [{
          type: error?.name || 'Error',
          value: message,
          stacktrace: error?.stack ? { frames: [{ filename: 'server', function: 'unknown', context_line: error.stack }] } : undefined,
        }],
      },
      extra,
    };
    const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() });
    const itemHeader = JSON.stringify({ type: 'event' });
    const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(payload)}`;
    await fetch(`https://${host}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
    });
  } catch { /* error reporting must never break the actual request */ }
}
