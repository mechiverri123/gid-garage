// Local competitor model. Business competitors are defined by LOCAL CUSTOMER
// competition; sites like Reddit or RepairPal only compete for search results.
// Tests: tests/seo-competitors.test.js
//
//   business / primary    mobile mechanics serving the same area   (weight 1.0)
//   business / secondary  independent local repair shops            (0.6)
//   business / tertiary   dealerships and chains                    (0.3)
//   search_result         publishers, forums, parts stores, OEMs    (not a business competitor)
// Anything located outside the service area gets weight 0.

import { isInsideServiceArea } from './service-area.js';
import { SERVICES, detectService } from './local-intent.js';

export const SEARCH_RESULT_DOMAINS = [
  'reddit.com', 'youtube.com', 'repairpal.com', 'yelp.com', 'wikipedia.org', 'quora.com', 'facebook.com', 'nextdoor.com',
  'autozone.com', 'oreillyauto.com', 'advanceautoparts.com', 'napaonline.com', 'rockauto.com', 'carparts.com',
  'cars.com', 'edmunds.com', 'kbb.com', 'caranddriver.com', 'motortrend.com', 'thedrive.com', 'jdpower.com',
  '2carpros.com', 'carcomplaints.com', 'yourmechanic.com', 'angi.com', 'thumbtack.com', 'bbb.org',
  'toyota.com', 'ford.com', 'honda.com', 'chevrolet.com', 'gmc.com', 'ramtrucks.com', 'jeep.com', 'nissanusa.com', 'subaru.com', 'hyundaiusa.com', 'kia.com',
];
const CHAINS = ['jiffy lube', 'midas', 'meineke', 'firestone', 'pep boys', 'les schwab', 'discount tire', 'big o', 'valvoline', 'goodyear', 'brakes plus', 'christian brothers', 'take 5', 'grease monkey', 'walmart', 'costco', 'mavis', 'ntb', 'monro'];
const DEALER = /\b(dealer|dealership|motors|auto group|toyota|ford|chevrolet|chevy|honda|nissan|subaru|hyundai|kia|jeep|chrysler|dodge|ram|gmc|buick|lexus|mazda|volkswagen)\b/i;
const MOBILE = /\b(mobile|on[- ]?site|on the go|we come to you|comes to you|roadside|at your (home|door)|house call)\b/i;
export const TIER_WEIGHT = { primary: 1.0, secondary: 0.6, tertiary: 0.3 };

const host = u => { try { return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function classifyCompetitor({ name = '', website = '', types = [], description = '', location = null } = {}) {
  const domain = host(website);
  if (domain && SEARCH_RESULT_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))) {
    return { kind: 'search_result', tier: null, isMobile: false, weight: 0, domain, reason: 'publisher/forum/parts/OEM site — competes for search results, not customers' };
  }
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const isMobile = MOBILE.test(text);
  let tier = 'secondary';
  let reason = 'local independent repair shop';
  if (isMobile) { tier = 'primary'; reason = 'mobile mechanic — same customer, same model'; }
  else if (CHAINS.some(c => lower.includes(c))) { tier = 'tertiary'; reason = 'chain'; }
  else if (types.includes('car_dealer') || DEALER.test(name)) { tier = 'tertiary'; reason = 'dealership'; }
  const area = location ? isInsideServiceArea(location) : { inside: null };
  const weight = area.inside === false ? 0 : TIER_WEIGHT[tier];
  return { kind: 'business', tier, isMobile, weight, domain: domain || null, insideServiceArea: area.inside, distanceMiles: area.distanceMiles ?? null, reason: area.inside === false ? `${reason}; located outside the service area` : reason };
}

// Reviews per 30 days from dated review-count snapshots.
export function reviewVelocity(snapshots) {
  const s = snapshots.filter(x => x.at && Number.isFinite(x.reviewCount)).sort((a, b) => a.at.localeCompare(b.at));
  if (s.length < 2) return null;
  const days = (new Date(s[s.length - 1].at) - new Date(s[0].at)) / 86400000;
  if (days < 7) return null;
  return Math.round(((s[s.length - 1].reviewCount - s[0].reviewCount) / days) * 30 * 10) / 10;
}

// Minimal public-page parse: title, meta description, h1s, schema types,
// services mentioned. No scripts executed; SPA sites show only their shell.
export function parsePublicPage(html = '') {
  const pick = re => (html.match(re)?.[1] || '').replace(/\s+/g, ' ').trim();
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  // Quote-matched: an apostrophe inside a double-quoted value ("Flagstaff's") must not end it.
  const attr = re => (html.match(re)?.[2] || '').replace(/\s+/g, ' ').trim();
  const description = attr(/<meta[^>]+name=["']description["'][^>]+content=(["'])([\s\S]*?)\1/i) || attr(/<meta[^>]+content=(["'])([\s\S]*?)\1[^>]+name=["']description["']/i);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const schemaTypes = [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const services = [...new Set(SERVICES.filter(s => s.id !== 'general').filter(s => s.terms.some(t => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text))).map(s => s.id))];
  return { title, description, h1s, schemaTypes: [...new Set(schemaTypes)], services, textLength: text.length, contentHash: hash(`${title}|${description}|${h1s.join('|')}|${services.join(',')}`) };
}

// Small stable string hash (change detection, not security).
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

// What changed between two page snapshots.
export function detectChanges(prev, next) {
  if (!prev || !next || prev.contentHash === next.contentHash) return [];
  const changes = [];
  if (prev.title !== next.title) changes.push({ type: 'title_changed', from: prev.title, to: next.title });
  if (prev.description !== next.description) changes.push({ type: 'description_changed', from: prev.description, to: next.description });
  if ((prev.h1s || []).join('|') !== (next.h1s || []).join('|')) changes.push({ type: 'headline_changed', from: prev.h1s, to: next.h1s });
  const added = (next.services || []).filter(s => !(prev.services || []).includes(s));
  const removed = (prev.services || []).filter(s => !(next.services || []).includes(s));
  if (added.length) changes.push({ type: 'services_added', services: added });
  if (removed.length) changes.push({ type: 'services_removed', services: removed });
  return changes;
}

// Local strength: tier weight × review volume × rating. GID scores as a mobile mechanic (1.0).
export const strengthOf = c => Math.round(c.weight * (1 + Math.log10(1 + (c.reviewCount ?? c.review_count ?? 0))) * ((c.rating || 4) / 5) * 100) / 100;

// Who is the biggest local competitor, and where they cover services we don't show.
export function competitorLandscape(competitors, ourServicesShown = [], services = SERVICES) {
  const ranked = competitors
    .filter(c => c.kind === 'business' && c.weight > 0)
    .map(c => ({ ...c, strength: strengthOf(c) }))
    .sort((a, b) => b.strength - a.strength);
  return ranked.map(c => ({
    ...c,
    theyShowWeDont: (c.services || []).filter(s => !ourServicesShown.includes(s) && services.find(x => x.id === s)?.offered === true),
    weShowTheyDont: ourServicesShown.filter(s => !(c.services || []).includes(s)),
  }));
}

export { detectService };
