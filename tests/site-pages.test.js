// Public content pages: every offered service has a page the SEO audit counts as
// coverage, prices match the homepage, the pre-rendered HTML carries each page's
// own title/canonical/H1, and unknown URLs 404 while app routes still load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICE_PAGES, AREAS, HOME_PAGE, pageForPath } from '../shared/site-pages.js';
import { buildPages, withHead } from '../scripts/prerender.mjs';
import { detectSiteStructure } from '../shared/seo/agent-detectors.js';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');

test('one page per offered service, and the SEO audit counts each as coverage', () => {
  const ids = SERVICE_PAGES.map(p => p.serviceId);
  assert.deepEqual([...ids].sort(), ['audio', 'brakes', 'diag', 'full', 'oil', 'suspension']);
  assert.equal(new Set(SERVICE_PAGES.map(p => p.path)).size, SERVICE_PAGES.length);
  const audits = [{ url: 'https://gidgarage.com/', title: 'Home', canonical: 'https://gidgarage.com/', h1: 'Flagstaff Mobile Mechanic', issues: [] },
    ...SERVICE_PAGES.map(p => ({ url: p.canonical, title: p.title, canonical: p.canonical, h1: p.h1, issues: [] }))];
  assert.deepEqual(detectSiteStructure(audits).filter(r => r.evidence.code === 'service_page_gap').map(r => r.evidence.service), []);
  assert.equal(pageForPath('/brake-repair-flagstaff/').serviceId, 'brakes');
});

test('titles and descriptions fit search results; prices are the homepage prices', () => {
  for (const p of [...SERVICE_PAGES, HOME_PAGE]) {
    assert.ok(p.title.length <= 75, `${p.path} title ${p.title.length}`);
    assert.ok(p.description.length <= 170, `${p.path} description ${p.description.length}`);
  }
  for (const p of SERVICE_PAGES) for (const x of p.pricing) {
    for (const price of x.detail.match(/\$[\d,]+\.\d\d/g) || []) assert.ok(app.includes(price), `${p.path}: ${price} is not a homepage price`);
  }
});

test('pre-rendered HTML: own title, canonical and one H1 per page; "$" in text is safe', () => {
  const template = '<html><head><title>T</title><link rel="canonical" href="https://gidgarage.com/" /><meta name="description" content="d" /><meta property="og:title" content="t" /><meta property="og:description" content="d" /><script type="application/ld+json" id="faq-schema">{}</script></head><body><div id="root"><nav>banner</nav></div><script type="module" src="/assets/index.js"></script></body></html>';
  const pages = Object.fromEntries(buildPages(template));
  const brake = pages['brake-repair-flagstaff.html'];
  assert.match(brake, /<title>Mobile Brake Repair in Flagstaff, AZ \| GID Garage<\/title>/);
  assert.match(brake, /<link rel="canonical" href="https:\/\/gidgarage.com\/brake-repair-flagstaff"/);
  assert.match(brake, /content="Brake pads and rotors replaced[^"]*\$149\.99\/axle/);
  assert.equal((brake.match(/<h1/g) || []).length, 1);
  assert.match(brake, /"@type":"FAQPage"/);
  assert.equal((pages['index.html'].match(/<h1/g) || []).length, 1);
  assert.match(pages['app-shell.html'], /noindex/);
  assert.doesNotMatch(pages['app-shell.html'], /<h1/);
  assert.match(pages['404.html'], /noindex/);
  assert.doesNotMatch(pages['404.html'], /type="module"/, 'the 404 page never boots the app');
  assert.throws(() => withHead('<html></html>', { ...HOME_PAGE, canonical: 'x' }), /canonical not set/);
});

test('routing: app routes still load, town pages 301 to one Areas page, sitemap lists real pages only', () => {
  for (const route of ['/bookings', '/admin', '/jarvis', '/prompt', '/estimate', '/invoice', '/ppi', '/games', '/game-redeem', '/review']) {
    assert.match(redirects, new RegExp(`^${route}\\s+/app-shell\\s+200$`, 'm'), route);
  }
  assert.match(redirects, /^\/service-area\/\*\s+\/service-area\s+301$/m);
  assert.doesNotMatch(sitemap, /service-area\//);
  for (const p of SERVICE_PAGES) assert.match(sitemap, new RegExp(`<loc>https://gidgarage.com${p.path}</loc>`));
  assert.ok(AREAS.some(a => a.slug === 'winslow'), 'Winslow stays listed until the owner decides');
});
