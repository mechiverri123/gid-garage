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
    photos: [{ src: '/photos/brake-rotor-before.webp', alt: 'Before: worn, rusted rotor' }, { src: '/photos/brake-rotor-after.webp', alt: 'After: new rotor on the same wheel' }, { src: '/photos/brake-new-rotor-caliper.webp', alt: 'New rotor with the caliper back on' }, { src: '/photos/brake-pads-in-caliper.webp', alt: 'New pads seated in the caliper bracket' }],
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
    photos: [{ src: '/photos/oil-old-filter.webp', alt: 'Old oil filter coming off' }, { src: '/photos/oil-new-filter.webp', alt: 'New oil filter installed' }, { src: '/photos/oil-fill.webp', alt: 'Filling with full synthetic oil' }, { src: '/photos/oil-life-reset.webp', alt: 'Oil life reset to 100% after the change' }],
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
    photos: [{ src: '/case/titan-coil-old-new.webp', alt: 'Failed coil pack found diagnosing a misfire, next to the new one' }, { src: '/case/blazer-old-vs-new.webp', alt: 'A battery that failed its health test, next to the replacement' }],
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
    // No photos until there's a genuine inspection photo (unrelated repair photos were removed).
    photos: [],
    faq: [],
  },
].map(p => ({ ...p, canonical: `${SITE}${p.path}`, howItWorks: HOW_IT_WORKS, faq: [...p.faq, ...COMMON_FAQ] }));

// Towns served (the same list as the homepage map), all within ~30 miles.
export const AREAS = [
  { name: 'Flagstaff', slug: 'flagstaff', miles: 0, blurb: 'Home base. Same-day and next-day mobile appointments are usually available anywhere in town.' },
  { name: 'Fort Valley', slug: 'fort-valley', miles: 2.7, blurb: 'Just northwest of downtown — one of our quickest response areas.' },
  { name: 'Kachina Village', slug: 'kachina-village', miles: 7.4, blurb: "A quick drive south off I-17 — we're out to Kachina Village regularly." },
  { name: 'Mountainaire', slug: 'mountainaire', miles: 7.8, blurb: 'Right next to Kachina Village along I-17 — easy reach for mobile appointments.' },
  { name: 'Doney Park', slug: 'doney-park', miles: 9.2, blurb: 'East of Flagstaff off Townsend-Winona Road — a regular stop for us.' },
  { name: 'Bellemont', slug: 'bellemont', miles: 10.6, blurb: 'Out along old Route 66/I-40 west of town — happy to make the drive.' },
  { name: 'Munds Park', slug: 'munds-park', miles: 12.5, blurb: 'The I-17 mountain community south of Flagstaff — a straightforward trip down the interstate.' },
  { name: 'Winona', slug: 'winona', miles: 13.9, blurb: 'East on old Route 66 near Walnut Canyon — we make it out this way regularly.' },
  { name: 'Parks', slug: 'parks', miles: 17.0, blurb: 'Out I-40 west, past Bellemont — a familiar drive for us.' },
  { name: 'Sedona', slug: 'sedona', miles: 28.0, blurb: 'Down 89A through Oak Creek Canyon — mobile repair without the drive up to Flagstaff.' },
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

// Real completed jobs, written only from the job record (symptom, what was
// confirmed, what was replaced, outcome). No customer names, contacts or
// addresses; photos cropped to the parts, metadata stripped (public/case/).
export const CASE_STUDIES = [
  {
    slug: '2005-nissan-titan-cylinder-6-misfire-coil-pack', serviceId: 'diag', month: 'July 2026',
    vehicle: '2005 Nissan Titan 5.6L V8', mileage: 'over 250,000 miles',
    title: '2005 Nissan Titan Misfire: Bad Coil Pack | GID Garage Flagstaff',
    description: 'A 2005 Nissan Titan with over 250k miles developed a cylinder 6 misfire right after new spark plugs. We confirmed a failed coil pack and fixed it on site.',
    h1: '2005 Nissan Titan: Cylinder 6 Misfire After a Spark Plug Job',
    complaint: 'The truck started misfiring on cylinder 6 shortly after its spark plugs were replaced.',
    diagnosis: 'We scanned the truck on site and confirmed the cylinder 6 misfire was caused by a bad ignition coil pack — not the new plugs.',
    repair: 'Replaced the cylinder 6 coil pack, then rescanned the truck.',
    outcome: 'The rescan came back clean — the misfire was resolved, and the truck never had to go to a shop.',
    lesson: "A misfire that shows up right after a tune-up isn't always the new parts. On a high-mileage engine, the coil feeding that cylinder can be the real failure — testing first saves replacing parts that are fine.",
    photos: [{ src: '/case/titan-coil-old-new.webp', alt: 'Failed coil pack next to the new replacement' }, { src: '/case/titan-coil-installed.webp', alt: 'Coil pack area on the 5.6L V8' }],
  },
  {
    slug: '2014-jeep-cherokee-misfire-spark-plugs-coils-plenum-gasket', serviceId: 'diag', month: 'July 2026',
    vehicle: '2014 Jeep Cherokee 3.2L V6', mileage: 'over 200,000 miles',
    title: '2014 Jeep Cherokee 3.2L Misfire Fix | GID Garage Flagstaff',
    description: 'Cylinder 5 misfire on a 2014 Jeep Cherokee 3.2L. All six spark plugs and coils replaced on site, including intake plenum removal and a new gasket.',
    h1: '2014 Jeep Cherokee 3.2L: Misfire on Cylinder 5',
    complaint: 'A misfire on cylinder 5. The owner wanted the ignition refreshed rather than chasing one cylinder at a time.',
    diagnosis: "On the 3.2L V6, the rear bank's plugs and coils sit under the upper intake plenum, so the plenum has to come off to reach them — and its gasket has to be replaced when it goes back on.",
    repair: 'Removed the upper intake plenum, replaced all six spark plugs and all six ignition coils, and reinstalled the plenum with a new gasket set — about 4.5 hours, done where the Jeep was parked.',
    outcome: 'New plugs and coils in all six cylinders. We also flagged oil seepage at cylinder 5 (a valve cover gasket to watch) and a transmission code that showed on the before-and-after scans, so the owner knows what to keep an eye on.',
    lesson: 'On engines where half the plugs hide under the intake, doing all six at once means paying for that teardown only once.',
    photos: [{ src: '/case/cherokee-plenum-off.webp', alt: 'Upper intake plenum removed, ports covered' }, { src: '/case/cherokee-intake-removed.webp', alt: 'Rear bank coils exposed with the intake off' }, { src: '/case/cherokee-old-plugs.webp', alt: 'All six old spark plugs removed' }],
  },
  {
    slug: '2021-chevrolet-blazer-no-start-battery-replacement', serviceId: 'diag', month: 'August 2026',
    vehicle: '2021 Chevrolet Blazer RS', mileage: null,
    title: "2021 Chevy Blazer Won't Start: Battery Fix | GID Garage Flagstaff",
    description: "A 2021 Chevrolet Blazer RS wouldn't start. We tested it where it sat, a battery health report confirmed a failed battery, and we installed a new AGM battery.",
    h1: "2021 Chevrolet Blazer RS: Won't Start",
    complaint: "The Blazer wouldn't start, and the owner wanted to know why before spending money on parts.",
    diagnosis: 'We came to the vehicle, scanned it, and ran a battery health test. The report confirmed the battery had failed.',
    repair: 'Installed a new Duralast Platinum Elite AGM battery (group 94R / H7) and rescanned.',
    outcome: 'The Blazer was back on the road without a tow, and the owner got the battery health report with the invoice.',
    lesson: "A no-start isn't always the battery — a quick test on site tells you what failed before you buy anything.",
    photos: [{ src: '/case/blazer-old-battery.webp', alt: 'Original battery before replacement' }, { src: '/case/blazer-new-battery.webp', alt: 'New Duralast AGM battery installed' }, { src: '/case/blazer-old-vs-new.webp', alt: 'Old battery next to the new AGM battery' }],
  },
  {
    slug: '2020-subaru-outback-brakes-spark-plugs-throttle-body', serviceId: 'brakes', month: 'September 2026',
    vehicle: '2020 Subaru Outback 2.5L', mileage: 'about 50,000 miles',
    title: '2020 Subaru Outback Brakes & Tune-Up | GID Garage Flagstaff',
    description: 'Front pads and rotors, spark plugs, PCV valve and a MAF and throttle body cleaning on a 2020 Subaru Outback, using genuine parts the owner supplied.',
    h1: '2020 Subaru Outback: Brakes, Plugs & a Very Dirty Throttle Body',
    complaint: 'The owner had already bought genuine Subaru parts and wanted the work done at home: front brake pads and rotors, spark plugs, PCV valve and hose, and a MAF sensor and throttle body cleaning.',
    diagnosis: 'During the cleaning, the MAF sensor had only light debris — nothing concerning — but the throttle body was significantly dirty.',
    repair: 'Replaced the front pads and rotors (caliper bracket bolts 99.6 ft-lb, slide pins 25 ft-lb, lug nuts 89 ft-lb), replaced the spark plugs (14 ft-lb), replaced the PCV valve and connector hose, and cleaned the MAF sensor and throttle body with the CRC cleaners made for each.',
    outcome: "Everything done in one visit at the owner's home with the owner's own parts, torqued to spec.",
    lesson: "Customer-supplied parts are welcome. And a throttle body can get dirty well before 60k miles — cleaning it is quick while you're already in there.",
    photos: [{ src: '/case/outback-brakes-before.webp', alt: 'Front brake before: worn rotor and pads' }, { src: '/case/outback-brakes-after.webp', alt: 'Front brake after: new rotor and pads' }, { src: '/case/outback-throttle-before.webp', alt: 'Throttle body before cleaning' }, { src: '/case/outback-throttle-after.webp', alt: 'Throttle body after cleaning' }, { src: '/case/outback-spark-plugs.webp', alt: 'Old and new spark plugs' }],
  },
].map(c => ({ ...c, path: `/case-studies/${c.slug}`, canonical: `${SITE}/case-studies/${c.slug}` }));

export const CASE_STUDIES_PAGE = {
  path: '/case-studies', canonical: `${SITE}/case-studies`, label: 'Real Jobs',
  title: 'Real Repair Jobs Around Flagstaff — Case Studies | GID Garage',
  description: 'Real mobile repair jobs from around Flagstaff: the problem, how we found it, what we replaced, and how it turned out. No stock photos.',
  h1: 'Real Jobs From Around Flagstaff',
  intro: 'Real vehicles, real problems, fixed where they were parked. Customer details are left out; the photos are from the jobs.',
};

export const caseStudyForPath = path => CASE_STUDIES.find(c => c.path === String(path).replace(/\/+$/, '')) || null;
