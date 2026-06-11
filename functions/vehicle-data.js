// Cloudflare Pages Function — GET /vehicle-data
// Proxies CarQuery API server-side to avoid CORS issues.
// CarQuery has ~60,000 trims with engine specs back to 1941, completely free.
//
// Query params:
//   ?cmd=getMakes
//   ?cmd=getModels&make=Toyota
//   ?cmd=getTrims&year=2007&make=Toyota&model=RAV4
//
// Returns cleaned JSON safe for the frontend.

const CARQUERY_BASE = 'https://www.carqueryapi.com/api/0.3/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const cmd = url.searchParams.get('cmd');
  const make = url.searchParams.get('make') || '';
  const model = url.searchParams.get('model') || '';
  const year = url.searchParams.get('year') || '';

  if (!cmd) return err('cmd required');

  try {
    if (cmd === 'getMakes') {
      // Returns all makes CarQuery knows about
      const res = await fetch(`${CARQUERY_BASE}?cmd=getMakes&format=json`, {
        headers: { 'User-Agent': 'GIDGarage/1.0' },
      });
      const text = await res.text();
      const data = parseCarQuery(text);
      const makes = (data.Makes || [])
        .map(m => m.make_display)
        .filter(Boolean)
        .sort();
      return json({ makes });
    }

    if (cmd === 'getModels') {
      if (!make) return err('make required');
      const res = await fetch(
        `${CARQUERY_BASE}?cmd=getModels&make=${encodeURIComponent(make)}&format=json`,
        { headers: { 'User-Agent': 'GIDGarage/1.0' } }
      );
      const text = await res.text();
      const data = parseCarQuery(text);
      const models = [...new Set(
        (data.Models || [])
          .map(m => m.model_name)
          .filter(Boolean)
      )].sort();
      return json({ models });
    }

    if (cmd === 'getTrims') {
      if (!make || !model) return err('make and model required');

      // Build URL — year is optional, narrows results when provided
      let cqUrl = `${CARQUERY_BASE}?cmd=getTrims&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&format=json`;
      if (year) cqUrl += `&year=${year}`;

      const res = await fetch(cqUrl, {
        headers: { 'User-Agent': 'GIDGarage/1.0' },
      });
      const text = await res.text();
      const data = parseCarQuery(text);
      const trims = (data.Trims || []).map(formatTrim).filter(Boolean);

      // Deduplicate by label
      const seen = new Set();
      const unique = trims.filter(t => {
        if (seen.has(t.label)) return false;
        seen.add(t.label);
        return true;
      });

      return json({ trims: unique });
    }

    return err(`unknown cmd: ${cmd}`);

  } catch (e) {
    return err(`upstream error: ${e.message}`, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// CarQuery returns JSONP-style or plain JSON depending on version.
// Parse defensively.
function parseCarQuery(text) {
  // Strip any JSONP wrapper like: callback({...});
  const stripped = text.replace(/^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/, '').replace(/\);?\s*$/, '');
  try {
    return JSON.parse(stripped);
  } catch {
    return {};
  }
}

function formatTrim(t) {
  // Build a clean engine string from CarQuery trim fields
  const cc = parseFloat(t.model_engine_cc);
  const liters = cc > 0 ? (cc / 1000).toFixed(1) + 'L' : '';
  const cyls = t.model_engine_cyl ? t.model_engine_cyl + '-cyl' : '';
  const fuel = (t.model_engine_fuel || '').toLowerCase();
  const driven = (t.model_drive || '').toUpperCase();

  let fuelTag = '';
  if (fuel.includes('diesel')) fuelTag = ' Diesel';
  else if (fuel.includes('electric')) fuelTag = ' Electric';
  else if (fuel.includes('hybrid')) fuelTag = ' Hybrid';

  let driveTag = '';
  if (driven.includes('AWD') || driven.includes('4WD') || driven.includes('4X4')) driveTag = ' AWD';
  else if (driven.includes('RWD')) driveTag = ' RWD';
  else if (driven.includes('FWD')) driveTag = ' FWD';

  const engine = [liters, cyls].filter(Boolean).join(' ') + fuelTag;
  const trim = (t.model_trim || '').trim();

  // label = "LE — 2.4L 4-cyl FWD" style
  const label = [trim, engine ? engine + driveTag : ''].filter(Boolean).join(' — ');
  if (!label) return null;

  return {
    label,
    trim,
    engine: engine + driveTag,
    year_from: t.model_year ? parseInt(t.model_year) : null,
  };
}
