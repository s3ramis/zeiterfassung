export function minutesToHours(minutes: number, includeSign = false): string {
  const sign = minutes < 0 ? '−' : includeSign && minutes > 0 ? '+' : '';
  const absolute = Math.abs(Math.round(minutes));
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  return `${sign}${hours}:${String(mins).padStart(2, '0')}`;
}

export function secondsToClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function decimalHoursToLabel(hours: number): string {
  return minutesToHours(Math.round(hours * 60));
}

export function absenceLabel(type: 'vacation' | 'sick' | 'overtime'): string {
  return type === 'vacation' ? 'Urlaub' : type === 'sick' ? 'Krankheit' : 'Überstundenausgleich';
}
