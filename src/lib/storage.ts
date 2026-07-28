import type { AppData, WorkPlanDayHours } from '../types';
import { localDateString, timestampDate } from './date';

const STORAGE_KEY = 'timepilot.app-data.v1';

const defaultHours: WorkPlanDayHours = {
  0: 0,
  1: 8,
  2: 8,
  3: 8,
  4: 8,
  5: 8,
  6: 0,
};

export function createDefaultData(): AppData {
  return {
    version: 1,
    events: [],
    absences: [],
    workPlans: [
      {
        id: crypto.randomUUID(),
        name: 'Standard 40 Stunden',
        validFrom: `${new Date().getFullYear()}-01-01`,
        validTo: null,
        hoursByWeekday: defaultHours,
      },
    ],
    notes: {},
    settings: {
      employeeName: 'Alex',
      federalState: 'DE-BY',
      annualLeaveDays: 30,
      holidayCreditMode: 'schedule',
    },
    holidayCache: {},
  };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultData();
    const parsed = JSON.parse(raw) as AppData;
    if (parsed.version !== 1) return createDefaultData();
    return parsed;
  } catch {
    return createDefaultData();
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function exportData(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `timepilot-backup-${localDateString()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function importData(file: File): Promise<AppData> {
  const text = await file.text();
  const parsed = JSON.parse(text) as AppData;
  if (
    parsed.version !== 1
    || !Array.isArray(parsed.events)
    || !Array.isArray(parsed.absences)
    || !Array.isArray(parsed.workPlans)
    || typeof parsed.notes !== 'object'
    || parsed.notes === null
  ) {
    throw new Error('Die Datei ist kein gültiges TimePilot-Backup.');
  }

  const eventDates = new Set(parsed.events.map((event) => timestampDate(event.timestamp)));
  const conflictingVacation = parsed.absences.find((absence) => {
    if (absence.type !== 'vacation') return false;
    return [...eventDates].some((date) => date >= absence.from && date <= absence.to);
  });
  if (conflictingVacation) {
    throw new Error('Das Backup enthält Urlaub an Tagen mit bereits erfassten Arbeitszeiten.');
  }

  return parsed;
}

export function clearData(): void {
  localStorage.removeItem(STORAGE_KEY);
}
