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
//   bj-deal    { fname, phone, bet }          -> { hands, activeIndex, dealerUpCard, canDouble, canSplit, newBalance, spinsRemaining } (or immediate resolution on a natural)
//   bj-split   { phone }                      -> same shape as bj-deal once split (2 hands), or immediate resolution if splitting Aces
//   bj-hit     { phone }                      -> hand state, or resolution if the round is over
//   bj-double  { phone }                      -> always advances/resolves (one card, then auto-stand)
//   bj-stand   { phone }                      -> advances to next split hand, or resolves
//
// Hands are stored as an array (1 normally, 2 after a split) so a split can
// win one hand and lose the other in the same round. Standard rules: double
// allowed on any 2-card hand; split allowed once on an initial pair (same
// rank); split Aces get exactly one card each and can't act further.
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
    { weight: 7000, type: 'lose' },
    { weight: 2700, type: 'credit' },
    { weight: 200, type: 'real', label: 'Free Multi-Point Inspection' },
    { weight: 100, type: 'real', label: '5% off your next service' },
  ],
  5: [
    { weight: 6600, type: 'lose' },
    { weight: 2900, type: 'credit' },
    { weight: 150, type: 'real', label: 'Free Multi-Point Inspection' },
    { weight: 150, type: 'real', label: '5% off your next service' },
    { weight: 100, type: 'real', label: '$20 off any service' },
    { weight: 100, type: 'real', label: '$15 off Full Synthetic Oil Change' },
  ],
  10: [
    { weight: 6400, type: 'lose' },
    { weight: 3000, type: 'credit' },
    { weight: 150, type: 'real', label: 'Free Multi-Point Inspection' },
    { weight: 150, type: 'real', label: '5% off your next service' },
    { weight: 100, type: 'real', label: '$20 off any service' },
    { weight: 100, type: 'real', label: '$15 off Full Synthetic Oil Change' },
    { weight: 100, type: 'real', label: '15% off Diagnostics ($89.99 service)' },
  ],
  20: [
    { weight: 6000, type: 'lose' },
    { weight: 3400, type: 'credit' },
    { weight: 150, type: 'real', label: 'Free Multi-Point Inspection' },
    { weight: 150, type: 'real', label: '5% off your next service' },
    { weight: 100, type: 'real', label: '$20 off any service' },
    { weight: 100, type: 'real', label: '$15 off Full Synthetic Oil Change' },
    { weight: 80, type: 'real', label: '15% off Diagnostics ($89.99 service)' },
    { weight: 15, type: 'real', label: '20% off Car Audio Install' },
    { weight: 4, type: 'real', label: '15% off Full Brake Job (pads + rotors)' },
    { weight: 1, type: 'real', label: 'Free Mobile Full Synthetic Oil Change' },
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

// Maps any dollar amount to the nearest valid prize tier at or below it, so
// a doubled/split bet that lands on a non-standard amount (e.g. $2 after
// doubling a $1 bet) still resolves to a sane prize tier instead of erroring.
function tierKeyFor(amount) {
  const sorted = [...ALLOWED_BETS].sort((a, b) => a - b);
  let key = sorted[0];
  for (const b of sorted) if (amount >= b) key = b;
  return key;
}

function rollPrize(bet, excludeLabels) {
  const table = BET_PRIZE_TABLES[tierKeyFor(bet)]
    .filter((p) => p.type !== 'real' || !excludeLabels?.has(p.label));
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

function canSplitPair(cards) {
  return cards.length === 2 && cards[0].r === cards[1].r;
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
function rollWinPrize(bet, excludeLabels) {
  const table = BET_PRIZE_TABLES[tierKeyFor(bet)];
  const pool = table.filter((p) => p.type !== 'lose' && (p.type !== 'real' || !excludeLabels?.has(p.label)));
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
// at that bet size (excluding anything already won today).
function rollNaturalPrize(bet, excludeLabels) {
  const table = BET_PRIZE_TABLES[tierKeyFor(bet)];
  const pool = table.filter((p) => p.type === 'real' && !excludeLabels?.has(p.label));
  if (!pool.length) return null; // every real prize at this tier already won today
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

  // Prizes this phone has already won today (Phoenix time) — excluded from
  // future rolls today so nobody stacks 3x of the same prize in one day.
  async function getWonLabelsToday(phone) {
    const today = phoenixToday();
    const res = await fetch(
      `${base}/game_wins?phone=eq.${encodeURIComponent(phone)}&created_at=gte.${today}&select=prize_label`,
      { headers }
    );
    const rows = res.ok ? await res.json() : [];
    return new Set(rows.map((r) => r.prize_label));
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

  async function saveHand(phone, fname, bet, deck, dealerHand, hands, activeIndex) {
    await fetch(`${base}/game_blackjack_hands`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        phone, fname: fname || null, bet, deck, dealer_hand: dealerHand,
        player_hand: hands[0].cards, // kept for back-compat/debugging only
        hands, active_index: activeIndex, status: 'active',
      }),
    });
  }

  async function clearHand(phone) {
    await fetch(`${base}/game_blackjack_hands?phone=eq.${encodeURIComponent(phone)}`, { method: 'DELETE', headers });
  }

  function handSummary(h) {
    return { cards: h.cards, total: handTotal(h.cards), bet: h.bet, status: h.status, isAceSplit: !!h.isAceSplit };
  }

  // Resolves the simple (non-split) immediate-natural case at deal time —
  // player and/or dealer was dealt 21 straight off the deck, so the round
  // ends instantly with no hit/stand/double/split involved.
  async function resolveNatural(phone, fname, bet, playerHand, dealerHand, outcome) {
    let creditWin = 0, prizeLabel = null, code = null, payout = 0;
    const excludeLabels = await getWonLabelsToday(phone);

    if (outcome === 'blackjack') {
      payout = bet * 2.5;
      const prize = rollNaturalPrize(bet, excludeLabels);
      if (prize && prize.type === 'real') {
        prizeLabel = prize.label;
        code = await awardRealPrize(phone, fname, prizeLabel, bet);
      } else {
        creditWin = Math.round(bet * 1.5 * 100) / 100;
        payout += creditWin;
      }
    } else if (outcome === 'push') {
      payout = bet;
    }
    // outcome === 'lose' -> payout stays 0

    await clearHand(phone);
    const { newBalance, spinsRemaining } = await adjustBalance(phone, payout, false);
    return json({
      hands: [{ cards: playerHand, total: handTotal(playerHand), bet, outcome, creditWin, prizeLabel, code }],
      dealerHand, dealerTotal: handTotal(dealerHand),
      newBalance, spinsRemaining,
    });
  }

  // Resolves every stored sub-hand (1 normally, 2 after a split) once all
  // of them are done being played. Plays the dealer out once (unless every
  // player hand already busted), then settles each sub-hand independently —
  // a split can win one hand and lose the other in the same round.
  async function resolveAllHands(phone, fname, handRow) {
    const anyStillIn = handRow.hands.some((h) => h.status === 'stood');
    let dealerHand = handRow.dealer_hand;
    if (anyStillIn) {
      const played = dealerPlay(handRow.dealer_hand, handRow.deck);
      dealerHand = played.hand;
    }
    const dealerTotal = handTotal(dealerHand);
    const excludeLabels = await getWonLabelsToday(phone);

    let totalPayout = 0;
    const results = [];
    for (const h of handRow.hands) {
      const total = handTotal(h.cards);
      let outcome;
      if (h.status === 'bust') outcome = 'lose';
      else if (dealerTotal > 21 || total > dealerTotal) outcome = 'win';
      else if (total < dealerTotal) outcome = 'lose';
      else outcome = 'push';

      let creditWin = 0, prizeLabel = null, code = null, payout = 0;
      if (outcome === 'win') {
        payout = h.bet * 2;
        const prize = rollWinPrize(h.bet, excludeLabels);
        if (prize.type === 'credit') {
          const mult = 0.5 + Math.random() * 1.5;
          creditWin = Math.round(h.bet * mult * 100) / 100;
          payout += creditWin;
        } else if (prize.type === 'real') {
          prizeLabel = prize.label;
          code = await awardRealPrize(phone, fname, prizeLabel, h.bet);
          excludeLabels.add(prizeLabel); // don't double-award the same prize across split hands in one round
        }
      } else if (outcome === 'push') {
        payout = h.bet;
      }

      totalPayout += payout;
      results.push({ cards: h.cards, total, bet: h.bet, outcome, creditWin, prizeLabel, code });
    }

    await clearHand(phone);
    const { newBalance, spinsRemaining } = await adjustBalance(phone, totalPayout, false);
    return json({ hands: results, dealerHand, dealerTotal, newBalance, spinsRemaining });
  }

  // After a hit/stand/double finishes the active sub-hand, moves to the next
  // still-active sub-hand (relevant after a split) or, if none remain,
  // resolves the whole round.
  async function advanceOrResolve(phone, fname, handRow) {
    const nextIndex = handRow.hands.findIndex((h) => h.status === 'active');
    if (nextIndex !== -1) {
      await saveHand(phone, fname, handRow.bet, handRow.deck, handRow.dealer_hand, handRow.hands, nextIndex);
      const next = handRow.hands[nextIndex];
      return json({
        hands: handRow.hands.map(handSummary), activeIndex: nextIndex,
        dealerUpCard: handRow.dealer_hand[0],
        canDouble: next.cards.length === 2 && !next.isAceSplit,
        canSplit: false,
      });
    }
    return await resolveAllHands(phone, fname, handRow);
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

        const prize = rollPrize(bet, await getWonLabelsToday(phone));
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
        if (existing && existing.status === 'active' && existing.hands) {
          const active = existing.hands[existing.active_index];
          return json({
            resumed: true,
            hands: existing.hands.map(handSummary), activeIndex: existing.active_index,
            dealerUpCard: existing.dealer_hand[0],
            canDouble: active.cards.length === 2 && !active.isAceSplit,
            canSplit: existing.hands.length === 1 && canSplitPair(active.cards),
          });
        }

        const { row } = await loadAccount(phone, payload.fname);
        if (row.spins_today >= MAX_SPINS_PER_DAY) return json({ error: 'Daily limit reached. Come back tomorrow!' }, 429);
        if (row.balance < bet) return json({ error: 'Not enough credits for that bet' }, 400);

        // Escrow the bet and count this hand against today's limit immediately.
        const escrow = await adjustBalance(phone, -bet, true);

        const deck = freshDeck();
        const playerHand = [deck.shift(), deck.shift()];
        const dealerHand = [deck.shift(), deck.shift()];

        const playerBJ = isBlackjack(playerHand);
        const dealerBJ = isBlackjack(dealerHand);

        if (playerBJ || dealerBJ) {
          const outcome = playerBJ && dealerBJ ? 'push' : playerBJ ? 'blackjack' : 'lose';
          return await resolveNatural(phone, payload.fname, bet, playerHand, dealerHand, outcome);
        }

        const hands = [{ cards: playerHand, bet, status: 'active', isAceSplit: false }];
        await saveHand(phone, payload.fname, bet, deck, dealerHand, hands, 0);
        return json({
          resumed: false,
          hands: hands.map(handSummary), activeIndex: 0,
          dealerUpCard: dealerHand[0],
          canDouble: true,
          canSplit: canSplitPair(playerHand),
          newBalance: escrow.newBalance, spinsRemaining: escrow.spinsRemaining,
        });
      }

      case 'bj-split': {
        const phone = normalizePhone(payload.phone);
        if (!phone || phone.length < 10) return json({ error: 'Valid phone required' }, 400);
        const handRow = await loadHand(phone);
        if (!handRow || !handRow.hands) return json({ error: 'No active hand' }, 400);
        const current = handRow.hands[handRow.active_index];
        if (handRow.hands.length !== 1 || !canSplitPair(current.cards)) {
          return json({ error: 'Cannot split this hand' }, 400);
        }

        const { row } = await loadAccount(phone, handRow.fname);
        if (row.balance < current.bet) return json({ error: 'Not enough credits to split' }, 400);
        const escrow = await adjustBalance(phone, -current.bet, false);

        const deck = [...handRow.deck];
        const isAces = current.cards[0].r === 'A';
        const handA = { cards: [current.cards[0], deck.shift()], bet: current.bet, status: isAces ? 'stood' : 'active', isAceSplit: isAces };
        const handB = { cards: [current.cards[1], deck.shift()], bet: current.bet, status: isAces ? 'stood' : 'active', isAceSplit: isAces };
        const hands = [handA, handB];

        const updatedRow = { ...handRow, deck, hands, active_index: 0 };
        if (isAces) {
          // Split aces get exactly one card each and can't act further — go straight to resolution.
          return await resolveAllHands(phone, handRow.fname, updatedRow);
        }

        await saveHand(phone, handRow.fname, handRow.bet, deck, handRow.dealer_hand, hands, 0);
        return json({
          hands: hands.map(handSummary), activeIndex: 0,
          dealerUpCard: handRow.dealer_hand[0],
          canDouble: true, canSplit: false,
          newBalance: escrow.newBalance, spinsRemaining: escrow.spinsRemaining,
        });
      }

      case 'bj-hit': {
        const phone = normalizePhone(payload.phone);
        if (!phone || phone.length < 10) return json({ error: 'Valid phone required' }, 400);
        const handRow = await loadHand(phone);
        if (!handRow || !handRow.hands) return json({ error: 'No active hand' }, 400);

        const deck = [...handRow.deck];
        const hands = handRow.hands.map((h) => ({ ...h, cards: [...h.cards] }));
        const current = hands[handRow.active_index];
        current.cards.push(deck.shift());
        const total = handTotal(current.cards);
        current.status = total > 21 ? 'bust' : total === 21 ? 'stood' : 'active';

        const updatedRow = { ...handRow, deck, hands };
        if (current.status !== 'active') {
          return await advanceOrResolve(phone, handRow.fname, updatedRow);
        }

        await saveHand(phone, handRow.fname, handRow.bet, deck, handRow.dealer_hand, hands, handRow.active_index);
        return json({
          hands: hands.map(handSummary), activeIndex: handRow.active_index,
          dealerUpCard: handRow.dealer_hand[0], canDouble: false, canSplit: false,
        });
      }

      case 'bj-double': {
        const phone = normalizePhone(payload.phone);
        if (!phone || phone.length < 10) return json({ error: 'Valid phone required' }, 400);
        const handRow = await loadHand(phone);
        if (!handRow || !handRow.hands) return json({ error: 'No active hand' }, 400);
        const current = handRow.hands[handRow.active_index];
        if (current.cards.length !== 2 || current.isAceSplit) {
          return json({ error: 'Cannot double on this hand' }, 400);
        }

        const { row } = await loadAccount(phone, handRow.fname);
        if (row.balance < current.bet) return json({ error: 'Not enough credits to double' }, 400);
        await adjustBalance(phone, -current.bet, false);

        const deck = [...handRow.deck];
        const hands = handRow.hands.map((h) => ({ ...h, cards: [...h.cards] }));
        const doubled = hands[handRow.active_index];
        doubled.bet *= 2;
        doubled.cards.push(deck.shift());
        const total = handTotal(doubled.cards);
        doubled.status = total > 21 ? 'bust' : 'stood'; // double always ends the hand after one card

        return await advanceOrResolve(phone, handRow.fname, { ...handRow, deck, hands });
      }

      case 'bj-stand': {
        const phone = normalizePhone(payload.phone);
        if (!phone || phone.length < 10) return json({ error: 'Valid phone required' }, 400);
        const handRow = await loadHand(phone);
        if (!handRow || !handRow.hands) return json({ error: 'No active hand' }, 400);

        const hands = handRow.hands.map((h) => ({ ...h, cards: [...h.cards] }));
        hands[handRow.active_index].status = 'stood';
        return await advanceOrResolve(phone, handRow.fname, { ...handRow, hands });
      }

      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ error: e.message ?? 'Server error' }, 500);
  }
}
