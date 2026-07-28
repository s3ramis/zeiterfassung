export type TimeEventType = 'CLOCK_IN' | 'BREAK_START' | 'BREAK_END' | 'CLOCK_OUT';

export interface TimeEvent {
  id: string;
  type: TimeEventType;
  timestamp: string;
  source?: 'timer' | 'manual';
}

export type AbsenceType = 'vacation' | 'sick' | 'overtime';

export interface Absence {
  id: string;
  type: AbsenceType;
  from: string;
  to: string;
  note: string;
  createdAt: string;
}

export interface WorkPlanDayHours {
  0: number;
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
  6: number;
}

export interface WorkPlan {
  id: string;
  name: string;
  validFrom: string;
  validTo: string | null;
  hoursByWeekday: WorkPlanDayHours;
}

export interface Holiday {
  date: string;
  name: string;
  nationwide: boolean;
}

export interface HolidayCacheEntry {
  key: string;
  loadedAt: string;
  holidays: Holiday[];
  source: 'api' | 'fallback';
}

export interface Settings {
  employeeName: string;
  federalState: string;
  annualLeaveDays: number;
  holidayCreditMode: 'schedule' | 'fixed8';
}

export interface AppData {
  version: 1;
  events: TimeEvent[];
  absences: Absence[];
  workPlans: WorkPlan[];
  notes: Record<string, string>;
  settings: Settings;
  holidayCache: Record<string, HolidayCacheEntry>;
}

export interface DaySummary {
  date: string;
  targetMinutes: number;
  workedMinutes: number;
  creditedMinutes: number;
  overtimeDeductionMinutes: number;
  breakMinutes: number;
  balanceMinutes: number;
  holiday?: Holiday;
  absence?: Absence;
  note?: string;
  status: 'empty' | 'working' | 'paused' | 'done' | 'incomplete';
}

export type AppSection = 'overview' | 'workplans' | 'absences' | 'settings';
