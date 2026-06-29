import { useEffect, useState, useRef } from 'react';
import { Phone, Mail, Menu, X } from 'lucide-react';
import BookingWidget, { AdminSchedule, verifyCancelToken, deleteLocalBooking, sendCancellationNotification } from './BookingWidget';
import { EstimatePage, InvoicePage } from './JobOps';
import GamesPage from './GamesPage';
import GameRedeem from './GameRedeem';

// Cancel flow now validates server-side (secret lives in the worker, not here).
async function apiPost(action: string, args: Record<string, any> = {}) {
  const res = await fetch('/api-customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...args }),
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const PHONE = '480-757-0476';
const EMAIL = 'gidgarageaz@hotmail.com';

// R2 public image URL — falls back to local /public in dev
const R2 = (import.meta.env.VITE_R2_PUBLIC_URL as string | undefined)?.replace(/\/$/, '') ?? '';
function img(filename: string) { return R2 ? `${R2}/${filename}` : `/${filename}`; }

const services = [
  {
    id: 'oil',
    title: 'Oil Change',
    desc: 'Full synthetic only — your vehicle deserves the best. $79.99 up to 5 quarts, +$10.99/qt after. Includes oil filter, fluid top-off, tire pressure check, and multi-point inspection. Most shops charge $110–140 for full synthetic — and you still have to drive there and wait. We come to you.',
    badge: null,
  },
  {
    id: 'brakes',
    title: 'Brakes',
    desc: 'Pad replacement, rotor replacement, and complete brake system service. Starting at $149.99/axle — Flagstaff shops average $240–320+/axle.',
    badge: null,
  },
  {
    id: 'diag',
    title: 'Diagnostics',
    desc: '$89.99 flat. We come to you, pull and interpret your OBD2 codes, and give you a clear explanation of what\'s wrong and what it\'ll take to fix it — no dealer visit, no upselling. Includes a full visual inspection.',
    badge: null,
  },
  {
    id: 'suspension',
    title: 'Suspension',
    desc: 'Shocks, struts, control arms, tie rods, and CV axles. Starting at $174.99 labor + parts — Flagstaff shops average $350–1,200+ depending on service. Get a free estimate when you book.',
    badge: null,
  },
  {
    id: 'full',
    title: 'Full Vehicle Inspection',
    desc: 'Comprehensive multi-point inspection — complimentary with any mechanical service. Standalone shops typically charge $120–160. Know exactly what your vehicle needs before spending a dime.',
    badge: 'Free',
  },
  {
    id: 'audio',
    title: 'Car Audio',
    desc: 'Mobile car audio installation — head units, speakers, amplifiers, and full system builds. Starting at $174.99 labor. Deposit may be required for sourced parts.',
    badge: 'New',
  },
];

function Nav({ openBooking }: { openBooking: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: 'Services', href: '#services' },
    { label: 'Why Us', href: '#why' },
    { label: 'Service Area', href: '#area' },
    { label: 'Waiting Room', href: '/games' },
    { label: 'Contact', href: '#footer' },
  ];

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#0f0f0f] shadow-lg shadow-black/50' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-5 md:px-8 flex items-center justify-between h-16 md:h-20">
        <a href="#hero" className="flex-shrink-0">
          <img src={img('website_logo.png')} alt="GID Garage" className="h-12 md:h-14 w-auto" />
        </a>
        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a key={l.label} href={l.href} className="text-sm font-semibold uppercase tracking-wide transition-colors duration-200 text-white hover:text-red-400">{l.label}</a>
          ))}
          <button onClick={openBooking} className="btn-primary text-xs px-8 py-4">Get a Quote</button>
        </nav>
        <button className="md:hidden p-1 text-white transition-colors" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu">
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      {menuOpen && (
        <div className="md:hidden bg-[#0f0f0f] border-b border-gray-800 px-5 py-5 flex flex-col gap-4">
          {links.map((l) => (
            <a key={l.label} href={l.href} className="text-white text-base font-semibold uppercase tracking-wide transition-colors hover:text-red-400" onClick={() => setMenuOpen(false)}>{l.label}</a>
          ))}
          <div className="mt-2"><button onClick={() => { openBooking(); setMenuOpen(false); }} className="btn-primary text-xs px-8 py-4">Get a Quote</button></div>
        </div>
      )}
    </header>
  );
}

function Hero({ openBooking }: { openBooking: () => void }) {
  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center bg-dark overflow-hidden pt-20">
      <div className="absolute inset-0">
        <img src="https://images.unsplash.com/photo-1530046339160-ce3e530c7d2f?w=2560&q=85&auto=format&fit=crop" alt="Mechanic working under a car hood" className="w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-dark/75" />
        <div className="absolute bottom-0 left-0 right-0 h-48" style={{ background: 'linear-gradient(to bottom, transparent, #0f0f0f)' }} />
      </div>
      <div className="relative z-10 w-full text-center">
        <div className="mb-4 w-full px-4 md:px-0 md:max-w-6xl lg:max-w-7xl mx-auto">
          <img
            src={img('banner.PNG')}
            alt="GID Garage"
            className="w-full object-contain drop-shadow-2xl"
            style={{ maxHeight: '560px' }}
          />
        </div>
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <p className="text-red-400 text-xs font-bold uppercase tracking-[0.25em] mb-6">Get It Done Garage · Flagstaff, AZ</p>
          <div className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-white leading-tight tracking-tight mb-6" role="heading" aria-level="1">Mobile Car Care<br />at 7,000 Feet</div>
          <div className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed font-light">We come to you — Flagstaff, Bellemont, Kachina, Fort Valley &amp; beyond. Honest pricing, expert work, no shop wait.</div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={openBooking} className="btn-primary text-sm px-8 py-4">Get a Quote</button>
            <a href={`tel:${PHONE}`} className="btn-outline text-sm px-8 py-4"><Phone className="w-4 h-4" />Call Now</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function ServiceCard({ s, onBookService }: { s: typeof services[0]; onBookService: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  const suspensionItems = [
    { label: 'Front Struts (pair)', detail: 'Starting at $399.99 + parts · Shops avg $850–1,200' },
    { label: 'Rear Shocks (pair)', detail: 'Starting at $249.99 + parts · Shops avg $450–650' },
    { label: 'Control Arms', detail: 'Starting at $224.99 + parts · Shops avg $450–650' },
    { label: 'Tie Rods', detail: 'Starting at $174.99 + parts · Shops avg $350–500' },
    { label: 'CV Axles', detail: 'Starting at $249.99 + parts · Shops avg $500–750' },
  ];

  const brakeItems = [
    { label: 'Brake Pads Only (per axle)', detail: 'Starting at $149.99 · Shops avg $240–320/axle' },
    { label: 'Brake Pads + Rotors (per axle)', detail: 'Starting at $269.99 · Shops avg $420–600/axle' },
    { label: 'Full Service — Pads + Rotor Replacement + Fluid Flush (per axle)', detail: 'Starting at $319.99 · Shops avg $520–700/axle' },
  ];

  const audioItems = [
    { label: 'Head Unit Replacement', detail: 'Starting at $174.99 labor + parts · Shops avg $250–400' },
    { label: 'Speaker Replacement (pair)', detail: 'Starting at $174.99 labor + parts · Shops avg $250–400' },
    { label: 'Head Unit Install (Customer-Supplied)', detail: '$149.99 labor only' },
    { label: '4-Channel Amp Install', detail: 'Starting at $249.99 labor + parts · Shops avg $500–750' },
    { label: 'Monoblock + Subwoofer Install', detail: 'Starting at $249.99 labor + parts · Shops avg $500–800' },
    { label: 'Full Sound System (Head Unit + Speakers + 4ch Amp + Mono Amp + Sub)', detail: 'Starting at $599.99 labor + parts — deposit required · Shops avg $1,500–2,200' },
  ];

  const dropdownItems = s.id === 'suspension' ? suspensionItems : s.id === 'brakes' ? brakeItems : s.id === 'audio' ? audioItems : null;

  return (
    <div className="p-6 bg-white/5 border border-white/10 border-l-4 border-l-red-600 hover:bg-white/10 hover:border-red-600/40 transition-all duration-300 flex flex-col">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-white font-bold text-lg tracking-tight">{s.title}</h3>
        {s.badge && <span className="text-[10px] font-black uppercase tracking-widest bg-red-600 text-white px-2 py-0.5 ml-2 flex-shrink-0">{s.badge}</span>}
      </div>
      <div className="text-white/60 text-sm leading-relaxed flex-1">{s.desc}</div>

      {dropdownItems && (
        <div className="mt-4">
          <button
            onClick={() => setOpen(v => !v)}
            className="text-xs text-red-400 font-bold uppercase tracking-widest flex items-center gap-2 hover:text-red-300 transition-colors"
          >
            {open ? '▲' : '▼'} {s.id === 'audio' ? 'View Audio Packages' : 'View Options & Pricing'}
          </button>
          {open && (
            <div className="mt-3 space-y-2">
              {dropdownItems.map((item) => (
                <div key={item.label} className="bg-black/30 border border-white/10 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-white text-xs font-semibold">{item.label}</span>
                  <span className="text-red-400 text-xs font-bold">{item.detail}</span>
                </div>
              ))}
              {s.id === 'audio' && (
                <p className="text-gray-600 text-[10px] mt-1">* Parts may need to be sourced — lead times vary. Deposit required for full system builds. You can also supply your own parts.</p>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => onBookService(s.id)}
        className="mt-5 w-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest py-2.5 px-4 transition-colors duration-200"
      >
        Get a Quote
      </button>
    </div>
  );
}

function Services({ onBookService }: { onBookService: (id: string) => void }) {
  return (
    <section id="services" className="py-20 md:py-28 bg-dark">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="text-center mb-12">
          <p className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-2">What We Offer</p>
          <div className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">Our Services</div>
          <div className="text-white/50 text-base mt-3 max-w-xl mx-auto">Everything handled at your home, office, or wherever you're parked in the Flagstaff area.</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((s) => (
            <ServiceCard key={s.id} s={s} onBookService={onBookService} />
          ))}
        </div>
        <div className="mt-12 text-center">
          <p className="text-white/50 text-sm mb-6">Don't see what you need? Call us — we handle virtually all automotive repair.</p>
          <a href={`tel:${PHONE}`} className="btn-primary inline-flex gap-2 items-center text-xs"><Phone className="w-4 h-4" />{PHONE}</a>
        </div>
      </div>
    </section>
  );
}

function WhyUs() {
  return (
    <section id="why" className="pt-4 pb-20 md:pb-28 bg-dark">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="text-center mb-10">
          <p className="text-red-400 text-xs font-bold uppercase tracking-[0.25em] mb-2">The GID Difference</p>
          <div className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">Why Choose GID Garage?</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {[
            {
              title: 'We Come to You',
              desc: "Skip the shop, the waiting room, and the ride back. We show up at your door — home, work, side of the road, wherever you need us in the Flagstaff area.",
            },
            {
              title: 'Honest Pricing',
              desc: "Clear estimates, no hidden fees, no pressure upsells. You always know exactly what you're paying for before we turn a wrench.",
            },
            {
              title: 'Mountain-Tough Service',
              desc: 'We know what high altitude, hard winters, and mountain roads do to your vehicle. Our work is built to last up here.',
            },
          ].map((t) => (
            <div key={t.title} className="bg-white/5 border border-white/10 p-8 hover:border-red-600/30 hover:bg-white/10 transition-all duration-300">
              <div className="w-12 h-1 bg-red-600 mb-6" />
              <h3 className="text-white font-bold text-xl mb-3 tracking-tight">{t.title}</h3>
              <div className="text-white/70 leading-relaxed text-sm">{t.desc}</div>
            </div>
          ))}
        </div>

        {/* Hours of Operation */}
        <div className="mt-8 bg-white/5 border border-white/10 border-l-4 border-l-red-600 p-6 md:p-8 max-w-2xl mx-auto">
          <p className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-3">Hours of Operation</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            <div>
              <p className="text-white font-bold text-sm">Monday – Friday</p>
              <p className="text-white/60 text-sm">1:30 PM – 8:00 PM</p>
            </div>
            <div>
              <p className="text-white font-bold text-sm">Saturday – Sunday</p>
              <p className="text-white/60 text-sm">5:00 AM – 8:00 PM</p>
              <p className="text-white/30 text-xs mt-0.5">By appointment only</p>
            </div>
          </div>
          <p className="text-white/40 text-xs mt-3">Appointments required. Same-day bookings subject to availability.</p>
        </div>
      </div>
    </section>
  );
}

// ── SERVICE AREA MAP ─────────────────────────────────────────────────────────
// Real coordinates from Google Maps / Places API
const SERVICE_AREAS = [
  { name: 'Flagstaff',       lat: 35.1983, lng: -111.6513, isHome: true,  miles: 0 },
  { name: 'Fort Valley',     lat: 35.2300, lng: -111.6800, isHome: false, miles: 2.7 },
  { name: 'Kachina Village', lat: 35.0970, lng: -111.6927, isHome: false, miles: 7.4 },
  { name: 'Mountainaire',    lat: 35.0855, lng: -111.6656, isHome: false, miles: 7.8 },
  { name: 'Doney Park',      lat: 35.2695, lng: -111.5140, isHome: false, miles: 9.2 },
  { name: 'Bellemont',       lat: 35.2381, lng: -111.8335, isHome: false, miles: 10.6 },
  { name: 'Winona',          lat: 35.2045, lng: -111.4051, isHome: false, miles: 13.9 },
];

function ServiceMap() {
  // Bounding box for all points
  const lats = SERVICE_AREAS.map(a => a.lat);
  const lngs = SERVICE_AREAS.map(a => a.lng);
  const minLat = Math.min(...lats) - 0.04;
  const maxLat = Math.max(...lats) + 0.04;
  const minLng = Math.min(...lngs) - 0.06;
  const maxLng = Math.max(...lngs) + 0.06;

  const W = 700, H = 420, PAD = 40;

  function project(lat: number, lng: number) {
    const x = PAD + ((lng - minLng) / (maxLng - minLng)) * (W - PAD * 2);
    const y = PAD + ((maxLat - lat) / (maxLat - minLat)) * (H - PAD * 2);
    return { x, y };
  }

  const home = SERVICE_AREAS.find(a => a.isHome)!;
  const { x: hx, y: hy } = project(home.lat, home.lng);

  return (
    <section id="area" className="py-20 md:py-28 bg-dark border-t border-white/5">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="text-center mb-10">
          <p className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-2">Service Area</p>
          <div className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">Flagstaff &amp; Surrounding Communities</div>
          <div className="text-white/50 text-base mt-3 max-w-xl mx-auto">We serve the greater Flagstaff region. Not sure if you're in range? Just call.</div>
        </div>

        {/* Distance cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-8">
          {SERVICE_AREAS.map(area => (
            <div key={area.name} className={`p-3 text-center border ${area.isHome ? 'border-red-600 bg-red-600/10' : 'border-white/10 bg-white/5'}`}>
              {area.isHome && <div className="w-2 h-2 bg-red-600 rounded-full mx-auto mb-1.5 animate-pulse" />}
              <p className={`text-xs font-bold ${area.isHome ? 'text-red-400' : 'text-white'}`}>{area.name}</p>
              <p className="text-white/40 text-[10px] mt-0.5">{area.isHome ? 'Home Base' : `~${area.miles} mi`}</p>
            </div>
          ))}
        </div>

        <div className="bg-white/5 border border-white/10 p-4 overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl mx-auto" xmlns="http://www.w3.org/2000/svg">
            {/* Lines from home to each area */}
            {SERVICE_AREAS.filter(a => !a.isHome).map(area => {
              const { x, y } = project(area.lat, area.lng);
              return (
                <line key={area.name} x1={hx} y1={hy} x2={x} y2={y}
                  stroke="#dc262640" strokeWidth="1.5" strokeDasharray="4 4" />
              );
            })}

            {/* Service area nodes */}
            {SERVICE_AREAS.map(area => {
              const { x, y } = project(area.lat, area.lng);
              if (area.isHome) return (
                <g key={area.name}>
                  <circle cx={x} cy={y} r="10" fill="#dc2626" opacity="0.25" />
                  <circle cx={x} cy={y} r="6" fill="#dc2626" />
                  <circle cx={x} cy={y} r="2.5" fill="white" />
                  <text x={x} y={y - 14} textAnchor="middle" fill="#dc2626" fontSize="10" fontFamily="sans-serif" fontWeight="bold">GID Garage</text>
                  <text x={x} y={y - 4} textAnchor="middle" fill="#dc2626" fontSize="9" fontFamily="sans-serif" dy="20">Flagstaff</text>
                </g>
              );
              return (
                <g key={area.name}>
                  <circle cx={x} cy={y} r="6" fill="#374151" stroke="#dc262660" strokeWidth="1.5" />
                  <circle cx={x} cy={y} r="3" fill="#9ca3af" />
                  <text x={x} y={y - 12} textAnchor="middle" fill="#9ca3af" fontSize="10" fontFamily="sans-serif">{area.name}</text>
                  <text x={x} y={y + 18} textAnchor="middle" fill="#6b7280" fontSize="9" fontFamily="sans-serif">~{area.miles}mi</text>
                </g>
              );
            })}

            {/* Legend */}
            <circle cx={PAD + 8} cy={H - 18} r="5" fill="#dc2626" />
            <text x={PAD + 18} y={H - 14} fill="#dc2626" fontSize="10" fontFamily="sans-serif">GID Garage HQ</text>
            <circle cx={PAD + 120} cy={H - 18} r="4" fill="#374151" stroke="#dc262660" strokeWidth="1.5" />
            <text x={PAD + 130} y={H - 14} fill="#9ca3af" fontSize="10" fontFamily="sans-serif">Service Area</text>
          </svg>
        </div>
      </div>
    </section>
  );
}

function PhotoGallery() {
  // Static fallback shown until /gallery-list resolves (or if it ever fails).
  const fallbackPhotos = [
    { src: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=800&q=80&auto=format&fit=crop', alt: 'Mechanic at work' },
  ];

  const [photos, setPhotos] = useState(fallbackPhotos);

  useEffect(() => {
    fetch('/gallery-list')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.keys?.length) {
          setPhotos([
            fallbackPhotos[0],
            ...data.keys.map((key: string) => ({ src: img(key), alt: 'GID Garage work' })),
          ]);
        }
      })
      .catch(() => {}); // keep fallbackPhotos on failure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [current, setCurrent] = useState(0);
  const total = photos.length;

  // Desktop: 3 at a time in a sliding window (loop-safe)
  const desktopOffset = current; // first visible index

  function prev() { setCurrent(c => (c - 1 + total) % total); }
  function next() { setCurrent(c => (c + 1) % total); }

  // Swipe support for mobile
  const touchStartX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -40) next();
    else if (dx > 40) prev();
    touchStartX.current = null;
  }

  // Build desktop visible photos (3 cycling)
  const desktopPhotos = [0, 1, 2].map(i => photos[(desktopOffset + i) % total]);

  return (
    <section className="py-0 bg-light relative overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Desktop: 3 across */}
      <div className="hidden sm:grid sm:grid-cols-3 relative">
        {desktopPhotos.map(({ src, alt }, i) => (
          <div key={`${src}-${i}`} className="relative overflow-hidden bg-[#0f0f0f]" style={{ aspectRatio: '4/3' }}>
            <img src={src} alt={alt} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
        ))}
        {/* Arrows over desktop */}
        <button onClick={prev} aria-label="Previous photos"
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-colors border border-white/10 text-lg">
          ‹
        </button>
        <button onClick={next} aria-label="Next photos"
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-colors border border-white/10 text-lg">
          ›
        </button>
      </div>

      {/* Mobile: single photo carousel */}
      <div className="sm:hidden relative">
        <div className="relative overflow-hidden bg-[#0f0f0f]" style={{ aspectRatio: '4/3' }}>
          <img src={photos[current].src} alt={photos[current].alt}
            className="w-full h-full object-cover transition-opacity duration-300" />
        </div>
        <button onClick={prev} aria-label="Previous"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-colors text-xl">‹</button>
        <button onClick={next} aria-label="Next"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-colors text-xl">›</button>
        {/* Dots */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {photos.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={`w-2 h-2 rounded-full transition-colors ${i === current ? 'bg-red-500' : 'bg-white/40'}`} />
          ))}
        </div>
      </div>
    </section>
  );
}

function BookingSection({ openBooking }: { openBooking: () => void }) {
  return (
    <section id="booking" className="py-20 md:py-28 bg-dark border-t border-white/5">
      <div className="max-w-2xl mx-auto px-5 md:px-8 text-center">
        <div className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">Get a Quote</div>
        <div className="text-white/50 text-base mb-2">
          Pick a time that works for you, or{' '}
          <a href={`tel:${PHONE}`} className="text-red-500 hover:text-red-400 font-semibold transition-colors underline underline-offset-2">call {PHONE}</a>{' '}
          to chat with us first.
        </div>
        <div className="text-white/30 text-xs mb-8">Mon–Fri 1:30–8 PM · Sat–Sun 5 AM–8 PM</div>
        <button onClick={openBooking} className="btn-primary text-xs px-8 py-4">Get a Quote</button>
      </div>
    </section>
  );
}

function ContactBar({ openBooking }: { openBooking: () => void }) {
  return (
    <section className="bg-red-600 py-12">
      <div className="max-w-7xl mx-auto px-5 md:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        <div>
          <p className="text-white/80 text-sm uppercase tracking-widest font-semibold mb-1">Ready to Get Started?</p>
          <h3 className="text-white text-2xl md:text-3xl font-extrabold tracking-tight">We Come to You, Flagstaff.</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <button onClick={openBooking} className="btn-primary text-xs px-8 py-4">Get a Quote</button>
          <a href={`tel:${PHONE}`} className="inline-flex items-center justify-center gap-2 border-2 border-white text-white font-bold px-7 py-3 text-sm uppercase tracking-wide hover:bg-white/10 transition-colors duration-200"><Phone className="w-4 h-4" />{PHONE}</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer id="footer" className="bg-dark border-t border-gray-800 py-12">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-8">
          <div>
            <img src={img('website_logo.png')} alt="GID Garage" className="h-16 w-auto mb-4" />
            <p className="text-white/70 text-sm max-w-xs leading-relaxed">Mobile automotive repair and car audio in Flagstaff, AZ. Honest work. Fair prices. We come to you.</p>
            <p className="text-white/50 text-xs mt-2 leading-relaxed">Based in Flagstaff, AZ · Serving Bellemont, Kachina Village, Fort Valley, Doney Park, Winona &amp; Mountainaire</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-white/50 text-xs uppercase tracking-widest font-semibold mb-1">Hours</div>
            <p className="text-white/70 text-sm">Mon–Fri: 1:30 PM – 8:00 PM</p>
            <p className="text-white/70 text-sm">Sat–Sun: 5:00 AM – 8:00 PM</p>
            <div className="border-t border-gray-800 pt-3 mt-1">
              <a href={`tel:${PHONE}`} className="flex items-center gap-3 text-white/70 hover:text-white transition-colors group">
                <Phone className="w-4 h-4 text-red-600 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">{PHONE}</span>
              </a>
              <a href={`mailto:${EMAIL}`} className="flex items-center gap-3 text-white/70 hover:text-white transition-colors group mt-2">
                <Mail className="w-4 h-4 text-red-600 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">{EMAIL}</span>
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-white text-xs uppercase tracking-widest font-semibold mb-1">Quick Links</p>
            {[{ label: 'Services', href: '#services' }, { label: 'Why GID Garage', href: '#why' }, { label: 'Service Area', href: '#area' }, { label: 'Get a Quote', href: '#booking' }].map((l) => (
              <a key={l.label} href={l.href} className="text-white/60 hover:text-white text-sm transition-colors">{l.label}</a>
            ))}
            <a href="/admin" className="text-gray-700 hover:text-gray-500 text-xs transition-colors mt-2">Admin ↗</a>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-white/50 text-xs">
          <p>&copy; 2026 GID Garage. All rights reserved.</p>
          <p>Flagstaff, Arizona</p>
        </div>
      </div>
    </footer>
  );
}

function CancelPage({ bookingId, token }: { bookingId: string; token: string }) {
  const [state, setState] = useState<'verifying' | 'ready' | 'invalid' | 'cancelling' | 'done' | 'error'>('verifying');
  const [booking, setBooking] = useState<any>(null);

  useEffect(() => {
    async function verify() {
      try {
        const result = await verifyCancelToken(bookingId, token);
        if (!result || !result.valid || !result.booking) { setState('invalid'); return; }
        if (result.booking.status === 'cancelled') { setState('done'); return; }
        setBooking(result.booking);
        setState('ready');
      } catch {
        setState('invalid');
      }
    }
    verify();
  }, [bookingId, token]);

  async function confirmCancel() {
    setState('cancelling');
    try {
      deleteLocalBooking(bookingId);
      const result = await apiPost('cancel', { id: bookingId, token });
      const cancelled = result?.booking ?? booking;
      if (cancelled) await sendCancellationNotification(cancelled);
      setState('done');
    } catch {
      setState('error');
    }
  }

  const dateStr = booking ? new Date(booking.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  }) : '';

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <a href="/" className="flex justify-center mb-8">
          <img src={img('website_logo.png')} alt="GID Garage" className="h-14 w-auto" />
        </a>

        {state === 'verifying' && (
          <p className="text-gray-500 text-sm uppercase tracking-wider font-bold">Verifying your link…</p>
        )}

        {state === 'invalid' && (
          <>
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-2xl font-black text-white mb-3">Invalid or Expired Link</h1>
            <p className="text-gray-500 text-sm mb-6">This cancellation link is no longer valid. If you need to cancel, please call us directly.</p>
            <a href={`tel:480-757-0476`} className="btn-primary text-xs px-8 py-4 inline-block">Call Us</a>
          </>
        )}

        {state === 'ready' && booking && (
          <>
            <div className="text-4xl mb-4">📅</div>
            <p className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-2">Cancel Appointment</p>
            <h1 className="text-2xl font-black text-white mb-6">Are you sure?</h1>
            <div className="bg-gray-900 border border-gray-800 p-5 mb-6 text-left space-y-2">
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Name</span>
                <span className="text-white text-sm">{booking.fname} {booking.lname}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Date</span>
                <span className="text-white text-sm">{dateStr}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Time</span>
                <span className="text-white text-sm">{booking.time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Vehicle</span>
                <span className="text-white text-sm">{booking.vehicle}</span>
              </div>
            </div>
            <p className="text-gray-600 text-xs mb-6">Cancellations within 24 hours of your appointment may incur a fee.</p>
            <div className="flex gap-3">
              <a href="/" className="flex-1 border border-gray-700 text-gray-400 hover:border-white hover:text-white text-xs font-bold uppercase tracking-wider py-3 transition-colors text-center">Keep It</a>
              <button onClick={confirmCancel} className="flex-1 bg-red-700 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wider py-3 transition-colors">Yes, Cancel</button>
            </div>
          </>
        )}

        {state === 'cancelling' && (
          <p className="text-gray-500 text-sm uppercase tracking-wider font-bold">Cancelling your appointment…</p>
        )}

        {state === 'done' && (
          <>
            <div className="text-4xl mb-4">✓</div>
            <h1 className="text-2xl font-black text-white mb-3">Appointment Cancelled</h1>
            <p className="text-gray-500 text-sm mb-6">Your appointment has been cancelled. We've sent a confirmation to your email.</p>
            <a href="/" className="btn-primary text-xs px-8 py-4 inline-block">Back to Site</a>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-2xl font-black text-white mb-3">Something Went Wrong</h1>
            <p className="text-gray-500 text-sm mb-6">We couldn't cancel your appointment. Please call us and we'll take care of it.</p>
            <a href={`tel:480-757-0476`} className="btn-primary text-xs px-8 py-4 inline-block">Call Us</a>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [bookingServiceId, setBookingServiceId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(window.location.pathname === '/bookings');

  const params = new URLSearchParams(window.location.search);
  const cancelId = params.get('cancel');
  const cancelToken = params.get('token');
  const isAdmin = window.location.pathname === '/admin' || window.location.hash === '#admin';
  const isBookingsRoute = window.location.pathname === '/bookings';
  const isEstimate = window.location.pathname === '/estimate';
  const isInvoice = window.location.pathname === '/invoice';
  const isGames = window.location.pathname === '/games';
  const isGameRedeem = window.location.pathname === '/game-redeem';

  function handleBookService(id: string) {
    setBookingServiceId(id);
    setModalOpen(true);
  }

  function openBooking() {
    setBookingServiceId(null);
    setModalOpen(true);
  }

  if (isAdmin) return <AdminSchedule />;
  if (isEstimate) return <EstimatePage />;
  if (isInvoice) return <InvoicePage />;
  if (isGames) return <GamesPage />;
  if (isGameRedeem) return <GameRedeem />;
  if (cancelId && cancelToken) return <CancelPage bookingId={cancelId} token={cancelToken} />;

  return (
    <div className="bg-dark text-dark min-h-screen font-sans">
      <Nav openBooking={openBooking} />
      <Hero openBooking={openBooking} />
      <Services onBookService={handleBookService} />
      <WhyUs />
      <ServiceMap />
      <PhotoGallery />
      <BookingSection openBooking={openBooking} />
      <ContactBar openBooking={openBooking} />
      <Footer />
      {modalOpen && (
        <BookingWidget
          autoOpen
          preselectedService={bookingServiceId ?? undefined}
          onClose={() => { setModalOpen(false); setBookingServiceId(null); }}
        />
      )}
    </div>
  );
}
