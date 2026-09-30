// Public content pages (service pages + the service-area page): ONE source for
// both the React pages (src/ServicePages.tsx) and the pre-rendered HTML
// (scripts/prerender.mjs), so what crawlers read before JavaScript runs is the
// same content people see. Facts only from the live site: prices from the
// homepage service cards, photos from real jobs, answers from the FAQ.
// Tests: tests/site-pages.test.js

export const SITE = 'https://gidgarage.com';
export const PHONE = '480-757-0476';

const HOW_IT_WORKS = [
  { title: 'Book or text', text: `Book online or call/text ${PHONE}. Tell us the vehicle and what's going on.` },
  { title: 'We come to you', text: 'Home, work, or wherever the vehicle is parked in the Flagstaff area — no shop, no waiting room, no ride back.' },
  { title: 'Clear price first', text: 'You get a clear estimate before any work starts. No hidden fees, no pressure upsells.' },
];

const COMMON_FAQ = [
  { q: 'Do you actually come to me?', a: "Yes — GID Garage is 100% mobile. Home, work, roadside, wherever your vehicle is, that's where we work on it." },
  { q: 'How fast can you get to me?', a: "Same-day or next-day appointments are usually available, depending on the schedule. Text us your details and we'll give you a real answer, not a runaround." },
  { q: 'Do I need to be there while you work?', a: "Not necessarily — as long as we can access the vehicle and get in touch if anything comes up, plenty of customers have us come by while they're at work or running errands." },
  { q: 'How do I pay?', a: "Card on file, tap-to-pay in person, or a secure payment link sent to your phone — whatever's easiest for you." },
];

export const SERVICE_PAGES = [
  {
    path: '/brake-repair-flagstaff', serviceId: 'brakes', label: 'Brake Repair',
    title: 'Mobile Brake Repair in Flagstaff, AZ | GID Garage',
    description: 'Brake pads and rotors replaced at your home or work in Flagstaff. Pads from $149.99/axle, pads + rotors from $269.99/axle. Call 480-757-0476.',
    h1: 'Mobile Brake Repair in Flagstaff',
    intro: 'Squealing, grinding, or a soft pedal? GID Garage replaces brake pads and rotors wherever your vehicle is parked in the Flagstaff area — you skip the shop and the wait.',
    pricing: [
      { label: 'Brake pads only (per axle)', detail: 'Starting at $149.99 · Flagstaff shops average $240–320/axle' },
      { label: 'Brake pads + rotors (per axle)', detail: 'Starting at $269.99 · shops average $420–600/axle' },
      { label: 'Full service — pads, rotors + fluid flush (per axle)', detail: 'Starting at $319.99 · shops average $520–700/axle' },
    ],
    included: ['Pad replacement', 'Rotor replacement', 'Complete brake system service', 'Complimentary multi-point inspection with the job'],
    photos: [{ src: 'IMG_1052.jpeg', alt: 'Brake pads — old vs. new' }, { src: 'IMG_1179.jpeg', alt: 'Brake pads seated in caliper' }],
    faq: [{ q: 'How do I know if I need brakes?', a: 'Squealing or grinding when you stop, a pedal that feels soft or low, or the car pulling to one side are the usual signs. Book a visit and we will check pads and rotors and tell you straight what they need.' }],
  },
  {
    path: '/mobile-oil-change-flagstaff', serviceId: 'oil', label: 'Oil Change',
    title: 'Mobile Oil Change in Flagstaff, AZ — $79.99 Full Synthetic | GID Garage',
    description: 'Full synthetic oil change at your home or work in Flagstaff: $79.99 up to 5 quarts, filter and multi-point inspection included. Call 480-757-0476.',
    h1: 'Mobile Oil Change in Flagstaff',
    intro: 'Full synthetic only, done in your driveway or parking lot. Most shops charge $110–140 for full synthetic — and you still have to drive there and wait. We come to you.',
    pricing: [{ label: 'Full synthetic oil change', detail: '$79.99 up to 5 quarts · +$10.99/qt after' }],
    included: ['Full synthetic oil', 'New oil filter', 'Fluid top-off', 'Tire pressure check', 'Multi-point inspection'],
    photos: [{ src: 'IMG_0952.jpeg', alt: 'Full synthetic oil change' }, { src: 'afba.jpg', alt: 'Cabin air filter — old vs. new' }],
    faq: [],
  },
  {
    path: '/car-diagnostics-flagstaff', serviceId: 'diag', label: 'Diagnostics',
    title: 'Mobile Car Diagnostics & Check Engine Light in Flagstaff | GID Garage',
    description: 'Check engine light on? $89.99 flat: we come to you in Flagstaff, read and interpret the codes, and explain what it will take to fix. Call 480-757-0476.',
    h1: 'Mobile Diagnostics & Check Engine Light in Flagstaff',
    intro: '$89.99 flat. We come to you, pull and interpret your OBD2 codes, and give you a clear explanation of what\'s wrong and what it\'ll take to fix it — no dealer visit, no upselling.',
    pricing: [{ label: 'Diagnostic visit', detail: '$89.99 flat · includes a full visual inspection' }],
    included: ['OBD2 code scan and interpretation', 'Full visual inspection', 'A clear explanation of the problem and the fix', 'A written estimate before any repair'],
    photos: [{ src: 'IMG_0915.jpeg', alt: 'Coolant temp sensor — old vs. new' }, { src: 'IMG_1392.jpeg', alt: 'Spark plugs — old vs. new' }],
    faq: [{ q: 'Is the code reading the whole diagnosis?', a: 'No — a code tells you where to look, not always what failed. We read the codes and inspect the vehicle so the explanation you get is what actually needs fixing.' }],
  },
  {
    path: '/suspension-repair-flagstaff', serviceId: 'suspension', label: 'Suspension',
    title: 'Mobile Suspension Repair in Flagstaff, AZ — Struts, Shocks | GID Garage',
    description: 'Struts, shocks, control arms, tie rods and CV axles replaced at your home or work in Flagstaff. Free estimate when you book. Call 480-757-0476.',
    h1: 'Mobile Suspension Repair in Flagstaff',
    intro: 'Shocks, struts, control arms, tie rods, and CV axles — replaced where your vehicle is parked. Mountain roads and hard winters are rough on suspension; we fix it without a trip to the shop.',
    pricing: [
      { label: 'Front struts (pair)', detail: 'Starting at $399.99 + parts · shops average $850–1,200' },
      { label: 'Rear shocks (pair)', detail: 'Starting at $249.99 + parts · shops average $450–650' },
      { label: 'Control arms', detail: 'Starting at $224.99 + parts · shops average $450–650' },
      { label: 'Tie rods', detail: 'Starting at $174.99 + parts · shops average $350–500' },
      { label: 'CV axles', detail: 'Starting at $249.99 + parts · shops average $500–750' },
    ],
    included: ['Free estimate when you book', 'Quality replacement parts', 'Complimentary multi-point inspection with the job'],
    photos: [{ src: 'rav4shocks.jpg', alt: 'Front strut assembly, ready to install' }, { src: 'IMG_1292.jpeg', alt: 'Control arms — old vs. new' }, { src: 'magnaride.jpg', alt: 'Adaptive suspension strut' }],
    faq: [{ q: 'Do you do wheel alignments?', a: 'No — after suspension work that affects alignment we point you to a shop that specializes in it, no charge for the honesty.' }],
  },
  {
    path: '/car-audio-installation-flagstaff', serviceId: 'audio', label: 'Car Audio',
    title: 'Mobile Car Audio Installation in Flagstaff, AZ | GID Garage',
    description: 'Head units, speakers, amplifiers and full system builds installed at your home in Flagstaff. From $174.99 labor; bring your own parts or we source them.',
    h1: 'Mobile Car Audio Installation in Flagstaff',
    intro: 'Head units, speakers, amplifiers, and full system builds — installed in your driveway. Bring your own parts or we source them.',
    pricing: [
      { label: 'Head unit replacement', detail: 'Starting at $174.99 labor + parts · shops average $250–400' },
      { label: 'Head unit install (customer-supplied)', detail: '$149.99 labor only' },
      { label: 'Speaker replacement (pair)', detail: 'Starting at $174.99 labor + parts · shops average $250–400' },
      { label: '4-channel amp install', detail: 'Starting at $249.99 labor + parts · shops average $500–750' },
      { label: 'Monoblock + subwoofer install', detail: 'Starting at $249.99 labor + parts · shops average $500–800' },
      { label: 'Full sound system', detail: 'Starting at $599.99 labor + parts, deposit required · shops average $1,500–2,200' },
    ],
    included: ['Clean install and wiring', 'Customer-supplied parts welcome', 'Deposit only for sourced parts and full builds'],
    photos: [{ src: 'photo-audio.jpg', alt: 'Head unit setup after install' }],
    faq: [{ q: 'Can I supply my own parts?', a: 'Yes. Customer-supplied head unit installs are $149.99 labor. Parts we source may need a deposit, and lead times vary.' }],
  },
  {
    path: '/vehicle-inspection-flagstaff', serviceId: 'full', label: 'Vehicle Inspection',
    title: 'Mobile Vehicle Inspection in Flagstaff, AZ | GID Garage',
    description: 'Comprehensive multi-point vehicle inspection at your home in Flagstaff — complimentary with any mechanical service. Know what your vehicle needs first.',
    h1: 'Mobile Multi-Point Vehicle Inspection in Flagstaff',
    intro: 'Know exactly what your vehicle needs before spending a dime. Our comprehensive multi-point inspection is complimentary with any mechanical service — standalone shops typically charge $120–160.',
    pricing: [{ label: 'Multi-point inspection', detail: 'Complimentary with any mechanical service · shops typically charge $120–160' }],
    included: ['Tire pressure and tread depth measured', 'Diagnostic trouble codes read', 'A visual look over the vehicle', 'A clear picture of what it needs before you spend anything'],
    photos: [{ src: 'IMG_0964.jpeg', alt: 'Radiator hose replacement' }, { src: 'IMG_1248.jpeg', alt: 'Timing cover and oil pan' }],
    faq: [],
  },
].map(p => ({ ...p, canonical: `${SITE}${p.path}`, howItWorks: HOW_IT_WORKS, faq: [...p.faq, ...COMMON_FAQ] }));

// Towns served (the same list as the homepage map). Winslow stays listed until
// the owner decides whether it's served (it's beyond the ~30-mile radius).
export const AREAS = [
  { name: 'Flagstaff', slug: 'flagstaff', miles: 0, blurb: 'Home base. Same-day and next-day mobile appointments are usually available anywhere in town.' },
  { name: 'Fort Valley', slug: 'fort-valley', miles: 2.7, blurb: 'Just northwest of downtown — one of our quickest response areas.' },
  { name: 'Kachina Village', slug: 'kachina-village', miles: 7.4, blurb: "A quick drive south off I-17 — we're out to Kachina Village regularly." },
  { name: 'Mountainaire', slug: 'mountainaire', miles: 7.8, blurb: 'Right next to Kachina Village along I-17 — easy reach for mobile appointments.' },
  { name: 'Doney Park', slug: 'doney-park', miles: 9.2, blurb: 'East of Flagstaff off Townsend-Winona Road — a regular stop for us.' },
  { name: 'Bellemont', slug: 'bellemont', miles: 10.6, blurb: 'Out along old Route 66/I-40 west of town — happy to make the drive.' },
  { name: 'Munds Park', slug: 'munds-park', miles: 12.5, blurb: 'The I-17 mountain community south of Flagstaff — a straightforward trip down the interstate.' },
  { name: 'Winona', slug: 'winona', miles: 13.9, blurb: 'East on old Route 66 near Walnut Canyon — we make it out this way regularly.' },
  { name: 'Parks', slug: 'parks', miles: 17.0, blurb: 'Out I-40 west toward Williams — a familiar drive for us.' },
  { name: 'Sedona', slug: 'sedona', miles: 28.0, blurb: 'Down 89A through Oak Creek Canyon — mobile repair without the drive up to Flagstaff.' },
  { name: 'Winslow', slug: 'winslow', miles: 58.0, blurb: 'Further east off I-40 — reach out ahead of time so we can build it into the schedule.' },
];

export const AREAS_PAGE = {
  path: '/service-area', canonical: `${SITE}/service-area`, label: 'Areas We Serve',
  title: 'Areas We Serve — Mobile Mechanic Around Flagstaff, AZ | GID Garage',
  description: 'GID Garage is a mobile mechanic based in Flagstaff serving Fort Valley, Kachina Village, Doney Park, Bellemont, Munds Park, Sedona and more. We come to you.',
  h1: 'Areas We Serve Around Flagstaff',
  intro: 'GID Garage is 100% mobile and based in Flagstaff. These are the communities we drive to regularly — not sure if you\'re in range? Call or text ' + PHONE + '.',
};

export const HOME_PAGE = {
  path: '/', canonical: `${SITE}/`,
  title: 'Mobile Mechanic in Flagstaff, AZ — We Come to You | GID Garage',
  description: "Flagstaff's mobile mechanic — we come to your home or work. Full synthetic oil change $79.99, brakes from $149.99/axle, diagnostics $89.99. Call 480-757-0476.",
  h1: 'Flagstaff Mobile Mechanic',
  intro: 'We come to you — Flagstaff, Bellemont, Kachina, Fort Valley & beyond. Honest pricing, expert work, no shop wait. Car care at 7,000 feet.',
};

export const PRIVACY_PAGE = { path: '/privacy', canonical: `${SITE}/privacy`, title: 'Privacy Policy | GID Garage', description: 'How GID Garage collects, uses and protects your information.', h1: 'Privacy Policy' };

export const pageForPath = path => SERVICE_PAGES.find(p => p.path === String(path).replace(/\/+$/, '')) || null;
