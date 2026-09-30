// Service pages (/brake-repair-flagstaff, …) and the Areas We Serve page. Content
// comes from shared/site-pages.js — the same data scripts/prerender.mjs writes
// into the HTML, so crawlers and people get the same page.
import { useEffect, useState, lazy, Suspense } from 'react';
import { Phone } from 'lucide-react';
import { SERVICE_PAGES, AREAS, AREAS_PAGE, CASE_STUDIES, CASE_STUDIES_PAGE, PHONE, type ServicePageData, type SimplePage, type CaseStudy } from '../shared/site-pages.js';

const BookingWidget = lazy(() => import('./BookingWidget'));
const R2 = (import.meta.env.VITE_R2_PUBLIC_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const img = (f: string) => (R2 ? `${R2}/${f}` : `/${f}`);

// Title, description and canonical match the pre-rendered HTML exactly.
function useHead(p: SimplePage | ServicePageData | CaseStudy) {
  useEffect(() => {
    document.title = p.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', p.description);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', p.canonical);
  }, [p]);
}

function Shell({ children, onQuote }: { children: React.ReactNode; onQuote: () => void }) {
  return (
    <div className="bg-dark text-dark min-h-screen font-sans">
      <header className="bg-[#0f0f0f] border-b border-white/10">
        <div className="max-w-5xl mx-auto px-5 md:px-8 h-16 md:h-20 flex items-center justify-between gap-4">
          <a href="/" className="flex-shrink-0"><img src="/opt/website_logo-192.webp" width={192} height={192} alt="GID Garage" className="h-12 w-auto" /></a>
          <div className="flex items-center gap-3">
            <a href={`tel:${PHONE}`} className="hidden sm:inline-flex items-center gap-2 text-white text-sm font-semibold"><Phone className="w-4 h-4" />{PHONE}</a>
            <button onClick={onQuote} className="btn-primary text-xs px-5 py-3">Get a Quote</button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-16">{children}</main>
      <footer className="border-t border-white/10 py-10">
        <div className="max-w-5xl mx-auto px-5 md:px-8 grid gap-6 sm:grid-cols-2 text-sm">
          <div>
            <p className="text-white font-bold mb-2">Services</p>
            <ul className="flex flex-col gap-1">{SERVICE_PAGES.map(s => <li key={s.path}><a href={s.path} className="text-white/60 hover:text-white">{s.h1}</a></li>)}</ul>
          </div>
          <div className="text-white/60">
            <p className="text-white font-bold mb-2">GID Garage</p>
            <p>Mobile mechanic based in Flagstaff, AZ.</p>
            <p className="mt-1"><a href={`tel:${PHONE}`} className="hover:text-white">{PHONE}</a> · <a href="mailto:info@gidgarage.com" className="hover:text-white">info@gidgarage.com</a></p>
            <p className="mt-1"><a href="/service-area" className="hover:text-white">Areas we serve</a> · <a href="/case-studies" className="hover:text-white">Real jobs</a> · <a href="/" className="hover:text-white">Home</a></p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function useBooking(serviceId?: string) {
  const [open, setOpen] = useState(false);
  const widget = open ? (
    <Suspense fallback={null}><BookingWidget autoOpen preselectedService={serviceId} onClose={() => setOpen(false)} /></Suspense>
  ) : null;
  return { openBooking: () => setOpen(true), widget };
}

export function ServicePage({ page }: { page: ServicePageData }) {
  useHead(page);
  const { openBooking, widget } = useBooking(page.serviceId);
  return (
    <Shell onQuote={openBooking}>
      <p className="text-red-400 text-xs font-bold uppercase tracking-[0.3em] mb-3">GID Garage · Flagstaff, AZ</p>
      <h1 className="text-white font-black uppercase tracking-tight leading-[0.95] text-4xl md:text-6xl">{page.h1}</h1>
      <p className="text-white/70 text-base md:text-lg leading-relaxed mt-5 max-w-3xl">{page.intro}</p>
      <div className="flex flex-col sm:flex-row gap-3 mt-7">
        <button onClick={openBooking} className="btn-primary text-sm px-8 py-4">Get a Quote</button>
        <a href={`tel:${PHONE}`} className="btn-outline text-sm px-8 py-4"><Phone className="w-4 h-4" />Call {PHONE}</a>
      </div>

      <section className="mt-12">
        <h2 className="text-white font-bold text-2xl tracking-tight mb-4">Pricing</h2>
        <ul className="flex flex-col gap-2">
          {page.pricing.map(p => (
            <li key={p.label} className="bg-white/5 border border-white/10 border-l-4 border-l-red-600 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <span className="text-white text-sm font-semibold">{p.label}</span><span className="text-red-400 text-sm font-bold">{p.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-white font-bold text-2xl tracking-tight mb-4">What's included</h2>
          <ul className="flex flex-col gap-2 text-white/70">{page.included.map(i => <li key={i} className="flex gap-2"><span className="text-red-500">✓</span>{i}</li>)}</ul>
        </div>
        <div>
          <h2 className="text-white font-bold text-2xl tracking-tight mb-4">How a mobile visit works</h2>
          <ol className="flex flex-col gap-3">{page.howItWorks.map((s, i) => (
            <li key={s.title} className="text-white/70"><span className="text-white font-semibold">{i + 1}. {s.title}.</span> {s.text}</li>
          ))}</ol>
        </div>
      </section>

      {page.photos.length > 0 && (
        <section className="mt-12">
          <h2 className="text-white font-bold text-2xl tracking-tight mb-4">From real jobs</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {page.photos.map(p => (
              <figure key={p.src} className="bg-white/5">
                <img src={img(p.src)} alt={p.alt} loading="lazy" decoding="async" className="w-full aspect-square object-cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
                <figcaption className="text-white/50 text-xs px-2 py-1.5">{p.alt}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {CASE_STUDIES.some(c => c.serviceId === page.serviceId) && (
        <section className="mt-12">
          <h2 className="text-white font-bold text-2xl tracking-tight mb-4">Real jobs like this</h2>
          <ul className="flex flex-col gap-2">{CASE_STUDIES.filter(c => c.serviceId === page.serviceId).map(c => (
            <li key={c.slug}><a href={c.path} className="text-red-400 hover:text-red-300 underline underline-offset-4">{c.h1}</a></li>
          ))}</ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-white font-bold text-2xl tracking-tight mb-4">Questions</h2>
        <div className="flex flex-col gap-3">{page.faq.map(f => (
          <div key={f.q} className="bg-white/5 border border-white/10 px-5 py-4"><h3 className="text-white font-semibold">{f.q}</h3><p className="text-white/60 text-sm leading-relaxed mt-1">{f.a}</p></div>
        ))}</div>
      </section>

      <section className="mt-12 bg-red-600 px-6 py-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <p className="text-white text-2xl font-extrabold tracking-tight">We come to you, Flagstaff.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={openBooking} className="bg-white text-red-600 font-bold uppercase tracking-wide text-xs px-7 py-3">Get a Quote</button>
          <a href={`tel:${PHONE}`} className="inline-flex items-center justify-center gap-2 border-2 border-white text-white font-bold px-6 py-3 text-xs uppercase tracking-wide"><Phone className="w-4 h-4" />{PHONE}</a>
        </div>
      </section>

      <p className="text-white/50 text-sm mt-10">Other services: {SERVICE_PAGES.filter(s => s.path !== page.path).map((s, i) => <span key={s.path}>{i ? ' · ' : ''}<a href={s.path} className="underline hover:text-white">{s.label}</a></span>)} · <a href="/service-area" className="underline hover:text-white">Areas we serve</a></p>
      {widget}
    </Shell>
  );
}

export function AreasPage() {
  useHead(AREAS_PAGE);
  const { openBooking, widget } = useBooking();
  useEffect(() => { const id = window.location.hash.slice(1); if (id) document.getElementById(id)?.scrollIntoView(); }, []);
  return (
    <Shell onQuote={openBooking}>
      <h1 className="text-white font-black uppercase tracking-tight leading-[0.95] text-4xl md:text-6xl">{AREAS_PAGE.h1}</h1>
      <p className="text-white/70 text-base md:text-lg leading-relaxed mt-5 max-w-3xl">{AREAS_PAGE.intro}</p>
      <ul className="grid gap-3 sm:grid-cols-2 mt-10">
        {AREAS.map(a => (
          <li key={a.slug} id={a.slug} className="bg-white/5 border border-white/10 px-5 py-4">
            <h2 className="text-white font-bold text-lg">{a.name}{a.miles ? <span className="text-white/40 text-sm font-normal"> · ~{a.miles} mi from Flagstaff</span> : <span className="text-red-400 text-sm font-normal"> · home base</span>}</h2>
            <p className="text-white/60 text-sm leading-relaxed mt-1">{a.blurb}</p>
          </li>
        ))}
      </ul>
      <p className="text-white/50 text-sm mt-10">Services: {SERVICE_PAGES.map((s, i) => <span key={s.path}>{i ? ' · ' : ''}<a href={s.path} className="underline hover:text-white">{s.label}</a></span>)}</p>
      {widget}
    </Shell>
  );
}

export function CaseStudyPage({ cs }: { cs: CaseStudy }) {
  useHead(cs);
  const service = SERVICE_PAGES.find(p => p.serviceId === cs.serviceId);
  const { openBooking, widget } = useBooking(cs.serviceId);
  const part = (title: string, text: string) => (
    <section className="mt-8"><h2 className="text-white font-bold text-xl tracking-tight mb-2">{title}</h2><p className="text-white/70 leading-relaxed">{text}</p></section>
  );
  return (
    <Shell onQuote={openBooking}>
      <p className="text-red-400 text-xs font-bold uppercase tracking-[0.3em] mb-3"><a href="/case-studies" className="hover:underline">Real jobs</a> · {cs.month}</p>
      <h1 className="text-white font-black tracking-tight leading-[1.05] text-3xl md:text-5xl">{cs.h1}</h1>
      <p className="text-white/50 text-sm mt-3">{cs.vehicle}{cs.mileage ? ` · ${cs.mileage}` : ''} · mobile repair in the Flagstaff area</p>
      {part('The problem', cs.complaint)}
      {part('What we found', cs.diagnosis)}
      {part('What we did', cs.repair)}
      {part('The result', cs.outcome)}
      <section className="mt-10">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{cs.photos.map(p => (
          <figure key={p.src} className="bg-white/5"><img src={p.src} alt={p.alt} loading="lazy" decoding="async" className="w-full aspect-square object-cover" /><figcaption className="text-white/50 text-xs px-2 py-1.5">{p.alt}</figcaption></figure>
        ))}</div>
      </section>
      <section className="mt-10 bg-white/5 border border-white/10 border-l-4 border-l-red-600 px-5 py-4">
        <h2 className="text-white font-bold mb-1">The takeaway</h2><p className="text-white/70 leading-relaxed">{cs.lesson}</p>
      </section>
      <div className="flex flex-col sm:flex-row gap-3 mt-8">
        <button onClick={openBooking} className="btn-primary text-sm px-8 py-4">Get a Quote</button>
        {service && <a href={service.path} className="btn-outline text-sm px-8 py-4">{service.label} — pricing</a>}
      </div>
      <p className="text-white/50 text-sm mt-10">More real jobs: {CASE_STUDIES.filter(c => c.slug !== cs.slug).map((c, i) => <span key={c.slug}>{i ? ' · ' : ''}<a href={c.path} className="underline hover:text-white">{c.vehicle}</a></span>)}</p>
      {widget}
    </Shell>
  );
}

export function CaseStudiesIndex() {
  useHead(CASE_STUDIES_PAGE);
  const { openBooking, widget } = useBooking();
  return (
    <Shell onQuote={openBooking}>
      <h1 className="text-white font-black uppercase tracking-tight leading-[0.95] text-4xl md:text-6xl">{CASE_STUDIES_PAGE.h1}</h1>
      <p className="text-white/70 text-base md:text-lg leading-relaxed mt-5 max-w-3xl">{CASE_STUDIES_PAGE.intro}</p>
      <ul className="grid gap-4 sm:grid-cols-2 mt-10">{CASE_STUDIES.map(c => (
        <li key={c.slug}>
          <a href={c.path} className="block bg-white/5 border border-white/10 hover:border-red-600/50 transition-colors">
            <img src={c.photos[0].src} alt={c.photos[0].alt} loading="lazy" decoding="async" className="w-full aspect-[4/3] object-cover" />
            <div className="px-4 py-3"><h2 className="text-white font-bold leading-snug">{c.h1}</h2><p className="text-white/50 text-sm mt-1">{c.month} · {c.vehicle}</p></div>
          </a>
        </li>
      ))}</ul>
      {widget}
    </Shell>
  );
}
