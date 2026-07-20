import type { AppData, WorkPlanDayHours } from '../types';
import { localDateString } from './date';

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
  if (parsed.version !== 1 || !Array.isArray(parsed.events) || !Array.isArray(parsed.workPlans)) {
    throw new Error('Die Datei ist kein gültiges TimePilot-Backup.');
  }
  return parsed;
}

export function clearData(): void {
  localStorage.removeItem(STORAGE_KEY);
}
