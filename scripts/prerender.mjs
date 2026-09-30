// Runs after `vite build` (package.json "build"). Writes each public page as its
// own HTML file so crawlers get the right title, description, canonical, H1 and
// text BEFORE JavaScript runs (Google: pre-rendering helps, and a JS canonical
// must match the HTML one). React replaces the static block when it mounts.
//   dist/index.html                     homepage (head + static text)
//   dist/<service-slug>.html            one per service  → served at /<service-slug>
//   dist/service-area.html              Areas We Serve   → /service-area
//   dist/privacy.html                   → /privacy
//   dist/app-shell.html                 app routes' shell (no static text), noindex
//   dist/404.html                       real 404 for unknown URLs (turns off the
//                                       SPA catch-all; app routes are listed in
//                                       public/_redirects)
// Content comes from shared/site-pages.js (the same data the React pages render).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SERVICE_PAGES, AREAS, AREAS_PAGE, HOME_PAGE, PRIVACY_PAGE, CASE_STUDIES, CASE_STUDIES_PAGE, PHONE, SITE } from '../shared/site-pages.js';

const DIST = new URL('../dist/', import.meta.url);
// Run as the build step; imported by tests for its helpers only.
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function withHead(html, p) {
  // Function replacers: page text contains "$149.99", which a string replacement would read as "$1".
  const out = html
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(p.title)}</title>`)
    .replace(/(<meta name="description" content=)"[^"]*"/, (_, a) => `${a}"${esc(p.description)}"`)
    .replace(/(<link rel="canonical" href=)"[^"]*"/, (_, a) => `${a}"${esc(p.canonical)}"`)
    .replace(/(<meta property="og:title" content=)"[^"]*"/, (_, a) => `${a}"${esc(p.title)}"`)
    .replace(/(<meta property="og:description" content=)"[^"]*"/, (_, a) => `${a}"${esc(p.description)}"`);
  if (!out.includes(`<link rel="canonical" href="${esc(p.canonical)}"`)) throw new Error(`canonical not set for ${p.path}`);
  return out;
}

// Static text inside #root, right after the loading banner. Inline styles only
// (Tailwind purges classes it didn't see in the source).
const wrap = inner => `<main style="background:#0f0f0f;color:#e5e7eb;font-family:Barlow,system-ui,sans-serif;padding:32px 20px;max-width:960px;margin:0 auto;line-height:1.6">${inner}</main>`;
const h1 = t => `<h1 style="color:#fff;font-size:40px;line-height:1.05;font-weight:900;text-transform:uppercase;margin:0 0 16px">${esc(t)}</h1>`;
const h2 = t => `<h2 style="color:#fff;font-size:24px;margin:28px 0 10px">${esc(t)}</h2>`;
const list = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
const serviceLinks = (except = null) => list(SERVICE_PAGES.filter(s => s.path !== except).map(s => `<a style="color:#f87171" href="${s.path}">${esc(s.h1)}</a>`));
const callLine = `<p><a style="color:#f87171" href="tel:${PHONE}">Call or text ${PHONE}</a> · <a style="color:#f87171" href="/bookings">Book online</a></p>`;

export function withRoot(html, inner) {
  const at = html.indexOf('</nav>', html.indexOf('<div id="root"'));
  if (at < 0) throw new Error('root placeholder not found');
  return html.slice(0, at + 6) + '<!--prerender-->' + wrap(inner) + '<!--/prerender-->' + html.slice(at + 6);
}

// Per-service structured data: what it is, who provides it, where, and the starting price.
export function serviceSchema(p) {
  const prices = p.pricing.map(x => Number((x.detail.match(/\$([\d,]+\.\d\d)/) || [])[1]?.replace(/,/g, ''))).filter(Number.isFinite);
  return JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Service', name: p.h1, serviceType: p.label, url: p.canonical, description: p.description,
    provider: { '@type': 'AutoRepair', name: 'GID Garage', telephone: '+14807570476', url: `${SITE}/` },
    areaServed: AREAS.map(a => ({ '@type': 'City', name: `${a.name}, AZ` })),
    ...(prices.length ? { offers: { '@type': 'Offer', priceCurrency: 'USD', price: Math.min(...prices).toFixed(2), description: p.pricing[0].detail } } : {}),
  });
}
const withServiceSchema = (html, p) => html.replace('</head>', `<script type="application/ld+json">${serviceSchema(p)}</script></head>`);

// llms.txt: a plain summary of the business for AI assistants and their crawlers.
export function llmsTxt() {
  const lines = [
    '# GID Garage', '',
    `> Mobile mechanic based in Flagstaff, Arizona. We come to the customer's home, work or roadside — no shop. Call or text ${PHONE}, book at ${SITE}/bookings, email info@gidgarage.com.`, '',
    '## Hours', '- Monday to Friday: 1:30 PM to 8:00 PM', '- Saturday and Sunday: 5:00 AM to 8:00 PM (by appointment)', '- Appointments required; same-day subject to availability.', '',
    '## Service area (about 30 miles around Flagstaff)', ...AREAS.map(a => `- ${a.name}${a.miles ? ` (~${a.miles} mi)` : ' (home base)'}`), '',
    '## Services and prices',
    ...SERVICE_PAGES.flatMap(p => [`- [${p.h1}](${p.canonical}): ${p.intro}`, ...p.pricing.map(x => `  - ${x.label}: ${x.detail}`)]), '',
    '## Not offered (referred to specialty shops)', '- Wheel alignments, A/C system work, transmission overhauls, welding', '',
    '## Real jobs (case studies)', ...CASE_STUDIES.map(c => `- [${c.h1}](${c.canonical})`), '',
    '## Payment', '- Card on file, tap-to-pay in person, or a secure payment link.', '',
    '## Pages', `- [Home](${SITE}/)`, `- [Areas we serve](${SITE}/service-area)`, `- [Real jobs](${SITE}/case-studies)`, `- [Book online](${SITE}/bookings)`, '',
  ];
  return lines.join('\n');
}

const faqSchema = faq => JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
// The homepage FAQ schema only belongs on pages that show those questions.
const withoutFaq = html => html.replace(/<script type="application\/ld\+json" id="faq-schema">[\s\S]*?<\/script>/, '');
const withFaq = (html, faq) => html.replace(/(<script type="application\/ld\+json" id="faq-schema">)[\s\S]*?(<\/script>)/, (_, a, b) => `${a}${faqSchema(faq)}${b}`);

export function buildPages(template) {
const pages = [];

pages.push(['index.html', withRoot(withHead(template, HOME_PAGE), [
  h1(HOME_PAGE.h1), `<p>${esc(HOME_PAGE.intro)}</p>`, callLine,
  h2('Services'), serviceLinks(), `<p><a style="color:#f87171" href="/service-area">Areas we serve around Flagstaff</a></p>`,
].join(''))]);

for (const p of SERVICE_PAGES) {
  pages.push([`${p.path.slice(1)}.html`, withServiceSchema(withFaq(withRoot(withHead(template, p), [
    h1(p.h1), `<p>${esc(p.intro)}</p>`, callLine,
    h2('Pricing'), list(p.pricing.map(x => `<strong>${esc(x.label)}</strong> — ${esc(x.detail)}`)),
    h2("What's included"), list(p.included.map(esc)),
    h2('How a mobile visit works'), `<ol>${p.howItWorks.map(s => `<li><strong>${esc(s.title)}.</strong> ${esc(s.text)}</li>`).join('')}</ol>`,
    CASE_STUDIES.some(c => c.serviceId === p.serviceId) ? h2('Real jobs like this') + list(CASE_STUDIES.filter(c => c.serviceId === p.serviceId).map(c => `<a style="color:#f87171" href="${c.path}">${esc(c.h1)}</a>`)) : '',
    h2('Questions'), p.faq.map(f => `<h3 style="color:#fff;margin:14px 0 4px">${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join(''),
    h2('Other services'), serviceLinks(p.path),
  ].join('')), p.faq), p)]);
}

pages.push(['service-area.html', withoutFaq(withRoot(withHead(template, AREAS_PAGE), [
  h1(AREAS_PAGE.h1), `<p>${esc(AREAS_PAGE.intro)}</p>`,
  AREAS.map(a => `<h2 id="${a.slug}" style="color:#fff;font-size:20px;margin:20px 0 4px">${esc(a.name)}${a.miles ? ` · ~${a.miles} mi from Flagstaff` : ' · home base'}</h2><p>${esc(a.blurb)}</p>`).join(''),
  h2('Services'), serviceLinks(), callLine,
].join('')))]);

pages.push(['privacy.html', withoutFaq(withRoot(withHead(template, PRIVACY_PAGE), h1(PRIVACY_PAGE.h1) + `<p>${esc(PRIVACY_PAGE.description)}</p>`))]);

// Real-job case studies: /case-studies and /case-studies/<slug>.
const caseLinks = (except = null) => list(CASE_STUDIES.filter(c => c.slug !== except).map(c => `<a style="color:#f87171" href="${c.path}">${esc(c.h1)}</a>`));
pages.push(['case-studies.html', withoutFaq(withRoot(withHead(template, CASE_STUDIES_PAGE), [
  h1(CASE_STUDIES_PAGE.h1), `<p>${esc(CASE_STUDIES_PAGE.intro)}</p>`, caseLinks(), callLine,
].join('')))]);
for (const c of CASE_STUDIES) {
  const service = SERVICE_PAGES.find(p => p.serviceId === c.serviceId);
  pages.push([`case-studies/${c.slug}.html`, withoutFaq(withRoot(withHead(template, c), [
    h1(c.h1), `<p>${esc(c.vehicle)}${c.mileage ? ` · ${esc(c.mileage)}` : ''} · ${esc(c.month)} · mobile repair in the Flagstaff area</p>`,
    h2('The problem'), `<p>${esc(c.complaint)}</p>`, h2('What we found'), `<p>${esc(c.diagnosis)}</p>`,
    h2('What we did'), `<p>${esc(c.repair)}</p>`, h2('The result'), `<p>${esc(c.outcome)}</p>`,
    c.photos.map(p => `<img src="${p.src}" alt="${esc(p.alt)}" width="300" loading="lazy" style="max-width:48%;margin:4px">`).join(''),
    h2('The takeaway'), `<p>${esc(c.lesson)}</p>`,
    service ? `<p><a style="color:#f87171" href="${service.path}">${esc(service.h1)} — pricing</a></p>` : '', callLine,
    h2('More real jobs'), caseLinks(c.slug),
  ].join('')))]);
}

// The app shell for app routes (/jarvis, /admin, /estimate …; see public/_redirects):
// the plain build output — no homepage text flashing before those screens load.
// Not a page of its own, so never indexed.
const shell = template.replace(/<head[^>]*>/, m => `${m}<meta name="robots" content="noindex" />`);
if (!shell.includes('content="noindex"')) throw new Error('app shell: <head> not found');
pages.push(['app-shell.html', shell]);

pages.push(['llms.txt', llmsTxt()]);

// A real 404: its own small page (no app), not indexable.
pages.push(['404.html', `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | GID Garage</title><link rel="icon" href="/favicon.ico"></head>
<body style="margin:0;background:#0f0f0f;color:#e5e7eb;font-family:system-ui,sans-serif">${wrap(`${h1('Page not found')}<p>That page doesn't exist. GID Garage is Flagstaff's mobile mechanic — here's where to go:</p><p><a style="color:#f87171" href="/">Home</a> · <a style="color:#f87171" href="/service-area">Areas we serve</a></p>${serviceLinks()}${callLine}`)}</body></html>`]);

  return pages;
}

// Writes every page into dist/. Called by vite.config.ts after each build (so it
// runs whether the host runs `vite build` or `npm run build`), or directly.
export function prerender(dist = DIST) {
  const tpl = readFileSync(new URL('index.html', dist), 'utf8').replace(/<!--prerender-->[\s\S]*?<!--\/prerender-->/, '');
  const pages = buildPages(tpl);
  for (const [file, html] of pages) {
    const url = new URL(file, dist);
    mkdirSync(new URL('.', url), { recursive: true });
    writeFileSync(url, html);
  }
  return pages.map(p => p[0]);
}

if (isMain) console.log(`prerender: ${prerender().join(', ')}`);
