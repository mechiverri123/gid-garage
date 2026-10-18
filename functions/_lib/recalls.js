// Free safety-recall check for a job's vehicle (NHTSA, no key). VIN -> year/make/model
// with vPIC, then NHTSA's recall list for that model. Model-wide: NHTSA has no public
// per-VIN API, so the page says to confirm by VIN at nhtsa.gov/recalls (repairs are
// free at a dealer). Cloudflare caches both calls for a day. Tests: tests/recalls.test.js
const DAY = { cf: { cacheTtl: 86400, cacheEverything: true } };

export async function vehicleRecalls(vin, fetchImpl = (...a) => fetch(...a)) {
  const v = String(vin || '').trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return null;
  try {
    const r = (await (await fetchImpl(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${v}?format=json`, DAY)).json())?.Results?.[0];
    if (!r?.Make || !r?.Model || !r?.ModelYear) return null;
    const q = new URLSearchParams({ make: r.Make, model: r.Model, modelYear: r.ModelYear });
    const res = await fetchImpl(`https://api.nhtsa.gov/recalls/recallsByVehicle?${q}`, DAY);
    if (!res.ok) return null;
    const list = (await res.json())?.results || [];
    const title = s => String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return {
      vehicle: `${r.ModelYear} ${title(r.Make)} ${r.Model}`,
      recalls: list.map(x => ({ campaign: x.NHTSACampaignNumber, component: title(String(x.Component || '').split(':')[0]), summary: String(x.Summary || '').slice(0, 400), date: x.ReportReceivedDate || null })),
    };
  } catch { return null; }
}
