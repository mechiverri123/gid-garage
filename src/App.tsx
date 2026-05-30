import { useEffect, useState } from 'react';
import { Phone, Mail, Menu, X } from 'lucide-react';
import BookingWidget, { AdminSchedule } from './BookingWidget';

const PHONE = '480-599-0118';
const EMAIL = 'gidgarageaz@hotmail.com';

const services = [
  { id: 'oil',        title: 'Oil Change',   desc: "We only do full synthetic — because your engine deserves better than the bare minimum. Starting at $79.99* · Price may vary by vehicle." },
  { id: 'brakes',     title: 'Brakes',       desc: 'Pad replacement, rotor resurfacing, and complete brake system diagnostics. Pricing varies per vehicle — get a free estimate when you book!' },
  { id: 'diag',       title: 'Diagnostics',  desc: 'Computer diagnostics to identify and resolve check engine light issues.' },
  { id: 'suspension', title: 'Suspension',   desc: 'Shocks, struts, control arms, tie rods, and CV axles. Pricing varies per vehicle — get a free estimate when you book!' },
  { id: 'full',       title: 'Full Service', desc: 'Comprehensive multi-point inspection and maintenance.' },
];

function Nav({ onBookService, openBooking }: { onBookService: (id: string) => void; openBooking: () => void }) {
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
    { label: 'Contact', href: '#footer' },
  ];

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#0f0f0f] shadow-lg shadow-black/50' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-5 md:px-8 flex items-center justify-between h-16 md:h-20">
        <a href="#hero" className="flex-shrink-0">
          <img src="/website_logo.png" alt="GID Garage" className="h-12 md:h-14 w-auto" />
        </a>
        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a key={l.label} href={l.href} className="text-sm font-semibold uppercase tracking-wide transition-colors duration-200 text-white hover:text-red-400">{l.label}</a>
          ))}
          <button onClick={openBooking} className="btn-primary text-xs px-8 py-4">Book Now</button>
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
          <div className="mt-2"><button onClick={() => { openBooking(); setMenuOpen(false); }} className="btn-primary text-xs px-8 py-4">Book Now</button></div>
        </div>
      )}
    </header>
  );
}

function Hero({ onBookService, openBooking }: { onBookService: (id: string) => void; openBooking: () => void }) {
  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center bg-dark overflow-hidden pt-20">
      <div className="absolute inset-0">
        <img src="https://images.unsplash.com/photo-1530046339160-ce3e530c7d2f?w=2560&q=85&auto=format&fit=crop" alt="Mechanic working under a car hood" className="w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-dark/75" />
        <div className="absolute bottom-0 left-0 right-0 h-48" style={{ background: 'linear-gradient(to bottom, transparent, #0f0f0f)' }} />
      </div>
      <div className="relative z-10 max-w-5xl mx-auto px-5 md:px-8 text-center">
        {/* Banner spanning full width with toolbox bg visible */}
        <div className="mb-4 w-full">
          <img
            src="/banner.PNG"
            alt="GID Garage"
            className="w-full object-contain drop-shadow-2xl"
            style={{ maxHeight: '500px' }}
          />
        </div>
        <p className="text-red-400 text-xs font-bold uppercase tracking-[0.25em] mb-6">Get It Done Garage</p>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-white leading-tight tracking-tight mb-6">Professional Car Care</h1>
        <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed font-light">Honest pricing, expert technicians, fast turnaround. Your car deserves the best — and we deliver.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button onClick={openBooking} className="btn-primary text-sm px-8 py-4">Book Now</button>
          <a href={`tel:${PHONE}`} className="btn-outline text-sm px-8 py-4"><Phone className="w-4 h-4" />Call Now</a>
        </div>
      </div>
    </section>
  );
}

function Services({ onBookService }: { onBookService: (id: string) => void }) {
  return (
    <section id="services" className="py-20 md:py-28 bg-dark">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="text-center mb-12">
          <p className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-2">What We Offer</p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">Our Services</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((s) => (
            <div key={s.title} className="p-6 bg-white/5 border border-white/10 border-l-4 border-l-red-600 hover:bg-white/10 hover:border-red-600/40 transition-all duration-300 flex flex-col">
              <h3 className="text-white font-bold text-lg mb-2 tracking-tight">{s.title}</h3>
              <p className="text-white/60 text-sm leading-relaxed flex-1">{s.desc}</p>
              <button
                onClick={() => onBookService(s.id)}
                className="mt-5 w-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest py-2.5 px-4 transition-colors duration-200"
              >
                Book {s.title}
              </button>
            </div>
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
        {/* Reduced gap: removed mb-8, use mb-4 and tighten phone link above heading */}
        <div className="text-center mb-4">
          <p className="text-red-400 text-xs font-bold uppercase tracking-[0.25em] mb-2">The GID Difference</p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">Why Choose GID Garage?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {[
            { title: 'Honest Pricing', desc: "Clear estimates, no hidden fees, no pressure to upsell. You always know what you're paying for." },
            { title: 'Expert Technicians', desc: 'Our mechanics have years of hands-on experience with all makes and models.' },
            { title: 'Fast Turnaround', desc: "Most services completed same-day so you're never left waiting." },
          ].map((t) => (
            <div key={t.title} className="bg-white/5 border border-white/10 p-8 hover:border-red-600/30 hover:bg-white/10 transition-all duration-300">
              <div className="w-12 h-1 bg-red-600 mb-6" />
              <h3 className="text-white font-bold text-xl mb-3 tracking-tight">{t.title}</h3>
              <p className="text-white/70 leading-relaxed text-sm">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Chandler coords: 33.3062, -111.8413
// Updated map bounds to include Chandler bottom-left
const SERVICE_AREAS = [
  { name: 'Gilbert',      lat: 33.3528, lng: -111.7890, isHome: true },
  { name: 'Mesa',         lat: 33.4152, lng: -111.8315, isHome: false },
  { name: 'Tempe',        lat: 33.4255, lng: -111.9400, isHome: false },
  { name: 'Phoenix',      lat: 33.4484, lng: -112.0740, isHome: false },
  { name: 'Queen Creek',  lat: 33.2487, lng: -111.6340, isHome: false },
  { name: 'Santan Valley',lat: 33.2115, lng: -111.5270, isHome: false },
  { name: 'Chandler',     lat: 33.27,   lng: -111.9400, isHome: false },
];

const MAP_LAT_MIN = 33.16;
const MAP_LAT_MAX = 33.52;
const MAP_LNG_MIN = -112.22;
const MAP_LNG_MAX = -111.40;

function ServiceMap() {
  const W = 700;
  const H = 420;
  const PAD = 40;

  function project(lat: number, lng: number) {
    const x = PAD + ((lng - MAP_LNG_MIN) / (MAP_LNG_MAX - MAP_LNG_MIN)) * (W - PAD * 2);
    const y = PAD + ((MAP_LAT_MAX - lat) / (MAP_LAT_MAX - MAP_LAT_MIN)) * (H - PAD * 2);
    return { x, y };
  }

  return (
    <section className="py-20 md:py-24 bg-dark border-t border-white/5">
      <div className="max-w-5xl mx-auto px-5 md:px-8">
        <div className="text-center mb-10">
          <p className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-2">Where We Work</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Serving the East Valley & Beyond</h2>
          <p className="text-white/50 text-sm mt-3">Based in Gilbert, AZ — we come to you across the greater Phoenix area.</p>
        </div>
        <div className="relative w-full overflow-hidden border border-white/10 bg-[#1a1a1a]" style={{ aspectRatio: `${W}/${H}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <rect width={W} height={H} fill="#111111" />
            {[0,1,2,3,4].map(i => (
              <line key={`h${i}`} x1={PAD} y1={PAD + i * (H - PAD*2)/4} x2={W-PAD} y2={PAD + i * (H - PAD*2)/4} stroke="#ffffff08" strokeWidth="1" />
            ))}
            {[0,1,2,3,4,5].map(i => (
              <line key={`v${i}`} x1={PAD + i * (W - PAD*2)/5} y1={PAD} x2={PAD + i * (W - PAD*2)/5} y2={H-PAD} stroke="#ffffff08" strokeWidth="1" />
            ))}

            {SERVICE_AREAS.filter(a => !a.isHome).map(area => {
              const home = project(SERVICE_AREAS[0].lat, SERVICE_AREAS[0].lng);
              const pt = project(area.lat, area.lng);
              return (
                <line key={area.name + '-line'}
                  x1={home.x} y1={home.y} x2={pt.x} y2={pt.y}
                  stroke="#dc262640" strokeWidth="1.5" strokeDasharray="4 4"
                />
              );
            })}

            {SERVICE_AREAS.map(area => {
              const { x, y } = project(area.lat, area.lng);
              if (area.isHome) {
                return (
                  <g key={area.name}>
                    <circle cx={x} cy={y} r="28" fill="none" stroke="#dc2626" strokeWidth="1" opacity="0.15">
                      <animate attributeName="r" values="18;34;18" dur="2.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.3;0;0.3" dur="2.5s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={x} cy={y} r="18" fill="none" stroke="#dc2626" strokeWidth="1.5" opacity="0.3">
                      <animate attributeName="r" values="10;22;10" dur="2.5s" begin="0.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0;0.5" dur="2.5s" begin="0.5s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={x} cy={y} r="8" fill="#dc2626" />
                    <circle cx={x} cy={y} r="4" fill="#ff6b6b" />
                    <text x={x} y={y - 16} textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="bold" fontFamily="sans-serif">{area.name}</text>
                    <text x={x} y={y - 4} textAnchor="middle" fill="#dc2626" fontSize="9" fontFamily="sans-serif" dy="20">GID Garage</text>
                  </g>
                );
              }
              return (
                <g key={area.name}>
                  <circle cx={x} cy={y} r="6" fill="#374151" stroke="#dc262660" strokeWidth="1.5" />
                  <circle cx={x} cy={y} r="3" fill="#9ca3af" />
                  <text x={x} y={y - 12} textAnchor="middle" fill="#9ca3af" fontSize="11" fontFamily="sans-serif">{area.name}</text>
                </g>
              );
            })}

            {/* Legend */}
            <circle cx={PAD + 8} cy={H - 18} r="5" fill="#dc2626" />
            <text x={PAD + 18} y={H - 14} fill="#dc2626" fontSize="10" fontFamily="sans-serif">GID Garage</text>
            <circle cx={PAD + 100} cy={H - 18} r="4" fill="#374151" stroke="#dc262660" strokeWidth="1.5" />
            <text x={PAD + 110} y={H - 14} fill="#9ca3af" fontSize="10" fontFamily="sans-serif">Service Area</text>
          </svg>
        </div>
      </div>
    </section>
  );
}

function PhotoStrip() {
  const photos = [
    'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80&auto=format&fit=crop',
  ];
  return (
    <section className="py-0 bg-light">
      <div className="grid grid-cols-1 sm:grid-cols-3">
        {photos.map((src) => (
          <div key={src} className="relative h-64 sm:h-80 overflow-hidden">
            <img src={src} alt="Garage work" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
        ))}
      </div>
    </section>
  );
}

function BookingSection({ openBooking }: { openBooking: () => void }) {
  return (
    <section id="booking" className="py-20 md:py-28 bg-dark border-t border-white/5">
      <div className="max-w-2xl mx-auto px-5 md:px-8 text-center">
        <p className="text-red-500 text-xs font-bold uppercase tracking-[0.25em] mb-2">Schedule Online</p>
        <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">Book Your Appointment</h2>
        <p className="text-white/50 text-base mb-8">
          Pick a time that works for you, or{' '}
          <a href={`tel:${PHONE}`} className="text-red-500 hover:text-red-400 font-semibold transition-colors underline underline-offset-2">call {PHONE}</a>{' '}
          to chat with us first.
        </p>
        <button onClick={openBooking} className="btn-primary text-xs px-8 py-4">Book Now</button>
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
          <h3 className="text-white text-2xl md:text-3xl font-extrabold tracking-tight">Let's Get Your Car Fixed.</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <button onClick={openBooking} className="btn-primary text-xs px-8 py-4">Book Now</button>
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
            <img src="/website_logo.png" alt="GID Garage" className="h-16 w-auto mb-4" />
            <p className="text-white/70 text-sm max-w-xs leading-relaxed">Professional automotive repair and service in Arizona. Honest work. Fair prices.</p>
            <p className="text-white/50 text-xs mt-2 leading-relaxed">Based in Gilbert, AZ · Serving Tempe, Phoenix, Mesa, Queen Creek, Chandler &amp; Santan Valley</p>
          </div>
          <div className="flex flex-col gap-3">
            <a href={`tel:${PHONE}`} className="flex items-center gap-3 text-white/70 hover:text-white transition-colors group">
              <Phone className="w-4 h-4 text-red-600 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium">{PHONE}</span>
            </a>
            <a href={`mailto:${EMAIL}`} className="flex items-center gap-3 text-white/70 hover:text-white transition-colors group">
              <Mail className="w-4 h-4 text-red-600 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium">{EMAIL}</span>
            </a>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-white text-xs uppercase tracking-widest font-semibold mb-1">Quick Links</p>
            {[{ label: 'Services', href: '#services' }, { label: 'Why GID Garage', href: '#why' }, { label: 'Book Appointment', href: '#booking' }].map((l) => (
              <a key={l.label} href={l.href} className="text-white/60 hover:text-white text-sm transition-colors">{l.label}</a>
            ))}
            <a href="/admin" className="text-gray-700 hover:text-gray-500 text-xs transition-colors mt-2">Admin ↗</a>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-white/50 text-xs">
          <p>&copy; 2026 GID Garage. All rights reserved.</p>
          <p>Arizona, USA</p>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const [bookingServiceId, setBookingServiceId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const isAdmin = window.location.pathname === '/admin' || window.location.hash === '#admin';

  function handleBookService(id: string) {
    setBookingServiceId(id);
    setModalOpen(true);
  }

  function openBooking() {
    setBookingServiceId(null);
    setModalOpen(true);
  }

  if (isAdmin) return <AdminSchedule />;

  return (
    <div className="bg-dark text-dark min-h-screen font-sans">
      <Nav onBookService={handleBookService} openBooking={openBooking} />
      <Hero onBookService={handleBookService} openBooking={openBooking} />
      <Services onBookService={handleBookService} />
      <WhyUs />
      <ServiceMap />
      <PhotoStrip />
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
