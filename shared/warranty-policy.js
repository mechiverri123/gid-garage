// The one source for GID Garage warranty wording. Terms of Service, estimates,
// invoices, receipts, emails and FAQs all read from here; don't write a second
// version anywhere. The warranty stays 30 days (owner decision, 2026-11-07).
// Wording signed on an estimate is versioned in shared/estimate-terms.js.

export const WARRANTY_URL = 'https://gidgarage.com/terms#warranty';

// Short statement for invoices, receipts, emails and estimates.
export const WARRANTY_SUMMARY = "30-Day Limited Workmanship Warranty: for 30 days from the date service is completed, GID Garage warrants the labor and workmanship on the specific repair you authorized. Parts carry only their manufacturer's or supplier's warranty, and GID Garage does not warrant customer-supplied parts. Unrelated problems, surrounding components, and pre-existing conditions are not covered unless caused by our defective workmanship.";
export const WARRANTY_SHORT = `${WARRANTY_SUMMARY} Full terms: gidgarage.com/terms#warranty`;

// One line for FAQs. index.html repeats this in its FAQ data (a test keeps them equal).
export const WARRANTY_FAQ = "Labor on the specific repair we perform has a 30-day limited workmanship warranty, and parts carry their manufacturer's or supplier's warranty. Full terms are in our Terms of Service.";

export const DIAGNOSTIC_SHORT = "This report reflects what was observed at the time of inspection. It is not a guarantee that every existing or developing problem was found, or of the vehicle's future condition. Full terms: gidgarage.com/terms#warranty";

export const warrantyEmailHtml = () => `<p style="color:#6b7280;font-size:11px;line-height:1.5;margin:12px 0 0;">${WARRANTY_SUMMARY} <a href="${WARRANTY_URL}" style="color:#9ca3af;">Full terms</a></p>`;

export const WARRANTY_POLICY = [
  {
    title: 'What the Warranty Covers',
    intro: 'For 30 days from the original date of completed service, GID Garage provides a limited warranty on the labor and workmanship directly related to the specific repair we performed. It covers:',
    items: [
      'Improper installation directly attributable to GID Garage.',
      'Defective workmanship directly related to the repair you authorized.',
      "A documented failure of the specific work we performed that is determined to be attributable to GID Garage's workmanship.",
    ],
    outro: "You are purchasing a specific authorized repair. This warranty is not a guarantee of your vehicle's overall mechanical condition, reliability, safety, or future performance, and it does not automatically cover every problem that develops after a repair.",
  },
  {
    title: 'How We Make It Right',
    items: [
      'We will have the opportunity to inspect the issue and determine an appropriate remedy.',
      'Our preferred remedy for a verified workmanship issue is correcting it at no additional labor charge. If that is not practical, we may offer another fair remedy, such as refunding the labor charge for the affected work.',
      'This warranty does not include automatic refunds, replacement vehicles, towing, rental vehicles, transportation expenses, or compensation for inconvenience.',
      'All remedies are subject to applicable law, and nothing in this warranty takes away a right that cannot legally be waived.',
    ],
  },
  {
    title: 'Surrounding and Unrelated Components',
    intro: 'A problem is not covered simply because it appears during or after a repair. Unless it was caused by our defective workmanship:',
    items: [
      'Repairing one component does not guarantee the condition of surrounding components.',
      'Accessing, removing, disconnecting, or working near an adjacent component does not automatically make GID Garage responsible for its condition.',
      "A component's proximity to the repair does not automatically make its failure a warranty issue.",
      'Existing components may fail during normal handling or operation because of pre-existing deterioration.',
      'Existing leaks, noises, electrical problems, corrosion, and previous repairs are not covered.',
      'A vehicle may develop unrelated problems after a repair, and those problems are not automatically covered.',
    ],
    outro: 'None of this excuses damage GID Garage actually causes through defective workmanship or negligence. We remain responsible for that damage where the law requires.',
  },
  {
    title: 'Customer-Supplied Parts',
    items: [
      'Customer-supplied parts carry no GID Garage parts warranty. We do not guarantee their quality, compatibility, condition, authenticity, or lifespan, and we are not responsible for defects in them.',
      'If a supplied part is incorrect, defective, damaged, or incompatible, additional labor and service charges may apply.',
      'We may decline to install a part we consider unsafe, unsuitable, damaged, or incompatible.',
      'For a job using customer-supplied parts, the workmanship warranty is limited to our installation and does not guarantee the part itself.',
    ],
  },
  {
    title: 'Parts Supplied by GID Garage',
    items: [
      "Parts are subject to the applicable manufacturer's or supplier's warranty terms, and that manufacturer or supplier decides coverage.",
      'We will reasonably assist you with a parts warranty claim, but we do not promise coverage beyond the actual manufacturer or supplier warranty.',
      "A manufacturer's parts warranty does not automatically include labor, towing, travel, rental vehicles, or incidental expenses.",
    ],
  },
  {
    title: 'Diagnostic Services and Recommendations',
    intro: 'Diagnostic services are evaluations based on the information, symptoms, test results, and conditions available at the time of inspection.',
    items: [
      'A diagnostic evaluation is not a guarantee that every existing or developing problem has been identified.',
      'Intermittent problems may not be present during testing.',
      'Some failures require additional testing, disassembly, or specialized equipment.',
      'A diagnostic recommendation does not guarantee that repairing one identified issue will resolve every symptom. Additional faults may be discovered after the original repair.',
      'Diagnostic services do not guarantee the future condition of the vehicle. We are not responsible for unrelated or undiscovered problems merely because a diagnostic service was performed.',
    ],
  },
  {
    title: 'How to Make a Warranty Claim',
    items: [
      'Contact us promptly after you discover a potential workmanship issue, at 480-757-0476 or info@gidgarage.com.',
      'Describe the problem and share any photos, videos, or diagnostic information reasonably available to you.',
      'Give us a reasonable opportunity to inspect the vehicle and verify the issue.',
      'When reasonably possible, get our authorization before another repair facility works on the claimed issue. Having another mechanic inspect the vehicle does not by itself void this warranty.',
      'To the extent permitted by law, we are not responsible for additional damage or costs caused by unauthorized third-party repairs or modifications.',
      'These steps do not apply where an emergency, a safety concern, or other circumstances make them impractical. Tell us as soon as you reasonably can.',
    ],
  },
  {
    title: 'What the Warranty Does Not Cover',
    intro: 'To the extent permitted by applicable law, this warranty does not cover:',
    items: [
      'Accidents and collisions.',
      'Misuse, abuse, improper vehicle operation, or racing and competitive use.',
      'Neglect or lack of maintenance.',
      'Overheating caused by unrelated conditions.',
      'Continued operation after a known warning or mechanical failure.',
      'Unauthorized modifications or damage caused by third-party repairs.',
      'Normal wear and tear and consumable maintenance items.',
      'Environmental damage.',
      'Unrelated component failures, pre-existing conditions, and failures outside the scope of the authorized repair.',
    ],
  },
  {
    title: 'What to Expect From Us',
    items: [
      'We do not guarantee that a repair will resolve symptoms unrelated to the diagnosed issue.',
      'Additional repairs found during service require your separate authorization, and we may decline additional work outside the original scope.',
      'We may decline warranty requests that are unrelated to the original repair. A request for free work outside the authorized repair is not automatically a warranty claim.',
      'Being a past customer does not by itself entitle a vehicle to free maintenance, inspections, unrelated diagnostics, or additional repairs.',
      'We want every customer to be happy with our work, but dissatisfaction alone does not establish a workmanship defect.',
      'We may refuse service or end a customer relationship where legally permissible.',
    ],
  },
];

// Must stay conspicuous and name merchantability (A.R.S. 47-2316).
export const WARRANTY_DISCLAIMER = 'Except for the limited warranty above and any warranty that cannot be excluded under applicable law, our services and this website are provided "as is," and we disclaim all other warranties, express or implied, including implied warranties of merchantability and fitness for a particular purpose, to the fullest extent permitted by law.';

export const OLDER_VEHICLES = {
  title: 'Older Vehicles and Pre-Existing Conditions',
  intro: 'GID Garage services vehicles of many ages and conditions. Older or high-mileage vehicles can have deterioration that may not be visible or discoverable during an ordinary repair, such as:',
  examples: [
    'Brittle plastic fittings and connectors.',
    'Corroded bolts and fasteners.',
    'Deteriorated hoses.',
    'Aging wiring and electrical connectors.',
    'Weak or deteriorated seals.',
    'Existing leaks.',
    'Previously damaged or improperly repaired components.',
    'Components weakened by heat, age, corrosion, or normal wear.',
  ],
  notes: [
    'We do not guarantee the lifespan of surrounding components, and replacing one part does not guarantee the continued operation of other aging parts.',
    'If a deteriorated part fails during service, we will tell you and discuss options before doing more work.',
    'Not all damage during a repair is exempt from responsibility. We remain responsible for damage caused by our defective workmanship or negligence where the law requires.',
    'We may photograph the vehicle before, during, and after service to document its condition. Damage you note when signing the estimate is recorded and acknowledged.',
  ],
};
