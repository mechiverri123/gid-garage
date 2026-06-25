// Cloudflare Pages Function — POST /api-game
// Backs the "Spin & Win" waiting-room game. All balance/odds logic runs here,
// server-side, so nothing can be manipulated from the browser. Mirrors the
// conventions in api-customer.js (same REST-to-Supabase pattern, same
// America/Phoenix day boundary for daily resets).
//
// Body: { action: string, ...args }
//   state      { fname, phone }              -> { balance, spinsToday, spinsRemaining }
//   spin       { fname, phone, bet }         -> { result: 'lose'|'credit'|'real', creditWin?, prizeLabel?, code?, newBalance, spinsRemaining }
//   redeem     { code }                       -> { ok, win? }   (admin-only, checked by caller's /game-redeem gate)

const STARTING_BALANCE = 20;
const DAILY_REFILL_TO = 20;
const MAX_SPINS_PER_DAY = 25;
const ALLOWED_BETS = [1, 5, 10, 20];

// Weighted prize table. Weights sum to 10000. "real" entries cost the
// business nothing upfront — they're % discounts or one low-cost giveaway —
// and the jackpot (free oil change) is deliberately rare.
const PRIZE_TABLE = [
  { weight: 4000, type: 'lose' },
  { weight: 2500, type: 'credit' },
  { weight: 1500, type: 'real', label: '5% off your next service' },
  { weight: 1000, type: 'real', label: 'Free GID Garage decal + $5 off any service' },
  { weight: 500, type: 'real', label: '10% off Diagnostics ($89.99 service)' },
  { weight: 300, type: 'real', label: '15% off Full Brake Job (pads + rotors)' },
  { weight: 150, type: 'real', label: '10% off Car Audio Install' },
  { weight: 50, type: 'real', label: 'Free Mobile Full Synthetic Oil Change' },
];
const TOTAL_WEIGHT = PRIZE_TABLE.reduce((s, p) => s + p.weight, 0);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalizePhone(phone) {
  return String(phone ?? '').replace(/\D/g, '');
}

function phoenixToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
}

function rollPrize() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const p of PRIZE_TABLE) {
    if (roll < p.weight) return p;
    roll -= p.weight;
  }
  return PRIZE_TABLE[0];
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function onRequestPost({ request, env }) {
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server not configured' }, 500);

  const base = `${supabaseUrl}/rest/v1`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Loads (or creates) the credits row, applying the daily refill if needed.
  // Returns the up-to-date row.
  async function loadAccount(phone, fname) {
    const res = await fetch(`${base}/game_credits?phone=eq.${encodeURIComponent(phone)}&select=*`, { headers });
    const rows = res.ok ? await res.json() : [];
    const today = phoenixToday();

    if (!rows.length) {
      const insertRes = await fetch(`${base}/game_credits`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          phone, fname: fname || null,
          balance: STARTING_BALANCE, spins_today: 0, last_refill_date: today,
        }),
      });
      const inserted = await insertRes.json();
      return { row: inserted[0], isNew: true };
    }

    const row = rows[0];
    if (row.last_refill_date !== today) {
      const newBalance = Math.max(row.balance, DAILY_REFILL_TO);
      const patchRes = await fetch(`${base}/game_credits?phone=eq.${encodeURIComponent(phone)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          balance: newBalance, spins_today: 0, last_refill_date: today,
          fname: fname || row.fname, updated_at: new Date().toISOString(),
        }),
      });
      const patched = await patchRes.json();
      return { row: patched[0], isNew: false };
    }

    return { row, isNew: false };
  }

  try {
    switch (payload.action) {
      case 'state': {
        const phone = normalizePhone(payload.phone);
        if (!phone || phone.length < 10) return json({ error: 'Valid phone required' }, 400);
        const { row, isNew } = await loadAccount(phone, payload.fname);
        return json({
          balance: row.balance,
          spinsToday: row.spins_today,
          spinsRemaining: Math.max(0, MAX_SPINS_PER_DAY - row.spins_today),
          isNew,
        });
      }

      case 'spin': {
        const phone = normalizePhone(payload.phone);
        const bet = Number(payload.bet);
        if (!phone || phone.length < 10) return json({ error: 'Valid phone required' }, 400);
        if (!ALLOWED_BETS.includes(bet)) return json({ error: 'Invalid bet amount' }, 400);

        const { row } = await loadAccount(phone, payload.fname);
        if (row.spins_today >= MAX_SPINS_PER_DAY) return json({ error: 'Daily spin limit reached. Come back tomorrow!' }, 429);
        if (row.balance < bet) return json({ error: 'Not enough credits for that bet' }, 400);

        const prize = rollPrize();
        let creditWin = 0;
        let prizeLabel = null;
        let code = null;

        if (prize.type === 'credit') {
          const mult = 2 + Math.random() * 3; // 2x–5x bet, in-game credits only
          creditWin = Math.round(bet * mult * 100) / 100;
        } else if (prize.type === 'real') {
          prizeLabel = prize.label;
          // Generate a unique 6-digit code, retrying on the rare collision.
          for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = genCode();
            const checkRes = await fetch(`${base}/game_wins?code=eq.${candidate}&select=id`, { headers });
            const existing = checkRes.ok ? await checkRes.json() : [];
            if (!existing.length) { code = candidate; break; }
          }
          if (!code) code = genCode() + Date.now().toString().slice(-2);

          await fetch(`${base}/game_wins`, {
            method: 'POST',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({
              code, phone, fname: payload.fname || row.fname || null,
              prize_label: prizeLabel, bet,
            }),
          });
        }

        const newBalance = Math.round((row.balance - bet + creditWin) * 100) / 100;
        await fetch(`${base}/game_credits?phone=eq.${encodeURIComponent(phone)}`, {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            balance: newBalance, spins_today: row.spins_today + 1, updated_at: new Date().toISOString(),
          }),
        });

        return json({
          result: prize.type,
          creditWin,
          prizeLabel,
          code,
          newBalance,
          spinsRemaining: Math.max(0, MAX_SPINS_PER_DAY - (row.spins_today + 1)),
        });
      }

      case 'redeem': {
        const code = String(payload.code ?? '').trim();
        if (!code) return json({ error: 'Code required' }, 400);
        const res = await fetch(`${base}/game_wins?code=eq.${encodeURIComponent(code)}&select=*`, { headers });
        const rows = res.ok ? await res.json() : [];
        if (!rows.length) return json({ ok: false, error: 'Code not found' });
        const win = rows[0];
        if (win.redeemed) return json({ ok: false, error: 'Already redeemed', win });

        await fetch(`${base}/game_wins?code=eq.${encodeURIComponent(code)}`, {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ redeemed: true, redeemed_at: new Date().toISOString() }),
        });

        return json({ ok: true, win });
      }

      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ error: e.message ?? 'Server error' }, 500);
  }
}
