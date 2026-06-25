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
//   bj-deal    { fname, phone, bet }          -> hand state (or immediate resolution on a natural)
//   bj-hit     { phone }                      -> hand state (or resolution if bust/auto-21)
//   bj-double  { phone }                      -> resolution (always ends the hand)
//   bj-stand   { phone }                      -> resolution
//
// Blackjack reuses BET_PRIZE_TABLES as the single source of truth for prize
// odds: a regular win rolls the bet tier's credit+real weights (lose excluded);
// a natural blackjack rolls the real-only weights, so every natural guarantees
// at least the lowest real prize unlocked at that bet size.

const STARTING_BALANCE = 20;
const DAILY_REFILL_TO = 20;
const MAX_SPINS_PER_DAY = 20;
const ALLOWED_BETS = [1, 5, 10, 20];

// Denomination-gated prize tables. Each bet size only has a shot at the
// prizes listed for it (and everything below) — a $1 spin can never land a
// brake-job discount, only $20 (max bet) can ever hit the jackpot. Each
// table's weights sum to 10000. "real" entries cost nothing upfront (a %
// discount or a near-zero-cost giveaway); the oil-change jackpot is
// deliberately rare and gated to max bet only.
const BET_PRIZE_TABLES = {
  1: [
    { weight: 5500, type: 'lose' },
    { weight: 3500, type: 'credit' },
    { weight: 700, type: 'real', label: 'Free Multi-Point Inspection (tires & brakes)' },
    { weight: 300, type: 'real', label: '5% off your next service' },
  ],
  5: [
    { weight: 5000, type: 'lose' },
    { weight: 3000, type: 'credit' },
    { weight: 600, type: 'real', label: 'Free Multi-Point Inspection (tires & brakes)' },
    { weight: 700, type: 'real', label: '5% off your next service' },
    { weight: 500, type: 'real', label: 'Free GID Garage decal + $5 off any service' },
    { weight: 200, type: 'real', label: '$15 off Full Synthetic Oil Change' },
  ],
  10: [
    { weight: 4800, type: 'lose' },
    { weight: 2700, type: 'credit' },
    { weight: 700, type: 'real', label: 'Free Multi-Point Inspection (tires & brakes)' },
    { weight: 800, type: 'real', label: '5% off your next service' },
    { weight: 600, type: 'real', label: 'Free GID Garage decal + $5 off any service' },
    { weight: 300, type: 'real', label: '$15 off Full Synthetic Oil Change' },
    { weight: 100, type: 'real', label: '10% off Diagnostics ($89.99 service)' },
  ],
  20: [
    { weight: 4000, type: 'lose' },
    { weight: 2000, type: 'credit' },
    { weight: 1000, type: 'real', label: 'Free Multi-Point Inspection (tires & brakes)' },
    { weight: 1200, type: 'real', label: '5% off your next service' },
    { weight: 800, type: 'real', label: 'Free GID Garage decal + $5 off any service' },
    { weight: 500, type: 'real', label: '$15 off Full Synthetic Oil Change' },
    { weight: 300, type: 'real', label: '10% off Diagnostics ($89.99 service)' },
    { weight: 150, type: 'real', label: '10% off Car Audio Install' },
    { weight: 45, type: 'real', label: '15% off Full Brake Job (pads + rotors)' },
    { weight: 5, type: 'real', label: 'Free Mobile Full Synthetic Oil Change' },
  ],
};

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

function rollPrize(bet) {
  const table = BET_PRIZE_TABLES[bet] ?? BET_PRIZE_TABLES[1];
  const totalWeight = table.reduce((s, p) => s + p.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const p of table) {
    if (roll < p.weight) return p;
    roll -= p.weight;
  }
  return table[0];
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Blackjack helpers ─────────────────────────────────────────────────────
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

function freshDeck() {
  const deck = [];
  for (const r of RANKS) for (const s of SUITS) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handTotal(hand) {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.r === 'A') { total += 11; aces++; }
    else if (c.r === 'J' || c.r === 'Q' || c.r === 'K') total += 10;
    else total += Number(c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBlackjack(hand) {
  return hand.length === 2 && handTotal(hand) === 21;
}

function dealerPlay(dealerHand, deck) {
  const hand = [...dealerHand];
  const remaining = [...deck];
  while (handTotal(hand) < 17) hand.push(remaining.shift());
  return { hand, remaining };
}

// Roll among a bet tier's non-"lose" entries (credit + real), used on a
// regular win — most of the time this lands on a credit bonus, occasionally
// a real prize, same proportions as the slot machine for that denomination.
function rollWinPrize(bet) {
  const table = BET_PRIZE_TABLES[bet] ?? BET_PRIZE_TABLES[1];
  const pool = table.filter((p) => p.type !== 'lose');
  const totalWeight = pool.reduce((s, p) => s + p.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const p of pool) {
    if (roll < p.weight) return p;
    roll -= p.weight;
  }
  return pool[0];
}

// Roll among a bet tier's real-only entries — used on a natural blackjack,
// so every natural always lands on at least the lowest real prize unlocked
// at that bet size.
function rollNaturalPrize(bet) {
  const table = BET_PRIZE_TABLES[bet] ?? BET_PRIZE_TABLES[1];
  const pool = table.filter((p) => p.type === 'real');
  const totalWeight = pool.reduce((s, p) => s + p.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const p of pool) {
    if (roll < p.weight) return p;
    roll -= p.weight;
  }
  return pool[0];
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

  // Generates a unique 6-digit code, stores the win, returns the code.
  async function awardRealPrize(phone, fname, prizeLabel, bet) {
    let code = null;
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
      body: JSON.stringify({ code, phone, fname: fname || null, prize_label: prizeLabel, bet }),
    });
    return code;
  }

  // Applies a balance delta (+/-) and optionally bumps spins_today by 1.
  async function adjustBalance(phone, delta, bumpSpins) {
    const res = await fetch(`${base}/game_credits?phone=eq.${encodeURIComponent(phone)}&select=balance,spins_today`, { headers });
    const rows = res.ok ? await res.json() : [];
    const current = rows[0] ?? { balance: 0, spins_today: 0 };
    const newBalance = Math.round((current.balance + delta) * 100) / 100;
    const newSpins = bumpSpins ? current.spins_today + 1 : current.spins_today;
    await fetch(`${base}/game_credits?phone=eq.${encodeURIComponent(phone)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ balance: newBalance, spins_today: newSpins, updated_at: new Date().toISOString() }),
    });
    return { newBalance, spinsRemaining: Math.max(0, MAX_SPINS_PER_DAY - newSpins) };
  }

  async function loadHand(phone) {
    const res = await fetch(`${base}/game_blackjack_hands?phone=eq.${encodeURIComponent(phone)}&select=*`, { headers });
    const rows = res.ok ? await res.json() : [];
    return rows[0] ?? null;
  }

  async function saveHand(phone, fname, bet, deck, playerHand, dealerHand) {
    await fetch(`${base}/game_blackjack_hands`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ phone, fname: fname || null, bet, deck, player_hand: playerHand, dealer_hand: dealerHand, status: 'active' }),
    });
  }

  async function clearHand(phone) {
    await fetch(`${base}/game_blackjack_hands?phone=eq.${encodeURIComponent(phone)}`, { method: 'DELETE', headers });
  }

  // Resolves a finished hand (dealer already played out, or player busted)
  // against the player's final hand, applies payout + prize roll, clears
  // the stored hand, and returns the full result payload.
  async function resolveBlackjack(phone, fname, bet, playerHand, dealerHand, outcome) {
    let creditWin = 0;
    let prizeLabel = null;
    let code = null;
    let payout = 0; // amount credited back beyond the already-escrowed bet

    if (outcome === 'blackjack') {
      payout = bet * 2.5; // 3:2 win + original bet back
      const prize = rollNaturalPrize(bet);
      if (prize.type === 'real') {
        prizeLabel = prize.label;
        code = await awardRealPrize(phone, fname, prizeLabel, bet);
      }
    } else if (outcome === 'win') {
      payout = bet * 2; // 1:1 win + original bet back
      const prize = rollWinPrize(bet);
      if (prize.type === 'credit') {
        const mult = 0.5 + Math.random() * 1.5; // smaller bonus on top of the real payout
        creditWin = Math.round(bet * mult * 100) / 100;
        payout += creditWin;
      } else if (prize.type === 'real') {
        prizeLabel = prize.label;
        code = await awardRealPrize(phone, fname, prizeLabel, bet);
      }
    } else if (outcome === 'push') {
      payout = bet; // refund only
    }
    // outcome === 'lose' -> payout stays 0, bet already escrowed/lost

    await clearHand(phone);
    const { newBalance, spinsRemaining } = await adjustBalance(phone, payout, false);

    return json({
      outcome, playerHand, dealerHand,
      playerTotal: handTotal(playerHand), dealerTotal: handTotal(dealerHand),
      creditWin, prizeLabel, code, newBalance, spinsRemaining,
    });
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

        const prize = rollPrize(bet);
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

      case 'bj-deal': {
        const phone = normalizePhone(payload.phone);
        const bet = Number(payload.bet);
        if (!phone || phone.length < 10) return json({ error: 'Valid phone required' }, 400);
        if (!ALLOWED_BETS.includes(bet)) return json({ error: 'Invalid bet amount' }, 400);

        const existing = await loadHand(phone);
        if (existing && existing.status === 'active') {
          return json({
            resumed: true, bet: existing.bet,
            playerHand: existing.player_hand, dealerUpCard: existing.dealer_hand[0],
            playerTotal: handTotal(existing.player_hand),
            canDouble: existing.player_hand.length === 2 && ALLOWED_BETS.includes(existing.bet * 2),
          });
        }

        const { row } = await loadAccount(phone, payload.fname);
        if (row.spins_today >= MAX_SPINS_PER_DAY) return json({ error: 'Daily limit reached. Come back tomorrow!' }, 429);
        if (row.balance < bet) return json({ error: 'Not enough credits for that bet' }, 400);

        // Escrow the bet and count this hand against today's limit immediately.
        await adjustBalance(phone, -bet, true);

        const deck = freshDeck();
        const playerHand = [deck.shift(), deck.shift()];
        const dealerHand = [deck.shift(), deck.shift()];

        const playerBJ = isBlackjack(playerHand);
        const dealerBJ = isBlackjack(dealerHand);

        if (playerBJ || dealerBJ) {
          const outcome = playerBJ && dealerBJ ? 'push' : playerBJ ? 'blackjack' : 'lose';
          return await resolveBlackjack(phone, payload.fname, bet, playerHand, dealerHand, outcome);
        }

        await saveHand(phone, payload.fname, bet, deck, playerHand, dealerHand);
        return json({
          resumed: false, bet,
          playerHand, dealerUpCard: dealerHand[0],
          playerTotal: handTotal(playerHand),
          canDouble: ALLOWED_BETS.includes(bet * 2),
        });
      }

      case 'bj-hit': {
        const phone = normalizePhone(payload.phone);
        if (!phone || phone.length < 10) return json({ error: 'Valid phone required' }, 400);
        const hand = await loadHand(phone);
        if (!hand) return json({ error: 'No active hand' }, 400);

        const deck = [...hand.deck];
        const playerHand = [...hand.player_hand, deck.shift()];
        const total = handTotal(playerHand);

        if (total > 21) {
          return await resolveBlackjack(phone, hand.fname, hand.bet, playerHand, hand.dealer_hand, 'lose');
        }
        if (total === 21) {
          const { hand: dealerHand } = dealerPlay(hand.dealer_hand, deck);
          const outcome = handTotal(dealerHand) === 21 ? 'push' : 'win';
          return await resolveBlackjack(phone, hand.fname, hand.bet, playerHand, dealerHand, outcome);
        }

        await saveHand(phone, hand.fname, hand.bet, deck, playerHand, hand.dealer_hand);
        return json({
          playerHand, dealerUpCard: hand.dealer_hand[0],
          playerTotal: total, canDouble: false,
        });
      }

      case 'bj-double': {
        const phone = normalizePhone(payload.phone);
        if (!phone || phone.length < 10) return json({ error: 'Valid phone required' }, 400);
        const hand = await loadHand(phone);
        if (!hand) return json({ error: 'No active hand' }, 400);
        if (hand.player_hand.length !== 2 || !ALLOWED_BETS.includes(hand.bet * 2)) {
          return json({ error: 'Cannot double on this hand' }, 400);
        }

        const { row } = await loadAccount(phone, hand.fname);
        if (row.balance < hand.bet) return json({ error: 'Not enough credits to double' }, 400);
        await adjustBalance(phone, -hand.bet, false);

        const deck = [...hand.deck];
        const playerHand = [...hand.player_hand, deck.shift()];
        const newBet = hand.bet * 2;
        const total = handTotal(playerHand);

        if (total > 21) {
          return await resolveBlackjack(phone, hand.fname, newBet, playerHand, hand.dealer_hand, 'lose');
        }
        const { hand: dealerHand } = dealerPlay(hand.dealer_hand, deck);
        const dealerTotal = handTotal(dealerHand);
        const outcome = dealerTotal > 21 || total > dealerTotal ? 'win' : total < dealerTotal ? 'lose' : 'push';
        return await resolveBlackjack(phone, hand.fname, newBet, playerHand, dealerHand, outcome);
      }

      case 'bj-stand': {
        const phone = normalizePhone(payload.phone);
        if (!phone || phone.length < 10) return json({ error: 'Valid phone required' }, 400);
        const hand = await loadHand(phone);
        if (!hand) return json({ error: 'No active hand' }, 400);

        const { hand: dealerHand } = dealerPlay(hand.dealer_hand, hand.deck);
        const playerTotal = handTotal(hand.player_hand);
        const dealerTotal = handTotal(dealerHand);
        const outcome = dealerTotal > 21 || playerTotal > dealerTotal ? 'win' : playerTotal < dealerTotal ? 'lose' : 'push';
        return await resolveBlackjack(phone, hand.fname, hand.bet, hand.player_hand, dealerHand, outcome);
      }

      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ error: e.message ?? 'Server error' }, 500);
  }
}
