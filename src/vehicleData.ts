// vehicleData.ts — Static make/model list derived from engineData.ts keys
// No network calls. Models are filtered by year using engineData ranges.
// Lazy-loaded by BookingWidget on first use.

export const VEHICLE_MODELS: Record<string, string[]> = {
  'Acura':         ['MDX', 'NSX', 'RDX', 'TL', 'TLX', 'TSX'],
  'BMW':           ['3 Series', '5 Series', 'X3', 'X5'],
  'Cadillac':      ['CTS', 'Escalade', 'SRX'],
  'Chevrolet':     ['Avalanche', 'Camaro', 'Cavalier', 'Cobalt', 'Colorado', 'Corvette', 'Cruze', 'Equinox', 'HHR', 'Impala', 'Malibu', 'Monte Carlo', 'S-10', 'Silverado 1500', 'Silverado 2500HD', 'Silverado EV', 'Sonic', 'Spark', 'SSR', 'Suburban', 'Tahoe', 'Trailblazer', 'Traverse'],
  'Chrysler':      ['300', 'Pacifica', 'PT Cruiser', 'Sebring', 'Town & Country'],
  'Dodge':         ['Avenger', 'Caliber', 'Challenger', 'Charger', 'Dakota', 'Durango', 'Grand Caravan', 'Journey', 'Neon', 'Stealth', 'Viper'],
  'Ford':          ['Bronco', 'Bronco Sport', 'Crown Victoria', 'Edge', 'Escape', 'Excursion', 'Expedition', 'Explorer', 'F-150', 'F-250 Super Duty', 'F-350 Super Duty', 'F-Series Lightning', 'Flex', 'Focus', 'Fusion', 'Maverick', 'Mustang', 'Ranger', 'Taurus', 'Thunderbird', 'Transit'],
  'Genesis':       ['G80', 'GV70'],
  'GMC':           ['Acadia', 'Canyon', 'Envoy', 'Hummer EV', 'Sierra 1500', 'Sierra 2500HD', 'Terrain', 'Yukon'],
  'Honda':         ['Accord', 'Civic', 'CR-V', 'CR-Z', 'Element', 'Fit', 'HR-V', 'Insight', 'Odyssey', 'Passport', 'Pilot', 'Prelude', 'Ridgeline', 'S2000'],
  'Hyundai':       ['Elantra', 'Genesis', 'Ioniq 5', 'Kona', 'Palisade', 'Santa Cruz', 'Santa Fe', 'Sonata', 'Tucson', 'Veloster'],
  'Infiniti':      ['G35', 'G37', 'Q50', 'Q60', 'QX60', 'QX80'],
  'Jeep':          ['Cherokee', 'Commander', 'Compass', 'Gladiator', 'Grand Cherokee', 'Grand Wagoneer', 'Liberty', 'Patriot', 'Renegade', 'Wagoneer', 'Wrangler'],
  'Kia':           ['EV6', 'Forte', 'K5', 'Niro', 'Optima', 'Sorento', 'Soul', 'Sportage', 'Stinger', 'Telluride'],
  'Lexus':         ['ES', 'GX', 'IS', 'LX', 'RX'],
  'Lincoln':       ['MKX', 'MKZ', 'Navigator', 'Town Car'],
  'Lucid':         ['Air'],
  'Mazda':         ['CX-5', 'CX-9', 'Mazda3', 'Mazda6', 'MX-5 Miata', 'RX-7', 'RX-8', 'Tribute'],
  'Mercedes-Benz': ['C-Class', 'E-Class', 'GLE'],
  'Mercury':       ['Grand Marquis', 'Mariner', 'Milan', 'Mountaineer'],
  'Mitsubishi':    ['3000GT', 'Eclipse', 'Lancer', 'Outlander'],
  'Nissan':        ['350Z', '370Z', 'Altima', 'Armada', 'Frontier', 'GT-R', 'Maxima', 'Murano', 'Pathfinder', 'Rogue', 'Sentra', 'Titan', 'Titan XD', 'Xterra', 'Z'],
  'Oldsmobile':    ['Alero', 'Bravada', 'Intrigue'],
  'Polestar':      ['Polestar 2', 'Polestar 3'],
  'Pontiac':       ['Firebird', 'G6', 'G8', 'Grand Prix', 'Solstice', 'Vibe'],
  'Porsche':       ['911', 'Cayenne', 'Macan'],
  'RAM':           ['1500', '2500', '3500'],
  'Rivian':        ['R1S', 'R1T'],
  'Saturn':        ['Ion', 'Sky', 'Vue'],
  'Subaru':        ['Ascent', 'Baja', 'BRZ', 'Crosstrek', 'Forester', 'Impreza', 'Legacy', 'Outback', 'Tribeca', 'WRX'],
  'Tesla':         ['Cybertruck', 'Model 3', 'Model S', 'Model X', 'Model Y'],
  'Toyota':        ['4Runner', 'Avalon', 'Camry', 'Celica', 'Corolla', 'Corolla Cross', 'Echo', 'FJ Cruiser', 'GR Corolla', 'GR86', 'Highlander', 'Land Cruiser', 'Matrix', 'MR2', 'Pickup', 'Prius', 'Prius Prime', 'RAV4', 'RAV4 Prime', 'Sequoia', 'Sienna', 'Solara', 'Supra', 'T100', 'Tacoma', 'Tundra', 'Venza', 'Yaris'],
  'Volkswagen':    ['Atlas', 'Beetle', 'Golf', 'ID.4', 'Jetta', 'Passat', 'Tiguan'],
  'Volvo':         ['S60', 'S90', 'XC40', 'XC60', 'XC90'],
};

export const MAKES: string[] = Object.keys(VEHICLE_MODELS).sort();
