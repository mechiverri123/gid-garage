// ── /jarvis — standalone Command Center ─────────────────────────────────
// Its own route (gidgarage.com/jarvis), not a tab inside /admin anymore.
// Reuses the same password gate and session key as /admin so a login on
// one carries over to the other, and talks to the exact same backend
// (admin-api-data.js, admin-ai-chat.js) — no backend changes needed.
//
// SECURITY NOTE FOR DEPLOYMENT: the client-side password gate below is
// defense-in-depth, not the real boundary — admin-api-data.js and
// admin-ai-chat.js both require the Cf-Access-Jwt-Assertion header, which
// only gets attached when Cloudflare Access is actually gating the
// request. If your Access application's path rule is scoped to /admin*
// specifically, it will NOT cover /jarvis by default — check your
// Cloudflare Zero Trust dashboard (Access → Applications → the app
// protecting /admin) and add /jarvis to its path match, or widen the
// existing rule, or every fetch from this page will come back 401.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { AdminPasswordGate } from './BookingWidget';
import { CommandCenterPage } from './command-center/CommandCenterPage';

export default function JarvisPage() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('gg_admin_auth') === '1');

  if (!unlocked) return <AdminPasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen" style={{ background: '#06090D' }}>
      <div className="max-w-6xl mx-auto pt-4 px-3 sm:px-6 flex items-center justify-between">
        <a href="/admin" className="text-[11px] text-[#52616D] hover:text-[#8899A6] uppercase tracking-wide">← Admin</a>
        <button
          onClick={() => { sessionStorage.removeItem('gg_admin_auth'); setUnlocked(false); }}
          className="text-[11px] text-[#52616D] hover:text-[#8899A6] uppercase tracking-wide"
        >
          🔒 Lock
        </button>
      </div>
      <CommandCenterPage />
    </div>
  );
}
