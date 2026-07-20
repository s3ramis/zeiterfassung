import type { Holiday } from '../types';
import { localDateString } from './date';

interface ApiHoliday {
  startDate: string;
  nationwide: boolean;
  name: Array<{ language: string; text: string }>;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

function shifted(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return localDateString(result);
}

export function federalHolidayFallback(year: number): Holiday[] {
  const easter = easterSunday(year);
  return [
    { date: `${year}-01-01`, name: 'Neujahr', nationwide: true },
    { date: shifted(easter, -2), name: 'Karfreitag', nationwide: true },
    { date: shifted(easter, 1), name: 'Ostermontag', nationwide: true },
    { date: `${year}-05-01`, name: 'Tag der Arbeit', nationwide: true },
    { date: shifted(easter, 39), name: 'Christi Himmelfahrt', nationwide: true },
    { date: shifted(easter, 50), name: 'Pfingstmontag', nationwide: true },
    { date: `${year}-10-03`, name: 'Tag der Deutschen Einheit', nationwide: true },
    { date: `${year}-12-25`, name: '1. Weihnachtsfeiertag', nationwide: true },
    { date: `${year}-12-26`, name: '2. Weihnachtsfeiertag', nationwide: true },
  ];
}

export async function fetchGermanHolidays(year: number, federalState: string): Promise<{ holidays: Holiday[]; source: 'api' | 'fallback' }> {
  const params = new URLSearchParams({
    countryIsoCode: 'DE',
    languageIsoCode: 'DE',
    subdivisionCode: federalState,
    validFrom: `${year}-01-01`,
    validTo: `${year}-12-31`,
  });

  try {
    const response = await fetch(`https://openholidaysapi.org/PublicHolidays?${params.toString()}`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = (await response.json()) as ApiHoliday[];
    return {
      source: 'api',
      holidays: result.map((entry) => ({
        date: entry.startDate,
        nationwide: entry.nationwide,
        name: entry.name.find((item) => item.language === 'DE')?.text ?? entry.name[0]?.text ?? 'Feiertag',
      })),
    };
  } catch (error) {
    console.warn('Feiertags-API nicht erreichbar, bundesweiter Fallback wird verwendet.', error);
    return { holidays: federalHolidayFallback(year), source: 'fallback' };
  }
}

export const FEDERAL_STATES = [
  ['DE-BW', 'Baden-Württemberg'],
  ['DE-BY', 'Bayern'],
  ['DE-BE', 'Berlin'],
  ['DE-BB', 'Brandenburg'],
  ['DE-HB', 'Bremen'],
  ['DE-HH', 'Hamburg'],
  ['DE-HE', 'Hessen'],
  ['DE-MV', 'Mecklenburg-Vorpommern'],
  ['DE-NI', 'Niedersachsen'],
  ['DE-NW', 'Nordrhein-Westfalen'],
  ['DE-RP', 'Rheinland-Pfalz'],
  ['DE-SL', 'Saarland'],
  ['DE-SN', 'Sachsen'],
  ['DE-ST', 'Sachsen-Anhalt'],
  ['DE-SH', 'Schleswig-Holstein'],
  ['DE-TH', 'Thüringen'],
] as const;
