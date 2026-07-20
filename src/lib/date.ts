const DAY_MS = 24 * 60 * 60 * 1000;

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('de-DE', options ?? { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    parseLocalDate(value),
  );
}

export function formatLongDate(value: string): string {
  return formatDate(value, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

export function lastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

export function addDays(value: string, amount: number): string {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

export function enumerateDates(from: string, to: string): string[] {
  const result: string[] = [];
  let cursor = parseLocalDate(from).getTime();
  const end = parseLocalDate(to).getTime();
  while (cursor <= end) {
    result.push(localDateString(new Date(cursor)));
    cursor += DAY_MS;
  }
  return result;
}

export function compareDateStrings(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isDateInRange(date: string, from: string, to: string | null): boolean {
  return date >= from && (!to || date <= to);
}

export function isWeekend(date: string): boolean {
  const weekday = parseLocalDate(date).getDay();
  return weekday === 0 || weekday === 6;
}

export function calendarCells(month: Date): Array<string | null> {
  const first = firstDayOfMonth(month);
  const last = lastDayOfMonth(month);
  const mondayIndex = (first.getDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: mondayIndex }, () => null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(localDateString(new Date(month.getFullYear(), month.getMonth(), day, 12)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function monthRange(month: Date): { from: string; to: string } {
  return { from: localDateString(firstDayOfMonth(month)), to: localDateString(lastDayOfMonth(month)) };
}

export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function isoDateTimeOnDate(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

export function timestampDate(timestamp: string): string {
  return localDateString(new Date(timestamp));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / DAY_MS);
}
