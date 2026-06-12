// trimData.ts — Year-range aware trim data
// Structure: "MAKE|MODEL" → array of { from, to, trims[] }
// Mirrors engineData.ts structure exactly.
// "Other / not listed" is appended automatically by the UI.

export interface TrimEntry {
  from: number;
  to: number;
  trims: string[];
}

export const TRIM_DATA: Record<string, TrimEntry[]> = {

  // ── TOYOTA ──────────────────────────────────────────────────────────────────

  'TOYOTA|CAMRY': [
    { from: 1983, to: 1991, trims: ['DX', 'LE', 'SE'] },
    { from: 1992, to: 1996, trims: ['DX', 'LE', 'SE', 'XLE'] },
    { from: 1997, to: 2001, trims: ['CE', 'LE', 'XLE'] },
    { from: 2002, to: 2006, trims: ['LE', 'SE', 'XLE'] },
    { from: 2007, to: 2011, trims: ['Base', 'LE', 'SE', 'XLE'] },
    { from: 2012, to: 2017, trims: ['L', 'LE', 'SE', 'XSE', 'XLE', 'SE Hybrid', 'XLE Hybrid'] },
    { from: 2018, to: 2024, trims: ['L', 'LE', 'SE', 'XSE', 'XLE', 'TRD', 'Hybrid LE', 'Hybrid SE', 'Hybrid XLE', 'Hybrid XSE'] },
  ],

  'TOYOTA|COROLLA': [
    { from: 1980, to: 1992, trims: ['DX', 'SR5', 'GTS'] },
    { from: 1993, to: 1997, trims: ['Base', 'DX', 'LE'] },
    { from: 1998, to: 2002, trims: ['CE', 'VE', 'LE', 'S'] },
    { from: 2003, to: 2008, trims: ['CE', 'LE', 'S', 'XRS'] },
    { from: 2009, to: 2013, trims: ['Base', 'LE', 'S', 'XRS'] },
    { from: 2014, to: 2019, trims: ['L', 'LE', 'LE Eco', 'S', 'S Plus', 'SE', 'XSE', 'XLE'] },
    { from: 2020, to: 2024, trims: ['L', 'LE', 'SE', 'XSE', 'XLE', 'Hybrid LE', 'Hybrid SE', 'Hybrid XLE'] },
  ],

  'TOYOTA|RAV4': [
    { from: 1996, to: 2000, trims: ['Base 2WD', 'Base 4WD', 'EV 4WD'] },
    { from: 2001, to: 2005, trims: ['Base 2WD', 'Base 4WD', 'L 2WD', 'L 4WD'] },
    { from: 2006, to: 2012, trims: ['Base 2WD', 'Base 4WD', 'Sport 2WD', 'Sport 4WD', 'Limited 2WD', 'Limited 4WD'] },
    { from: 2013, to: 2018, trims: ['LE 2WD', 'LE AWD', 'XLE 2WD', 'XLE AWD', 'Limited 2WD', 'Limited AWD', 'SE 2WD', 'SE AWD', 'EV'] },
    { from: 2019, to: 2024, trims: ['LE', 'XLE', 'XLE Premium', 'TRD Off-Road', 'Adventure', 'Limited', 'Hybrid LE', 'Hybrid XLE', 'Hybrid XLE Premium', 'Hybrid Limited', 'Hybrid XSE'] },
  ],

  'TOYOTA|RAV4 PRIME': [
    { from: 2021, to: 2024, trims: ['SE', 'XSE', 'XSE Premium'] },
  ],

  'TOYOTA|TACOMA': [
    { from: 1995, to: 2004, trims: ['Regular Cab 2WD', 'Regular Cab 4WD', 'Xtracab 2WD', 'Xtracab 4WD', 'Xtracab PreRunner', 'Double Cab 2WD', 'Double Cab 4WD', 'Double Cab PreRunner', 'S-Runner'] },
    { from: 2005, to: 2015, trims: ['Regular Cab 2WD', 'Regular Cab 4WD', 'Access Cab 2WD', 'Access Cab 4WD', 'Access Cab PreRunner', 'Double Cab 2WD', 'Double Cab 4WD', 'Double Cab PreRunner', 'Double Cab TRD Sport', 'Double Cab TRD Off-Road', 'Double Cab Limited'] },
    { from: 2016, to: 2023, trims: ['SR', 'SR5', 'TRD Sport', 'TRD Off-Road', 'Limited', 'TRD Pro'] },
    { from: 2024, to: 2026, trims: ['SR', 'SR5', 'TRD Sport', 'TRD Off-Road', 'Limited', 'TRD Pro', 'Trailhunter'] },
  ],

  'TOYOTA|TUNDRA': [
    { from: 2000, to: 2006, trims: ['Regular Cab', 'Access Cab SR5', 'Access Cab Limited', 'Double Cab SR5', 'Double Cab Limited'] },
    { from: 2007, to: 2013, trims: ['Regular Cab Grade', 'Double Cab Grade', 'Double Cab SR5', 'Double Cab Limited', 'CrewMax SR5', 'CrewMax Limited', 'CrewMax Platinum'] },
    { from: 2014, to: 2021, trims: ['SR', 'SR5', 'Limited', 'Platinum', '1794 Edition', 'TRD Pro'] },
    { from: 2022, to: 2026, trims: ['SR', 'SR5', 'Limited', 'Platinum', '1794 Edition', 'TRD Pro', 'Capstone'] },
  ],

  'TOYOTA|4RUNNER': [
    { from: 1984, to: 1989, trims: ['Base 4WD', 'SR5 4WD'] },
    { from: 1990, to: 1995, trims: ['Base 2WD', 'Base 4WD', 'SR5 2WD', 'SR5 4WD'] },
    { from: 1996, to: 2002, trims: ['SR5 2WD', 'SR5 4WD', 'Limited 2WD', 'Limited 4WD'] },
    { from: 2003, to: 2009, trims: ['Sport 2WD', 'Sport 4WD', 'SR5 2WD', 'SR5 4WD', 'Limited 2WD', 'Limited 4WD'] },
    { from: 2010, to: 2024, trims: ['SR5 2WD', 'SR5 4WD', 'Trail 4WD', 'TRD Off-Road 4WD', 'TRD Off-Road Premium 4WD', 'Limited 2WD', 'Limited 4WD', 'TRD Pro 4WD'] },
  ],

  'TOYOTA|HIGHLANDER': [
    { from: 2001, to: 2007, trims: ['Base 2WD', 'Base AWD', 'Limited 2WD', 'Limited AWD', 'Hybrid Limited AWD'] },
    { from: 2008, to: 2013, trims: ['Base 2WD', 'Base AWD', 'Sport 2WD', 'Sport AWD', 'SE 2WD', 'SE AWD', 'Limited 2WD', 'Limited AWD', 'Hybrid Limited AWD'] },
    { from: 2014, to: 2019, trims: ['LE 2WD', 'LE AWD', 'LE Plus 2WD', 'LE Plus AWD', 'XLE 2WD', 'XLE AWD', 'Limited 2WD', 'Limited AWD', 'Limited Platinum AWD', 'Hybrid LE AWD', 'Hybrid XLE AWD', 'Hybrid Limited AWD', 'Hybrid Platinum AWD'] },
    { from: 2020, to: 2024, trims: ['L', 'LE', 'XLE', 'XSE', 'Limited', 'Platinum', 'Hybrid LE', 'Hybrid XLE', 'Hybrid XSE', 'Hybrid Limited', 'Hybrid Platinum'] },
  ],

  'TOYOTA|SIENNA': [
    { from: 1998, to: 2003, trims: ['CE', 'LE', 'XLE'] },
    { from: 2004, to: 2010, trims: ['CE', 'LE', 'XLE', 'XLE Limited', 'XLE AWD'] },
    { from: 2011, to: 2020, trims: ['L', 'LE', 'SE', 'XLE', 'Limited', 'Limited Premium', 'AWD LE', 'AWD XLE', 'AWD Limited'] },
    { from: 2021, to: 2024, trims: ['LE', 'XSE', 'XLE', 'Limited', 'Platinum'] },
  ],

  'TOYOTA|PRIUS': [
    { from: 2001, to: 2003, trims: ['Base'] },
    { from: 2004, to: 2009, trims: ['Base', 'Package 2', 'Package 3', 'Package 4', 'Package 5', 'Touring'] },
    { from: 2010, to: 2015, trims: ['Two', 'Three', 'Four', 'Five', 'Persona Series', 'Plugin Two', 'Plugin Three', 'Plugin Four', 'Plugin Advanced'] },
    { from: 2016, to: 2022, trims: ['Two Eco', 'Two', 'Three', 'Three Touring', 'Four', 'Four Touring', 'Prime Plus', 'Prime Premium', 'Prime Advanced'] },
    { from: 2023, to: 2026, trims: ['LE', 'XLE', 'Limited', 'Prime SE', 'Prime XSE', 'Prime XSE Premium'] },
  ],

  'TOYOTA|PRIUS PRIME': [
    { from: 2017, to: 2022, trims: ['Plus', 'Premium', 'Advanced'] },
    { from: 2023, to: 2026, trims: ['SE', 'XSE', 'XSE Premium'] },
  ],

  'TOYOTA|SEQUOIA': [
    { from: 2001, to: 2007, trims: ['SR5 2WD', 'SR5 4WD', 'Limited 2WD', 'Limited 4WD'] },
    { from: 2008, to: 2022, trims: ['SR5 2WD', 'SR5 4WD', 'Limited 2WD', 'Limited 4WD', 'Platinum 2WD', 'Platinum 4WD', 'TRD Pro 4WD'] },
    { from: 2023, to: 2026, trims: ['SR5', 'Limited', 'Platinum', 'TRD Pro', 'Capstone'] },
  ],

  'TOYOTA|SUPRA': [
    { from: 1993, to: 1998, trims: ['Base', 'Turbo'] },
    { from: 2020, to: 2024, trims: ['2.0', '3.0', '3.0 Premium', 'A91 Edition', 'A91-CF Edition', 'A91-MT Edition'] },
  ],

  'TOYOTA|FJ CRUISER': [
    { from: 2006, to: 2014, trims: ['Base 2WD', 'Base 4WD', 'Trail Teams 4WD'] },
  ],

  'TOYOTA|VENZA': [
    { from: 2009, to: 2015, trims: ['Base 2WD', 'Base AWD', 'XLE 2WD', 'XLE AWD', 'Limited 2WD', 'Limited AWD'] },
    { from: 2021, to: 2024, trims: ['LE', 'XLE', 'XLE Premium', 'Limited'] },
  ],

  'TOYOTA|AVALON': [
    { from: 1995, to: 1999, trims: ['XL', 'XLS'] },
    { from: 2000, to: 2004, trims: ['XL', 'XLS'] },
    { from: 2005, to: 2012, trims: ['XL', 'XLS', 'Limited', 'Touring'] },
    { from: 2013, to: 2018, trims: ['XLE', 'XLE Plus', 'XLE Premium', 'XLE Touring', 'Limited', 'Hybrid XLE', 'Hybrid XLE Plus', 'Hybrid XLE Premium', 'Hybrid Limited'] },
    { from: 2019, to: 2022, trims: ['XLE', 'XSE', 'XLE Premium', 'Limited', 'Touring', 'TRD', 'Hybrid XLE', 'Hybrid XSE', 'Hybrid XLE Premium', 'Hybrid Limited', 'Hybrid Touring'] },
  ],

  'TOYOTA|CELICA': [
    { from: 1994, to: 1999, trims: ['ST', 'GT', 'GT-S'] },
    { from: 2000, to: 2005, trims: ['GT', 'GT-S', 'Action Package'] },
  ],

  'TOYOTA|MATRIX': [
    { from: 2003, to: 2008, trims: ['Base 2WD', 'Base AWD', 'XR 2WD', 'XR AWD', 'XRS'] },
    { from: 2009, to: 2014, trims: ['Base', 'S', 'XRS'] },
  ],

  'TOYOTA|YARIS': [
    { from: 2006, to: 2012, trims: ['CE Hatchback', 'LE Hatchback', 'S Hatchback', 'Base Sedan', 'S Sedan'] },
    { from: 2012, to: 2020, trims: ['L Hatchback', 'LE Hatchback', 'SE Hatchback', 'L Sedan', 'LE Sedan'] },
    { from: 2020, to: 2020, trims: ['L', 'LE', 'XLE'] },
  ],

  'TOYOTA|ECHO': [
    { from: 2000, to: 2005, trims: ['Base Coupe', 'Base Sedan', 'Base Hatchback'] },
  ],

  'TOYOTA|LAND CRUISER': [
    { from: 1998, to: 2007, trims: ['Base'] },
    { from: 2008, to: 2021, trims: ['Base'] },
    { from: 2022, to: 2026, trims: ['1958', 'Standard', 'First Edition'] },
  ],

  'TOYOTA|GR86': [
    { from: 2022, to: 2026, trims: ['Base', 'Premium'] },
  ],

  'TOYOTA|GR COROLLA': [
    { from: 2023, to: 2026, trims: ['Core', 'Morizo Edition', 'Circuit Edition'] },
  ],

  'TOYOTA|COROLLA CROSS': [
    { from: 2022, to: 2026, trims: ['L', 'LE', 'XLE', 'Hybrid S', 'Hybrid SE', 'Hybrid XLE'] },
  ],

  // ── HONDA ────────────────────────────────────────────────────────────────────

  'HONDA|CIVIC': [
    { from: 1980, to: 1995, trims: ['DX', 'LX', 'EX', 'Si', 'CX', 'VX'] },
    { from: 1996, to: 2000, trims: ['CX', 'DX', 'LX', 'EX', 'HX', 'Si'] },
    { from: 2001, to: 2005, trims: ['DX', 'LX', 'EX', 'HX', 'Si', 'Hybrid'] },
    { from: 2006, to: 2011, trims: ['DX', 'LX', 'EX', 'EX-L', 'Si', 'Hybrid', 'GX'] },
    { from: 2012, to: 2015, trims: ['LX', 'EX', 'EX-L', 'Si', 'Hybrid', 'Hybrid-L', 'Natural Gas'] },
    { from: 2016, to: 2021, trims: ['LX', 'Sport', 'EX', 'EX-L', 'Touring', 'Si', 'Type R'] },
    { from: 2022, to: 2026, trims: ['LX', 'Sport', 'EX', 'Sport-L', 'Touring', 'Si', 'Type R'] },
  ],

  'HONDA|ACCORD': [
    { from: 1990, to: 1997, trims: ['DX', 'LX', 'EX', 'EX-R', 'SE'] },
    { from: 1998, to: 2002, trims: ['LX', 'EX', 'EX V6', 'SE'] },
    { from: 2003, to: 2007, trims: ['LX', 'LX V6', 'EX', 'EX V6', 'EX-L', 'EX-L V6'] },
    { from: 2008, to: 2012, trims: ['LX', 'LX-P', 'LX V6', 'EX', 'EX V6', 'EX-L', 'EX-L V6', 'Crosstour'] },
    { from: 2013, to: 2017, trims: ['LX', 'Sport', 'EX', 'EX-L', 'EX-L V6', 'Touring', 'Touring V6', 'Hybrid', 'Plug-In Hybrid'] },
    { from: 2018, to: 2022, trims: ['LX', 'Sport', 'Sport Special Edition', 'EX', 'EX-L', 'Touring', 'Hybrid Sport', 'Hybrid EX-L', 'Hybrid Touring'] },
    { from: 2023, to: 2026, trims: ['LX', 'Sport', 'Sport-L', 'EX-L', 'Touring', 'Hybrid Sport', 'Hybrid Sport-L', 'Hybrid EX-L', 'Hybrid Touring'] },
  ],

  'HONDA|CR-V': [
    { from: 1997, to: 2001, trims: ['LX 2WD', 'LX 4WD', 'EX 2WD', 'EX 4WD'] },
    { from: 2002, to: 2006, trims: ['LX 2WD', 'LX 4WD', 'EX 2WD', 'EX 4WD', 'SE 4WD'] },
    { from: 2007, to: 2011, trims: ['LX 2WD', 'LX 4WD', 'EX 2WD', 'EX 4WD', 'EX-L 2WD', 'EX-L 4WD'] },
    { from: 2012, to: 2016, trims: ['LX 2WD', 'LX AWD', 'EX 2WD', 'EX AWD', 'EX-L 2WD', 'EX-L AWD', 'EX-L Navi AWD', 'SE AWD'] },
    { from: 2017, to: 2022, trims: ['LX', 'EX', 'EX-L', 'Touring', 'Hybrid Sport', 'Hybrid EX', 'Hybrid EX-L', 'Hybrid Touring'] },
    { from: 2023, to: 2026, trims: ['LX', 'EX', 'Sport', 'EX-L', 'Sport-L', 'Touring', 'Hybrid Sport', 'Hybrid Sport-L', 'Hybrid EX-L', 'Hybrid Touring'] },
  ],

  'HONDA|PILOT': [
    { from: 2003, to: 2008, trims: ['LX 2WD', 'LX AWD', 'EX 2WD', 'EX AWD', 'EX-L 2WD', 'EX-L AWD'] },
    { from: 2009, to: 2015, trims: ['LX 2WD', 'LX AWD', 'EX 2WD', 'EX AWD', 'EX-L 2WD', 'EX-L AWD', 'Touring AWD'] },
    { from: 2016, to: 2022, trims: ['LX', 'EX', 'EX-L', 'Touring', 'Elite', 'Black Edition', 'Special Edition'] },
    { from: 2023, to: 2026, trims: ['Sport', 'EX-L', 'TrailSport', 'Touring', 'Elite', 'Black Edition'] },
  ],

  'HONDA|ODYSSEY': [
    { from: 1995, to: 1998, trims: ['Base', 'LX', 'EX'] },
    { from: 1999, to: 2004, trims: ['LX', 'EX', 'EX-L'] },
    { from: 2005, to: 2010, trims: ['LX', 'EX', 'EX-L', 'EX-L RES', 'Touring'] },
    { from: 2011, to: 2017, trims: ['LX', 'EX', 'EX-L', 'EX-L RES', 'Touring', 'Touring Elite', 'SE'] },
    { from: 2018, to: 2026, trims: ['LX', 'EX', 'EX-L', 'Touring', 'Elite'] },
  ],

  'HONDA|RIDGELINE': [
    { from: 2006, to: 2014, trims: ['RT', 'RTS', 'RTL', 'RTX'] },
    { from: 2017, to: 2026, trims: ['Sport', 'RTL', 'RTL-E', 'Black Edition'] },
  ],

  'HONDA|ELEMENT': [
    { from: 2003, to: 2011, trims: ['LX 2WD', 'LX AWD', 'EX 2WD', 'EX AWD', 'SC'] },
  ],

  'HONDA|FIT': [
    { from: 2007, to: 2008, trims: ['Base', 'Sport'] },
    { from: 2009, to: 2014, trims: ['Base', 'Sport', 'Twist'] },
    { from: 2015, to: 2020, trims: ['LX', 'Sport', 'EX', 'EX-L'] },
  ],

  'HONDA|HR-V': [
    { from: 2016, to: 2022, trims: ['LX 2WD', 'LX AWD', 'Sport 2WD', 'Sport AWD', 'EX 2WD', 'EX AWD', 'EX-L 2WD', 'EX-L AWD'] },
    { from: 2023, to: 2026, trims: ['LX', 'Sport', 'EX', 'EX-L'] },
  ],

  'HONDA|PASSPORT': [
    { from: 2019, to: 2026, trims: ['Sport AWD', 'EX-L AWD', 'Touring AWD', 'Elite AWD', 'TrailSport AWD'] },
  ],

  'HONDA|S2000': [
    { from: 2000, to: 2009, trims: ['Base', 'CR'] },
  ],

  'HONDA|INSIGHT': [
    { from: 2000, to: 2006, trims: ['Base', 'CVT'] },
    { from: 2010, to: 2014, trims: ['LX', 'EX', 'EX-L', 'Touring'] },
    { from: 2019, to: 2022, trims: ['LX', 'EX', 'Touring'] },
  ],

  // ── FORD ────────────────────────────────────────────────────────────────────

  'FORD|F-150': [
    { from: 1980, to: 1996, trims: ['Regular Cab Custom', 'Regular Cab XL', 'Regular Cab XLT', 'SuperCab XL', 'SuperCab XLT', 'Lightning'] },
    { from: 1997, to: 2003, trims: ['Regular Cab XL', 'Regular Cab XLT', 'Regular Cab Lariat', 'SuperCab XL', 'SuperCab XLT', 'SuperCab Lariat', 'SuperCrew XLT', 'SuperCrew Lariat', 'SuperCrew King Ranch', 'Lightning', 'Harley-Davidson'] },
    { from: 2004, to: 2008, trims: ['Regular Cab XL', 'Regular Cab STX', 'Regular Cab XLT', 'SuperCab XL', 'SuperCab STX', 'SuperCab XLT', 'SuperCab FX4', 'SuperCab Lariat', 'SuperCrew XLT', 'SuperCrew Lariat', 'SuperCrew King Ranch', 'SuperCrew Lariat FX4'] },
    { from: 2009, to: 2014, trims: ['Regular Cab XL', 'Regular Cab STX', 'Regular Cab XLT', 'SuperCab XL', 'SuperCab STX', 'SuperCab XLT', 'SuperCab Lariat', 'SuperCab FX2', 'SuperCab FX4', 'SuperCrew XLT', 'SuperCrew Lariat', 'SuperCrew King Ranch', 'SuperCrew Platinum', 'SuperCrew Harley-Davidson', 'SVT Raptor'] },
    { from: 2015, to: 2020, trims: ['XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Limited', 'Raptor'] },
    { from: 2021, to: 2026, trims: ['XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Limited', 'Raptor', 'Raptor R', 'Tremor'] },
  ],

  'FORD|F-250 SUPER DUTY': [
    { from: 1999, to: 2007, trims: ['Regular Cab XL', 'Regular Cab XLT', 'Regular Cab Lariat', 'SuperCab XL', 'SuperCab XLT', 'SuperCab Lariat', 'Crew Cab XL', 'Crew Cab XLT', 'Crew Cab Lariat', 'Crew Cab King Ranch'] },
    { from: 2008, to: 2016, trims: ['Regular Cab XL', 'Regular Cab XLT', 'Regular Cab Lariat', 'SuperCab XL', 'SuperCab XLT', 'SuperCab Lariat', 'SuperCab King Ranch', 'Crew Cab XL', 'Crew Cab XLT', 'Crew Cab Lariat', 'Crew Cab King Ranch', 'Crew Cab Platinum'] },
    { from: 2017, to: 2026, trims: ['XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Limited', 'Tremor'] },
  ],

  'FORD|F-350 SUPER DUTY': [
    { from: 1999, to: 2016, trims: ['Regular Cab XL', 'Regular Cab XLT', 'Regular Cab Lariat', 'SuperCab XL', 'SuperCab XLT', 'SuperCab Lariat', 'Crew Cab XL', 'Crew Cab XLT', 'Crew Cab Lariat', 'Crew Cab King Ranch', 'Crew Cab Platinum'] },
    { from: 2017, to: 2026, trims: ['XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Limited'] },
  ],

  'FORD|ESCAPE': [
    { from: 2001, to: 2007, trims: ['XLS 2WD', 'XLS AWD', 'XLT 2WD', 'XLT AWD', 'Limited 2WD', 'Limited AWD', 'Hybrid 2WD', 'Hybrid AWD'] },
    { from: 2008, to: 2012, trims: ['XLS 2WD', 'XLT 2WD', 'XLT AWD', 'Limited 2WD', 'Limited AWD', 'Hybrid 2WD', 'Hybrid AWD'] },
    { from: 2013, to: 2019, trims: ['S', 'SE', 'SEL', 'Titanium'] },
    { from: 2020, to: 2026, trims: ['S', 'SE', 'SEL', 'Titanium', 'Plug-In Hybrid SE', 'Plug-In Hybrid SEL', 'Plug-In Hybrid Titanium'] },
  ],

  'FORD|EXPLORER': [
    { from: 1991, to: 1994, trims: ['Base 2WD', 'Base 4WD', 'Sport 2WD', 'Sport 4WD', 'Eddie Bauer 2WD', 'Eddie Bauer 4WD'] },
    { from: 1995, to: 2001, trims: ['XL 2WD', 'XL 4WD', 'XLS 2WD', 'XLS 4WD', 'XLT 2WD', 'XLT 4WD', 'Eddie Bauer 2WD', 'Eddie Bauer 4WD', 'Limited 2WD', 'Limited 4WD', 'NBX 2WD', 'NBX 4WD'] },
    { from: 2002, to: 2010, trims: ['XLS 2WD', 'XLS AWD', 'XLT 2WD', 'XLT AWD', 'Eddie Bauer 2WD', 'Eddie Bauer AWD', 'Limited 2WD', 'Limited AWD', 'Sport Trac XLT', 'Sport Trac Limited', 'Sport Trac Adrenalin'] },
    { from: 2011, to: 2019, trims: ['Base', 'XLT', 'Limited', 'Limited 4WD', 'Sport', 'Platinum', 'XLT 4WD'] },
    { from: 2020, to: 2026, trims: ['Base', 'XLT', 'ST-Line', 'Timberline', 'Limited', 'ST', 'Platinum', 'King Ranch'] },
  ],

  'FORD|MUSTANG': [
    { from: 1980, to: 1993, trims: ['L', 'GL', 'LX', 'GT', 'GT 5.0', 'Cobra', 'SVO'] },
    { from: 1994, to: 2004, trims: ['Base', 'GT', 'Cobra', 'Mach 1', 'Bullitt'] },
    { from: 2005, to: 2014, trims: ['V6', 'V6 Premium', 'GT', 'GT Premium', 'Boss 302', 'Shelby GT500', 'Shelby GT500 Super Snake'] },
    { from: 2015, to: 2022, trims: ['EcoBoost', 'EcoBoost Premium', 'GT', 'GT Premium', 'GT350', 'GT350R', 'GT500', 'Mach 1', 'Bullitt'] },
    { from: 2024, to: 2026, trims: ['EcoBoost', 'EcoBoost Premium', 'GT', 'GT Premium', 'Dark Horse', 'GTD'] },
  ],

  'FORD|RANGER': [
    { from: 1983, to: 1992, trims: ['S', 'STX', 'XL', 'XLT', 'GT', 'Splash'] },
    { from: 1993, to: 2011, trims: ['XL Regular Cab', 'XL SuperCab', 'XLT Regular Cab', 'XLT SuperCab', 'Edge', 'Sport', 'FX4 Off-Road', 'Tremor'] },
    { from: 2019, to: 2023, trims: ['XL', 'XLT', 'Lariat', 'FX4 Off-Road'] },
    { from: 2024, to: 2026, trims: ['XL', 'XLT', 'Lariat', 'Raptor', 'Tremor'] },
  ],

  'FORD|BRONCO': [
    { from: 2021, to: 2026, trims: ['Base', 'Big Bend', 'Black Diamond', 'Outer Banks', 'Badlands', 'Wildtrak', 'Everglades', 'Raptor', 'Heritage', 'Heritage Limited'] },
  ],

  'FORD|EXPEDITION': [
    { from: 1997, to: 2002, trims: ['XLT 2WD', 'XLT 4WD', 'Eddie Bauer 2WD', 'Eddie Bauer 4WD'] },
    { from: 2003, to: 2006, trims: ['XLT 2WD', 'XLT 4WD', 'Eddie Bauer 2WD', 'Eddie Bauer 4WD', 'NBX 2WD', 'NBX 4WD', 'King Ranch 2WD', 'King Ranch 4WD', 'Limited 2WD', 'Limited 4WD'] },
    { from: 2007, to: 2017, trims: ['XLT', 'Eddie Bauer', 'Limited', 'King Ranch'] },
    { from: 2018, to: 2026, trims: ['XL', 'XLT', 'Limited', 'Timberline', 'King Ranch', 'Platinum', 'Stealth Edition'] },
  ],

  'FORD|FUSION': [
    { from: 2006, to: 2012, trims: ['S', 'SE', 'SEL', 'Sport', 'Hybrid'] },
    { from: 2013, to: 2020, trims: ['S', 'SE', 'SE Luxury', 'SEL', 'Titanium', 'Sport', 'Hybrid S', 'Hybrid SE', 'Hybrid Titanium', 'Energi SE', 'Energi Titanium'] },
  ],

  'FORD|FOCUS': [
    { from: 2000, to: 2007, trims: ['ZX3', 'ZX4', 'ZX5', 'ZXW', 'ZTS', 'SVT'] },
    { from: 2008, to: 2011, trims: ['S Sedan', 'SE Sedan', 'SES Sedan', 'SES Coupe', 'SEL'] },
    { from: 2012, to: 2018, trims: ['S', 'SE', 'SEL', 'Titanium', 'ST', 'RS', 'Electric'] },
  ],

  'FORD|EDGE': [
    { from: 2007, to: 2014, trims: ['SE 2WD', 'SE AWD', 'SEL 2WD', 'SEL AWD', 'Limited 2WD', 'Limited AWD', 'Sport AWD'] },
    { from: 2015, to: 2021, trims: ['SE', 'SEL', 'Titanium', 'Sport', 'ST'] },
  ],

  'FORD|MAVERICK': [
    { from: 2022, to: 2026, trims: ['XL', 'XLT', 'Lariat', 'Tremor'] },
  ],

  'FORD|BRONCO SPORT': [
    { from: 2021, to: 2026, trims: ['Base', 'Big Bend', 'Outer Banks', 'Badlands', 'First Edition'] },
  ],

  'FORD|TAURUS': [
    { from: 1986, to: 1995, trims: ['L', 'GL', 'LX', 'SHO'] },
    { from: 1996, to: 2007, trims: ['G', 'GL', 'LX', 'SE', 'SEL', 'SES', 'SHO'] },
    { from: 2010, to: 2019, trims: ['SE', 'SEL', 'Limited', 'SHO'] },
  ],

  // ── CHEVROLET ────────────────────────────────────────────────────────────────

  'CHEVROLET|SILVERADO 1500': [
    { from: 1988, to: 1998, trims: ['Regular Cab Cheyenne', 'Regular Cab Scottsdale', 'Regular Cab WT', 'Extended Cab WT', 'Extended Cab Scottsdale', 'Extended Cab 454 SS'] },
    { from: 1999, to: 2006, trims: ['Regular Cab WT', 'Regular Cab LS', 'Regular Cab LT', 'Extended Cab WT', 'Extended Cab LS', 'Extended Cab LT', 'Crew Cab LS', 'Crew Cab LT', 'SS'] },
    { from: 2007, to: 2013, trims: ['Regular Cab WT', 'Regular Cab LS', 'Regular Cab LT', 'Extended Cab WT', 'Extended Cab LS', 'Extended Cab LT', 'Extended Cab LTZ', 'Crew Cab LS', 'Crew Cab LT', 'Crew Cab LTZ', 'Crew Cab Hybrid'] },
    { from: 2014, to: 2018, trims: ['WT', 'LS', 'LT', 'LTZ', 'High Country'] },
    { from: 2019, to: 2026, trims: ['WT', 'Custom', 'Custom Trail Boss', 'LT', 'LT Trail Boss', 'RST', 'LTZ', 'Trail Boss', 'High Country', 'ZR2'] },
  ],

  'CHEVROLET|SILVERADO 2500HD': [
    { from: 2001, to: 2014, trims: ['Regular Cab WT', 'Regular Cab LS', 'Regular Cab LT', 'Extended Cab WT', 'Extended Cab LT', 'Crew Cab LS', 'Crew Cab LT', 'Crew Cab LTZ'] },
    { from: 2015, to: 2026, trims: ['WT', 'Custom', 'LT', 'LTZ', 'High Country'] },
  ],

  'CHEVROLET|SILVERADO 3500HD': [
    { from: 2001, to: 2014, trims: ['Regular Cab WT', 'Regular Cab LS', 'Regular Cab LT', 'Extended Cab WT', 'Extended Cab LT', 'Crew Cab LS', 'Crew Cab LT', 'Crew Cab LTZ'] },
    { from: 2015, to: 2026, trims: ['WT', 'Custom', 'LT', 'LTZ', 'High Country'] },
  ],

  'CHEVROLET|EQUINOX': [
    { from: 2005, to: 2009, trims: ['LS 2WD', 'LS AWD', 'LT 2WD', 'LT AWD', 'Sport 2WD', 'Sport AWD'] },
    { from: 2010, to: 2017, trims: ['LS 2WD', 'LS AWD', 'LT 2WD', 'LT AWD', 'LTZ 2WD', 'LTZ AWD'] },
    { from: 2018, to: 2026, trims: ['LS', 'LT', 'RS', 'Premier'] },
  ],

  'CHEVROLET|TRAVERSE': [
    { from: 2009, to: 2017, trims: ['LS', 'LT', 'LTZ', 'Premier'] },
    { from: 2018, to: 2026, trims: ['LS', 'LT', 'RS', 'Premier', 'High Country'] },
  ],

  'CHEVROLET|TAHOE': [
    { from: 1992, to: 1999, trims: ['2-door 2WD', '2-door 4WD', '4-door LS 2WD', '4-door LS 4WD', '4-door LT 4WD'] },
    { from: 2000, to: 2006, trims: ['LS 2WD', 'LS 4WD', 'LT 2WD', 'LT 4WD', 'Z71 4WD'] },
    { from: 2007, to: 2014, trims: ['LS', 'LT', 'LTZ', 'Hybrid'] },
    { from: 2015, to: 2020, trims: ['LS', 'LT', 'LTZ', 'Premier'] },
    { from: 2021, to: 2026, trims: ['LS', 'LT', 'RST', 'Z71', 'Premier', 'High Country'] },
  ],

  'CHEVROLET|SUBURBAN': [
    { from: 1992, to: 1999, trims: ['C1500', 'C2500', 'K1500', 'K2500', 'LS', 'LT'] },
    { from: 2000, to: 2006, trims: ['LS 2WD', 'LS 4WD', 'LT 2WD', 'LT 4WD', 'Z71 4WD'] },
    { from: 2007, to: 2014, trims: ['LS', 'LT', 'LTZ'] },
    { from: 2015, to: 2020, trims: ['LS', 'LT', 'LTZ', 'Premier'] },
    { from: 2021, to: 2026, trims: ['LS', 'LT', 'RST', 'Z71', 'Premier', 'High Country'] },
  ],

  'CHEVROLET|CAMARO': [
    { from: 1982, to: 1992, trims: ['Sport Coupe', 'Berlinetta', 'Z28', 'IROC-Z', 'RS', 'Heritage Edition'] },
    { from: 1993, to: 2002, trims: ['Base', 'RS', 'Z28', 'SS', 'Indy Pace Car'] },
    { from: 2010, to: 2015, trims: ['LS', 'LT', 'LT RS', 'SS', 'SS RS', 'ZL1', 'Z/28'] },
    { from: 2016, to: 2024, trims: ['LS', 'LT', 'LT1', 'RS', 'SS', 'ZL1', 'ZL1 1LE', 'COPO'] },
  ],

  'CHEVROLET|COLORADO': [
    { from: 2004, to: 2012, trims: ['Regular Cab WT', 'Extended Cab WT', 'Extended Cab LT', 'Extended Cab Z71', 'Crew Cab LT', 'Crew Cab Z71'] },
    { from: 2015, to: 2022, trims: ['WT', 'LT', 'Z71', 'ZR2'] },
    { from: 2023, to: 2026, trims: ['WT', 'LT', 'Z71', 'ZR2', 'ZR2 Bison'] },
  ],

  'CHEVROLET|IMPALA': [
    { from: 2000, to: 2005, trims: ['Base', 'LS', 'SS'] },
    { from: 2006, to: 2013, trims: ['LS', 'LT', 'LTZ', 'SS', 'Police'] },
    { from: 2014, to: 2020, trims: ['LS', 'LT', 'Premier', 'Limited LS', 'Limited LT', 'Limited Premier'] },
  ],

  'CHEVROLET|MALIBU': [
    { from: 1997, to: 2003, trims: ['Base', 'LS'] },
    { from: 2004, to: 2007, trims: ['LS', 'LT', 'LTZ', 'SS', 'Maxx LS', 'Maxx LT', 'Maxx LTZ'] },
    { from: 2008, to: 2012, trims: ['LS', 'LT', 'LTZ', 'Hybrid'] },
    { from: 2013, to: 2016, trims: ['LS', 'LT', 'LTZ', 'Eco'] },
    { from: 2016, to: 2024, trims: ['L', 'LS', 'RS', 'LT', 'Premier'] },
  ],

  'CHEVROLET|TRAILBLAZER': [
    { from: 2002, to: 2009, trims: ['LS 2WD', 'LS 4WD', 'LT 2WD', 'LT 4WD', 'LTZ 2WD', 'LTZ 4WD', 'SS 2WD', 'SS AWD', 'Envoy SLE', 'Envoy SLT', 'Envoy Denali', 'EXT LS', 'EXT LT'] },
    { from: 2021, to: 2026, trims: ['LS', 'LT', 'ACTIV', 'RS'] },
  ],

  'CHEVROLET|CRUZE': [
    { from: 2011, to: 2016, trims: ['LS', 'LT', 'LTZ', 'Eco'] },
    { from: 2016, to: 2019, trims: ['L', 'LS', 'LT', 'Premier', 'Diesel LT', 'Diesel Premier'] },
  ],

  'CHEVROLET|CORVETTE': [
    { from: 1980, to: 1996, trims: ['Base', 'Z51', 'Grand Sport', 'ZR-1', 'Collector Edition', 'Pace Car'] },
    { from: 1997, to: 2004, trims: ['Base', 'Z06', 'Pace Car', '50th Anniversary'] },
    { from: 2005, to: 2013, trims: ['Base', 'Z06', 'Grand Sport', 'ZR1', 'Jake Edition', '427 Convertible'] },
    { from: 2014, to: 2019, trims: ['Stingray', 'Stingray Z51', 'Grand Sport', 'Grand Sport Z07', 'Z06', 'Z06 Z07', 'ZR1'] },
    { from: 2020, to: 2026, trims: ['Stingray 1LT', 'Stingray 2LT', 'Stingray 3LT', 'Z51', 'IMSA GTLM Championship', 'E-Ray', 'Z06', 'ZR1'] },
  ],

  // ── GMC ─────────────────────────────────────────────────────────────────────

  'GMC|SIERRA 1500': [
    { from: 1999, to: 2006, trims: ['Regular Cab SL', 'Regular Cab SLE', 'Extended Cab SLE', 'Extended Cab SLT', 'Crew Cab SLE', 'Crew Cab SLT', 'Denali'] },
    { from: 2007, to: 2013, trims: ['Regular Cab SL', 'Regular Cab SLE', 'Extended Cab SLE', 'Extended Cab SLT', 'Crew Cab SLE', 'Crew Cab SLT', 'Crew Cab Denali'] },
    { from: 2014, to: 2018, trims: ['SL', 'SLE', 'SLT', 'All Terrain X', 'Denali'] },
    { from: 2019, to: 2026, trims: ['Pro', 'SLE', 'Elevation', 'SLT', 'AT4', 'AT4X', 'Denali', 'Denali Ultimate'] },
  ],

  'GMC|SIERRA 2500HD': [
    { from: 2001, to: 2014, trims: ['Regular Cab SL', 'Regular Cab SLE', 'Extended Cab SLE', 'Extended Cab SLT', 'Crew Cab SLE', 'Crew Cab SLT', 'Crew Cab Denali'] },
    { from: 2015, to: 2026, trims: ['SLE', 'SLT', 'AT4', 'Denali'] },
  ],

  'GMC|SIERRA 3500HD': [
    { from: 2001, to: 2014, trims: ['Regular Cab SL', 'Regular Cab SLE', 'Extended Cab SLE', 'Extended Cab SLT', 'Crew Cab SLE', 'Crew Cab SLT', 'Crew Cab Denali'] },
    { from: 2015, to: 2026, trims: ['SLE', 'SLT', 'AT4', 'Denali'] },
  ],

  'GMC|YUKON': [
    { from: 1992, to: 1999, trims: ['SLE 2WD', 'SLE 4WD', 'SLT 4WD'] },
    { from: 2000, to: 2006, trims: ['SLE 2WD', 'SLE 4WD', 'SLT 2WD', 'SLT 4WD', 'Denali AWD'] },
    { from: 2007, to: 2014, trims: ['SLE', 'SLT', 'Denali'] },
    { from: 2015, to: 2020, trims: ['SLE', 'SLT', 'Denali'] },
    { from: 2021, to: 2026, trims: ['SLE', 'SLT', 'AT4', 'Denali', 'Denali Ultimate'] },
  ],

  'GMC|ACADIA': [
    { from: 2007, to: 2016, trims: ['SLE-1', 'SLE-2', 'SLT-1', 'SLT-2', 'Denali', 'Limited'] },
    { from: 2017, to: 2023, trims: ['SL', 'SLE', 'SLT', 'Denali', 'AT4'] },
    { from: 2024, to: 2026, trims: ['SLE', 'SLT', 'AT4', 'Denali', 'Denali Ultimate'] },
  ],

  'GMC|TERRAIN': [
    { from: 2010, to: 2017, trims: ['SLE-1', 'SLE-2', 'SLT-1', 'SLT-2', 'Denali'] },
    { from: 2018, to: 2026, trims: ['SLE', 'SLT', 'AT4', 'Denali'] },
  ],

  'GMC|CANYON': [
    { from: 2004, to: 2012, trims: ['Regular Cab SL', 'Extended Cab SLE', 'Extended Cab SLT', 'Crew Cab SLE', 'Crew Cab SLT'] },
    { from: 2015, to: 2022, trims: ['Base', 'SLE', 'SLT', 'All Terrain', 'Denali', 'AT4'] },
    { from: 2023, to: 2026, trims: ['Elevation', 'AT4', 'AT4X', 'Denali'] },
  ],

  // ── DODGE / RAM / JEEP / CHRYSLER ────────────────────────────────────────────

  'DODGE|CHALLENGER': [
    { from: 2008, to: 2014, trims: ['SE', 'R/T', 'R/T Classic', 'SRT8', 'SRT8 392', 'SRT8 Core'] },
    { from: 2015, to: 2023, trims: ['SXT', 'SXT Plus', 'GT AWD', 'R/T', 'R/T Plus', 'R/T Scat Pack', 'R/T Scat Pack Widebody', 'SRT 392', 'SRT Hellcat', 'SRT Hellcat Widebody', 'SRT Hellcat Redeye', 'SRT Hellcat Redeye Widebody', 'SRT Super Stock', 'Demon', 'Demon 170', 'Last Call'] },
  ],

  'DODGE|CHARGER': [
    { from: 2006, to: 2010, trims: ['SE', 'SXT', 'R/T', 'SRT8', 'Police'] },
    { from: 2011, to: 2014, trims: ['SE', 'SXT', 'R/T', 'R/T Max', 'SRT8', 'SRT8 392', 'Police'] },
    { from: 2015, to: 2023, trims: ['SXT', 'SXT AWD', 'GT AWD', 'R/T', 'R/T Scat Pack', 'R/T Scat Pack Widebody', 'SRT 392', 'SRT Hellcat', 'SRT Hellcat Widebody', 'SRT Hellcat Redeye', 'SRT Hellcat Redeye Widebody', 'Police', 'Pursuit'] },
  ],

  'DODGE|DURANGO': [
    { from: 1998, to: 2003, trims: ['Base 2WD', 'Base 4WD', 'SLT 2WD', 'SLT 4WD', 'R/T 4WD'] },
    { from: 2004, to: 2009, trims: ['SXT 2WD', 'SXT AWD', 'SLT 2WD', 'SLT AWD', 'Limited 2WD', 'Limited AWD'] },
    { from: 2011, to: 2013, trims: ['Express', 'Heat', 'SXT', 'Crew', 'R/T', 'Citadel'] },
    { from: 2014, to: 2026, trims: ['SXT', 'SXT Plus AWD', 'GT AWD', 'GT Plus AWD', 'Citadel AWD', 'R/T AWD', 'SRT 392 AWD', 'SRT Hellcat AWD', 'Pursuit'] },
  ],

  'DODGE|GRAND CARAVAN': [
    { from: 1984, to: 1995, trims: ['Base', 'SE', 'LE', 'ES', 'Grand SE', 'Grand LE'] },
    { from: 1996, to: 2007, trims: ['SE', 'Sport', 'ES', 'SXT', 'EX'] },
    { from: 2008, to: 2020, trims: ['SE', 'SE Plus', 'AVP', 'SXT', 'GT', 'Crew', 'R/T', 'Blacktop'] },
  ],

  'DODGE|DAKOTA': [
    { from: 1987, to: 1996, trims: ['Regular Cab Base', 'Regular Cab LE', 'Club Cab LE', 'Club Cab Sport', 'RT'] },
    { from: 1997, to: 2004, trims: ['Regular Cab Base', 'Regular Cab SLT', 'Club Cab SLT', 'Quad Cab SLT', 'Quad Cab Sport', 'Quad Cab R/T', 'Quad Cab SXT'] },
    { from: 2005, to: 2011, trims: ['Regular Cab ST', 'Club Cab ST', 'Club Cab SLT', 'Quad Cab ST', 'Quad Cab SLT', 'Quad Cab TRX4', 'Quad Cab Sport', 'Quad Cab Laramie'] },
  ],

  'RAM|1500': [
    { from: 1994, to: 2001, trims: ['Regular Cab WS', 'Regular Cab ST', 'Regular Cab SLT', 'Quad Cab ST', 'Quad Cab SLT', 'Quad Cab Laramie'] },
    { from: 2002, to: 2008, trims: ['Regular Cab ST', 'Regular Cab SLT', 'Quad Cab ST', 'Quad Cab SLT', 'Quad Cab Laramie', 'Mega Cab Laramie', 'SRT-10'] },
    { from: 2009, to: 2018, trims: ['Regular Cab Tradesman', 'Regular Cab ST', 'Quad Cab Tradesman', 'Quad Cab ST', 'Quad Cab Express', 'Quad Cab SLT', 'Quad Cab Big Horn', 'Crew Cab Big Horn', 'Crew Cab Laramie', 'Crew Cab Longhorn', 'Crew Cab Limited', 'Rebel', 'Sport'] },
    { from: 2019, to: 2026, trims: ['Tradesman', 'Big Horn', 'Lone Star', 'Laramie', 'Sport', 'Rebel', 'Laramie Longhorn', 'Limited', 'Limited Longhorn', 'TRX'] },
  ],

  'RAM|2500': [
    { from: 1994, to: 2009, trims: ['Regular Cab ST', 'Regular Cab SLT', 'Quad Cab SLT', 'Mega Cab Laramie', 'Power Wagon'] },
    { from: 2010, to: 2026, trims: ['Tradesman', 'Big Horn', 'Lone Star', 'Laramie', 'Power Wagon', 'Laramie Longhorn', 'Limited', 'Limited Longhorn'] },
  ],

  'RAM|3500': [
    { from: 1994, to: 2009, trims: ['Regular Cab ST', 'Regular Cab SLT', 'Quad Cab SLT', 'Mega Cab Laramie'] },
    { from: 2010, to: 2026, trims: ['Tradesman', 'Big Horn', 'Lone Star', 'Laramie', 'Laramie Longhorn', 'Limited', 'Limited Longhorn'] },
  ],

  'JEEP|WRANGLER': [
    { from: 1987, to: 1995, trims: ['YJ Base', 'YJ S', 'YJ Sahara', 'YJ Renegade', 'YJ Islander', 'YJ Rio Grande'] },
    { from: 1997, to: 2006, trims: ['TJ SE', 'TJ Sport', 'TJ Sahara', 'TJ Rubicon', 'TJ X', 'TJ Unlimited'] },
    { from: 2007, to: 2018, trims: ['X 2-door', 'Sport 2-door', 'Sport 4-door', 'Sahara 2-door', 'Sahara 4-door', 'Rubicon 2-door', 'Rubicon 4-door', 'Polar', 'Freedom Edition', 'Hard Rock'] },
    { from: 2018, to: 2026, trims: ['Sport', 'Sport S', 'Willys Sport', 'Willys', 'Sahara', 'Sahara Altitude', 'Rubicon', 'Rubicon 392', '4xe', 'High Altitude', 'Xtreme Recon'] },
  ],

  'JEEP|GRAND CHEROKEE': [
    { from: 1993, to: 1998, trims: ['SE 2WD', 'SE 4WD', 'Laredo 2WD', 'Laredo 4WD', 'Limited 4WD', 'Orvis', 'TSi'] },
    { from: 1999, to: 2004, trims: ['Laredo 2WD', 'Laredo 4WD', 'Limited 2WD', 'Limited 4WD', 'Overland 4WD', 'Freedom Edition'] },
    { from: 2005, to: 2010, trims: ['Laredo 2WD', 'Laredo 4WD', 'Limited 2WD', 'Limited 4WD', 'Overland 4WD', 'SRT8 AWD'] },
    { from: 2011, to: 2021, trims: ['Laredo', 'Laredo X', 'Altitude', 'Limited', 'Overland', 'Summit', 'Trailhawk', 'SRT', 'Trackhawk'] },
    { from: 2022, to: 2026, trims: ['Laredo', 'Altitude', 'Limited', 'Overland', 'Summit', 'Summit Reserve', 'Trailhawk', 'SRT', 'Trackhawk', '4xe', 'High Altitude'] },
  ],

  'JEEP|CHEROKEE': [
    { from: 1984, to: 2001, trims: ['XJ Base', 'XJ Pioneer', 'XJ Chief', 'XJ Sport', 'XJ Classic', 'XJ Country', 'XJ Limited', 'XJ Orvis'] },
    { from: 2014, to: 2023, trims: ['Sport', 'Latitude', 'Latitude Plus', 'Altitude', 'Trailhawk', 'Overland', 'Limited', '80th Anniversary'] },
  ],

  'JEEP|GLADIATOR': [
    { from: 2020, to: 2026, trims: ['Sport', 'Sport S', 'Willys Sport', 'Willys', 'Overland', 'Rubicon', 'Mojave', 'High Altitude', 'Farout'] },
  ],

  'JEEP|COMPASS': [
    { from: 2007, to: 2017, trims: ['Sport 2WD', 'Sport 4WD', 'Latitude 2WD', 'Latitude 4WD', 'Limited 2WD', 'Limited 4WD', 'Trailhawk 4WD'] },
    { from: 2017, to: 2026, trims: ['Sport', 'Latitude', 'Latitude Lux', 'Altitude', 'Limited', 'Trailhawk'] },
  ],

  'JEEP|LIBERTY': [
    { from: 2002, to: 2012, trims: ['Sport 2WD', 'Sport 4WD', 'Limited 2WD', 'Limited 4WD', 'Renegade 4WD', 'Rocky Mountain Edition'] },
  ],

  // ── SUBARU ────────────────────────────────────────────────────────────────────

  'SUBARU|OUTBACK': [
    { from: 1995, to: 1999, trims: ['Base AWD', 'Brighton AWD', 'Limited AWD'] },
    { from: 2000, to: 2004, trims: ['Base AWD', 'L.L. Bean AWD', 'Limited AWD', 'VDC AWD'] },
    { from: 2005, to: 2009, trims: ['2.5i AWD', '2.5i Limited AWD', '2.5XT AWD', '2.5XT Limited AWD', '3.0R AWD', '3.0R VDC AWD'] },
    { from: 2010, to: 2014, trims: ['2.5i AWD', '2.5i Premium AWD', '2.5i Limited AWD', '3.6R Premium AWD', '3.6R Limited AWD'] },
    { from: 2015, to: 2019, trims: ['2.5i', '2.5i Premium', '2.5i Limited', '3.6R Touring', '2.5i Touring', 'Sport'] },
    { from: 2020, to: 2026, trims: ['Base', 'Premium', 'Limited', 'Limited XT', 'Touring', 'Touring XT', 'Wilderness', 'Onyx Edition', 'Onyx Edition XT'] },
  ],

  'SUBARU|FORESTER': [
    { from: 1998, to: 2002, trims: ['L AWD', 'S AWD'] },
    { from: 2003, to: 2008, trims: ['X AWD', 'XS AWD', 'XT AWD', 'XT Limited AWD', 'LL Bean AWD'] },
    { from: 2009, to: 2013, trims: ['2.5X AWD', '2.5X Premium AWD', '2.5X Limited AWD', '2.5X Touring AWD', '2.5XT AWD', '2.5XT Premium AWD', '2.5XT Limited AWD', '2.5XT Touring AWD'] },
    { from: 2014, to: 2018, trims: ['2.5i', '2.5i Premium', '2.5i Limited', '2.5i Touring', '2.0XT Premium', '2.0XT Touring'] },
    { from: 2019, to: 2026, trims: ['Base', 'Premium', 'Sport', 'Limited', 'Touring', 'Wilderness'] },
  ],

  'SUBARU|CROSSTREK': [
    { from: 2013, to: 2017, trims: ['2.0i', '2.0i Premium', '2.0i Limited', 'Hybrid'] },
    { from: 2018, to: 2023, trims: ['Base', 'Premium', 'Limited', 'Sport', 'Hybrid', 'Wilderness'] },
    { from: 2024, to: 2026, trims: ['Base', 'Premium', 'Sport', 'Limited', 'Wilderness'] },
  ],

  'SUBARU|IMPREZA': [
    { from: 1993, to: 2001, trims: ['L AWD', 'LX AWD', 'LS AWD', 'Brighton AWD', 'RS AWD', 'Outback Sport AWD'] },
    { from: 2002, to: 2007, trims: ['Base AWD', '2.5RS AWD', '2.5TS AWD', 'WRX AWD', 'WRX STi AWD', 'Outback Sport AWD'] },
    { from: 2008, to: 2014, trims: ['2.5i', '2.5i Premium', '2.5i Limited', 'WRX', 'WRX Premium', 'WRX Limited', 'WRX STi', 'WRX STi Limited', 'Outback Sport'] },
    { from: 2017, to: 2026, trims: ['Base', 'Premium', 'Sport', 'Limited'] },
  ],

  'SUBARU|WRX': [
    { from: 2015, to: 2021, trims: ['Base', 'Premium', 'Limited', 'STI', 'STI Limited', 'STI Sport', 'STI Series.Gray', 'STI S209'] },
    { from: 2022, to: 2026, trims: ['Base', 'Premium', 'Limited', 'GT', 'tS'] },
  ],

  'SUBARU|LEGACY': [
    { from: 1990, to: 1994, trims: ['Base AWD', 'L AWD', 'LS AWD', 'Sport AWD', 'Touring AWD'] },
    { from: 2000, to: 2004, trims: ['L AWD', 'GT AWD', 'GT Limited AWD', 'L.L. Bean AWD'] },
    { from: 2005, to: 2009, trims: ['2.5i AWD', '2.5i Limited AWD', '2.5GT AWD', '2.5GT Limited AWD', '2.5GT spec.B AWD', '3.0R AWD', '3.0R VDC AWD'] },
    { from: 2010, to: 2014, trims: ['2.5i AWD', '2.5i Premium AWD', '2.5i Limited AWD', '2.5i Sport AWD', '2.5GT AWD', '3.6R Premium AWD', '3.6R Limited AWD'] },
    { from: 2015, to: 2019, trims: ['2.5i', '2.5i Premium', '2.5i Sport', '2.5i Limited', '3.6R Premium', '3.6R Limited', '3.6R Touring'] },
    { from: 2020, to: 2026, trims: ['Base', 'Premium', 'Sport', 'Limited', 'Limited XT', 'Touring XT'] },
  ],

  'SUBARU|ASCENT': [
    { from: 2019, to: 2026, trims: ['Base', 'Premium', 'Limited', 'Touring', 'Onyx Edition'] },
  ],

  'SUBARU|BRZ': [
    { from: 2013, to: 2021, trims: ['Premium', 'Limited', 'Series.Gray', 'tS', 'STI Performance'] },
    { from: 2022, to: 2026, trims: ['Premium', 'Limited', 'tS'] },
  ],

  // ── NISSAN ────────────────────────────────────────────────────────────────────

  'NISSAN|ALTIMA': [
    { from: 1993, to: 1997, trims: ['XE', 'GXE', 'GLE', 'SE'] },
    { from: 1998, to: 2001, trims: ['XE', 'GXE', 'GLE', 'SE', 'SE-R'] },
    { from: 2002, to: 2006, trims: ['S', 'SE', 'SE-R', 'SE-R Spec V', 'SL'] },
    { from: 2007, to: 2012, trims: ['S', 'S CVT', 'SE', 'SL', '3.5 SE', '3.5 SL', 'Hybrid'] },
    { from: 2013, to: 2018, trims: ['S', 'SV', 'SL', 'S Sedan', 'SR', 'Hybrid SV', 'Hybrid SL'] },
    { from: 2019, to: 2026, trims: ['S', 'SR', 'SV', 'SL', 'Platinum', 'Edition One'] },
  ],

  'NISSAN|ROGUE': [
    { from: 2008, to: 2013, trims: ['S 2WD', 'S AWD', 'SL 2WD', 'SL AWD', 'Krom Edition'] },
    { from: 2014, to: 2020, trims: ['S', 'SV', 'SL', 'Midnight Edition', 'Sport S', 'Sport SV', 'Sport SL'] },
    { from: 2021, to: 2026, trims: ['S', 'SV', 'SL', 'Platinum', 'Rock Creek'] },
  ],

  'NISSAN|FRONTIER': [
    { from: 1998, to: 2004, trims: ['XE Regular Cab', 'SE Regular Cab', 'XE King Cab', 'SE King Cab', 'SC King Cab', 'Crew Cab SE', 'Desert Runner'] },
    { from: 2005, to: 2021, trims: ['King Cab S', 'King Cab SV', 'King Cab Pro-4X', 'Crew Cab S', 'Crew Cab SV', 'Crew Cab Pro-4X', 'Crew Cab PRO-X', 'Crew Cab SL', 'Desert Runner', 'Midnight Edition'] },
    { from: 2022, to: 2026, trims: ['King Cab S', 'King Cab SV', 'Crew Cab S', 'Crew Cab SV', 'Crew Cab Pro-4X', 'Crew Cab PRO-X', 'Crew Cab SL'] },
  ],

  'NISSAN|PATHFINDER': [
    { from: 1987, to: 1995, trims: ['XE 2WD', 'XE 4WD', 'SE 4WD', 'LE 4WD'] },
    { from: 1996, to: 2004, trims: ['XE 2WD', 'XE 4WD', 'SE 2WD', 'SE 4WD', 'LE 4WD', 'SE Off-Road 4WD'] },
    { from: 2005, to: 2012, trims: ['S 2WD', 'S 4WD', 'SE 2WD', 'SE 4WD', 'LE 2WD', 'LE 4WD', 'SE Off-Road 4WD', 'Silver Edition'] },
    { from: 2013, to: 2021, trims: ['S', 'SV', 'SL', 'Platinum', 'Rock Creek', 'Midnight Edition'] },
    { from: 2022, to: 2026, trims: ['S', 'SV', 'SL', 'Rock Creek', 'Platinum'] },
  ],

  'NISSAN|TITAN': [
    { from: 2004, to: 2015, trims: ['King Cab XE 2WD', 'King Cab XE 4WD', 'King Cab SE 2WD', 'King Cab SE 4WD', 'King Cab LE 4WD', 'Crew Cab SE 2WD', 'Crew Cab SE 4WD', 'Crew Cab LE 4WD', 'Crew Cab PRO-4X 4WD'] },
    { from: 2016, to: 2026, trims: ['King Cab S', 'King Cab SV', 'Crew Cab S', 'Crew Cab SV', 'Crew Cab Pro-4X', 'Crew Cab Platinum Reserve', 'XD S', 'XD SV', 'XD Pro-4X', 'XD Platinum Reserve'] },
  ],

  'NISSAN|MURANO': [
    { from: 2003, to: 2007, trims: ['S AWD', 'SE AWD', 'SL AWD'] },
    { from: 2009, to: 2014, trims: ['S', 'SV', 'SL', 'LE', 'CrossCabriolet'] },
    { from: 2015, to: 2026, trims: ['S', 'SV', 'SL', 'Platinum', 'Midnight Edition'] },
  ],

  'NISSAN|MAXIMA': [
    { from: 1995, to: 2003, trims: ['GXE', 'GLE', 'SE', 'SE 20th Anniversary'] },
    { from: 2004, to: 2008, trims: ['S', 'SE', 'SL'] },
    { from: 2009, to: 2014, trims: ['S', 'SV', 'SV Sport', 'SL'] },
    { from: 2016, to: 2023, trims: ['S', 'SV', 'SR', 'SL', 'Platinum', 'Midnight Edition', '40th Anniversary'] },
  ],

  'NISSAN|SENTRA': [
    { from: 1995, to: 2006, trims: ['XE', 'GXE', 'GLE', 'SE', 'SE-R', 'SE-R Spec V', 'CA'] },
    { from: 2007, to: 2012, trims: ['2.0', '2.0 S', '2.0 SL', 'SE-R', 'SE-R Spec V'] },
    { from: 2013, to: 2019, trims: ['FE+S', 'S', 'SV', 'SR', 'SR Turbo', 'SL', 'NISMO'] },
    { from: 2020, to: 2026, trims: ['S', 'SR', 'SV', 'SL'] },
  ],

  'NISSAN|ARMADA': [
    { from: 2004, to: 2015, trims: ['SE 2WD', 'SE 4WD', 'LE 2WD', 'LE 4WD', 'SL 4WD', 'Platinum Reserve 4WD', 'Titanium 4WD'] },
    { from: 2017, to: 2026, trims: ['S', 'SV', 'SL', 'Platinum', 'Platinum Reserve', 'Midnight Edition'] },
  ],

  // ── HYUNDAI / KIA ─────────────────────────────────────────────────────────────

  'HYUNDAI|TUCSON': [
    { from: 2005, to: 2009, trims: ['GLS 2WD', 'GLS AWD', 'SE 2WD', 'SE AWD', 'Limited 2WD', 'Limited AWD'] },
    { from: 2010, to: 2015, trims: ['GLS 2WD', 'GLS AWD', 'Limited 2WD', 'Limited AWD'] },
    { from: 2016, to: 2021, trims: ['SE 2WD', 'SE AWD', 'Value 2WD', 'Value AWD', 'SEL 2WD', 'SEL AWD', 'Sport 2WD', 'Sport AWD', 'Limited 2WD', 'Limited AWD', 'Ultimate 2WD', 'Ultimate AWD'] },
    { from: 2022, to: 2026, trims: ['SE', 'SEL', 'N Line', 'XRT', 'Limited', 'Plug-In Hybrid SE', 'Plug-In Hybrid SEL', 'Plug-In Hybrid Limited'] },
  ],

  'HYUNDAI|SANTA FE': [
    { from: 2001, to: 2006, trims: ['GLS 2WD', 'GLS AWD', 'LX 2WD', 'LX AWD'] },
    { from: 2007, to: 2012, trims: ['GLS 2WD', 'GLS AWD', 'SE 2WD', 'SE AWD', 'Limited 2WD', 'Limited AWD', 'Sport 2WD', 'Sport AWD'] },
    { from: 2013, to: 2018, trims: ['GLS', 'Sport 2WD', 'Sport AWD', 'Sport 2.0T AWD', 'Limited 2WD', 'Limited AWD', 'Limited Ultimate AWD'] },
    { from: 2019, to: 2026, trims: ['SE', 'SEL', 'SEL Plus', 'XRT', 'Limited', 'Calligraphy'] },
  ],

  'HYUNDAI|ELANTRA': [
    { from: 1992, to: 2000, trims: ['Base', 'GLS', 'GT'] },
    { from: 2001, to: 2006, trims: ['GLS', 'GT', 'GLS Sport'] },
    { from: 2007, to: 2010, trims: ['GLS', 'SE'] },
    { from: 2011, to: 2016, trims: ['GLS', 'Limited', 'Sport', 'SE', 'GT', 'Coupe GS', 'Coupe SE'] },
    { from: 2017, to: 2020, trims: ['SE', 'Eco', 'Value Edition', 'SEL', 'Sport', 'Limited'] },
    { from: 2021, to: 2026, trims: ['SE', 'SEL', 'N Line', 'Limited', 'N', 'Hybrid Blue', 'Hybrid SEL', 'Hybrid N Line', 'Hybrid Limited'] },
  ],

  'HYUNDAI|SONATA': [
    { from: 1999, to: 2005, trims: ['GLS', 'LX'] },
    { from: 2006, to: 2010, trims: ['GLS', 'SE', 'Limited', 'Sport'] },
    { from: 2011, to: 2014, trims: ['GLS', 'SE', 'Limited', 'Sport', 'Hybrid', 'Hybrid SE', 'Hybrid Limited'] },
    { from: 2015, to: 2019, trims: ['SE', 'Eco', 'Sport', 'Sport 2.0T', 'SE 2.4L', 'Limited 2.0T', 'Limited', 'Hybrid SE', 'Hybrid Sport', 'Hybrid Limited', 'Plug-In Hybrid SE', 'Plug-In Hybrid Limited'] },
    { from: 2020, to: 2026, trims: ['SE', 'SEL', 'SEL Plus', 'N Line', 'Limited', 'Hybrid Blue', 'Hybrid SEL', 'Hybrid SEL Plus', 'Hybrid N Line', 'Hybrid Limited'] },
  ],

  'HYUNDAI|PALISADE': [
    { from: 2020, to: 2026, trims: ['SE', 'SEL', 'XRT', 'Limited', 'Calligraphy'] },
  ],

  'KIA|SPORTAGE': [
    { from: 1995, to: 2002, trims: ['Base 2WD', 'Base 4WD', 'EX 4WD'] },
    { from: 2005, to: 2010, trims: ['LX 2WD', 'LX AWD', 'EX 2WD', 'EX AWD'] },
    { from: 2011, to: 2016, trims: ['LX 2WD', 'LX AWD', 'EX 2WD', 'EX AWD', 'SX 2WD', 'SX AWD', 'SX Limited AWD'] },
    { from: 2017, to: 2022, trims: ['LX 2WD', 'LX AWD', 'EX 2WD', 'EX AWD', 'S 2WD', 'S AWD', 'SX Turbo AWD', 'SX Turbo Limited AWD'] },
    { from: 2023, to: 2026, trims: ['LX', 'EX', 'S', 'X-Line', 'SX', 'X-Pro', 'SX Prestige', 'Plug-In Hybrid EX', 'Plug-In Hybrid SX'] },
  ],

  'KIA|SORENTO': [
    { from: 2003, to: 2009, trims: ['LX 2WD', 'LX 4WD', 'EX 2WD', 'EX 4WD'] },
    { from: 2011, to: 2015, trims: ['LX 2WD', 'LX AWD', 'EX 2WD', 'EX AWD', 'SX 2WD', 'SX AWD', 'SX Limited AWD'] },
    { from: 2016, to: 2020, trims: ['L', 'LX', 'EX', 'EX V6', 'SX', 'SX Limited', 'SXL'] },
    { from: 2021, to: 2026, trims: ['LX', 'S', 'EX', 'SX', 'X-Line', 'SX Prestige', 'Plug-In Hybrid EX', 'Plug-In Hybrid SX', 'Plug-In Hybrid SX Prestige'] },
  ],

  'KIA|TELLURIDE': [
    { from: 2020, to: 2026, trims: ['LX', 'S', 'EX', 'SX', 'SX-P', 'X-Line', 'X-Pro', 'X-Pro Prestige'] },
  ],

  'KIA|SOUL': [
    { from: 2010, to: 2013, trims: ['Base', 'Plus', 'Sport', '!', '+', 'Exclaim'] },
    { from: 2014, to: 2019, trims: ['Base', 'Plus', 'Exclaim', 'EV Base', 'EV Plus', 'EV Exclaim'] },
    { from: 2020, to: 2026, trims: ['LX', 'S', 'EX', 'GT-Line', 'Turbo', 'EV Wind', 'EV Wave', 'EV Dream'] },
  ],

  'KIA|FORTE': [
    { from: 2010, to: 2013, trims: ['LX', 'EX', 'SX', 'Koup EX', 'Koup SX'] },
    { from: 2014, to: 2018, trims: ['LX', 'EX', 'EX Premium', 'EX Tech', 'SX', 'Koup EX', 'Koup SX'] },
    { from: 2019, to: 2026, trims: ['FE', 'LXS', 'GT-Line', 'EX', 'GT'] },
  ],

  // ── MAZDA ─────────────────────────────────────────────────────────────────────

  'MAZDA|MAZDA3': [
    { from: 2004, to: 2009, trims: ['i Sedan', 's Sedan', 'i Sport Sedan', 's Sport Sedan', 'i Hatchback', 's Hatchback', 'i Touring', 's Touring', 'i Grand Touring', 's Grand Touring', 'MAZDASPEED3 Sport', 'MAZDASPEED3 Grand Touring'] },
    { from: 2010, to: 2013, trims: ['i SV', 'i Sport', 'i Touring', 'i Grand Touring', 's Sport', 's Touring', 's Grand Touring', 'MAZDASPEED3 Sport', 'MAZDASPEED3 Grand Touring'] },
    { from: 2014, to: 2018, trims: ['i Sport', 'i Touring', 'i Grand Touring', 's Sport', 's Touring', 's Grand Touring', 'i SV'] },
    { from: 2019, to: 2026, trims: ['Select', 'Preferred', 'Premium', 'Premium Plus', '2.5 Turbo', '2.5 Turbo Premium', '2.5 Turbo Premium Plus'] },
  ],

  'MAZDA|CX-5': [
    { from: 2013, to: 2016, trims: ['Sport 2WD', 'Sport AWD', 'Touring 2WD', 'Touring AWD', 'Grand Touring 2WD', 'Grand Touring AWD'] },
    { from: 2017, to: 2022, trims: ['Sport', 'Touring', 'Grand Touring', 'Grand Touring Reserve', 'Signature', 'Carbon Edition'] },
    { from: 2023, to: 2026, trims: ['S Select', 'S Preferred', 'S Premium', 'S Premium Plus', '2.5 Turbo', '2.5 Turbo Premium', '2.5 Turbo Signature'] },
  ],

  'MAZDA|MX-5 MIATA': [
    { from: 1990, to: 1997, trims: ['Base', 'Special Edition', 'M Edition', 'R Package', 'Merlot'] },
    { from: 1999, to: 2005, trims: ['Base', 'Cloth', 'Leather', 'SE', 'Shinsen', 'Tan Top', 'LS', 'STO'] },
    { from: 2006, to: 2015, trims: ['Sport', 'Touring', 'Grand Touring', 'Club', 'PRHT Grand Touring', 'PRHT Club', 'RF Club', 'RF Grand Touring', '25th Anniversary', 'Mx-5 Cup'] },
    { from: 2016, to: 2026, trims: ['Sport', 'Club', 'Grand Touring', 'RF Club', 'RF Grand Touring'] },
  ],

  // ── BMW ───────────────────────────────────────────────────────────────────────

  'BMW|3 SERIES': [
    { from: 1984, to: 1991, trims: ['325e', '325es', '325i', '325is', '325iX', 'M3'] },
    { from: 1992, to: 1998, trims: ['318i', '318is', '318ti', '323i', '323is', '325i', '325is', '328i', '328is', 'M3'] },
    { from: 1999, to: 2005, trims: ['323i', '325i', '325xi', '328i', '330i', '330xi', 'M3'] },
    { from: 2006, to: 2011, trims: ['325i', '325xi', '328i', '328xi', '330i', '335i', '335xi', '335d', 'M3'] },
    { from: 2012, to: 2018, trims: ['320i', '320i xDrive', '328i', '328i xDrive', '328d', '335i', '335i xDrive', '340i', '340i xDrive', 'M3'] },
    { from: 2019, to: 2026, trims: ['330i', '330i xDrive', '330e', '330e xDrive', 'M340i', 'M340i xDrive', 'M3', 'M3 Competition', 'M3 CS'] },
  ],

  'BMW|5 SERIES': [
    { from: 1997, to: 2003, trims: ['525i', '528i', '530i', '540i', 'M5'] },
    { from: 2004, to: 2010, trims: ['525i', '525xi', '528i', '528xi', '530i', '530xi', '545i', '550i', 'M5'] },
    { from: 2011, to: 2016, trims: ['528i', '528i xDrive', '535i', '535i xDrive', '535d', '535d xDrive', '550i', '550i xDrive', 'M5', 'ActiveHybrid 5'] },
    { from: 2017, to: 2026, trims: ['530i', '530i xDrive', '530e', '530e xDrive', '540i', '540i xDrive', '545e xDrive', 'M550i xDrive', 'M5', 'M5 Competition', 'M5 CS'] },
  ],

  'BMW|X3': [
    { from: 2004, to: 2010, trims: ['2.5i', '3.0i', '3.0si'] },
    { from: 2011, to: 2017, trims: ['xDrive28i', 'xDrive35i', 'xDrive28d'] },
    { from: 2018, to: 2026, trims: ['sDrive30i', 'xDrive30i', 'xDrive30e', 'M40i', 'M', 'M Competition'] },
  ],

  'BMW|X5': [
    { from: 2000, to: 2006, trims: ['3.0i', '4.4i', '4.6is', '4.8is'] },
    { from: 2007, to: 2013, trims: ['xDrive30i', 'xDrive35i', 'xDrive35d', 'xDrive48i', 'xDrive50i', 'M'] },
    { from: 2014, to: 2018, trims: ['sDrive35i', 'xDrive35i', 'xDrive35d', 'xDrive40e', 'xDrive50i', 'M'] },
    { from: 2019, to: 2026, trims: ['sDrive40i', 'xDrive40i', 'xDrive45e', 'xDrive50i', 'M60i', 'M', 'M Competition'] },
  ],

  // ── TESLA ─────────────────────────────────────────────────────────────────────

  'TESLA|MODEL 3': [
    { from: 2017, to: 2020, trims: ['Standard Range', 'Standard Range Plus', 'Long Range', 'Long Range AWD', 'Long Range Performance', 'Performance'] },
    { from: 2021, to: 2026, trims: ['Standard Range RWD', 'Long Range AWD', 'Performance'] },
  ],

  'TESLA|MODEL Y': [
    { from: 2020, to: 2026, trims: ['Standard Range', 'Long Range AWD', 'Performance'] },
  ],

  'TESLA|MODEL S': [
    { from: 2012, to: 2015, trims: ['60', '70', '70D', '85', '85D', 'P85', 'P85D', 'P85+'] },
    { from: 2016, to: 2021, trims: ['60', '60D', '75', '75D', '90D', '100D', 'P100D', 'P90D', 'Long Range', 'Long Range Plus', 'Performance'] },
    { from: 2021, to: 2026, trims: ['Long Range', 'Plaid'] },
  ],

  'TESLA|MODEL X': [
    { from: 2016, to: 2020, trims: ['60D', '75D', '90D', '100D', 'P90D', 'P100D', 'Long Range', 'Performance'] },
    { from: 2021, to: 2026, trims: ['Long Range', 'Plaid'] },
  ],

  'TESLA|CYBERTRUCK': [
    { from: 2024, to: 2026, trims: ['AWD', 'Cyberbeast', 'Foundation Series'] },
  ],

  // ── VOLKSWAGEN ────────────────────────────────────────────────────────────────

  'VOLKSWAGEN|JETTA': [
    { from: 1985, to: 1992, trims: ['Base', 'GL', 'GX', 'GLI', 'Carat', 'Wolfsburg Edition'] },
    { from: 1993, to: 1998, trims: ['GL', 'GLS', 'GT', 'GLX', 'Trek'] },
    { from: 1999, to: 2005, trims: ['GL', 'GLS', 'TDI', 'VR6', 'GLI', 'Wolfsburg', 'GLS 1.8T', 'GLS 2.0'] },
    { from: 2005, to: 2010, trims: ['Value Edition', '2.5', 'TDI', 'Wolfsburg', 'GLI', 'SE', 'SEL', 'Limited Edition'] },
    { from: 2011, to: 2018, trims: ['S', 'SE', 'SEL', 'SEL Premium', 'TDI S', 'TDI SE', 'TDI SEL', 'TDI SEL Premium', 'Hybrid SE', 'Hybrid SEL', 'Hybrid SEL Premium', 'GLI 2.0T S', 'GLI 2.0T SE', 'GLI 2.0T Autobahn'] },
    { from: 2019, to: 2026, trims: ['S', 'SE', 'SEL', 'R-Line Black', 'GLI S', 'GLI Autobahn', 'GLI 35th Anniversary'] },
  ],

  'VOLKSWAGEN|GOLF': [
    { from: 1985, to: 1994, trims: ['Base', 'GL', 'GTI', 'Cabriolet'] },
    { from: 1995, to: 2001, trims: ['GL', 'GLS', 'GTI', 'GTI VR6', 'GTI Anniversary', 'Cabrio'] },
    { from: 2002, to: 2007, trims: ['GL', 'GLS', 'TDI', 'GTI 1.8T', 'GTI VR6', 'R32'] },
    { from: 2010, to: 2014, trims: ['TDI', 'TDI w/Sunroof', 'TDI w/Nav', 'Wolfsburg Edition', 'GTI Base', 'GTI 2-door', 'GTI 4-door', 'R'] },
    { from: 2015, to: 2021, trims: ['S', 'SE', 'SEL', 'Sport', 'Alltrack S', 'Alltrack SE', 'Alltrack SEL', 'GTI S', 'GTI SE', 'GTI Autobahn', 'GTI Rabbit', 'R'] },
    { from: 2022, to: 2026, trims: ['S', 'SE', 'GTI S', 'GTI SE', 'GTI Autobahn', 'R'] },
  ],

  'VOLKSWAGEN|TIGUAN': [
    { from: 2009, to: 2017, trims: ['S 2WD', 'S 4Motion', 'SE 2WD', 'SE 4Motion', 'SEL 4Motion', 'Wolfsburg Edition 4Motion', 'R-Line 4Motion'] },
    { from: 2018, to: 2026, trims: ['S', 'SE', 'SE R-Line Black', 'SEL', 'SEL R-Line', 'SEL Premium R-Line'] },
  ],

  'VOLKSWAGEN|PASSAT': [
    { from: 1990, to: 1997, trims: ['GL', 'GLS', 'GLX', 'VR6'] },
    { from: 1998, to: 2005, trims: ['GLS', 'GLS 1.8T', 'GLX', 'GLX V6', 'W8', 'TDI', 'Wagon GLS', 'Wagon GLX'] },
    { from: 2006, to: 2011, trims: ['2.0T', '2.0T Komfort', '2.0T Lux', '3.6 SEL', 'TDI'] },
    { from: 2012, to: 2019, trims: ['S', 'SE', 'SEL', 'SEL Premium', 'TDI S', 'TDI SE', 'TDI SEL', 'TDI SEL Premium', 'Wolfsburg Edition', 'R-Line'] },
  ],

  // ── ACURA / INFINITI / LEXUS / LINCOLN / CADILLAC ─────────────────────────────

  'ACURA|MDX': [
    { from: 2001, to: 2006, trims: ['Base AWD', 'Touring AWD'] },
    { from: 2007, to: 2013, trims: ['Base AWD', 'Technology AWD', 'Advance AWD', 'Entertainment AWD'] },
    { from: 2014, to: 2020, trims: ['Base AWD', 'Technology AWD', 'Advance AWD', 'Entertainment AWD', 'Sport Hybrid SH-AWD', 'Sport Hybrid Technology', 'Sport Hybrid Advance'] },
    { from: 2022, to: 2026, trims: ['Base', 'Technology', 'A-Spec', 'A-Spec Technology', 'Advance', 'Type S', 'Type S Advance'] },
  ],

  'ACURA|RDX': [
    { from: 2007, to: 2012, trims: ['Base AWD', 'Technology AWD'] },
    { from: 2013, to: 2018, trims: ['Base FWD', 'Base AWD', 'Technology FWD', 'Technology AWD', 'Advance AWD', 'Dynamic AWD'] },
    { from: 2019, to: 2026, trims: ['Base', 'Technology', 'A-Spec', 'A-Spec Technology', 'Advance'] },
  ],

  'ACURA|TL': [
    { from: 1996, to: 2003, trims: ['2.5TL', '3.2TL', '3.2TL Type-S'] },
    { from: 2004, to: 2008, trims: ['Base', 'Navigation', 'Type-S', 'Type-S Navigation'] },
    { from: 2009, to: 2014, trims: ['Base FWD', 'Base AWD', 'Technology FWD', 'Technology AWD', 'Advance AWD', 'SH-AWD Technology', 'SH-AWD Advance'] },
  ],

  'ACURA|TLX': [
    { from: 2015, to: 2020, trims: ['2.4L', '2.4L Technology', '2.4L A-Spec', '3.5L V6 Technology SH-AWD', '3.5L V6 Advance SH-AWD'] },
    { from: 2021, to: 2026, trims: ['Base', 'Technology', 'A-Spec', 'A-Spec Technology', 'Advance', 'Type S', 'Type S Advance'] },
  ],

  'LEXUS|RX': [
    { from: 1999, to: 2003, trims: ['RX 300 2WD', 'RX 300 AWD'] },
    { from: 2004, to: 2009, trims: ['RX 330 2WD', 'RX 330 AWD', 'RX 350 2WD', 'RX 350 AWD', 'RX 400h AWD'] },
    { from: 2010, to: 2015, trims: ['RX 350 2WD', 'RX 350 AWD', 'RX 350 F Sport AWD', 'RX 450h AWD'] },
    { from: 2016, to: 2022, trims: ['RX 350 2WD', 'RX 350 AWD', 'RX 350 F Sport 2WD', 'RX 350 F Sport AWD', 'RX 450h AWD', 'RX 450h F Sport AWD', 'RX 350L 7-Seat', 'RX 450hL 7-Seat'] },
    { from: 2023, to: 2026, trims: ['RX 350', 'RX 350 F Sport', 'RX 350 F Sport Handling', 'RX 350h', 'RX 500h F Sport Performance', 'RX 350h F Sport', 'RX 450h+'] },
  ],

  'LEXUS|ES': [
    { from: 1997, to: 2001, trims: ['ES 300'] },
    { from: 2002, to: 2006, trims: ['ES 300', 'ES 330'] },
    { from: 2007, to: 2012, trims: ['ES 350'] },
    { from: 2013, to: 2018, trims: ['ES 300h Hybrid', 'ES 350', 'ES 350 Crafted Line'] },
    { from: 2019, to: 2026, trims: ['ES 250 AWD', 'ES 300h Hybrid', 'ES 350', 'ES 350 F Sport', 'ES 350 Black Line Special Edition', 'ES 350 Ultra Luxury'] },
  ],

  'LEXUS|GX': [
    { from: 2003, to: 2009, trims: ['GX 470 Base', 'GX 470 Sport'] },
    { from: 2010, to: 2023, trims: ['GX 460 Base', 'GX 460 Premium', 'GX 460 Luxury', 'GX 460 Sport Design'] },
    { from: 2024, to: 2026, trims: ['Premium', 'Premium+', 'Luxury', 'Overtrail', 'Overtrail+'] },
  ],

  'LINCOLN|NAVIGATOR': [
    { from: 1998, to: 2002, trims: ['Base 2WD', 'Base 4WD', 'Luxury 4WD'] },
    { from: 2003, to: 2006, trims: ['Base 2WD', 'Luxury 2WD', 'Ultimate 2WD', 'Base 4WD', 'Luxury 4WD', 'Ultimate 4WD'] },
    { from: 2007, to: 2017, trims: ['Base 2WD', 'Base 4WD', 'L 2WD', 'L 4WD'] },
    { from: 2018, to: 2026, trims: ['Standard', 'Reserve', 'Black Label', 'L Standard', 'L Reserve', 'L Black Label'] },
  ],

  'CADILLAC|ESCALADE': [
    { from: 1999, to: 2000, trims: ['Base'] },
    { from: 2002, to: 2006, trims: ['Base 2WD', 'Base AWD', 'EXT Base', 'EXT AWD', 'ESV Base', 'ESV AWD'] },
    { from: 2007, to: 2014, trims: ['Base 2WD', 'Base AWD', 'Luxury AWD', 'Premium AWD', 'ESV Base', 'ESV Premium'] },
    { from: 2015, to: 2020, trims: ['Standard', 'Luxury', 'Premium Luxury', 'Platinum', 'ESV Standard', 'ESV Luxury', 'ESV Platinum'] },
    { from: 2021, to: 2026, trims: ['Luxury', 'Premium Luxury', 'Premium Luxury Platinum', 'Sport', 'Sport Platinum', 'V', 'V Blackwing', 'ESV Luxury', 'ESV Premium Luxury', 'ESV Platinum'] },
  ],

  'PORSCHE|CAYENNE': [
    { from: 2003, to: 2010, trims: ['Base', 'S', 'GTS', 'Turbo', 'Turbo S'] },
    { from: 2011, to: 2017, trims: ['Base', 'S', 'S Hybrid', 'GTS', 'Turbo', 'Turbo S', 'Diesel', 'S E-Hybrid'] },
    { from: 2019, to: 2026, trims: ['Base', 'S', 'GTS', 'Turbo', 'Turbo S', 'E-Hybrid', 'S E-Hybrid', 'Turbo E-Hybrid', 'Turbo S E-Hybrid', 'Coupe', 'Coupe GTS', 'Coupe Turbo'] },
  ],

  'MERCEDES-BENZ|C-CLASS': [
    { from: 1994, to: 2000, trims: ['C220', 'C230', 'C280', 'C36 AMG', 'C43 AMG'] },
    { from: 2001, to: 2007, trims: ['C230', 'C240', 'C280', 'C320', 'C350', 'C55 AMG'] },
    { from: 2008, to: 2014, trims: ['C300 RWD', 'C300 4MATIC', 'C350 RWD', 'C350 4MATIC', 'C63 AMG', 'C63 AMG Black Series'] },
    { from: 2015, to: 2021, trims: ['C300 RWD', 'C300 4MATIC', 'C350e Plug-In Hybrid', 'C63 AMG', 'C63 S AMG', 'Cabriolet C300', 'Cabriolet C63 AMG'] },
    { from: 2022, to: 2026, trims: ['C300 RWD', 'C300 4MATIC', 'C43 AMG', 'C63 S E Performance AMG'] },
  ],

  // ── FORD VANS & HEAVY DUTY ────────────────────────────────────────────────
  'FORD|TRANSIT': [
    { from: 2015, to: 2026, trims: ['XL Cargo', 'XLT Cargo', 'XL Passenger', 'XLT Passenger', 'Limited Passenger', 'Trail'] },
  ],
  'FORD|TRANSIT CONNECT': [
    { from: 2010, to: 2013, trims: ['XL', 'XLT'] },
    { from: 2014, to: 2026, trims: ['XL', 'XLT', 'Titanium', 'Wagon XL', 'Wagon XLT', 'Wagon Titanium'] },
  ],
  'FORD|E-SERIES': [
    { from: 1992, to: 2007, trims: ['E-150 XL', 'E-150 XLT', 'E-250 XL', 'E-250 XLT', 'E-350 XL', 'E-350 XLT', 'E-350 Super Duty'] },
    { from: 2008, to: 2014, trims: ['E-150 XL', 'E-150 XLT', 'E-250 Super Duty XL', 'E-250 Super Duty XLT', 'E-350 Super Duty XL', 'E-350 Super Duty XLT'] },
  ],
  'FORD|F-450 SUPER DUTY': [
    { from: 1999, to: 2016, trims: ['Regular Cab XL', 'Regular Cab XLT', 'Regular Cab Lariat', 'SuperCab XL', 'SuperCab XLT', 'Crew Cab XL', 'Crew Cab XLT', 'Crew Cab Lariat', 'Crew Cab King Ranch'] },
    { from: 2017, to: 2026, trims: ['XL', 'XLT', 'Lariat', 'King Ranch', 'Platinum', 'Limited'] },
  ],

  // ── CHEVROLET / GMC VANS ──────────────────────────────────────────────────
  'CHEVROLET|EXPRESS': [
    { from: 1996, to: 2003, trims: ['1500 LS', '1500 LT', '2500 LS', '2500 LT', '3500 LS', '3500 LT', 'Cargo 1500', 'Cargo 2500', 'Cargo 3500'] },
    { from: 2004, to: 2026, trims: ['LS', 'LT', '2500 LS', '2500 LT', '3500 LS', '3500 LT', 'Cargo', '2500 Cargo', '3500 Cargo', 'Work Van'] },
  ],
  'GMC|SAVANA': [
    { from: 1996, to: 2003, trims: ['1500 SL', '1500 SLE', '2500 SL', '2500 SLE', '3500 SL', '3500 SLE', 'Cargo 2500', 'Cargo 3500'] },
    { from: 2004, to: 2026, trims: ['SL', 'SLE', 'SLT', '2500 SLE', '3500 SLE', 'Cargo', '2500 Cargo', '3500 Cargo', 'Work Van'] },
  ],

  // ── RAM VANS ──────────────────────────────────────────────────────────────
  'RAM|PROMASTER': [
    { from: 2014, to: 2026, trims: ['1500 Low Roof', '1500 High Roof', '2500 High Roof', '3500 High Roof', 'Window Van'] },
  ],
  'RAM|PROMASTER CITY': [
    { from: 2015, to: 2026, trims: ['Tradesman', 'SLT', 'Wagon SE', 'Wagon SLT'] },
  ],

  // ── NISSAN MISSING MODELS ─────────────────────────────────────────────────
  'NISSAN|XTERRA': [
    { from: 1999, to: 2004, trims: ['XE 2WD', 'XE 4WD', 'SE 2WD', 'SE 4WD'] },
    { from: 2005, to: 2015, trims: ['X 2WD', 'X 4WD', 'S 2WD', 'S 4WD', 'PRO-4X 4WD', 'Off-Road 4WD'] },
  ],
  'NISSAN|VERSA': [
    { from: 2007, to: 2011, trims: ['1.6 Base', '1.6 S', '1.8 S', '1.8 SL'] },
    { from: 2012, to: 2019, trims: ['S', 'SV', 'SL', 'Note S', 'Note SV', 'Note SR', 'Note SL'] },
    { from: 2020, to: 2026, trims: ['S', 'SV', 'SR'] },
  ],

  // ── HYUNDAI / KIA MISSING MODELS ─────────────────────────────────────────
  'HYUNDAI|KONA': [
    { from: 2018, to: 2023, trims: ['SE', 'SEL', 'Limited', 'N Line', 'Electric SE', 'Electric Limited'] },
    { from: 2024, to: 2026, trims: ['SE', 'SEL', 'N Line', 'Limited', 'N', 'Electric Standard', 'Electric SE', 'Electric Limited'] },
  ],
  'KIA|SELTOS': [
    { from: 2021, to: 2026, trims: ['LX', 'S', 'EX', 'SX'] },
  ],

};

export function getTrims(make: string, model: string, year: number): string[] {
  // Try exact key first, then case-insensitive
  const key = `${make.toUpperCase()}|${model.toUpperCase()}`;
  const entries = TRIM_DATA[key]
    ?? TRIM_DATA[Object.keys(TRIM_DATA).find(k => k.toLowerCase() === key.toLowerCase()) ?? ''];
  if (!entries) return [];
  const match = entries.find(e => year >= e.from && year <= e.to);
  return match ? match.trims : [];
}
