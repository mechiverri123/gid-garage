// engineData.ts — Year-range aware engine data
// Structure: MAKE|MODEL → array of { from, to, engines[] }
// "from" and "to" are inclusive model years.
// Multiple entries per model cover different generations / engine availability windows.
// Lazy-loaded by BookingWidget — do not import statically.

export interface EngineEntry {
  from: number;
  to: number;
  engines: string[];
}

export const ENGINE_DATA: Record<string, EngineEntry[]> = {

  // ── TOYOTA ──────────────────────────────────────────────────────────────────

  'TOYOTA|CAMRY': [
    { from: 1983, to: 1991, engines: ['2.0L 4-cyl', '2.5L V6'] },
    { from: 1992, to: 1996, engines: ['2.2L 4-cyl', '3.0L V6'] },
    { from: 1997, to: 2001, engines: ['2.2L 4-cyl', '3.0L V6'] },
    { from: 2002, to: 2006, engines: ['2.4L 4-cyl', '3.0L V6'] },
    { from: 2007, to: 2011, engines: ['2.4L 4-cyl', '3.5L V6'] },
    { from: 2012, to: 2017, engines: ['2.5L 4-cyl', '3.5L V6'] },
    { from: 2018, to: 2024, engines: ['2.5L 4-cyl', '3.5L V6', '2.5L Hybrid'] },
  ],

  'TOYOTA|COROLLA': [
    { from: 1980, to: 1992, engines: ['1.6L 4-cyl'] },
    { from: 1993, to: 2002, engines: ['1.6L 4-cyl', '1.8L 4-cyl'] },
    { from: 2003, to: 2008, engines: ['1.8L 4-cyl'] },
    { from: 2009, to: 2013, engines: ['1.8L 4-cyl', '2.4L 4-cyl XRS'] },
    { from: 2014, to: 2019, engines: ['1.8L 4-cyl'] },
    { from: 2020, to: 2024, engines: ['1.8L 4-cyl', '2.0L 4-cyl', '1.8L Hybrid'] },
  ],

  'TOYOTA|RAV4': [
    { from: 1996, to: 2000, engines: ['2.0L 4-cyl 2WD', '2.0L 4-cyl 4WD'] },
    { from: 2001, to: 2005, engines: ['2.0L 4-cyl 2WD', '2.0L 4-cyl 4WD'] },
    { from: 2006, to: 2012, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl 4WD', '3.5L V6 2WD', '3.5L V6 4WD'] },
    { from: 2013, to: 2018, engines: ['2.5L 4-cyl 2WD', '2.5L 4-cyl AWD'] },
    { from: 2019, to: 2024, engines: ['2.5L 4-cyl 2WD', '2.5L 4-cyl AWD', '2.5L Hybrid AWD', '2.5L Plug-in Hybrid AWD'] },
  ],

  'TOYOTA|RAV4 PRIME': [
    { from: 2021, to: 2024, engines: ['2.5L Plug-in Hybrid AWD'] },
  ],

  'TOYOTA|TACOMA': [
    { from: 1995, to: 2004, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl 4WD', '2.7L 4-cyl 2WD', '2.7L 4-cyl 4WD', '3.4L V6 2WD', '3.4L V6 4WD'] },
    { from: 2005, to: 2015, engines: ['2.7L 4-cyl 2WD', '2.7L 4-cyl 4WD', '4.0L V6 2WD', '4.0L V6 4WD'] },
    { from: 2016, to: 2023, engines: ['2.7L 4-cyl 2WD', '2.7L 4-cyl 4WD', '3.5L V6 2WD', '3.5L V6 4WD'] },
    { from: 2024, to: 2026, engines: ['2.4L Turbo 4-cyl 2WD', '2.4L Turbo 4-cyl 4WD', '2.4L Turbo Hybrid 4WD'] },
  ],

  'TOYOTA|TUNDRA': [
    { from: 2000, to: 2006, engines: ['3.4L V6 2WD', '3.4L V6 4WD', '4.7L V8 2WD', '4.7L V8 4WD'] },
    { from: 2007, to: 2021, engines: ['4.6L V8 2WD', '4.6L V8 4WD', '5.7L V8 2WD', '5.7L V8 4WD'] },
    { from: 2022, to: 2026, engines: ['3.5L Twin-Turbo V6 2WD', '3.5L Twin-Turbo V6 4WD', '3.5L Twin-Turbo Hybrid V6 4WD'] },
  ],

  'TOYOTA|4RUNNER': [
    { from: 1984, to: 1995, engines: ['2.4L 4-cyl 4WD', '3.0L V6 4WD'] },
    { from: 1996, to: 2002, engines: ['2.7L 4-cyl 4WD', '3.4L V6 2WD', '3.4L V6 4WD'] },
    { from: 2003, to: 2009, engines: ['4.0L V6 2WD', '4.0L V6 4WD', '4.7L V8 4WD'] },
    { from: 2010, to: 2024, engines: ['4.0L V6 2WD', '4.0L V6 4WD'] },
  ],

  'TOYOTA|HIGHLANDER': [
    { from: 2001, to: 2007, engines: ['2.4L 4-cyl FWD', '2.4L 4-cyl AWD', '3.3L V6 FWD', '3.3L V6 AWD', '3.3L Hybrid V6 AWD'] },
    { from: 2008, to: 2013, engines: ['2.7L 4-cyl FWD', '3.5L V6 FWD', '3.5L V6 AWD', '3.3L Hybrid V6 AWD'] },
    { from: 2014, to: 2019, engines: ['2.7L 4-cyl FWD', '3.5L V6 FWD', '3.5L V6 AWD', '3.5L Hybrid V6 AWD'] },
    { from: 2020, to: 2024, engines: ['2.4L Turbo 4-cyl FWD', '2.4L Turbo 4-cyl AWD', '3.5L V6 FWD', '3.5L V6 AWD', '2.5L Hybrid AWD'] },
  ],

  'TOYOTA|SIENNA': [
    { from: 1998, to: 2003, engines: ['3.0L V6 FWD', '3.0L V6 AWD'] },
    { from: 2004, to: 2010, engines: ['3.3L V6 FWD', '3.3L V6 AWD'] },
    { from: 2011, to: 2020, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2021, to: 2024, engines: ['2.5L Hybrid FWD', '2.5L Hybrid AWD'] },
  ],

  'TOYOTA|PRIUS': [
    { from: 2001, to: 2003, engines: ['1.5L Hybrid'] },
    { from: 2004, to: 2009, engines: ['1.5L Hybrid'] },
    { from: 2010, to: 2015, engines: ['1.8L Hybrid'] },
    { from: 2016, to: 2022, engines: ['1.8L Hybrid', '1.8L Plug-in Hybrid'] },
    { from: 2023, to: 2026, engines: ['2.0L Hybrid', '2.0L Plug-in Hybrid'] },
  ],

  'TOYOTA|SEQUOIA': [
    { from: 2001, to: 2007, engines: ['4.7L V8 2WD', '4.7L V8 4WD'] },
    { from: 2008, to: 2022, engines: ['5.7L V8 2WD', '5.7L V8 4WD', '4.6L V8 2WD', '4.6L V8 4WD'] },
    { from: 2023, to: 2026, engines: ['3.5L Twin-Turbo Hybrid V6 2WD', '3.5L Twin-Turbo Hybrid V6 4WD'] },
  ],

  'TOYOTA|LAND CRUISER': [
    { from: 1980, to: 1987, engines: ['3.0L 6-cyl 4WD', '4.2L Diesel 6-cyl 4WD'] },
    { from: 1988, to: 1997, engines: ['4.0L 6-cyl 4WD', '4.2L Diesel 6-cyl 4WD'] },
    { from: 1998, to: 2007, engines: ['4.7L V8 4WD'] },
    { from: 2008, to: 2021, engines: ['5.7L V8 4WD'] },
    { from: 2022, to: 2026, engines: ['3.3L Twin-Turbo Hybrid V6 4WD'] },
  ],

  'TOYOTA|FJ CRUISER': [
    { from: 2006, to: 2014, engines: ['4.0L V6 2WD', '4.0L V6 4WD'] },
  ],

  'TOYOTA|AVALON': [
    { from: 1995, to: 1999, engines: ['3.0L V6'] },
    { from: 2000, to: 2004, engines: ['3.0L V6'] },
    { from: 2005, to: 2012, engines: ['3.5L V6'] },
    { from: 2013, to: 2018, engines: ['3.5L V6'] },
    { from: 2019, to: 2022, engines: ['3.5L V6', '2.5L Hybrid'] },
  ],

  'TOYOTA|SUPRA': [
    { from: 1982, to: 1992, engines: ['2.8L 6-cyl', '3.0L 6-cyl Turbo', '3.0L 6-cyl'] },
    { from: 1993, to: 1998, engines: ['3.0L Twin-Turbo 6-cyl', '3.0L 6-cyl NA'] },
    { from: 2020, to: 2026, engines: ['2.0L Turbo 4-cyl', '3.0L Turbo 6-cyl'] },
  ],

  'TOYOTA|CELICA': [
    { from: 1980, to: 1985, engines: ['2.0L 4-cyl', '2.2L 4-cyl'] },
    { from: 1986, to: 1993, engines: ['1.6L 4-cyl', '2.0L 4-cyl', '2.2L 4-cyl', '2.0L Turbo 4-cyl'] },
    { from: 1994, to: 1999, engines: ['1.8L 4-cyl', '2.2L 4-cyl'] },
    { from: 2000, to: 2005, engines: ['1.8L 4-cyl', '1.8L 4-cyl High Output'] },
  ],

  'TOYOTA|MR2': [
    { from: 1985, to: 1989, engines: ['1.6L 4-cyl', '1.6L Supercharged 4-cyl'] },
    { from: 1991, to: 1995, engines: ['2.0L 4-cyl', '2.0L Turbo 4-cyl'] },
    { from: 2000, to: 2005, engines: ['1.8L 4-cyl'] },
  ],

  'TOYOTA|MATRIX': [
    { from: 2003, to: 2008, engines: ['1.8L 4-cyl FWD', '1.8L 4-cyl AWD', '1.8L High Output 4-cyl FWD'] },
    { from: 2009, to: 2013, engines: ['1.8L 4-cyl FWD', '1.8L 4-cyl AWD', '2.4L 4-cyl XRS FWD'] },
  ],

  'TOYOTA|VENZA': [
    { from: 2009, to: 2015, engines: ['2.7L 4-cyl FWD', '2.7L 4-cyl AWD', '3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2021, to: 2024, engines: ['2.5L Hybrid FWD', '2.5L Hybrid AWD'] },
  ],

  'TOYOTA|SOLARA': [
    { from: 1999, to: 2003, engines: ['2.2L 4-cyl', '3.0L V6'] },
    { from: 2004, to: 2008, engines: ['2.4L 4-cyl', '3.3L V6'] },
  ],

  'TOYOTA|YARIS': [
    { from: 2006, to: 2012, engines: ['1.5L 4-cyl'] },
    { from: 2012, to: 2020, engines: ['1.5L 4-cyl'] },
  ],

  'TOYOTA|ECHO': [
    { from: 2000, to: 2005, engines: ['1.5L 4-cyl'] },
  ],

  'TOYOTA|COROLLA CROSS': [
    { from: 2022, to: 2026, engines: ['2.0L 4-cyl FWD', '2.0L 4-cyl AWD', '2.0L Hybrid AWD'] },
  ],

  'TOYOTA|GR86': [
    { from: 2022, to: 2026, engines: ['2.4L 4-cyl RWD'] },
  ],

  'TOYOTA|GR COROLLA': [
    { from: 2023, to: 2026, engines: ['1.6L Turbo 3-cyl AWD'] },
  ],

  'TOYOTA|PICKUP': [
    { from: 1980, to: 1995, engines: ['2.2L 4-cyl 2WD', '2.2L 4-cyl 4WD', '2.4L 4-cyl 2WD', '2.4L 4-cyl 4WD', '3.0L V6 2WD', '3.0L V6 4WD'] },
  ],

  'TOYOTA|T100': [
    { from: 1993, to: 1998, engines: ['2.7L 4-cyl 2WD', '2.7L 4-cyl 4WD', '3.4L V6 2WD', '3.4L V6 4WD'] },
  ],

  // ── HONDA ───────────────────────────────────────────────────────────────────

  'HONDA|CIVIC': [
    { from: 1980, to: 1987, engines: ['1.3L 4-cyl', '1.5L 4-cyl'] },
    { from: 1988, to: 1991, engines: ['1.5L 4-cyl', '1.6L 4-cyl'] },
    { from: 1992, to: 1995, engines: ['1.5L 4-cyl', '1.6L 4-cyl', '1.6L VTEC 4-cyl'] },
    { from: 1996, to: 2000, engines: ['1.4L 4-cyl', '1.6L 4-cyl', '1.6L VTEC 4-cyl Si'] },
    { from: 2001, to: 2005, engines: ['1.7L 4-cyl', '2.0L Si 4-cyl'] },
    { from: 2006, to: 2011, engines: ['1.8L 4-cyl', '2.0L Si 4-cyl'] },
    { from: 2012, to: 2015, engines: ['1.8L 4-cyl', '2.4L Si 4-cyl'] },
    { from: 2016, to: 2021, engines: ['2.0L 4-cyl', '1.5L Turbo 4-cyl', '2.0L Turbo Si 4-cyl', '2.0L Turbo Type R 4-cyl'] },
    { from: 2022, to: 2026, engines: ['2.0L 4-cyl', '1.5L Turbo 4-cyl', '2.0L Hybrid', '2.0L Turbo Si 4-cyl', '2.0L Turbo Type R 4-cyl'] },
  ],

  'HONDA|ACCORD': [
    { from: 1980, to: 1989, engines: ['1.8L 4-cyl', '2.0L 4-cyl'] },
    { from: 1990, to: 1997, engines: ['2.2L 4-cyl', '2.7L V6'] },
    { from: 1998, to: 2002, engines: ['2.3L 4-cyl', '3.0L V6'] },
    { from: 2003, to: 2007, engines: ['2.4L 4-cyl', '3.0L V6'] },
    { from: 2008, to: 2012, engines: ['2.4L 4-cyl', '3.5L V6'] },
    { from: 2013, to: 2017, engines: ['2.4L 4-cyl', '3.5L V6'] },
    { from: 2018, to: 2022, engines: ['1.5L Turbo 4-cyl', '2.0L Turbo 4-cyl', '2.0L Hybrid'] },
    { from: 2023, to: 2026, engines: ['1.5L Turbo 4-cyl', '2.0L Hybrid'] },
  ],

  'HONDA|CR-V': [
    { from: 1997, to: 2001, engines: ['2.0L 4-cyl 2WD', '2.0L 4-cyl AWD'] },
    { from: 2002, to: 2006, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl AWD'] },
    { from: 2007, to: 2011, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl AWD'] },
    { from: 2012, to: 2016, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl AWD'] },
    { from: 2017, to: 2022, engines: ['1.5L Turbo 4-cyl FWD', '1.5L Turbo 4-cyl AWD', '2.0L Hybrid AWD'] },
    { from: 2023, to: 2026, engines: ['1.5L Turbo 4-cyl FWD', '1.5L Turbo 4-cyl AWD', '2.0L Hybrid AWD'] },
  ],

  'HONDA|PILOT': [
    { from: 2003, to: 2008, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2009, to: 2015, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2016, to: 2022, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2023, to: 2026, engines: ['3.5L V6 FWD', '3.5L V6 AWD', '3.5L Hybrid AWD'] },
  ],

  'HONDA|ODYSSEY': [
    { from: 1995, to: 1998, engines: ['2.2L 4-cyl'] },
    { from: 1999, to: 2004, engines: ['3.5L V6'] },
    { from: 2005, to: 2010, engines: ['3.5L V6'] },
    { from: 2011, to: 2017, engines: ['3.5L V6'] },
    { from: 2018, to: 2026, engines: ['3.5L V6'] },
  ],

  'HONDA|RIDGELINE': [
    { from: 2006, to: 2014, engines: ['3.5L V6 AWD'] },
    { from: 2017, to: 2026, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
  ],

  'HONDA|PASSPORT': [
    { from: 1994, to: 2002, engines: ['2.6L 4-cyl 2WD', '2.6L 4-cyl 4WD', '3.2L V6 2WD', '3.2L V6 4WD'] },
    { from: 2019, to: 2026, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
  ],

  'HONDA|HR-V': [
    { from: 2016, to: 2022, engines: ['1.8L 4-cyl FWD', '1.8L 4-cyl AWD'] },
    { from: 2023, to: 2026, engines: ['2.0L 4-cyl FWD', '2.0L 4-cyl AWD'] },
  ],

  'HONDA|FIT': [
    { from: 2007, to: 2014, engines: ['1.5L 4-cyl'] },
    { from: 2015, to: 2020, engines: ['1.5L 4-cyl'] },
  ],

  'HONDA|ELEMENT': [
    { from: 2003, to: 2011, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl AWD'] },
  ],

  'HONDA|S2000': [
    { from: 2000, to: 2003, engines: ['2.0L 4-cyl RWD'] },
    { from: 2004, to: 2009, engines: ['2.2L 4-cyl RWD'] },
  ],

  'HONDA|PRELUDE': [
    { from: 1983, to: 1987, engines: ['1.8L 4-cyl', '2.0L 4-cyl'] },
    { from: 1988, to: 1991, engines: ['2.0L 4-cyl', '2.1L 4-cyl'] },
    { from: 1992, to: 1996, engines: ['2.2L 4-cyl', '2.3L VTEC 4-cyl'] },
    { from: 1997, to: 2001, engines: ['2.2L 4-cyl', '2.2L VTEC 4-cyl'] },
  ],

  'HONDA|INSIGHT': [
    { from: 2000, to: 2006, engines: ['1.0L Hybrid 3-cyl'] },
    { from: 2010, to: 2014, engines: ['1.3L Hybrid 4-cyl'] },
    { from: 2019, to: 2022, engines: ['1.5L Hybrid 4-cyl'] },
  ],

  'HONDA|CR-Z': [
    { from: 2011, to: 2016, engines: ['1.5L Hybrid 4-cyl'] },
  ],

  // ── FORD ────────────────────────────────────────────────────────────────────

  'FORD|F-150': [
    { from: 1980, to: 1996, engines: ['4.9L 6-cyl 2WD', '4.9L 6-cyl 4WD', '5.0L V8 2WD', '5.0L V8 4WD', '5.8L V8 2WD', '5.8L V8 4WD', '4.9L 6-cyl', '7.5L V8 2WD', '7.5L V8 4WD'] },
    { from: 1997, to: 2003, engines: ['4.2L V6 2WD', '4.2L V6 4WD', '4.6L V8 2WD', '4.6L V8 4WD', '5.4L V8 2WD', '5.4L V8 4WD'] },
    { from: 2004, to: 2008, engines: ['4.2L V6 2WD', '4.2L V6 4WD', '4.6L V8 2WD', '4.6L V8 4WD', '5.4L V8 2WD', '5.4L V8 4WD', '5.4L Supercharged V8 Harley'] },
    { from: 2009, to: 2014, engines: ['3.7L V6 2WD', '3.7L V6 4WD', '5.0L V8 2WD', '5.0L V8 4WD', '3.5L EcoBoost V6 2WD', '3.5L EcoBoost V6 4WD', '6.2L V8 2WD', '6.2L V8 4WD'] },
    { from: 2015, to: 2020, engines: ['2.7L EcoBoost V6 2WD', '2.7L EcoBoost V6 4WD', '3.5L EcoBoost V6 2WD', '3.5L EcoBoost V6 4WD', '5.0L V8 2WD', '5.0L V8 4WD', '3.3L V6 2WD', '3.3L V6 4WD', '3.0L Power Stroke Diesel V6 2WD', '3.0L Power Stroke Diesel V6 4WD'] },
    { from: 2021, to: 2026, engines: ['2.7L EcoBoost V6 2WD', '2.7L EcoBoost V6 4WD', '3.5L EcoBoost V6 2WD', '3.5L EcoBoost V6 4WD', '5.0L V8 2WD', '5.0L V8 4WD', '3.5L PowerBoost Hybrid V6 2WD', '3.5L PowerBoost Hybrid V6 4WD', '3.3L V6 2WD', '3.3L V6 4WD', '5.2L V8 Raptor R 4WD'] },
  ],

  'FORD|F-250 SUPER DUTY': [
    { from: 1999, to: 2007, engines: ['5.4L V8 2WD', '5.4L V8 4WD', '6.0L Power Stroke Diesel V8 2WD', '6.0L Power Stroke Diesel V8 4WD', '6.8L V10 2WD', '6.8L V10 4WD'] },
    { from: 2008, to: 2010, engines: ['5.4L V8 2WD', '5.4L V8 4WD', '6.4L Power Stroke Diesel V8 2WD', '6.4L Power Stroke Diesel V8 4WD', '6.8L V10 2WD', '6.8L V10 4WD'] },
    { from: 2011, to: 2016, engines: ['6.2L V8 2WD', '6.2L V8 4WD', '6.7L Power Stroke Diesel V8 2WD', '6.7L Power Stroke Diesel V8 4WD'] },
    { from: 2017, to: 2026, engines: ['6.2L V8 2WD', '6.2L V8 4WD', '7.3L V8 2WD', '7.3L V8 4WD', '6.7L Power Stroke Diesel V8 2WD', '6.7L Power Stroke Diesel V8 4WD'] },
  ],

  'FORD|F-350 SUPER DUTY': [
    { from: 1999, to: 2007, engines: ['5.4L V8 2WD', '5.4L V8 4WD', '6.0L Power Stroke Diesel V8 2WD', '6.0L Power Stroke Diesel V8 4WD', '6.8L V10 2WD', '6.8L V10 4WD'] },
    { from: 2008, to: 2010, engines: ['5.4L V8 2WD', '5.4L V8 4WD', '6.4L Power Stroke Diesel V8 2WD', '6.4L Power Stroke Diesel V8 4WD', '6.8L V10 2WD', '6.8L V10 4WD'] },
    { from: 2011, to: 2016, engines: ['6.2L V8 2WD', '6.2L V8 4WD', '6.7L Power Stroke Diesel V8 2WD', '6.7L Power Stroke Diesel V8 4WD'] },
    { from: 2017, to: 2026, engines: ['6.2L V8 2WD', '6.2L V8 4WD', '7.3L V8 2WD', '7.3L V8 4WD', '6.7L Power Stroke Diesel V8 2WD', '6.7L Power Stroke Diesel V8 4WD'] },
  ],

  'FORD|MUSTANG': [
    { from: 1980, to: 1993, engines: ['2.3L 4-cyl', '3.8L V6', '5.0L HO V8'] },
    { from: 1994, to: 1998, engines: ['3.8L V6', '4.6L V8 GT', '5.8L Supercharged V8 Cobra R'] },
    { from: 1999, to: 2004, engines: ['3.8L V6', '4.6L 2V V8 GT', '4.6L 4V V8 Cobra', '5.4L Supercharged V8 Cobra R'] },
    { from: 2005, to: 2010, engines: ['4.0L V6', '4.6L 3V V8 GT', '5.4L Supercharged V8 GT500'] },
    { from: 2011, to: 2014, engines: ['3.7L V6', '5.0L V8 GT', '5.8L Supercharged V8 GT500'] },
    { from: 2015, to: 2017, engines: ['2.3L EcoBoost 4-cyl', '3.7L V6', '5.0L V8 GT', '5.2L V8 GT350'] },
    { from: 2018, to: 2022, engines: ['2.3L EcoBoost 4-cyl', '5.0L V8 GT', '5.2L V8 GT350', '5.2L Supercharged V8 GT500', '2.3L High Performance 4-cyl'] },
    { from: 2024, to: 2026, engines: ['2.3L EcoBoost 4-cyl', '5.0L V8 GT', '5.2L Supercharged V8 GT500 Dark Horse'] },
  ],

  'FORD|EXPLORER': [
    { from: 1991, to: 1994, engines: ['4.0L V6 2WD', '4.0L V6 4WD'] },
    { from: 1995, to: 2001, engines: ['4.0L V6 2WD', '4.0L V6 4WD', '5.0L V8 2WD', '5.0L V8 4WD'] },
    { from: 2002, to: 2010, engines: ['4.0L V6 2WD', '4.0L V6 4WD', '4.6L V8 2WD', '4.6L V8 4WD'] },
    { from: 2011, to: 2019, engines: ['2.0L EcoBoost 4-cyl FWD', '2.0L EcoBoost 4-cyl 4WD', '3.5L V6 FWD', '3.5L V6 4WD', '3.5L EcoBoost V6 4WD', '2.3L EcoBoost 4-cyl FWD', '2.3L EcoBoost 4-cyl 4WD'] },
    { from: 2020, to: 2026, engines: ['2.3L EcoBoost 4-cyl RWD', '2.3L EcoBoost 4-cyl AWD', '3.0L EcoBoost V6 AWD', '3.3L Hybrid V6 RWD', '3.3L Hybrid V6 AWD'] },
  ],

  'FORD|ESCAPE': [
    { from: 2001, to: 2007, engines: ['2.0L 4-cyl FWD', '2.0L 4-cyl 4WD', '3.0L V6 FWD', '3.0L V6 4WD', '2.3L Hybrid 4-cyl AWD'] },
    { from: 2008, to: 2012, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl 4WD', '3.0L V6 FWD', '3.0L V6 4WD', '2.5L Hybrid 4-cyl AWD'] },
    { from: 2013, to: 2019, engines: ['1.6L EcoBoost 4-cyl FWD', '1.6L EcoBoost 4-cyl AWD', '2.0L EcoBoost 4-cyl FWD', '2.0L EcoBoost 4-cyl AWD', '2.5L 4-cyl FWD'] },
    { from: 2020, to: 2026, engines: ['1.5L EcoBoost 3-cyl FWD', '1.5L EcoBoost 3-cyl AWD', '2.0L EcoBoost 4-cyl AWD', '2.5L Hybrid FWD', '2.5L Plug-in Hybrid FWD'] },
  ],

  'FORD|EDGE': [
    { from: 2007, to: 2010, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2011, to: 2014, engines: ['2.0L EcoBoost 4-cyl FWD', '2.0L EcoBoost 4-cyl AWD', '3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2015, to: 2026, engines: ['2.0L EcoBoost 4-cyl FWD', '2.0L EcoBoost 4-cyl AWD', '2.7L EcoBoost V6 AWD'] },
  ],

  'FORD|EXPEDITION': [
    { from: 1997, to: 2002, engines: ['4.6L V8 2WD', '4.6L V8 4WD', '5.4L V8 2WD', '5.4L V8 4WD'] },
    { from: 2003, to: 2006, engines: ['4.6L V8 2WD', '4.6L V8 4WD', '5.4L V8 2WD', '5.4L V8 4WD'] },
    { from: 2007, to: 2017, engines: ['5.4L V8 2WD', '5.4L V8 4WD'] },
    { from: 2018, to: 2026, engines: ['3.5L EcoBoost V6 2WD', '3.5L EcoBoost V6 4WD'] },
  ],

  'FORD|RANGER': [
    { from: 1983, to: 1992, engines: ['2.0L 4-cyl 2WD', '2.0L 4-cyl 4WD', '2.3L 4-cyl 2WD', '2.3L 4-cyl 4WD', '2.9L V6 2WD', '2.9L V6 4WD'] },
    { from: 1993, to: 1997, engines: ['2.3L 4-cyl 2WD', '2.3L 4-cyl 4WD', '3.0L V6 2WD', '3.0L V6 4WD', '4.0L V6 2WD', '4.0L V6 4WD'] },
    { from: 1998, to: 2011, engines: ['2.3L 4-cyl 2WD', '2.3L 4-cyl 4WD', '3.0L V6 2WD', '3.0L V6 4WD', '4.0L V6 2WD', '4.0L V6 4WD'] },
    { from: 2019, to: 2026, engines: ['2.3L EcoBoost 4-cyl 2WD', '2.3L EcoBoost 4-cyl 4WD', '2.7L EcoBoost V6 4WD'] },
  ],

  'FORD|BRONCO': [
    { from: 1980, to: 1996, engines: ['4.9L 6-cyl 4WD', '5.0L V8 4WD', '5.8L V8 4WD'] },
    { from: 2021, to: 2026, engines: ['2.3L EcoBoost 4-cyl 4WD', '2.7L EcoBoost V6 4WD'] },
  ],

  'FORD|BRONCO SPORT': [
    { from: 2021, to: 2026, engines: ['1.5L EcoBoost 3-cyl AWD', '2.0L EcoBoost 4-cyl AWD'] },
  ],

  'FORD|FUSION': [
    { from: 2006, to: 2009, engines: ['2.3L 4-cyl FWD', '2.3L 4-cyl AWD', '3.0L V6 FWD', '3.0L V6 AWD'] },
    { from: 2010, to: 2012, engines: ['2.5L 4-cyl FWD', '3.0L V6 FWD', '3.0L V6 AWD', '2.5L Hybrid FWD'] },
    { from: 2013, to: 2020, engines: ['1.5L EcoBoost 4-cyl FWD', '2.0L EcoBoost 4-cyl FWD', '2.0L EcoBoost 4-cyl AWD', '2.5L Hybrid FWD', '2.0L Plug-in Hybrid FWD', '1.6L EcoBoost 4-cyl FWD', '2.7L EcoBoost V6 AWD'] },
  ],

  'FORD|FOCUS': [
    { from: 2000, to: 2007, engines: ['2.0L 4-cyl', '2.3L 4-cyl ST'] },
    { from: 2008, to: 2011, engines: ['2.0L 4-cyl'] },
    { from: 2012, to: 2018, engines: ['2.0L 4-cyl', '1.0L EcoBoost 3-cyl', '2.0L Turbo ST 4-cyl', '2.3L Turbo RS 4-cyl AWD'] },
  ],

  'FORD|TAURUS': [
    { from: 1986, to: 1995, engines: ['2.5L 4-cyl', '3.0L V6', '3.8L V6'] },
    { from: 1996, to: 2007, engines: ['3.0L V6', '3.0L Duratec V6'] },
    { from: 2008, to: 2009, engines: ['3.5L V6'] },
    { from: 2010, to: 2019, engines: ['3.5L V6', '3.5L EcoBoost V6', '2.0L EcoBoost 4-cyl'] },
  ],

  'FORD|MAVERICK': [
    { from: 2022, to: 2026, engines: ['2.5L Hybrid FWD', '2.0L EcoBoost 4-cyl FWD', '2.0L EcoBoost 4-cyl AWD'] },
  ],

  'FORD|CROWN VICTORIA': [
    { from: 1992, to: 2011, engines: ['4.6L V8'] },
  ],

  'FORD|EXCURSION': [
    { from: 2000, to: 2005, engines: ['5.4L V8 2WD', '5.4L V8 4WD', '6.8L V10 2WD', '6.8L V10 4WD', '7.3L Power Stroke Diesel V8 2WD', '7.3L Power Stroke Diesel V8 4WD', '6.0L Power Stroke Diesel V8 2WD', '6.0L Power Stroke Diesel V8 4WD'] },
  ],

  'FORD|FLEX': [
    { from: 2009, to: 2019, engines: ['3.5L V6 FWD', '3.5L V6 AWD', '3.5L EcoBoost V6 AWD'] },
  ],

  'FORD|TRANSIT': [
    { from: 2015, to: 2026, engines: ['3.5L V6 RWD', '3.5L EcoBoost V6 RWD', '3.5L EcoBoost V6 AWD', '2.0L EcoBlue Diesel RWD', '3.5L Hybrid V6'] },
  ],

  // ── CHEVROLET ───────────────────────────────────────────────────────────────

  'CHEVROLET|SILVERADO 1500': [
    { from: 1999, to: 2006, engines: ['4.3L V6 2WD', '4.3L V6 4WD', '4.8L V8 2WD', '4.8L V8 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.0L V8 2WD', '6.0L V8 4WD'] },
    { from: 2007, to: 2013, engines: ['4.3L V6 2WD', '4.3L V6 4WD', '4.8L V8 2WD', '4.8L V8 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.0L V8 2WD', '6.0L V8 4WD', '6.2L V8 2WD', '6.2L V8 4WD'] },
    { from: 2014, to: 2018, engines: ['4.3L V6 2WD', '4.3L V6 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.2L V8 2WD', '6.2L V8 4WD'] },
    { from: 2019, to: 2026, engines: ['2.7L Turbo 4-cyl 2WD', '2.7L Turbo 4-cyl 4WD', '3.0L Duramax Diesel 6-cyl 2WD', '3.0L Duramax Diesel 6-cyl 4WD', '4.3L V6 2WD', '4.3L V6 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.2L V8 2WD', '6.2L V8 4WD'] },
  ],

  'CHEVROLET|SILVERADO 2500HD': [
    { from: 2001, to: 2010, engines: ['6.0L V8 2WD', '6.0L V8 4WD', '6.6L Duramax Diesel V8 2WD', '6.6L Duramax Diesel V8 4WD', '8.1L V8 2WD', '8.1L V8 4WD'] },
    { from: 2011, to: 2019, engines: ['6.0L V8 2WD', '6.0L V8 4WD', '6.6L Duramax Diesel V8 2WD', '6.6L Duramax Diesel V8 4WD'] },
    { from: 2020, to: 2026, engines: ['6.6L V8 2WD', '6.6L V8 4WD', '6.6L Duramax Diesel V8 2WD', '6.6L Duramax Diesel V8 4WD'] },
  ],

  'CHEVROLET|CAMARO': [
    { from: 1980, to: 1981, engines: ['3.8L V6', '4.4L V8', '5.0L V8', '5.7L V8'] },
    { from: 1982, to: 1992, engines: ['2.5L 4-cyl', '2.8L V6', '3.1L V6', '5.0L TBI V8', '5.0L TPI V8', '5.7L TPI V8 IROC-Z'] },
    { from: 1993, to: 1997, engines: ['3.4L V6', '5.7L LT1 V8 Z28', '5.7L LT1 V8 SS'] },
    { from: 1998, to: 2002, engines: ['3.8L V6', '5.7L LS1 V8 Z28', '5.7L LS1 V8 SS'] },
    { from: 2010, to: 2015, engines: ['3.6L V6', '6.2L V8 SS', '7.0L V8 Z/28'] },
    { from: 2016, to: 2024, engines: ['2.0L Turbo 4-cyl', '3.6L V6', '6.2L V8 SS', '6.2L Supercharged V8 ZL1'] },
  ],

  'CHEVROLET|CORVETTE': [
    { from: 1980, to: 1982, engines: ['5.7L V8'] },
    { from: 1984, to: 1991, engines: ['5.7L TPI V8'] },
    { from: 1992, to: 1996, engines: ['5.7L LT1 V8', '5.7L LT4 V8'] },
    { from: 1997, to: 2004, engines: ['5.7L LS1 V8', '5.7L LS6 V8 Z06'] },
    { from: 2005, to: 2013, engines: ['6.0L LS2 V8', '7.0L LS7 V8 Z06', '6.2L LS3 V8', '6.2L Supercharged LSA V8 ZR1', '6.2L LS9 Supercharged V8 ZR1'] },
    { from: 2014, to: 2019, engines: ['6.2L LT1 V8', '6.2L LT4 Supercharged V8 Z06', '6.2L LT2 V8'] },
    { from: 2020, to: 2026, engines: ['6.2L LT2 V8 Mid-Engine', '5.5L LT6 Flat-Plane V8 Z06', '5.5L Twin-Turbo V8 E-Ray', '6.2L Supercharged V8 ZR1'] },
  ],

  'CHEVROLET|EQUINOX': [
    { from: 2005, to: 2009, engines: ['3.4L V6 FWD', '3.4L V6 AWD', '3.6L V6 Sport AWD'] },
    { from: 2010, to: 2017, engines: ['2.4L 4-cyl FWD', '2.4L 4-cyl AWD', '3.0L V6 AWD'] },
    { from: 2018, to: 2026, engines: ['1.5L Turbo 4-cyl FWD', '1.5L Turbo 4-cyl AWD', '2.0L Turbo 4-cyl AWD'] },
  ],

  'CHEVROLET|TAHOE': [
    { from: 1995, to: 1999, engines: ['5.7L V8 2WD', '5.7L V8 4WD', '6.5L Turbo Diesel V8 2WD', '6.5L Turbo Diesel V8 4WD'] },
    { from: 2000, to: 2006, engines: ['4.8L V8 2WD', '4.8L V8 4WD', '5.3L V8 2WD', '5.3L V8 4WD'] },
    { from: 2007, to: 2014, engines: ['4.8L V8 2WD', '4.8L V8 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.0L Hybrid V8 2WD', '6.0L Hybrid V8 4WD'] },
    { from: 2015, to: 2020, engines: ['5.3L V8 2WD', '5.3L V8 4WD', '6.2L V8 2WD', '6.2L V8 4WD'] },
    { from: 2021, to: 2026, engines: ['5.3L V8 2WD', '5.3L V8 4WD', '6.2L V8 2WD', '6.2L V8 4WD', '3.0L Duramax Diesel 6-cyl 2WD', '3.0L Duramax Diesel 6-cyl 4WD'] },
  ],

  'CHEVROLET|SUBURBAN': [
    { from: 1992, to: 1999, engines: ['5.7L V8 2WD', '5.7L V8 4WD', '7.4L V8 2WD', '7.4L V8 4WD', '6.5L Turbo Diesel V8 4WD'] },
    { from: 2000, to: 2006, engines: ['4.8L V8 2WD', '4.8L V8 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '8.1L V8 2WD', '8.1L V8 4WD'] },
    { from: 2007, to: 2014, engines: ['5.3L V8 2WD', '5.3L V8 4WD', '6.0L V8 2WD', '6.0L V8 4WD'] },
    { from: 2015, to: 2020, engines: ['5.3L V8 2WD', '5.3L V8 4WD', '6.2L V8 2WD', '6.2L V8 4WD'] },
    { from: 2021, to: 2026, engines: ['5.3L V8 2WD', '5.3L V8 4WD', '6.2L V8 2WD', '6.2L V8 4WD', '3.0L Duramax Diesel 6-cyl 2WD', '3.0L Duramax Diesel 6-cyl 4WD'] },
  ],

  'CHEVROLET|COLORADO': [
    { from: 2004, to: 2012, engines: ['2.9L 4-cyl 2WD', '2.9L 4-cyl 4WD', '3.7L 5-cyl 2WD', '3.7L 5-cyl 4WD', '5.3L V8 2WD', '5.3L V8 4WD'] },
    { from: 2015, to: 2022, engines: ['2.5L 4-cyl 2WD', '2.5L 4-cyl 4WD', '3.6L V6 2WD', '3.6L V6 4WD', '2.8L Duramax Diesel 4-cyl 2WD', '2.8L Duramax Diesel 4-cyl 4WD'] },
    { from: 2023, to: 2026, engines: ['2.7L Turbo 4-cyl 2WD', '2.7L Turbo 4-cyl 4WD', '2.7L Turbo+ 4-cyl 2WD', '2.7L Turbo+ 4-cyl 4WD'] },
  ],

  'CHEVROLET|MALIBU': [
    { from: 1980, to: 1983, engines: ['3.8L V6', '4.4L V8', '5.0L V8'] },
    { from: 1997, to: 2003, engines: ['2.4L 4-cyl', '3.1L V6'] },
    { from: 2004, to: 2007, engines: ['2.2L 4-cyl', '3.5L V6', '2.4L 4-cyl Maxx'] },
    { from: 2008, to: 2012, engines: ['2.4L 4-cyl', '3.6L V6'] },
    { from: 2013, to: 2015, engines: ['2.0L Turbo 4-cyl', '2.5L 4-cyl', '2.4L Hybrid 4-cyl'] },
    { from: 2016, to: 2024, engines: ['1.5L Turbo 4-cyl', '2.0L Turbo 4-cyl'] },
  ],

  'CHEVROLET|TRAVERSE': [
    { from: 2009, to: 2017, engines: ['3.6L V6 FWD', '3.6L V6 AWD'] },
    { from: 2018, to: 2022, engines: ['2.0L Turbo 4-cyl FWD', '3.6L V6 FWD', '3.6L V6 AWD'] },
    { from: 2024, to: 2026, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '3.6L V6 FWD', '3.6L V6 AWD'] },
  ],

  'CHEVROLET|TRAILBLAZER': [
    { from: 2002, to: 2009, engines: ['4.2L 6-cyl 2WD', '4.2L 6-cyl 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.0L V8 SS 2WD', '6.0L V8 SS 4WD'] },
    { from: 2021, to: 2026, engines: ['1.2L Turbo 3-cyl FWD', '1.3L Turbo 3-cyl FWD', '1.3L Turbo 3-cyl AWD'] },
  ],

  'CHEVROLET|IMPALA': [
    { from: 1980, to: 1985, engines: ['3.8L V6', '5.0L V8'] },
    { from: 2000, to: 2005, engines: ['3.4L V6', '3.8L V6', '3.8L Supercharged V6 SS', '5.3L V8 SS'] },
    { from: 2006, to: 2013, engines: ['3.5L V6', '3.9L V6', '5.3L V8 SS'] },
    { from: 2014, to: 2020, engines: ['2.5L 4-cyl', '3.6L V6', '2.0L Turbo Biturbo'] },
  ],

  'CHEVROLET|CRUZE': [
    { from: 2011, to: 2016, engines: ['1.4L Turbo 4-cyl', '1.8L 4-cyl'] },
    { from: 2016, to: 2019, engines: ['1.4L Turbo 4-cyl', '1.6L Turbo Diesel 4-cyl'] },
  ],

  'CHEVROLET|SONIC': [
    { from: 2012, to: 2020, engines: ['1.4L Turbo 4-cyl', '1.8L 4-cyl'] },
  ],

  'CHEVROLET|SPARK': [
    { from: 2013, to: 2022, engines: ['1.2L 4-cyl', '1.4L 4-cyl'] },
  ],

  'CHEVROLET|COBALT': [
    { from: 2005, to: 2010, engines: ['2.2L 4-cyl', '2.0L Supercharged SS 4-cyl', '2.4L 4-cyl'] },
  ],

  'CHEVROLET|CAVALIER': [
    { from: 1982, to: 2005, engines: ['2.0L 4-cyl', '2.2L 4-cyl', '2.4L 4-cyl', '3.1L V6'] },
  ],

  'CHEVROLET|AVALANCHE': [
    { from: 2002, to: 2013, engines: ['5.3L V8 4WD', '8.1L V8 4WD', '6.0L V8 4WD', '6.2L V8 4WD'] },
  ],

  'CHEVROLET|S-10': [
    { from: 1982, to: 2004, engines: ['2.0L 4-cyl 2WD', '2.2L 4-cyl 2WD', '2.2L 4-cyl 4WD', '2.5L 4-cyl 2WD', '4.3L V6 2WD', '4.3L V6 4WD'] },
  ],

  'CHEVROLET|HHR': [
    { from: 2006, to: 2011, engines: ['2.0L Turbo SS 4-cyl', '2.2L 4-cyl', '2.4L 4-cyl'] },
  ],

  'CHEVROLET|SSR': [
    { from: 2003, to: 2006, engines: ['5.3L V8', '6.0L V8'] },
  ],

  // ── GMC ─────────────────────────────────────────────────────────────────────

  'GMC|SIERRA 1500': [
    { from: 1999, to: 2006, engines: ['4.3L V6 2WD', '4.3L V6 4WD', '4.8L V8 2WD', '4.8L V8 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.0L V8 2WD', '6.0L V8 4WD'] },
    { from: 2007, to: 2013, engines: ['4.3L V6 2WD', '4.3L V6 4WD', '4.8L V8 2WD', '4.8L V8 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.0L V8 2WD', '6.0L V8 4WD', '6.2L V8 2WD', '6.2L V8 4WD'] },
    { from: 2014, to: 2018, engines: ['4.3L V6 2WD', '4.3L V6 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.2L V8 2WD', '6.2L V8 4WD'] },
    { from: 2019, to: 2026, engines: ['2.7L Turbo 4-cyl 2WD', '2.7L Turbo 4-cyl 4WD', '3.0L Duramax Diesel 6-cyl 2WD', '3.0L Duramax Diesel 6-cyl 4WD', '4.3L V6 2WD', '4.3L V6 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.2L V8 2WD', '6.2L V8 4WD'] },
  ],

  'GMC|SIERRA 2500HD': [
    { from: 2001, to: 2010, engines: ['6.0L V8 2WD', '6.0L V8 4WD', '6.6L Duramax Diesel V8 2WD', '6.6L Duramax Diesel V8 4WD', '8.1L V8 2WD', '8.1L V8 4WD'] },
    { from: 2011, to: 2019, engines: ['6.0L V8 2WD', '6.0L V8 4WD', '6.6L Duramax Diesel V8 2WD', '6.6L Duramax Diesel V8 4WD'] },
    { from: 2020, to: 2026, engines: ['6.6L V8 2WD', '6.6L V8 4WD', '6.6L Duramax Diesel V8 2WD', '6.6L Duramax Diesel V8 4WD'] },
  ],

  'GMC|YUKON': [
    { from: 1992, to: 1999, engines: ['5.7L V8 2WD', '5.7L V8 4WD'] },
    { from: 2000, to: 2006, engines: ['4.8L V8 2WD', '4.8L V8 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.0L V8 Denali 2WD', '6.0L V8 Denali 4WD'] },
    { from: 2007, to: 2014, engines: ['5.3L V8 2WD', '5.3L V8 4WD', '6.2L V8 Denali 2WD', '6.2L V8 Denali 4WD'] },
    { from: 2015, to: 2020, engines: ['5.3L V8 2WD', '5.3L V8 4WD', '6.2L V8 Denali 2WD', '6.2L V8 Denali 4WD'] },
    { from: 2021, to: 2026, engines: ['5.3L V8 2WD', '5.3L V8 4WD', '6.2L V8 Denali 2WD', '6.2L V8 Denali 4WD', '3.0L Duramax Diesel 6-cyl 2WD', '3.0L Duramax Diesel 6-cyl 4WD'] },
  ],

  'GMC|CANYON': [
    { from: 2004, to: 2012, engines: ['2.9L 4-cyl 2WD', '2.9L 4-cyl 4WD', '3.7L 5-cyl 2WD', '3.7L 5-cyl 4WD', '5.3L V8 2WD', '5.3L V8 4WD'] },
    { from: 2015, to: 2022, engines: ['2.5L 4-cyl 2WD', '2.5L 4-cyl 4WD', '3.6L V6 2WD', '3.6L V6 4WD', '2.8L Duramax Diesel 4-cyl 2WD', '2.8L Duramax Diesel 4-cyl 4WD'] },
    { from: 2023, to: 2026, engines: ['2.7L Turbo 4-cyl 2WD', '2.7L Turbo 4-cyl 4WD'] },
  ],

  'GMC|TERRAIN': [
    { from: 2010, to: 2017, engines: ['2.4L 4-cyl FWD', '2.4L 4-cyl AWD', '3.0L V6 AWD'] },
    { from: 2018, to: 2026, engines: ['1.5L Turbo 4-cyl FWD', '1.5L Turbo 4-cyl AWD', '2.0L Turbo 4-cyl AWD', '1.6L Turbo Diesel 4-cyl FWD', '1.6L Turbo Diesel 4-cyl AWD'] },
  ],

  'GMC|ACADIA': [
    { from: 2007, to: 2016, engines: ['3.6L V6 FWD', '3.6L V6 AWD'] },
    { from: 2017, to: 2023, engines: ['2.0L Turbo 4-cyl FWD', '3.6L V6 FWD', '3.6L V6 AWD'] },
    { from: 2024, to: 2026, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '3.6L V6 FWD', '3.6L V6 AWD'] },
  ],

  'GMC|ENVOY': [
    { from: 2002, to: 2009, engines: ['4.2L 6-cyl 2WD', '4.2L 6-cyl 4WD', '5.3L V8 2WD', '5.3L V8 4WD', '6.0L V8 Denali 2WD', '6.0L V8 Denali 4WD'] },
  ],

  // ── DODGE / RAM / CHRYSLER ──────────────────────────────────────────────────

  'DODGE|CHARGER': [
    { from: 1980, to: 1987, engines: ['2.2L 4-cyl', '2.6L 4-cyl', '2.2L Turbo 4-cyl'] },
    { from: 2006, to: 2010, engines: ['2.7L V6', '3.5L V6', '5.7L HEMI V8', '6.1L HEMI SRT8 V8'] },
    { from: 2011, to: 2014, engines: ['3.6L V6', '5.7L HEMI V8', '6.4L HEMI SRT8 V8'] },
    { from: 2015, to: 2023, engines: ['3.6L V6', '5.7L HEMI V8', '6.4L HEMI 392 V8', '6.2L Supercharged HEMI Hellcat V8', '6.2L Supercharged HEMI Super Stock V8', '6.2L Supercharged HEMI Demon 170 V8'] },
    { from: 2024, to: 2026, engines: ['2.7L Hurricane Twin-Turbo 6-cyl', '3.0L Hurricane Twin-Turbo 6-cyl', '6.2L Supercharged HEMI Banshee V8'] },
  ],

  'DODGE|CHALLENGER': [
    { from: 1980, to: 1983, engines: ['2.0L 4-cyl', '2.6L 4-cyl'] },
    { from: 2008, to: 2014, engines: ['3.5L V6', '3.6L V6', '5.7L HEMI V8', '6.1L HEMI SRT8 V8'] },
    { from: 2015, to: 2023, engines: ['3.6L V6', '5.7L HEMI V8', '6.4L HEMI 392 V8', '6.2L Supercharged HEMI Hellcat V8', '6.2L Supercharged HEMI Redeye V8', '6.2L Supercharged HEMI Demon V8', '6.2L Supercharged HEMI Super Stock V8'] },
  ],

  'DODGE|DURANGO': [
    { from: 1998, to: 2003, engines: ['3.9L V6 2WD', '3.9L V6 4WD', '4.7L V8 2WD', '4.7L V8 4WD', '5.2L V8 2WD', '5.2L V8 4WD', '5.9L V8 2WD', '5.9L V8 4WD'] },
    { from: 2004, to: 2009, engines: ['3.7L V6 2WD', '3.7L V6 4WD', '4.7L V8 2WD', '4.7L V8 4WD', '5.7L HEMI V8 2WD', '5.7L HEMI V8 4WD'] },
    { from: 2011, to: 2026, engines: ['3.6L V6 2WD', '3.6L V6 AWD', '5.7L HEMI V8 2WD', '5.7L HEMI V8 AWD', '6.4L HEMI SRT V8 AWD', '6.2L Supercharged Hellcat V8 AWD'] },
  ],

  'DODGE|GRAND CARAVAN': [
    { from: 1984, to: 1995, engines: ['2.2L 4-cyl', '2.5L 4-cyl', '2.6L 4-cyl', '3.0L V6', '3.3L V6'] },
    { from: 1996, to: 2007, engines: ['3.3L V6', '3.8L V6'] },
    { from: 2008, to: 2020, engines: ['3.3L V6', '3.8L V6', '3.6L V6'] },
  ],

  'DODGE|DAKOTA': [
    { from: 1987, to: 1996, engines: ['2.2L 4-cyl 2WD', '3.9L V6 2WD', '3.9L V6 4WD', '5.2L V8 2WD', '5.2L V8 4WD'] },
    { from: 1997, to: 2004, engines: ['2.5L 4-cyl 2WD', '3.9L V6 2WD', '3.9L V6 4WD', '4.7L V8 2WD', '4.7L V8 4WD', '5.9L V8 2WD', '5.9L V8 4WD'] },
    { from: 2005, to: 2011, engines: ['3.7L V6 2WD', '3.7L V6 4WD', '4.7L V8 2WD', '4.7L V8 4WD'] },
  ],

  'DODGE|JOURNEY': [
    { from: 2009, to: 2020, engines: ['2.4L 4-cyl FWD', '3.5L V6 FWD', '3.5L V6 AWD', '3.6L V6 FWD', '3.6L V6 AWD'] },
  ],

  'DODGE|VIPER': [
    { from: 1992, to: 2002, engines: ['8.0L V10'] },
    { from: 2003, to: 2010, engines: ['8.3L V10', '8.4L V10'] },
    { from: 2013, to: 2017, engines: ['8.4L V10', '8.4L V10 ACR'] },
  ],

  'DODGE|NEON': [
    { from: 1995, to: 1999, engines: ['2.0L 4-cyl', '2.0L DOHC 4-cyl ACR'] },
    { from: 2000, to: 2005, engines: ['2.0L 4-cyl', '2.4L Turbo SRT-4 4-cyl'] },
  ],

  'DODGE|CALIBER': [
    { from: 2007, to: 2012, engines: ['1.8L 4-cyl FWD', '2.0L 4-cyl FWD', '2.4L 4-cyl FWD', '2.4L 4-cyl AWD', '2.0L Turbo SRT-4 4-cyl FWD'] },
  ],

  'DODGE|AVENGER': [
    { from: 1995, to: 2000, engines: ['2.0L 4-cyl', '2.5L V6'] },
    { from: 2008, to: 2014, engines: ['2.4L 4-cyl', '2.7L V6', '3.5L V6'] },
  ],

  'RAM|1500': [
    { from: 1994, to: 2001, engines: ['3.9L V6 2WD', '3.9L V6 4WD', '5.2L V8 2WD', '5.2L V8 4WD', '5.9L V8 2WD', '5.9L V8 4WD', '8.0L V10 2WD', '8.0L V10 4WD', '5.9L Cummins Diesel 6-cyl 2WD', '5.9L Cummins Diesel 6-cyl 4WD'] },
    { from: 2002, to: 2008, engines: ['3.7L V6 2WD', '3.7L V6 4WD', '4.7L V8 2WD', '4.7L V8 4WD', '5.7L HEMI V8 2WD', '5.7L HEMI V8 4WD', '8.3L V10 2WD', '8.3L V10 4WD'] },
    { from: 2009, to: 2018, engines: ['3.6L V6 2WD', '3.6L V6 4WD', '4.7L V8 2WD', '4.7L V8 4WD', '5.7L HEMI V8 2WD', '5.7L HEMI V8 4WD', '3.0L EcoDiesel V6 2WD', '3.0L EcoDiesel V6 4WD'] },
    { from: 2019, to: 2026, engines: ['3.6L V6 2WD', '3.6L V6 4WD', '5.7L HEMI V8 2WD', '5.7L HEMI V8 4WD', '3.0L EcoDiesel V6 2WD', '3.0L EcoDiesel V6 4WD', '4.4L Hurricane Twin-Turbo 6-cyl 2WD', '4.4L Hurricane Twin-Turbo 6-cyl 4WD'] },
  ],

  'RAM|2500': [
    { from: 1994, to: 2002, engines: ['5.9L V8 2WD', '5.9L V8 4WD', '8.0L V10 2WD', '8.0L V10 4WD', '5.9L Cummins Diesel 6-cyl 2WD', '5.9L Cummins Diesel 6-cyl 4WD'] },
    { from: 2003, to: 2009, engines: ['5.7L HEMI V8 2WD', '5.7L HEMI V8 4WD', '5.9L Cummins Diesel 6-cyl 2WD', '5.9L Cummins Diesel 6-cyl 4WD', '6.7L Cummins Diesel 6-cyl 2WD', '6.7L Cummins Diesel 6-cyl 4WD'] },
    { from: 2010, to: 2026, engines: ['5.7L HEMI V8 2WD', '5.7L HEMI V8 4WD', '6.4L HEMI V8 2WD', '6.4L HEMI V8 4WD', '6.7L Cummins Diesel 6-cyl 2WD', '6.7L Cummins Diesel 6-cyl 4WD'] },
  ],

  'RAM|3500': [
    { from: 1994, to: 2002, engines: ['5.9L V8 2WD', '5.9L V8 4WD', '8.0L V10 2WD', '8.0L V10 4WD', '5.9L Cummins Diesel 6-cyl 2WD', '5.9L Cummins Diesel 6-cyl 4WD'] },
    { from: 2003, to: 2009, engines: ['5.7L HEMI V8 2WD', '5.7L HEMI V8 4WD', '5.9L Cummins Diesel 6-cyl 2WD', '5.9L Cummins Diesel 6-cyl 4WD', '6.7L Cummins Diesel 6-cyl 2WD', '6.7L Cummins Diesel 6-cyl 4WD'] },
    { from: 2010, to: 2026, engines: ['5.7L HEMI V8 2WD', '5.7L HEMI V8 4WD', '6.4L HEMI V8 2WD', '6.4L HEMI V8 4WD', '6.7L Cummins Diesel 6-cyl 2WD', '6.7L Cummins Diesel 6-cyl 4WD'] },
  ],

  'CHRYSLER|300': [
    { from: 2005, to: 2010, engines: ['2.7L V6', '3.5L V6', '5.7L HEMI V8', '6.1L HEMI SRT8 V8'] },
    { from: 2011, to: 2023, engines: ['3.6L V6', '5.7L HEMI V8', '6.4L HEMI SRT8 V8'] },
  ],

  'CHRYSLER|PACIFICA': [
    { from: 2004, to: 2008, engines: ['3.5L V6 FWD', '3.5L V6 AWD', '4.0L V6 FWD', '4.0L V6 AWD'] },
    { from: 2017, to: 2026, engines: ['3.6L V6', '3.6L Plug-in Hybrid'] },
  ],

  'CHRYSLER|PT CRUISER': [
    { from: 2001, to: 2010, engines: ['2.4L 4-cyl', '2.4L Turbo GT 4-cyl'] },
  ],

  'CHRYSLER|SEBRING': [
    { from: 1995, to: 2000, engines: ['2.0L 4-cyl', '2.5L V6'] },
    { from: 2001, to: 2006, engines: ['2.4L 4-cyl', '2.7L V6'] },
    { from: 2007, to: 2010, engines: ['2.4L 4-cyl', '2.7L V6', '3.5L V6'] },
  ],

  'CHRYSLER|TOWN & COUNTRY': [
    { from: 1990, to: 1995, engines: ['3.0L V6', '3.3L V6', '3.8L V6'] },
    { from: 1996, to: 2010, engines: ['3.3L V6', '3.8L V6'] },
    { from: 2011, to: 2016, engines: ['3.6L V6'] },
  ],

  // ── JEEP ────────────────────────────────────────────────────────────────────

  'JEEP|WRANGLER': [
    { from: 1987, to: 1995, engines: ['2.5L 4-cyl 4WD', '4.0L 6-cyl 4WD'] },
    { from: 1997, to: 2006, engines: ['2.4L 4-cyl 4WD', '4.0L 6-cyl 4WD'] },
    { from: 2007, to: 2011, engines: ['3.8L V6 4WD'] },
    { from: 2012, to: 2018, engines: ['3.6L V6 4WD'] },
    { from: 2018, to: 2026, engines: ['2.0L Turbo 4-cyl 4WD', '3.6L V6 4WD', '3.0L EcoDiesel V6 4WD', '3.6L 4xe Plug-in Hybrid 4WD'] },
  ],

  'JEEP|GRAND CHEROKEE': [
    { from: 1993, to: 1998, engines: ['4.0L 6-cyl 2WD', '4.0L 6-cyl 4WD', '5.2L V8 2WD', '5.2L V8 4WD', '5.9L V8 Limited 4WD'] },
    { from: 1999, to: 2004, engines: ['4.0L 6-cyl 2WD', '4.0L 6-cyl 4WD', '4.7L V8 2WD', '4.7L V8 4WD', '4.7L High Output V8 4WD'] },
    { from: 2005, to: 2010, engines: ['3.7L V6 2WD', '3.7L V6 4WD', '4.7L V8 2WD', '4.7L V8 4WD', '5.7L HEMI V8 2WD', '5.7L HEMI V8 4WD', '6.1L HEMI SRT8 V8 4WD', '3.0L CRD Diesel V6 4WD'] },
    { from: 2011, to: 2021, engines: ['3.6L V6 2WD', '3.6L V6 4WD', '5.7L HEMI V8 2WD', '5.7L HEMI V8 4WD', '6.4L HEMI SRT V8 4WD', '6.2L Supercharged Trackhawk V8 4WD', '3.0L EcoDiesel V6 4WD'] },
    { from: 2022, to: 2026, engines: ['2.0L Turbo 4-cyl 2WD', '2.0L Turbo 4-cyl 4WD', '3.6L V6 2WD', '3.6L V6 4WD', '5.7L HEMI V8 4WD', '6.4L HEMI V8 4WD', '3.0L EcoDiesel V6 4WD', '3.6L 4xe Plug-in Hybrid 4WD'] },
  ],

  'JEEP|CHEROKEE': [
    { from: 1984, to: 2001, engines: ['2.5L 4-cyl 2WD', '2.5L 4-cyl 4WD', '4.0L 6-cyl 2WD', '4.0L 6-cyl 4WD'] },
    { from: 2014, to: 2023, engines: ['2.0L Turbo 4-cyl FWD', '2.0L Turbo 4-cyl 4WD', '2.4L 4-cyl FWD', '2.4L 4-cyl 4WD', '3.2L V6 FWD', '3.2L V6 4WD'] },
  ],

  'JEEP|COMPASS': [
    { from: 2007, to: 2016, engines: ['2.0L 4-cyl FWD', '2.0L 4-cyl 4WD', '2.4L 4-cyl FWD', '2.4L 4-cyl 4WD', '2.4L Turbo SRT4 4-cyl FWD'] },
    { from: 2017, to: 2026, engines: ['2.0L 4-cyl FWD', '2.4L 4-cyl FWD', '2.4L 4-cyl 4WD'] },
  ],

  'JEEP|COMMANDER': [
    { from: 2006, to: 2010, engines: ['3.7L V6 2WD', '3.7L V6 4WD', '4.7L V8 2WD', '4.7L V8 4WD', '5.7L HEMI V8 4WD', '3.0L CRD Diesel V6 4WD'] },
  ],

  'JEEP|LIBERTY': [
    { from: 2002, to: 2007, engines: ['2.4L 4-cyl 4WD', '3.7L V6 2WD', '3.7L V6 4WD', '2.8L CRD Diesel 4-cyl 4WD'] },
    { from: 2008, to: 2012, engines: ['3.7L V6 2WD', '3.7L V6 4WD', '2.8L CRD Diesel 4-cyl 4WD'] },
  ],

  'JEEP|GLADIATOR': [
    { from: 2020, to: 2026, engines: ['3.6L V6 4WD', '3.0L EcoDiesel V6 4WD'] },
  ],

  'JEEP|RENEGADE': [
    { from: 2015, to: 2026, engines: ['1.3L Turbo 4-cyl FWD', '1.3L Turbo 4-cyl 4WD', '2.4L 4-cyl FWD', '2.4L 4-cyl 4WD'] },
  ],

  'JEEP|PATRIOT': [
    { from: 2007, to: 2017, engines: ['2.0L 4-cyl FWD', '2.0L 4-cyl 4WD', '2.4L 4-cyl FWD', '2.4L 4-cyl 4WD'] },
  ],

  'JEEP|WAGONEER': [
    { from: 2022, to: 2026, engines: ['3.0L Hurricane Twin-Turbo 6-cyl 4WD', '5.7L HEMI V8 4WD'] },
  ],

  'JEEP|GRAND WAGONEER': [
    { from: 2022, to: 2026, engines: ['3.0L Hurricane Twin-Turbo 6-cyl 4WD', '6.4L HEMI V8 4WD'] },
  ],

  // ── NISSAN ──────────────────────────────────────────────────────────────────

  'NISSAN|ALTIMA': [
    { from: 1993, to: 1997, engines: ['2.4L 4-cyl'] },
    { from: 1998, to: 2001, engines: ['2.4L 4-cyl', '3.5L V6'] },
    { from: 2002, to: 2006, engines: ['2.5L 4-cyl', '3.5L V6'] },
    { from: 2007, to: 2012, engines: ['2.5L 4-cyl', '3.5L V6'] },
    { from: 2013, to: 2018, engines: ['2.5L 4-cyl', '3.5L V6'] },
    { from: 2019, to: 2026, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '2.0L Turbo VC 4-cyl FWD', '2.0L Turbo VC 4-cyl AWD'] },
  ],

  'NISSAN|ROGUE': [
    { from: 2008, to: 2013, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD'] },
    { from: 2014, to: 2020, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD'] },
    { from: 2021, to: 2026, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '1.5L Turbo 3-cyl Hybrid AWD'] },
  ],

  'NISSAN|PATHFINDER': [
    { from: 1987, to: 1995, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl 4WD', '3.0L V6 2WD', '3.0L V6 4WD'] },
    { from: 1996, to: 2004, engines: ['3.3L V6 2WD', '3.3L V6 4WD'] },
    { from: 2005, to: 2012, engines: ['4.0L V6 2WD', '4.0L V6 4WD', '5.6L V8 LE 4WD'] },
    { from: 2013, to: 2021, engines: ['3.5L V6 FWD', '3.5L V6 4WD', '2.5L Hybrid 4-cyl AWD'] },
    { from: 2022, to: 2026, engines: ['3.5L V6 FWD', '3.5L V6 4WD'] },
  ],

  'NISSAN|FRONTIER': [
    { from: 1998, to: 2004, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl 4WD', '3.3L V6 2WD', '3.3L V6 4WD', '3.3L Supercharged V6 2WD', '3.3L Supercharged V6 4WD'] },
    { from: 2005, to: 2021, engines: ['2.5L 4-cyl 2WD', '2.5L 4-cyl 4WD', '4.0L V6 2WD', '4.0L V6 4WD'] },
    { from: 2022, to: 2026, engines: ['3.8L V6 2WD', '3.8L V6 4WD'] },
  ],

  'NISSAN|TITAN': [
    { from: 2004, to: 2015, engines: ['5.6L V8 2WD', '5.6L V8 4WD'] },
    { from: 2016, to: 2026, engines: ['5.6L V8 2WD', '5.6L V8 4WD'] },
  ],

  'NISSAN|TITAN XD': [
    { from: 2016, to: 2026, engines: ['5.6L V8 2WD', '5.6L V8 4WD', '5.0L Cummins Diesel V8 2WD', '5.0L Cummins Diesel V8 4WD'] },
  ],

  'NISSAN|ARMADA': [
    { from: 2004, to: 2015, engines: ['5.6L V8 2WD', '5.6L V8 4WD'] },
    { from: 2017, to: 2026, engines: ['5.6L V8 2WD', '5.6L V8 4WD'] },
  ],

  'NISSAN|MURANO': [
    { from: 2003, to: 2007, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2009, to: 2014, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2015, to: 2026, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
  ],

  'NISSAN|SENTRA': [
    { from: 1982, to: 1994, engines: ['1.4L 4-cyl', '1.6L 4-cyl'] },
    { from: 1995, to: 2006, engines: ['1.6L 4-cyl', '1.8L 4-cyl', '2.0L SE-R 4-cyl', '2.5L SE-R Spec V 4-cyl'] },
    { from: 2007, to: 2012, engines: ['2.0L 4-cyl', '2.5L SE-R Spec V 4-cyl'] },
    { from: 2013, to: 2019, engines: ['1.8L 4-cyl'] },
    { from: 2020, to: 2026, engines: ['2.0L 4-cyl'] },
  ],

  'NISSAN|MAXIMA': [
    { from: 1985, to: 1994, engines: ['3.0L V6'] },
    { from: 1995, to: 2003, engines: ['3.0L V6', '3.5L V6'] },
    { from: 2004, to: 2008, engines: ['3.5L V6'] },
    { from: 2009, to: 2026, engines: ['3.5L V6'] },
  ],

  'NISSAN|350Z': [
    { from: 2003, to: 2009, engines: ['3.5L V6 RWD', '3.5L V6 Nismo RWD'] },
  ],

  'NISSAN|370Z': [
    { from: 2009, to: 2020, engines: ['3.7L V6 RWD', '3.7L V6 Nismo RWD'] },
  ],

  'NISSAN|GT-R': [
    { from: 2009, to: 2026, engines: ['3.8L Twin-Turbo V6 AWD', '3.8L Twin-Turbo V6 Nismo AWD'] },
  ],

  'NISSAN|Z': [
    { from: 2023, to: 2026, engines: ['3.0L Twin-Turbo V6 RWD', '3.0L Twin-Turbo V6 Nismo RWD'] },
  ],

  'NISSAN|XTERRA': [
    { from: 2000, to: 2004, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl 4WD', '3.3L V6 2WD', '3.3L V6 4WD', '3.3L Supercharged V6 4WD'] },
    { from: 2005, to: 2015, engines: ['4.0L V6 2WD', '4.0L V6 4WD'] },
  ],

  // ── SUBARU ──────────────────────────────────────────────────────────────────

  'SUBARU|OUTBACK': [
    { from: 1995, to: 1999, engines: ['2.2L H4 AWD', '2.5L H4 AWD', '2.5L Turbo H4 AWD'] },
    { from: 2000, to: 2004, engines: ['2.5L H4 AWD', '3.0L H6 AWD'] },
    { from: 2005, to: 2009, engines: ['2.5L H4 AWD', '2.5L Turbo XT H4 AWD', '3.0L H6 AWD'] },
    { from: 2010, to: 2014, engines: ['2.5L H4 AWD', '3.6L H6 AWD'] },
    { from: 2015, to: 2019, engines: ['2.5L H4 AWD', '3.6L H6 AWD'] },
    { from: 2020, to: 2026, engines: ['2.5L H4 AWD', '2.4L Turbo H4 AWD'] },
  ],

  'SUBARU|FORESTER': [
    { from: 1998, to: 2002, engines: ['2.2L H4 AWD', '2.5L H4 AWD', '2.5L Turbo S H4 AWD'] },
    { from: 2003, to: 2008, engines: ['2.5L H4 AWD', '2.5L Turbo XT H4 AWD'] },
    { from: 2009, to: 2013, engines: ['2.5L H4 AWD', '2.5L Turbo XT H4 AWD'] },
    { from: 2014, to: 2018, engines: ['2.0L Turbo XT H4 AWD', '2.5L H4 AWD'] },
    { from: 2019, to: 2026, engines: ['2.5L H4 AWD', '2.0L Hybrid H4 AWD'] },
  ],

  'SUBARU|IMPREZA': [
    { from: 1993, to: 2001, engines: ['1.8L H4 FWD', '1.8L H4 AWD', '2.2L H4 FWD', '2.2L H4 AWD'] },
    { from: 2002, to: 2007, engines: ['2.0L H4 AWD', '2.5L H4 AWD', '2.5L Turbo WRX H4 AWD', '2.5L Turbo STI H4 AWD'] },
    { from: 2008, to: 2014, engines: ['2.0L H4 FWD', '2.0L H4 AWD', '2.5L H4 FWD', '2.5L H4 AWD', '2.5L Turbo WRX H4 AWD', '2.5L Turbo STI H4 AWD'] },
    { from: 2017, to: 2026, engines: ['2.0L H4 FWD', '2.0L H4 AWD'] },
  ],

  'SUBARU|WRX': [
    { from: 2015, to: 2021, engines: ['2.0L Turbo H4 AWD', '2.5L Turbo STI H4 AWD'] },
    { from: 2022, to: 2026, engines: ['2.4L Turbo H4 AWD', '2.4L Turbo STI H4 AWD'] },
  ],

  'SUBARU|LEGACY': [
    { from: 1990, to: 1999, engines: ['2.2L H4 FWD', '2.2L H4 AWD', '2.2L Turbo H4 AWD', '2.5L H4 AWD'] },
    { from: 2000, to: 2009, engines: ['2.5L H4 FWD', '2.5L H4 AWD', '2.5L Turbo GT H4 AWD', '3.0L H6 AWD'] },
    { from: 2010, to: 2014, engines: ['2.5L H4 AWD', '2.5L Turbo GT H4 AWD', '3.6L H6 AWD'] },
    { from: 2015, to: 2019, engines: ['2.5L H4 AWD', '3.6L H6 AWD'] },
    { from: 2020, to: 2026, engines: ['2.5L H4 AWD', '2.4L Turbo H4 AWD'] },
  ],

  'SUBARU|CROSSTREK': [
    { from: 2013, to: 2017, engines: ['2.0L H4 AWD'] },
    { from: 2018, to: 2023, engines: ['2.0L H4 AWD', '2.5L H4 AWD', '2.0L Plug-in Hybrid H4 AWD'] },
    { from: 2024, to: 2026, engines: ['2.5L H4 AWD', '2.0L Plug-in Hybrid H4 AWD'] },
  ],

  'SUBARU|BRZ': [
    { from: 2013, to: 2021, engines: ['2.0L H4 RWD'] },
    { from: 2022, to: 2026, engines: ['2.4L H4 RWD'] },
  ],

  'SUBARU|ASCENT': [
    { from: 2019, to: 2026, engines: ['2.4L Turbo H4 FWD', '2.4L Turbo H4 AWD'] },
  ],

  'SUBARU|TRIBECA': [
    { from: 2006, to: 2014, engines: ['3.0L H6 AWD', '3.6L H6 AWD'] },
  ],

  'SUBARU|BAJA': [
    { from: 2003, to: 2006, engines: ['2.5L H4 AWD', '2.5L Turbo H4 AWD'] },
  ],

  // ── HYUNDAI ─────────────────────────────────────────────────────────────────

  'HYUNDAI|ELANTRA': [
    { from: 1992, to: 2000, engines: ['1.6L 4-cyl', '1.8L 4-cyl'] },
    { from: 2001, to: 2006, engines: ['2.0L 4-cyl'] },
    { from: 2007, to: 2010, engines: ['2.0L 4-cyl'] },
    { from: 2011, to: 2016, engines: ['1.6L Turbo 4-cyl GT', '1.8L 4-cyl', '2.0L 4-cyl Sport'] },
    { from: 2017, to: 2020, engines: ['1.4L Turbo 4-cyl', '2.0L 4-cyl'] },
    { from: 2021, to: 2026, engines: ['2.0L 4-cyl', '1.6L Turbo 4-cyl', '1.6L Hybrid', 'N 2.0L Turbo 4-cyl'] },
  ],

  'HYUNDAI|TUCSON': [
    { from: 2005, to: 2009, engines: ['2.0L 4-cyl 2WD', '2.0L 4-cyl AWD', '2.7L V6 2WD', '2.7L V6 AWD'] },
    { from: 2010, to: 2015, engines: ['2.0L 4-cyl 2WD', '2.0L 4-cyl AWD', '2.4L 4-cyl 2WD', '2.4L 4-cyl AWD'] },
    { from: 2016, to: 2020, engines: ['2.0L 4-cyl FWD', '2.0L 4-cyl AWD', '1.6L Turbo 4-cyl AWD'] },
    { from: 2022, to: 2026, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '1.6L Turbo Hybrid AWD', '1.6L Turbo Plug-in Hybrid AWD'] },
  ],

  'HYUNDAI|SANTA FE': [
    { from: 2001, to: 2006, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl AWD', '2.7L V6 2WD', '2.7L V6 AWD', '3.5L V6 AWD'] },
    { from: 2007, to: 2012, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl AWD', '2.7L V6 2WD', '2.7L V6 AWD', '3.3L V6 AWD'] },
    { from: 2013, to: 2018, engines: ['2.0L Turbo 4-cyl FWD', '2.0L Turbo 4-cyl AWD', '2.4L 4-cyl FWD', '2.4L 4-cyl AWD', '3.3L V6 FWD', '3.3L V6 AWD'] },
    { from: 2019, to: 2026, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '2.5L Turbo 4-cyl FWD', '2.5L Turbo 4-cyl AWD', '1.6L Turbo Plug-in Hybrid AWD'] },
  ],

  'HYUNDAI|SONATA': [
    { from: 1989, to: 1998, engines: ['2.0L 4-cyl', '2.4L 4-cyl', '3.0L V6'] },
    { from: 1999, to: 2005, engines: ['2.4L 4-cyl', '2.7L V6'] },
    { from: 2006, to: 2010, engines: ['2.4L 4-cyl', '3.3L V6'] },
    { from: 2011, to: 2019, engines: ['2.0L Turbo 4-cyl', '2.4L 4-cyl', '2.4L Hybrid 4-cyl'] },
    { from: 2020, to: 2026, engines: ['2.5L 4-cyl', '2.5L Turbo 4-cyl', '2.0L Hybrid', '1.6L Turbo Plug-in Hybrid'] },
  ],

  'HYUNDAI|PALISADE': [
    { from: 2020, to: 2026, engines: ['3.8L V6 FWD', '3.8L V6 AWD'] },
  ],

  'HYUNDAI|KONA': [
    { from: 2018, to: 2023, engines: ['2.0L 4-cyl FWD', '1.6L Turbo 4-cyl AWD', 'Electric'] },
    { from: 2024, to: 2026, engines: ['2.0L 4-cyl FWD', '1.6L Turbo 4-cyl AWD', 'Electric', 'Hybrid'] },
  ],

  'HYUNDAI|VELOSTER': [
    { from: 2012, to: 2017, engines: ['1.6L 4-cyl', '1.6L Turbo 4-cyl'] },
    { from: 2019, to: 2022, engines: ['1.6L 4-cyl', '1.6L Turbo 4-cyl', '2.0L Turbo N 4-cyl'] },
  ],

  'HYUNDAI|GENESIS': [
    { from: 2009, to: 2016, engines: ['2.0L Turbo 4-cyl', '3.8L V6', '4.6L V8', '5.0L V8 R-Spec'] },
  ],

  // ── KIA ─────────────────────────────────────────────────────────────────────

  'KIA|TELLURIDE': [
    { from: 2020, to: 2026, engines: ['3.8L V6 FWD', '3.8L V6 AWD'] },
  ],

  'KIA|SORENTO': [
    { from: 2003, to: 2009, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl 4WD', '3.5L V6 2WD', '3.5L V6 4WD'] },
    { from: 2011, to: 2015, engines: ['2.4L 4-cyl 2WD', '2.4L 4-cyl AWD', '2.0L Turbo 4-cyl AWD', '3.3L V6 FWD', '3.3L V6 AWD'] },
    { from: 2016, to: 2020, engines: ['2.0L Turbo 4-cyl AWD', '2.4L 4-cyl FWD', '2.4L 4-cyl AWD', '3.3L V6 FWD', '3.3L V6 AWD'] },
    { from: 2021, to: 2026, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '2.5L Turbo 4-cyl AWD', '1.6L Turbo Hybrid AWD', '1.6L Turbo Plug-in Hybrid AWD'] },
  ],

  'KIA|SPORTAGE': [
    { from: 1995, to: 2002, engines: ['2.0L 4-cyl 2WD', '2.0L 4-cyl 4WD'] },
    { from: 2005, to: 2010, engines: ['2.0L 4-cyl 2WD', '2.0L 4-cyl AWD', '2.7L V6 AWD'] },
    { from: 2011, to: 2016, engines: ['2.0L 4-cyl FWD', '2.0L 4-cyl AWD', '2.4L 4-cyl FWD', '2.4L 4-cyl AWD'] },
    { from: 2017, to: 2021, engines: ['2.0L 4-cyl FWD', '2.0L 4-cyl AWD', '2.4L 4-cyl FWD', '2.4L 4-cyl AWD'] },
    { from: 2023, to: 2026, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '1.6L Turbo Hybrid AWD', '1.6L Turbo Plug-in Hybrid AWD'] },
  ],

  'KIA|STINGER': [
    { from: 2018, to: 2023, engines: ['2.0L Turbo 4-cyl RWD', '2.0L Turbo 4-cyl AWD', '3.3L Twin-Turbo V6 RWD', '3.3L Twin-Turbo V6 AWD'] },
  ],

  'KIA|K5': [
    { from: 2021, to: 2026, engines: ['1.6L Turbo 4-cyl FWD', '1.6L Turbo 4-cyl AWD', '2.5L Turbo 4-cyl AWD'] },
  ],

  'KIA|OPTIMA': [
    { from: 2001, to: 2010, engines: ['2.0L 4-cyl', '2.4L 4-cyl', '2.5L V6', '2.7L V6'] },
    { from: 2011, to: 2020, engines: ['2.0L Turbo 4-cyl', '2.4L 4-cyl', '2.4L Hybrid 4-cyl', '2.0L Plug-in Hybrid'] },
  ],

  'KIA|FORTE': [
    { from: 2010, to: 2018, engines: ['1.6L 4-cyl', '2.0L 4-cyl', '2.0L Turbo SX 4-cyl'] },
    { from: 2019, to: 2026, engines: ['1.6L Turbo 4-cyl', '2.0L 4-cyl', '2.0L Turbo GT 4-cyl'] },
  ],

  'KIA|SOUL': [
    { from: 2010, to: 2013, engines: ['1.6L 4-cyl', '2.0L 4-cyl'] },
    { from: 2014, to: 2019, engines: ['1.6L 4-cyl', '1.6L Turbo 4-cyl', '2.0L 4-cyl', 'Electric'] },
    { from: 2020, to: 2026, engines: ['1.6L Turbo 4-cyl', '2.0L 4-cyl', 'Electric'] },
  ],

  'KIA|NIRO': [
    { from: 2017, to: 2022, engines: ['1.6L Hybrid FWD', '1.6L Plug-in Hybrid FWD', 'Electric'] },
    { from: 2023, to: 2026, engines: ['1.6L Hybrid FWD', '1.6L Plug-in Hybrid FWD', 'Electric'] },
  ],

  // ── TESLA ───────────────────────────────────────────────────────────────────

  'TESLA|MODEL S': [
    { from: 2012, to: 2015, engines: ['60 kWh Electric RWD', '85 kWh Electric RWD', '85D kWh Electric AWD', 'P85 Electric RWD', 'P85+ Electric RWD', 'P85D Electric AWD'] },
    { from: 2016, to: 2019, engines: ['60 kWh Electric RWD', '75 kWh Electric RWD', '75D Electric AWD', '90D Electric AWD', '100D Electric AWD', 'P90D Electric AWD', 'P100D Electric AWD'] },
    { from: 2020, to: 2026, engines: ['Long Range Electric AWD', 'Plaid Electric AWD'] },
  ],

  'TESLA|MODEL X': [
    { from: 2016, to: 2019, engines: ['75D Electric AWD', '90D Electric AWD', '100D Electric AWD', 'P90D Electric AWD', 'P100D Electric AWD'] },
    { from: 2020, to: 2026, engines: ['Long Range Electric AWD', 'Plaid Electric AWD'] },
  ],

  'TESLA|MODEL 3': [
    { from: 2017, to: 2020, engines: ['Standard Range Electric RWD', 'Long Range Electric AWD', 'Performance Electric AWD'] },
    { from: 2021, to: 2026, engines: ['Standard Range Electric RWD', 'Long Range Electric AWD', 'Performance Electric AWD'] },
  ],

  'TESLA|MODEL Y': [
    { from: 2020, to: 2026, engines: ['Standard Range Electric RWD', 'Long Range Electric AWD', 'Performance Electric AWD'] },
  ],

  'TESLA|CYBERTRUCK': [
    { from: 2024, to: 2026, engines: ['All-Wheel Drive Electric AWD', 'Cyberbeast Electric AWD'] },
  ],

  // ── MAZDA ───────────────────────────────────────────────────────────────────

  'MAZDA|MAZDA3': [
    { from: 2004, to: 2009, engines: ['2.0L 4-cyl', '2.3L 4-cyl', '2.3L Turbo MPS/Mazdaspeed3 4-cyl FWD'] },
    { from: 2010, to: 2013, engines: ['2.0L 4-cyl', '2.5L 4-cyl', '2.3L Turbo Mazdaspeed3 4-cyl FWD'] },
    { from: 2014, to: 2018, engines: ['2.0L 4-cyl', '2.5L 4-cyl'] },
    { from: 2019, to: 2026, engines: ['2.0L 4-cyl FWD', '2.0L 4-cyl AWD', '2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '2.5L Turbo 4-cyl AWD'] },
  ],

  'MAZDA|MAZDA6': [
    { from: 2003, to: 2008, engines: ['2.3L 4-cyl', '3.0L V6', '2.3L Turbo Mazdaspeed6 4-cyl AWD'] },
    { from: 2009, to: 2013, engines: ['2.5L 4-cyl', '3.7L V6'] },
    { from: 2014, to: 2021, engines: ['2.5L 4-cyl', '2.5L Turbo 4-cyl'] },
  ],

  'MAZDA|CX-5': [
    { from: 2013, to: 2016, engines: ['2.0L 4-cyl FWD', '2.0L 4-cyl AWD', '2.5L 4-cyl FWD', '2.5L 4-cyl AWD'] },
    { from: 2017, to: 2026, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '2.5L Turbo 4-cyl FWD', '2.5L Turbo 4-cyl AWD'] },
  ],

  'MAZDA|CX-9': [
    { from: 2007, to: 2015, engines: ['3.7L V6 FWD', '3.7L V6 AWD'] },
    { from: 2016, to: 2023, engines: ['2.5L Turbo 4-cyl FWD', '2.5L Turbo 4-cyl AWD'] },
  ],

  'MAZDA|MX-5 MIATA': [
    { from: 1990, to: 1997, engines: ['1.6L 4-cyl RWD'] },
    { from: 1999, to: 2005, engines: ['1.8L 4-cyl RWD'] },
    { from: 2006, to: 2015, engines: ['2.0L 4-cyl RWD'] },
    { from: 2016, to: 2026, engines: ['2.0L 4-cyl RWD'] },
  ],

  'MAZDA|RX-7': [
    { from: 1979, to: 1991, engines: ['1.1L Rotary RWD', '1.3L Turbo Rotary RWD'] },
    { from: 1992, to: 2002, engines: ['1.3L Twin-Turbo Rotary RWD'] },
  ],

  'MAZDA|RX-8': [
    { from: 2004, to: 2011, engines: ['1.3L Rotary RWD', '1.3L High Power Rotary RWD'] },
  ],

  'MAZDA|TRIBUTE': [
    { from: 2001, to: 2006, engines: ['2.0L 4-cyl FWD', '2.0L 4-cyl 4WD', '3.0L V6 FWD', '3.0L V6 4WD'] },
    { from: 2008, to: 2011, engines: ['2.3L 4-cyl FWD', '2.3L 4-cyl 4WD', '3.0L V6 FWD', '3.0L V6 4WD', '2.3L Hybrid FWD'] },
  ],

  // ── VOLKSWAGEN ──────────────────────────────────────────────────────────────

  'VOLKSWAGEN|JETTA': [
    { from: 1985, to: 1992, engines: ['1.6L 4-cyl', '1.8L 4-cyl', '2.0L 4-cyl', '1.6L Diesel 4-cyl'] },
    { from: 1993, to: 1998, engines: ['2.0L 4-cyl', '2.8L VR6', '1.9L TDI Diesel 4-cyl'] },
    { from: 1999, to: 2005, engines: ['1.8L Turbo 4-cyl', '2.0L 4-cyl', '2.8L VR6', '1.9L TDI Diesel 4-cyl', '2.0L Turbo GLI 4-cyl'] },
    { from: 2005, to: 2010, engines: ['1.9L TDI Diesel 4-cyl', '2.0L 4-cyl', '2.0L Turbo GLI 4-cyl', '2.5L 5-cyl'] },
    { from: 2011, to: 2018, engines: ['1.4L Turbo 4-cyl', '1.8L Turbo 4-cyl', '2.0L Turbo GLI 4-cyl', '2.0L TDI Diesel 4-cyl', '2.5L 5-cyl'] },
    { from: 2019, to: 2026, engines: ['1.4L Turbo 4-cyl', '1.5L Turbo 4-cyl', '2.0L Turbo GLI 4-cyl'] },
  ],

  'VOLKSWAGEN|GOLF': [
    { from: 1985, to: 1992, engines: ['1.6L 4-cyl', '1.8L 4-cyl', '2.0L 4-cyl'] },
    { from: 1993, to: 1999, engines: ['2.0L 4-cyl', '1.9L TDI Diesel 4-cyl', '2.8L VR6 GTI'] },
    { from: 1999, to: 2006, engines: ['1.8L Turbo GTI 4-cyl', '1.9L TDI 4-cyl', '2.0L 4-cyl', '2.8L VR6 4Motion AWD'] },
    { from: 2010, to: 2014, engines: ['2.0L Turbo GTI 4-cyl', '2.0L TDI 4-cyl', '2.5L 5-cyl'] },
    { from: 2015, to: 2021, engines: ['1.4L Turbo 4-cyl', '1.8L Turbo 4-cyl', '2.0L Turbo GTI 4-cyl', '2.0L Turbo R 4-cyl AWD', '1.6L TDI 4-cyl', '2.0L TDI 4-cyl'] },
    { from: 2022, to: 2026, engines: ['1.5L Turbo 4-cyl', '2.0L Turbo GTI 4-cyl', '2.0L Turbo R 4-cyl AWD'] },
  ],

  'VOLKSWAGEN|PASSAT': [
    { from: 1990, to: 1997, engines: ['2.0L 4-cyl', '2.8L VR6', '1.9L TDI Diesel 4-cyl'] },
    { from: 1998, to: 2005, engines: ['1.8L Turbo 4-cyl', '2.8L V6', '2.0L TDI Diesel 4-cyl', '4.0L W8 AWD'] },
    { from: 2006, to: 2010, engines: ['2.0L Turbo 4-cyl', '3.6L V6 AWD', '2.0L TDI Diesel 4-cyl'] },
    { from: 2012, to: 2019, engines: ['1.8L Turbo 4-cyl', '2.0L Turbo SEL 4-cyl', '2.0L TDI Diesel 4-cyl', '3.6L V6'] },
  ],

  'VOLKSWAGEN|TIGUAN': [
    { from: 2009, to: 2017, engines: ['2.0L Turbo 4-cyl FWD', '2.0L Turbo 4-cyl 4Motion AWD'] },
    { from: 2018, to: 2026, engines: ['2.0L Turbo 4-cyl FWD', '2.0L Turbo 4-cyl 4Motion AWD'] },
  ],

  'VOLKSWAGEN|ATLAS': [
    { from: 2018, to: 2026, engines: ['2.0L Turbo 4-cyl FWD', '2.0L Turbo 4-cyl 4Motion AWD', '3.6L V6 FWD', '3.6L V6 4Motion AWD'] },
  ],

  'VOLKSWAGEN|BEETLE': [
    { from: 1998, to: 2010, engines: ['1.8L Turbo 4-cyl', '2.0L 4-cyl', '1.9L TDI Diesel 4-cyl', '2.5L 5-cyl', '3.2L VR6'] },
    { from: 2012, to: 2019, engines: ['1.8L Turbo 4-cyl', '2.0L Turbo Dune/R-Line 4-cyl', '1.8L Turbo GSR 4-cyl', '2.0L TDI Diesel 4-cyl'] },
  ],

  // ── BMW ─────────────────────────────────────────────────────────────────────

  'BMW|3 SERIES': [
    { from: 1984, to: 1991, engines: ['1.8L 4-cyl', '2.5L 6-cyl', '2.7L 6-cyl M3'] },
    { from: 1992, to: 1998, engines: ['1.9L 4-cyl', '2.5L 6-cyl', '2.8L 6-cyl', '3.0L M3 6-cyl'] },
    { from: 1999, to: 2005, engines: ['2.5L 6-cyl', '2.8L 6-cyl', '3.0L 6-cyl', '3.2L M3 S54 6-cyl', '2.0L Diesel 4-cyl'] },
    { from: 2006, to: 2011, engines: ['2.5L 6-cyl', '3.0L 6-cyl', '3.0L Turbo xi AWD', '4.0L M3 V8', '2.0L Turbo Diesel 4-cyl'] },
    { from: 2012, to: 2018, engines: ['2.0L Turbo 4-cyl', '2.0L Turbo AWD', '3.0L Turbo 6-cyl', '3.0L Twin-Turbo M3 6-cyl', 'Plug-in Hybrid 2.0L Turbo'] },
    { from: 2019, to: 2026, engines: ['2.0L Turbo 4-cyl RWD', '2.0L Turbo 4-cyl xDrive AWD', '3.0L Turbo 6-cyl RWD', '3.0L Turbo 6-cyl xDrive AWD', '3.0L Twin-Turbo M3 6-cyl RWD', '3.0L Twin-Turbo M3 Competition 6-cyl AWD', 'Plug-in Hybrid AWD'] },
  ],

  'BMW|5 SERIES': [
    { from: 1982, to: 1988, engines: ['1.8L 4-cyl', '2.5L 6-cyl', '2.8L 6-cyl', '3.5L M5 6-cyl'] },
    { from: 1989, to: 1995, engines: ['2.5L 6-cyl', '3.0L 6-cyl', '3.5L M5 6-cyl', '4.0L M5 V8'] },
    { from: 1997, to: 2003, engines: ['2.5L 6-cyl', '2.8L 6-cyl', '3.0L 6-cyl', '4.4L V8', '4.9L M5 V8'] },
    { from: 2004, to: 2010, engines: ['2.5L 6-cyl', '3.0L 6-cyl', '3.0L Turbo 6-cyl xi AWD', '4.8L V8', '5.0L M5 V10'] },
    { from: 2011, to: 2016, engines: ['2.0L Turbo 4-cyl', '3.0L Turbo 6-cyl', '3.0L Twin-Turbo M5 V8', '4.4L Twin-Turbo M5 V8', 'Plug-in Hybrid'] },
    { from: 2017, to: 2026, engines: ['2.0L Turbo 4-cyl RWD', '2.0L Turbo 4-cyl xDrive AWD', '3.0L Turbo 6-cyl RWD', '3.0L Turbo 6-cyl xDrive AWD', '4.4L Twin-Turbo M5 V8 AWD', 'Plug-in Hybrid AWD'] },
  ],

  'BMW|X3': [
    { from: 2004, to: 2010, engines: ['2.5L 6-cyl xDrive AWD', '3.0L 6-cyl xDrive AWD', '3.0L Turbo Diesel xDrive AWD'] },
    { from: 2011, to: 2017, engines: ['2.0L Turbo 4-cyl xDrive AWD', '3.0L Turbo 6-cyl xDrive AWD', '3.0L M xDrive AWD', '2.0L Turbo Diesel xDrive AWD'] },
    { from: 2018, to: 2026, engines: ['2.0L Turbo 4-cyl sDrive RWD', '2.0L Turbo 4-cyl xDrive AWD', '3.0L Turbo 6-cyl xDrive AWD', '3.0L Twin-Turbo M xDrive AWD', 'Plug-in Hybrid xDrive AWD', 'Electric xDrive AWD'] },
  ],

  'BMW|X5': [
    { from: 2000, to: 2006, engines: ['3.0L 6-cyl xDrive AWD', '4.4L V8 xDrive AWD', '4.6L V8 xDrive AWD', '4.8L V8 xDrive AWD'] },
    { from: 2007, to: 2013, engines: ['3.0L Turbo Diesel xDrive AWD', '3.0L 6-cyl xDrive AWD', '4.4L Twin-Turbo V8 xDrive AWD', '4.8L V8 xDrive AWD'] },
    { from: 2014, to: 2018, engines: ['2.0L Turbo 4-cyl xDrive AWD', '3.0L Turbo 6-cyl xDrive AWD', '4.4L Twin-Turbo M V8 xDrive AWD', 'Plug-in Hybrid xDrive AWD', '3.0L Turbo Diesel xDrive AWD'] },
    { from: 2019, to: 2026, engines: ['3.0L Turbo 6-cyl xDrive AWD', '4.4L Twin-Turbo M xDrive AWD', 'Plug-in Hybrid xDrive AWD', 'Electric xDrive AWD'] },
  ],

  // ── MERCEDES-BENZ ───────────────────────────────────────────────────────────

  'MERCEDES-BENZ|C-CLASS': [
    { from: 1994, to: 2000, engines: ['2.2L 4-cyl', '2.8L 6-cyl', '2.3L Supercharged C43 4-cyl', '4.3L AMG V8'] },
    { from: 2001, to: 2007, engines: ['1.8L Supercharged 4-cyl', '2.6L V6', '3.0L V6', '3.2L AMG V6', '5.5L AMG V8'] },
    { from: 2008, to: 2014, engines: ['2.5L V6', '3.0L V6', '3.5L V6', '6.3L AMG V8', '2.1L BlueTEC Diesel 4-cyl'] },
    { from: 2015, to: 2021, engines: ['2.0L Turbo 4-cyl', '2.0L Turbo 4-cyl 4Matic AWD', '3.0L Turbo 6-cyl 4Matic AWD', '4.0L Twin-Turbo AMG V8', 'Plug-in Hybrid 2.0L'] },
    { from: 2022, to: 2026, engines: ['2.0L Turbo 4-cyl', '2.0L Turbo 4-cyl 4Matic AWD', '3.0L Turbo 6-cyl 4Matic AWD', '4.0L Twin-Turbo AMG V8 AWD', 'Plug-in Hybrid AWD'] },
  ],

  'MERCEDES-BENZ|E-CLASS': [
    { from: 1986, to: 1995, engines: ['2.3L 4-cyl', '2.6L 6-cyl', '3.0L 6-cyl', '3.4L 6-cyl', '5.0L V8', '2.0L Diesel 4-cyl', '3.0L Diesel 6-cyl'] },
    { from: 1996, to: 2002, engines: ['2.8L V6', '3.2L V6', '4.3L V8', '5.4L AMG V8', '3.2L Diesel 6-cyl'] },
    { from: 2003, to: 2009, engines: ['3.2L V6', '3.5L V6', '5.0L V8', '6.3L AMG V8', '3.0L BlueTEC Diesel V6'] },
    { from: 2010, to: 2016, engines: ['3.5L V6', '3.5L V6 4Matic AWD', '5.5L AMG V8', '6.3L AMG V8', '2.1L BlueTEC Diesel 4-cyl', 'Plug-in Hybrid'] },
    { from: 2017, to: 2026, engines: ['2.0L Turbo 4-cyl', '2.0L Turbo 4-cyl 4Matic AWD', '3.0L Turbo 6-cyl 4Matic AWD', '4.0L Twin-Turbo AMG V8 4Matic AWD', 'Plug-in Hybrid AWD', '2.0L Diesel 4-cyl'] },
  ],

  'MERCEDES-BENZ|GLE': [
    { from: 2016, to: 2019, engines: ['3.0L Turbo V6 4Matic AWD', '4.7L Twin-Turbo V8 4Matic AWD', '5.5L AMG V8 4Matic AWD', 'Plug-in Hybrid 3.0L V6 AWD', '3.0L BlueTEC Diesel V6 AWD'] },
    { from: 2020, to: 2026, engines: ['2.0L Turbo 4-cyl 4Matic AWD', '3.0L Turbo 6-cyl 4Matic AWD', '4.0L Twin-Turbo AMG V8 4Matic AWD', 'Plug-in Hybrid 3.0L 6-cyl AWD'] },
  ],

  // ── ACURA ───────────────────────────────────────────────────────────────────

  'ACURA|MDX': [
    { from: 2001, to: 2006, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2007, to: 2013, engines: ['3.7L V6 FWD', '3.7L V6 AWD'] },
    { from: 2014, to: 2020, engines: ['3.5L V6 FWD', '3.5L V6 AWD', '3.0L Hybrid V6 AWD'] },
    { from: 2022, to: 2026, engines: ['3.5L V6 FWD', '3.5L V6 AWD', 'Hybrid V6 AWD', '3.0L Turbo Type S V6 AWD'] },
  ],

  'ACURA|RDX': [
    { from: 2007, to: 2012, engines: ['2.3L Turbo 4-cyl FWD', '2.3L Turbo 4-cyl AWD'] },
    { from: 2013, to: 2018, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2019, to: 2026, engines: ['2.0L Turbo 4-cyl FWD', '2.0L Turbo 4-cyl AWD'] },
  ],

  'ACURA|TLX': [
    { from: 2015, to: 2020, engines: ['2.4L 4-cyl FWD', '3.5L V6 AWD'] },
    { from: 2021, to: 2026, engines: ['2.0L Turbo 4-cyl FWD', '2.0L Turbo 4-cyl AWD', '3.0L Turbo Type S V6 AWD'] },
  ],

  'ACURA|TSX': [
    { from: 2004, to: 2008, engines: ['2.4L 4-cyl'] },
    { from: 2009, to: 2014, engines: ['2.4L 4-cyl', '3.5L V6'] },
  ],

  'ACURA|TL': [
    { from: 1996, to: 2003, engines: ['2.5L 5-cyl', '3.2L V6'] },
    { from: 2004, to: 2008, engines: ['3.2L V6', '3.5L V6'] },
    { from: 2009, to: 2014, engines: ['3.5L V6 FWD', '3.7L V6 AWD', '3.5L SH-AWD', '3.7L SH-AWD'] },
  ],

  'ACURA|NSX': [
    { from: 1991, to: 2005, engines: ['3.0L V6 RWD', '3.2L V6 RWD'] },
    { from: 2017, to: 2022, engines: ['3.5L Twin-Turbo Hybrid V6 AWD'] },
  ],

  // ── LEXUS ───────────────────────────────────────────────────────────────────

  'LEXUS|RX': [
    { from: 1999, to: 2003, engines: ['3.0L V6 FWD', '3.0L V6 AWD'] },
    { from: 2004, to: 2009, engines: ['3.3L V6 FWD', '3.3L V6 AWD', '3.3L Hybrid V6 AWD'] },
    { from: 2010, to: 2015, engines: ['3.5L V6 FWD', '3.5L V6 AWD', '3.5L Hybrid V6 AWD'] },
    { from: 2016, to: 2022, engines: ['3.5L V6 FWD', '3.5L V6 AWD', '3.5L Hybrid V6 AWD'] },
    { from: 2023, to: 2026, engines: ['2.4L Turbo 4-cyl AWD', '2.5L Hybrid AWD', '2.5L Plug-in Hybrid AWD'] },
  ],

  'LEXUS|ES': [
    { from: 1992, to: 1996, engines: ['3.0L V6'] },
    { from: 1997, to: 2001, engines: ['3.0L V6'] },
    { from: 2002, to: 2006, engines: ['3.0L V6'] },
    { from: 2007, to: 2012, engines: ['3.5L V6'] },
    { from: 2013, to: 2018, engines: ['3.5L V6', '2.5L Hybrid'] },
    { from: 2019, to: 2026, engines: ['3.5L V6', '2.5L Hybrid'] },
  ],

  'LEXUS|IS': [
    { from: 2001, to: 2005, engines: ['3.0L 6-cyl', '2.0L Turbo IS300 Sport Cross'] },
    { from: 2006, to: 2013, engines: ['2.5L V6', '3.0L V6', '3.5L V6 AWD'] },
    { from: 2014, to: 2020, engines: ['2.0L Turbo 4-cyl', '3.5L V6 RWD', '3.5L V6 AWD', '5.0L V8 IS-F'] },
    { from: 2021, to: 2026, engines: ['2.0L Turbo 4-cyl RWD', '3.5L V6 RWD', '3.5L V6 AWD'] },
  ],

  'LEXUS|GX': [
    { from: 2003, to: 2009, engines: ['4.7L V8 4WD'] },
    { from: 2010, to: 2023, engines: ['4.0L V6 4WD'] },
    { from: 2024, to: 2026, engines: ['3.4L Twin-Turbo V6 4WD', '3.4L Twin-Turbo Hybrid V6 4WD'] },
  ],

  'LEXUS|LX': [
    { from: 1996, to: 1997, engines: ['4.5L 6-cyl 4WD'] },
    { from: 1998, to: 2007, engines: ['4.7L V8 4WD'] },
    { from: 2008, to: 2021, engines: ['5.7L V8 4WD'] },
    { from: 2022, to: 2026, engines: ['3.4L Twin-Turbo V6 4WD', '3.4L Twin-Turbo Hybrid V6 4WD'] },
  ],

  // ── LINCOLN ─────────────────────────────────────────────────────────────────

  'LINCOLN|NAVIGATOR': [
    { from: 1998, to: 2002, engines: ['5.4L V8 2WD', '5.4L V8 4WD'] },
    { from: 2003, to: 2006, engines: ['5.4L V8 2WD', '5.4L V8 4WD'] },
    { from: 2007, to: 2014, engines: ['5.4L V8 2WD', '5.4L V8 4WD'] },
    { from: 2015, to: 2017, engines: ['3.5L EcoBoost V6 2WD', '3.5L EcoBoost V6 4WD'] },
    { from: 2018, to: 2026, engines: ['3.5L EcoBoost V6 RWD', '3.5L EcoBoost V6 4WD'] },
  ],

  'LINCOLN|TOWN CAR': [
    { from: 1981, to: 1997, engines: ['5.0L V8'] },
    { from: 1998, to: 2011, engines: ['4.6L V8'] },
  ],

  'LINCOLN|MKX': [
    { from: 2007, to: 2015, engines: ['3.5L V6 FWD', '3.5L V6 AWD', '3.7L V6 FWD', '3.7L V6 AWD'] },
    { from: 2016, to: 2018, engines: ['2.7L EcoBoost V6 FWD', '2.7L EcoBoost V6 AWD', '3.7L V6 FWD', '3.7L V6 AWD'] },
  ],

  'LINCOLN|MKZ': [
    { from: 2007, to: 2012, engines: ['3.5L V6 FWD', '3.5L V6 AWD'] },
    { from: 2013, to: 2020, engines: ['2.0L EcoBoost 4-cyl FWD', '3.0L EcoBoost V6 AWD', '2.0L Hybrid FWD'] },
  ],

  // ── CADILLAC ────────────────────────────────────────────────────────────────

  'CADILLAC|ESCALADE': [
    { from: 1999, to: 2000, engines: ['5.7L V8 2WD', '5.7L V8 4WD'] },
    { from: 2002, to: 2006, engines: ['5.3L V8 2WD', '5.3L V8 4WD', '6.0L V8 2WD', '6.0L V8 4WD'] },
    { from: 2007, to: 2014, engines: ['6.2L V8 2WD', '6.2L V8 4WD'] },
    { from: 2015, to: 2020, engines: ['6.2L V8 2WD', '6.2L V8 4WD'] },
    { from: 2021, to: 2026, engines: ['6.2L V8 2WD', '6.2L V8 4WD', '3.0L Duramax Diesel 6-cyl 2WD', '3.0L Duramax Diesel 6-cyl 4WD', '6.2L Supercharged V8 Blackwing AWD'] },
  ],

  'CADILLAC|CTS': [
    { from: 2003, to: 2007, engines: ['2.8L V6', '3.2L V6', '5.7L V8 CTS-V'] },
    { from: 2008, to: 2013, engines: ['3.0L V6', '3.6L V6', '6.2L Supercharged CTS-V V8'] },
    { from: 2014, to: 2019, engines: ['2.0L Turbo 4-cyl', '3.6L V6', '6.2L Supercharged CTS-V V8'] },
  ],

  'CADILLAC|SRX': [
    { from: 2004, to: 2009, engines: ['3.6L V6 FWD', '3.6L V6 AWD', '4.6L V8 AWD', '3.0L Diesel V6 AWD'] },
    { from: 2010, to: 2016, engines: ['2.8L Turbo V6 FWD', '2.8L Turbo V6 AWD', '3.0L V6 FWD', '3.0L V6 AWD', '3.6L V6 FWD', '3.6L V6 AWD'] },
  ],

  // ── PONTIAC ─────────────────────────────────────────────────────────────────

  'PONTIAC|FIREBIRD': [
    { from: 1982, to: 1992, engines: ['2.5L 4-cyl', '2.8L V6', '5.0L V8', '5.7L TPI V8 Trans Am'] },
    { from: 1993, to: 1997, engines: ['3.4L V6', '5.7L LT1 V8 Firebird', '5.7L LT1 V8 Trans Am', '5.7L LT4 V8 Firehawk'] },
    { from: 1998, to: 2002, engines: ['3.8L V6', '5.7L LS1 V8 Formula', '5.7L LS1 V8 Trans Am', '5.7L Supercharged WS6 V8'] },
  ],

  'PONTIAC|GRAND PRIX': [
    { from: 1988, to: 1996, engines: ['2.3L 4-cyl', '3.1L V6', '3.4L V6'] },
    { from: 1997, to: 2003, engines: ['3.1L V6', '3.8L V6', '3.8L Supercharged GTP V6'] },
    { from: 2004, to: 2008, engines: ['3.8L V6', '3.8L Supercharged GTP V6', '5.3L V8 GXP'] },
  ],

  'PONTIAC|G6': [
    { from: 2005, to: 2010, engines: ['2.4L 4-cyl', '3.5L V6', '3.6L V6', '3.9L V6 GTP'] },
  ],

  'PONTIAC|G8': [
    { from: 2008, to: 2009, engines: ['3.6L V6', '6.0L V8 GT', '6.2L V8 GXP'] },
  ],

  'PONTIAC|VIBE': [
    { from: 2003, to: 2008, engines: ['1.8L 4-cyl FWD', '1.8L 4-cyl AWD', '2.4L High Output 4-cyl GT FWD'] },
    { from: 2009, to: 2010, engines: ['1.8L 4-cyl FWD', '2.4L High Output 4-cyl GT FWD'] },
  ],

  'PONTIAC|SOLSTICE': [
    { from: 2006, to: 2009, engines: ['2.0L Turbo GXP 4-cyl', '2.4L 4-cyl'] },
  ],

  // ── SATURN ──────────────────────────────────────────────────────────────────

  'SATURN|VUE': [
    { from: 2002, to: 2007, engines: ['2.2L 4-cyl FWD', '2.2L 4-cyl AWD', '3.5L V6 FWD', '3.5L V6 AWD', '2.2L Hybrid 4-cyl FWD'] },
    { from: 2008, to: 2010, engines: ['2.4L 4-cyl FWD', '2.4L 4-cyl AWD', '3.5L V6 AWD', '2.4L Hybrid 4-cyl FWD', '2.4L Two-Mode Hybrid 4-cyl AWD'] },
  ],

  'SATURN|ION': [
    { from: 2003, to: 2007, engines: ['2.0L Supercharged Redline 4-cyl', '2.2L 4-cyl', '2.4L 4-cyl'] },
  ],

  'SATURN|SKY': [
    { from: 2007, to: 2010, engines: ['2.0L Turbo Red Line 4-cyl', '2.4L 4-cyl'] },
  ],

  // ── OLDSMOBILE ──────────────────────────────────────────────────────────────

  'OLDSMOBILE|ALERO': [
    { from: 1999, to: 2004, engines: ['2.2L 4-cyl', '2.4L 4-cyl', '3.4L V6'] },
  ],

  'OLDSMOBILE|INTRIGUE': [
    { from: 1998, to: 2002, engines: ['3.5L V6', '3.8L V6'] },
  ],

  'OLDSMOBILE|BRAVADA': [
    { from: 1996, to: 2004, engines: ['4.3L V6 AWD', '4.2L 6-cyl AWD'] },
  ],

  // ── MERCURY ─────────────────────────────────────────────────────────────────

  'MERCURY|GRAND MARQUIS': [
    { from: 1983, to: 2011, engines: ['4.6L V8', '5.0L V8'] },
  ],

  'MERCURY|MOUNTAINEER': [
    { from: 1997, to: 2010, engines: ['4.0L V6 2WD', '4.0L V6 AWD', '4.6L V8 AWD', '5.0L V8 AWD'] },
  ],

  'MERCURY|MARINER': [
    { from: 2005, to: 2011, engines: ['2.3L 4-cyl FWD', '2.3L 4-cyl 4WD', '3.0L V6 FWD', '3.0L V6 4WD', '2.3L Hybrid AWD'] },
  ],

  'MERCURY|MILAN': [
    { from: 2006, to: 2011, engines: ['2.3L 4-cyl FWD', '2.3L 4-cyl AWD', '2.5L 4-cyl FWD', '3.0L V6 FWD', '2.5L Hybrid FWD'] },
  ],

  // ── SUBCOMPACT / DISCONTINUED MODELS ────────────────────────────────────────

  'CHEVROLET|MONTE CARLO': [
    { from: 1980, to: 1988, engines: ['3.8L V6', '4.4L V8', '5.0L V8'] },
    { from: 1995, to: 2007, engines: ['3.1L V6', '3.4L V6', '3.8L V6', '3.8L Supercharged SS V6', '5.3L V8 SS'] },
  ],

  'FORD|THUNDERBIRD': [
    { from: 1980, to: 1988, engines: ['3.8L V6', '5.0L V8'] },
    { from: 2002, to: 2005, engines: ['3.9L V8'] },
  ],

  'DODGE|STEALTH': [
    { from: 1991, to: 1996, engines: ['3.0L V6 FWD', '3.0L Turbo V6 FWD', '3.0L Twin-Turbo V6 AWD R/T Turbo'] },
  ],

  'MITSUBISHI|3000GT': [
    { from: 1991, to: 1999, engines: ['3.0L V6 FWD', '3.0L Turbo V6 FWD', '3.0L Twin-Turbo V6 AWD VR-4'] },
  ],

  'MITSUBISHI|ECLIPSE': [
    { from: 1990, to: 1994, engines: ['1.8L 4-cyl FWD', '2.0L Turbo 4-cyl FWD', '2.0L Turbo 4-cyl AWD GSX'] },
    { from: 1995, to: 1999, engines: ['2.0L 4-cyl FWD', '2.0L Turbo GST 4-cyl FWD', '2.0L Turbo GSX 4-cyl AWD'] },
    { from: 2000, to: 2005, engines: ['2.4L 4-cyl', '3.0L V6'] },
    { from: 2006, to: 2011, engines: ['2.4L 4-cyl', '3.8L V6'] },
  ],

  'MITSUBISHI|OUTLANDER': [
    { from: 2003, to: 2006, engines: ['2.4L 4-cyl FWD', '2.4L 4-cyl AWD'] },
    { from: 2007, to: 2013, engines: ['2.4L 4-cyl FWD', '2.4L 4-cyl AWD', '3.0L V6 AWD'] },
    { from: 2014, to: 2021, engines: ['2.4L 4-cyl FWD', '2.4L 4-cyl AWD', '3.0L V6 AWD', '2.0L Plug-in Hybrid AWD'] },
    { from: 2022, to: 2026, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '2.4L Plug-in Hybrid AWD'] },
  ],

  'MITSUBISHI|LANCER': [
    { from: 2002, to: 2007, engines: ['2.0L 4-cyl FWD', '2.0L Turbo Evo VIII AWD', '2.0L Turbo Evo IX AWD'] },
    { from: 2008, to: 2017, engines: ['1.5L 4-cyl FWD', '2.0L 4-cyl FWD', '2.0L Turbo Evo X AWD', '2.0L Turbo Ralliart AWD'] },
  ],

  // ── MODERN EVs ───────────────────────────────────────────────────────────────

  'RIVIAN|R1T': [
    { from: 2022, to: 2026, engines: ['Dual Motor AWD', 'Quad Motor AWD', 'Standard Pack AWD', 'Max Pack AWD'] },
  ],

  'RIVIAN|R1S': [
    { from: 2022, to: 2026, engines: ['Dual Motor AWD', 'Quad Motor AWD', 'Max Pack AWD'] },
  ],

  'LUCID|AIR': [
    { from: 2022, to: 2026, engines: ['Pure Electric RWD', 'Touring Electric AWD', 'Grand Touring Electric AWD', 'Dream Edition Electric AWD', 'Sapphire Electric AWD'] },
  ],

  'POLESTAR|POLESTAR 2': [
    { from: 2021, to: 2026, engines: ['Single Motor FWD', 'Single Motor RWD', 'Dual Motor AWD', 'Dual Motor Performance AWD'] },
  ],

  'POLESTAR|POLESTAR 3': [
    { from: 2024, to: 2026, engines: ['Standard Electric AWD', 'Performance Electric AWD'] },
  ],

  'GMC|HUMMER EV': [
    { from: 2022, to: 2026, engines: ['EV2 Electric AWD', 'EV2X Electric AWD', 'EV3X Electric AWD', 'Edition 1 Electric AWD'] },
  ],

  'FORD|F-SERIES LIGHTNING': [
    { from: 2022, to: 2026, engines: ['Standard Range Electric AWD', 'Extended Range Electric AWD'] },
  ],

  'CHEVROLET|SILVERADO EV': [
    { from: 2024, to: 2026, engines: ['Work Truck Electric AWD', 'LT Electric AWD', 'RST Electric AWD', 'Trail Boss Electric AWD'] },
  ],

  // ── ADDITIONAL POPULAR MODELS ────────────────────────────────────────────────

  'TOYOTA|PRIUS PRIME': [
    { from: 2017, to: 2022, engines: ['1.8L Plug-in Hybrid'] },
    { from: 2023, to: 2026, engines: ['2.0L Plug-in Hybrid AWD', '2.0L Plug-in Hybrid FWD'] },
  ],

  'FORD|MAVERICK': [
    { from: 2022, to: 2026, engines: ['2.5L Hybrid FWD', '2.0L EcoBoost 4-cyl FWD', '2.0L EcoBoost 4-cyl AWD'] },
  ],

  'HYUNDAI|IONIQ 5': [
    { from: 2022, to: 2026, engines: ['Electric Standard Range RWD', 'Electric Long Range RWD', 'Electric Long Range AWD', 'N Electric AWD'] },
  ],

  'HYUNDAI|SANTA CRUZ': [
    { from: 2022, to: 2026, engines: ['2.5L 4-cyl FWD', '2.5L 4-cyl AWD', '2.5L Turbo 4-cyl AWD'] },
  ],

  'KIA|EV6': [
    { from: 2022, to: 2026, engines: ['Standard Range Electric RWD', 'Long Range Electric RWD', 'Long Range Electric AWD', 'GT Electric AWD'] },
  ],

  'GENESIS|GV70': [
    { from: 2022, to: 2026, engines: ['2.5L Turbo 4-cyl RWD', '2.5L Turbo 4-cyl AWD', '3.5L Twin-Turbo V6 AWD', 'Electric AWD'] },
  ],

  'GENESIS|G80': [
    { from: 2017, to: 2022, engines: ['2.0L Turbo 4-cyl', '3.8L V6', '5.0L V8'] },
    { from: 2022, to: 2026, engines: ['2.5L Turbo 4-cyl RWD', '2.5L Turbo 4-cyl AWD', '3.5L Twin-Turbo V6 AWD', 'Electric AWD'] },
  ],

  'VOLKSWAGEN|ID.4': [
    { from: 2021, to: 2026, engines: ['Electric Standard RWD', 'Electric Pro RWD', 'Electric Pro S RWD', 'Electric AWD'] },
  ],

  'BMW|X3': [
    { from: 2004, to: 2010, engines: ['2.5L 6-cyl xDrive AWD', '3.0L 6-cyl xDrive AWD'] },
    { from: 2011, to: 2017, engines: ['2.0L Turbo 4-cyl xDrive AWD', '3.0L Turbo 6-cyl xDrive AWD', '3.0L M xDrive AWD'] },
    { from: 2018, to: 2026, engines: ['2.0L Turbo 4-cyl sDrive RWD', '2.0L Turbo 4-cyl xDrive AWD', '3.0L Turbo 6-cyl xDrive AWD', '3.0L Twin-Turbo M xDrive AWD', 'Electric xDrive AWD'] },
  ],

  'PORSCHE|CAYENNE': [
    { from: 2003, to: 2010, engines: ['3.2L V6 AWD', '4.5L V8 AWD', '4.5L Twin-Turbo Turbo V8 AWD', '4.8L V8 AWD', '4.8L Twin-Turbo Turbo S V8 AWD'] },
    { from: 2011, to: 2018, engines: ['3.0L Turbo Diesel V6 AWD', '3.6L V6 AWD', '3.6L Turbo V6 AWD', '4.8L V8 AWD', '4.8L Twin-Turbo Turbo S V8 AWD', 'Plug-in Hybrid V6 AWD'] },
    { from: 2019, to: 2026, engines: ['3.0L Turbo V6 AWD', '2.9L Twin-Turbo V6 S AWD', '4.0L Twin-Turbo V8 Turbo AWD', '4.0L Twin-Turbo Turbo S E-Hybrid AWD', 'Plug-in Hybrid V6 AWD'] },
  ],

  'PORSCHE|MACAN': [
    { from: 2015, to: 2023, engines: ['2.0L Turbo 4-cyl AWD', '2.0L Turbo GTS 4-cyl AWD', '3.0L Twin-Turbo V6 S AWD', '3.0L Twin-Turbo GTS V6 AWD', '2.9L Twin-Turbo Turbo V6 AWD'] },
    { from: 2024, to: 2026, engines: ['Electric AWD', 'Electric Turbo AWD'] },
  ],

  'PORSCHE|911': [
    { from: 1980, to: 1989, engines: ['3.0L 6-cyl RWD', '3.2L 6-cyl Carrera RWD', '3.3L Turbo 6-cyl RWD'] },
    { from: 1990, to: 1998, engines: ['3.3L Turbo 6-cyl RWD', '3.6L 6-cyl RWD', '3.8L 6-cyl RS RWD', '3.6L 4S AWD'] },
    { from: 1999, to: 2004, engines: ['3.4L 6-cyl RWD', '3.6L 6-cyl Carrera 4S AWD', '3.6L Turbo AWD', '3.6L GT3 6-cyl RWD', '3.8L GT2 Twin-Turbo RWD'] },
    { from: 2005, to: 2011, engines: ['3.6L 6-cyl RWD', '3.8L 6-cyl S RWD', '3.6L Turbo AWD', '3.8L Turbo S AWD', '3.8L GT3 6-cyl RWD'] },
    { from: 2012, to: 2018, engines: ['3.4L 6-cyl RWD', '3.8L 6-cyl S RWD', '3.8L Twin-Turbo AWD', '4.0L GT3 RS 6-cyl RWD', '3.8L GT2 RS Twin-Turbo RWD'] },
    { from: 2019, to: 2026, engines: ['3.0L Twin-Turbo 6-cyl RWD', '3.0L Twin-Turbo 6-cyl S RWD', '3.0L Twin-Turbo 4S AWD', '3.7L Twin-Turbo Turbo AWD', '4.0L GT3 6-cyl RWD', '3.7L GT2 RS Twin-Turbo RWD', '3.6L GTS 6-cyl RWD'] },
  ],

};
