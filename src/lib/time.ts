import type { Absence, AppData, DaySummary, Holiday, TimeEvent, WorkPlan } from '../types';
import { enumerateDates, isDateInRange, localDateString, parseLocalDate, timestampDate } from './date';

export type TimerState = 'idle' | 'working' | 'paused' | 'done';

export interface TimeTotals {
  workedMilliseconds: number;
  breakMilliseconds: number;
  state: TimerState;
  firstClockIn?: string;
  lastClockOut?: string;
  openSince?: string;
}

export function eventsForDate(events: TimeEvent[], date: string): TimeEvent[] {
  return events
    .filter((event) => timestampDate(event.timestamp) === date)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function calculateTimeTotals(events: TimeEvent[], date: string, now = new Date()): TimeTotals {
  const sorted = eventsForDate(events, date);
  let state: TimerState = 'idle';
  let workedMilliseconds = 0;
  let breakMilliseconds = 0;
  let workStartedAt: number | null = null;
  let breakStartedAt: number | null = null;
  let firstClockIn: string | undefined;
  let lastClockOut: string | undefined;

  for (const event of sorted) {
    const at = new Date(event.timestamp).getTime();
    if (event.type === 'CLOCK_IN') {
      if (!firstClockIn) firstClockIn = event.timestamp;
      if (state !== 'working') workStartedAt = at;
      breakStartedAt = null;
      state = 'working';
    } else if (event.type === 'BREAK_START' && state === 'working') {
      if (workStartedAt !== null) workedMilliseconds += Math.max(0, at - workStartedAt);
      workStartedAt = null;
      breakStartedAt = at;
      state = 'paused';
    } else if (event.type === 'BREAK_END' && state === 'paused') {
      if (breakStartedAt !== null) breakMilliseconds += Math.max(0, at - breakStartedAt);
      breakStartedAt = null;
      workStartedAt = at;
      state = 'working';
    } else if (event.type === 'CLOCK_OUT' && (state === 'working' || state === 'paused')) {
      if (state === 'working' && workStartedAt !== null) workedMilliseconds += Math.max(0, at - workStartedAt);
      if (state === 'paused' && breakStartedAt !== null) breakMilliseconds += Math.max(0, at - breakStartedAt);
      workStartedAt = null;
      breakStartedAt = null;
      state = 'done';
      lastClockOut = event.timestamp;
    }
  }

  const isToday = date === localDateString(now);
  if (isToday && state === 'working' && workStartedAt !== null) {
    workedMilliseconds += Math.max(0, now.getTime() - workStartedAt);
  }
  if (isToday && state === 'paused' && breakStartedAt !== null) {
    breakMilliseconds += Math.max(0, now.getTime() - breakStartedAt);
  }

  return {
    workedMilliseconds,
    breakMilliseconds,
    state,
    firstClockIn,
    lastClockOut,
    openSince:
      state === 'working' && workStartedAt !== null
        ? new Date(workStartedAt).toISOString()
        : state === 'paused' && breakStartedAt !== null
          ? new Date(breakStartedAt).toISOString()
          : undefined,
  };
}

export function activeWorkPlan(plans: WorkPlan[], date: string): WorkPlan | undefined {
  return [...plans]
    .filter((plan) => isDateInRange(date, plan.validFrom, plan.validTo))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
}

export function targetMinutesForDate(plans: WorkPlan[], date: string): number {
  const plan = activeWorkPlan(plans, date);
  if (!plan) return 0;
  const weekday = parseLocalDate(date).getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return Math.round((plan.hoursByWeekday[weekday] ?? 0) * 60);
}

export function absenceForDate(absences: Absence[], date: string): Absence | undefined {
  return absences.find((absence) => date >= absence.from && date <= absence.to);
}

export function buildDaySummary(
  data: AppData,
  date: string,
  holidays: Holiday[],
  now = new Date(),
): DaySummary {
  const totals = calculateTimeTotals(data.events, date, now);
  const targetMinutes = targetMinutesForDate(data.workPlans, date);
  const holiday = holidays.find((entry) => entry.date === date);
  const absence = absenceForDate(data.absences, date);
  const holidayCredit = holiday
    ? data.settings.holidayCreditMode === 'fixed8' && targetMinutes > 0
      ? 8 * 60
      : targetMinutes
    : 0;
  const absenceCredit = absence && !holiday ? targetMinutes : 0;
  const creditedMinutes = Math.max(holidayCredit, absenceCredit);
  const workedMinutes = Math.round(totals.workedMilliseconds / 60000);
  const breakMinutes = Math.round(totals.breakMilliseconds / 60000);
  const balanceMinutes = workedMinutes + creditedMinutes - targetMinutes;

  let status: DaySummary['status'] = 'empty';
  if (totals.state === 'working') status = 'working';
  else if (totals.state === 'paused') status = 'paused';
  else if (totals.state === 'done') status = 'done';
  else if (eventsForDate(data.events, date).length > 0) status = 'incomplete';

  return {
    date,
    targetMinutes,
    workedMinutes,
    creditedMinutes,
    breakMinutes,
    balanceMinutes,
    holiday,
    absence,
    note: data.notes[date],
    status,
  };
}

export function summariesForRange(
  data: AppData,
  from: string,
  to: string,
  holidays: Holiday[],
  now = new Date(),
): DaySummary[] {
  return enumerateDates(from, to).map((date) => buildDaySummary(data, date, holidays, now));
}

export function aggregateSummaries(summaries: DaySummary[]) {
  return summaries.reduce(
    (total, day) => ({
      targetMinutes: total.targetMinutes + day.targetMinutes,
      workedMinutes: total.workedMinutes + day.workedMinutes,
      creditedMinutes: total.creditedMinutes + day.creditedMinutes,
      breakMinutes: total.breakMinutes + day.breakMinutes,
      balanceMinutes: total.balanceMinutes + day.balanceMinutes,
    }),
    { targetMinutes: 0, workedMinutes: 0, creditedMinutes: 0, breakMinutes: 0, balanceMinutes: 0 },
  );
}

export function vacationDaysUsed(data: AppData, holidays: Holiday[], year: number): number {
  const dates = new Set<string>();
  for (const absence of data.absences.filter((entry) => entry.type === 'vacation')) {
    for (const date of enumerateDates(absence.from, absence.to)) {
      if (parseLocalDate(date).getFullYear() !== year) continue;
      if (targetMinutesForDate(data.workPlans, date) <= 0) continue;
      if (holidays.some((holiday) => holiday.date === date)) continue;
      dates.add(date);
    }
  }
  return dates.size;
}

export function nextEligibleOvertimeDates(data: AppData, holidays: Holiday[], limit = 8): string[] {
  const result: string[] = [];
  let cursor = localDateString();
  for (let index = 0; index < 180 && result.length < limit; index += 1) {
    const date = new Date(parseLocalDate(cursor));
    date.setDate(date.getDate() + 1);
    cursor = localDateString(date);
    if (targetMinutesForDate(data.workPlans, cursor) <= 0) continue;
    if (holidays.some((holiday) => holiday.date === cursor)) continue;
    if (absenceForDate(data.absences, cursor)) continue;
    result.push(cursor);
  }
  return result;
}

export function weeklyHours(plan: WorkPlan): number {
  return Object.values(plan.hoursByWeekday).reduce((sum, hours) => sum + hours, 0);
}
