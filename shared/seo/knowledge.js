// SEO knowledge base: the guidance recommendations are allowed to cite.
// Each entry is a claim taken from a source, with its evidence tier:
//   google_confirmed  – Google's own documentation says it
//   strong_industry   – repeated, well-established SEO research
//   experimental      – plausible, limited evidence (GID's own tests count here first)
//   speculation       – never used to justify a HIGH priority
//
// Seeded 2026-09-29 from the pages below (retrieved that day). The weekly
// knowledge check (ops.refreshKnowledge) re-fetches every Google URL and flags an
// entry "changed — review" when the page text changes; an entry the owner marks
// superseded stops being cited. Tests: tests/seo-agent.test.js

export const TIERS = ['google_confirmed', 'strong_industry', 'experimental', 'speculation'];

export const KNOWLEDGE = [
  { id: 'local_ranking_factors', tier: 'google_confirmed', category: 'GBP',
    source: 'Google Business Profile Help — Tips to improve your local ranking on Google', url: 'https://support.google.com/business/answer/7091',
    claim: 'Local results are based mainly on relevance, distance and prominence. Prominence includes links and review count/score. There is no way to request or pay for a better local ranking.' },
  { id: 'gbp_complete_info', tier: 'google_confirmed', category: 'GBP',
    source: 'Google Business Profile Help — Tips to improve your local ranking on Google', url: 'https://support.google.com/business/answer/7091',
    claim: 'Verify the profile and keep complete, accurate info (hours incl. special hours, category, attributes); respond to reviews; add photos.' },
  { id: 'gbp_name_rules', tier: 'google_confirmed', category: 'GBP',
    source: 'Guidelines for representing your business on Google', url: 'https://support.google.com/business/answer/3038177',
    claim: 'Adding unnecessary information (keywords, locations, taglines) to the business name is not permitted and can suspend the profile.' },
  { id: 'gbp_service_area', tier: 'google_confirmed', category: 'GBP',
    source: 'Guidelines for representing your business on Google', url: 'https://support.google.com/business/answer/3038177',
    claim: 'Service-area businesses should hide their address; the service area should not extend beyond about 2 hours of driving from the base.' },
  { id: 'gbp_categories', tier: 'google_confirmed', category: 'GBP',
    source: 'Guidelines for representing your business on Google', url: 'https://support.google.com/business/answer/3038177',
    claim: 'Use as few categories as possible to describe the core business ("this business IS a …"), not ancillary services.' },
  { id: 'reviews_asking', tier: 'google_confirmed', category: 'REVIEWS',
    source: 'Google Business Profile Help — Tips to get more reviews', url: 'https://support.google.com/business/answer/3474122',
    claim: 'Ask customers to leave reviews via a Google link or QR code; reply to reviews conversationally, not promotionally.' },
  { id: 'reviews_no_incentives', tier: 'google_confirmed', category: 'REVIEWS',
    source: 'Maps User Generated Content Policy — Fake engagement', url: 'https://support.google.com/contributionpolicy/answer/7400114',
    claim: 'No incentives for reviews; no discouraging negative reviews or selectively soliciting positive ones (review gating); reviews must reflect a genuine experience.' },
  { id: 'spam_doorway', tier: 'google_confirmed', category: 'CONTENT',
    source: 'Spam policies for Google Web Search (updated 2026-08-28)', url: 'https://developers.google.com/search/docs/essentials/spam-policies',
    claim: 'Doorway abuse: sites or pages created to rank for specific, similar search queries (e.g. near-identical city pages).' },
  { id: 'spam_scaled', tier: 'google_confirmed', category: 'CONTENT',
    source: 'Spam policies for Google Web Search (updated 2026-08-28)', url: 'https://developers.google.com/search/docs/essentials/spam-policies',
    claim: 'Scaled content abuse: many pages generated primarily to manipulate rankings rather than help users.' },
  { id: 'spam_keywords_links', tier: 'google_confirmed', category: 'BACKLINKS',
    source: 'Spam policies for Google Web Search (updated 2026-08-28)', url: 'https://developers.google.com/search/docs/essentials/spam-policies',
    claim: 'Keyword stuffing, link spam (bought links, excessive exchanges, low-quality directories) and hidden text are spam.' },
  { id: 'js_soft404', tier: 'google_confirmed', category: 'TECHNICAL SEO',
    source: 'Understand JavaScript SEO basics (updated 2026-03-04)', url: 'https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics',
    claim: 'Single-page apps create soft 404s; redirect unknown routes to a URL that returns HTTP 404, or add a noindex robots meta tag to error pages.' },
  { id: 'js_canonical', tier: 'google_confirmed', category: 'TECHNICAL SEO',
    source: 'Understand JavaScript SEO basics (updated 2026-03-04)', url: 'https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics',
    claim: 'JavaScript may set the canonical URL, but it should always be the same value as in the original HTML.' },
  { id: 'js_prerender', tier: 'google_confirmed', category: 'TECHNICAL SEO',
    source: 'Understand JavaScript SEO basics (updated 2026-03-04)', url: 'https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics',
    claim: 'Pages wait in a render queue before JavaScript runs; server-side or pre-rendering is still a great idea because not all bots run JavaScript.' },
  { id: 'schema_local', tier: 'google_confirmed', category: 'TECHNICAL SEO',
    source: 'LocalBusiness structured data (updated 2026-09-08)', url: 'https://developers.google.com/search/docs/appearance/structured-data/local-business',
    claim: 'Use the most specific LocalBusiness subtype; name and address are required; telephone, url, geo, openingHoursSpecification are recommended.' },
  { id: 'gbp_performance_api', tier: 'google_confirmed', category: 'GBP',
    source: 'Business Profile Performance API reference', url: 'https://developers.google.com/my-business/reference/performance/rest',
    claim: 'Daily metrics (impressions by platform/device, website clicks, call clicks, direction requests) and monthly search-keyword impressions are available per location.' },
  { id: 'title_ctr', tier: 'strong_industry', category: 'WEBSITE',
    source: 'Google Search Central — Influencing title links; widely replicated CTR studies', url: 'https://developers.google.com/search/docs/appearance/title-link',
    claim: 'Descriptive, specific titles that match the searcher\'s task tend to earn more clicks at the same position.' },
  { id: 'service_pages', tier: 'strong_industry', category: 'CONTENT',
    source: 'Google — Creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content',
    claim: 'A dedicated, genuinely useful page per core service (real process, pricing context, photos, FAQs from real customers) is the most reliable way to be relevant for that service.' },
  { id: 'review_velocity', tier: 'strong_industry', category: 'REVIEWS',
    source: 'Local search ranking factor surveys (industry)', url: 'https://support.google.com/business/answer/7091',
    claim: 'A steady flow of recent genuine reviews matters beyond the total count; long gaps in new reviews weaken prominence.' },
  { id: 'real_job_content', tier: 'experimental', category: 'CONTENT',
    source: 'Google — helpful content (experience) guidance; GID to verify with its own results', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content',
    claim: 'Anonymised case studies from real completed jobs (vehicle, symptom, diagnosis, repair, photos) demonstrate first-hand experience.' },
];

export const knowledgeById = id => KNOWLEDGE.find(k => k.id === id) || null;

// Merge stored status (seo_knowledge: hash, changed/superseded flags) over the seed.
export function withStoredStatus(seed = KNOWLEDGE, stored = []) {
  const byId = new Map(stored.map(s => [s.id, s]));
  return seed.map(k => {
    const s = byId.get(k.id);
    return { ...k, status: s?.status || 'active', lastCheckedAt: s?.last_checked_at || null, changedAt: s?.changed_at || null, retrievedAt: s?.retrieved_at || '2026-09-29' };
  });
}

// Visible text of a page, for change detection (markup and scripts ignored).
export function pageFingerprint(html = '') {
  const text = String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return { hash: (h >>> 0).toString(16), length: text.length };
}
