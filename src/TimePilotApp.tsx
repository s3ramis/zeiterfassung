import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AbsenceType,
  AppData,
  AppSection,
  Holiday,
  Settings,
  TimeEvent,
  TimeEventType,
  WorkPlan,
  WorkPlanDayHours,
} from './types';
import {
  addMonths,
  calendarCells,
  enumerateDates,
  formatDate,
  formatLongDate,
  localDateString,
  monthRange,
  parseLocalDate,
  timestampDate,
} from './lib/date';
import { absenceLabel, decimalHoursToLabel, minutesToHours, secondsToClock } from './lib/format';
import { FEDERAL_STATES, fetchGermanHolidays } from './lib/holidays';
import { exportMonthlyPdf } from './lib/pdf';
import { exportData, importData } from './lib/storage';
import type { AuthUser, StorageMode } from './lib/data-store';
import {
  activeWorkPlan,
  aggregateSummaries,
  buildDaySummary,
  calculateTimeTotals,
  eventsForDate,
  futureOvertimeDeductionMinutes,
  hasEventsInRange,
  nextEligibleOvertimeDates,
  summariesForRange,
  targetMinutesForDate,
  timeWindowsForDate,
  vacationDaysUsed,
  vacationForDate,
  weeklyHours,
} from './lib/time';

const EVENT_LABELS: Record<TimeEventType, string> = {
  CLOCK_IN: 'Eingestempelt',
  BREAK_START: 'Pause begonnen',
  BREAK_END: 'Pause beendet',
  CLOCK_OUT: 'Ausgestempelt',
};

const SECTION_META: Record<AppSection, { title: string; subtitle: string }> = {
  overview: { title: 'Übersicht', subtitle: 'Zeiterfassung, Kalender und Zeitkonto' },
  workplans: { title: 'Arbeitspläne', subtitle: 'Sollzeiten mit Gültigkeitszeitraum verwalten' },
  absences: { title: 'Abwesenheiten', subtitle: 'Urlaub, Krankheit und Überstundenabbau' },
  settings: { title: 'Einstellungen', subtitle: 'Person, Feiertage, Urlaub und Datensicherung' },
};

const WEEKDAYS: Array<{ key: keyof WorkPlanDayHours; label: string; long: string }> = [
  { key: 1, label: 'Mo', long: 'Montag' },
  { key: 2, label: 'Di', long: 'Dienstag' },
  { key: 3, label: 'Mi', long: 'Mittwoch' },
  { key: 4, label: 'Do', long: 'Donnerstag' },
  { key: 5, label: 'Fr', long: 'Freitag' },
  { key: 6, label: 'Sa', long: 'Samstag' },
  { key: 0, label: 'So', long: 'Sonntag' },
];

function timeLabel(timestamp?: string): string {
  if (!timestamp) return '–';
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(date);
}

function stateName(code: string): string {
  return FEDERAL_STATES.find(([value]) => value === code)?.[1] ?? code;
}

function rangesOverlap(aFrom: string, aTo: string | null, bFrom: string, bTo: string | null): boolean {
  const safeATo = aTo ?? '9999-12-31';
  const safeBTo = bTo ?? '9999-12-31';
  return aFrom <= safeBTo && bFrom <= safeATo;
}

function Icon({ name, size = 20 }: { name: 'clock' | 'calendar' | 'plan' | 'absence' | 'settings' | 'database' | 'browser' | 'download' | 'edit' | 'trash' | 'plus' | 'play' | 'pause' | 'stop' | 'coffee' | 'check' | 'user'; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
    plan: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    absence: <><path d="M4 19c3-5 5-7 8-7s5 2 8 7" /><circle cx="12" cy="7" r="3" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9 6a8 8 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.3-1a8 8 0 0 0 1.7 1l.5 3h5l.5-3a8 8 0 0 0 1.7-1l2.3 1 2-3.5-2.1-1.5c.1-.3.1-.7.1-1z" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
    browser: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4zM13.5 6.5l4 4" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    play: <><path d="M8 5l11 7-11 7V5z" /></>,
    pause: <><path d="M8 5h3v14H8zM14 5h3v14h-3z" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    coffee: <><path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8zM16 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2" /></>,
    check: <path d="M5 12l4 4 10-10" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  };
  return <svg className="icon-svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export interface StorageInfo {
  mode: StorageMode;
  label: string;
  user: AuthUser | null;
  serverUrl?: string;
  syncState: 'idle' | 'saving' | 'saved' | 'error';
  syncMessage: string;
}

interface TimePilotAppProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  storageInfo: StorageInfo;
  onChangeMode: () => void;
  onLogout?: () => Promise<void>;
  onReset: () => Promise<void>;
}

interface AbsenceSelection {
  from: string;
  to: string;
  next: 'from' | 'to';
  version: number;
}

export default function TimePilotApp({ data, setData, storageInfo, onChangeMode, onLogout, onReset }: TimePilotAppProps) {
  const [section, setSection] = useState<AppSection>('overview');
  const [now, setNow] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [selectedDate, setSelectedDate] = useState(() => localDateString());
  const [holidayStatus, setHolidayStatus] = useState('Feiertage werden geprüft …');
  const [suggestedDate, setSuggestedDate] = useState('');
  const [absenceSelection, setAbsenceSelection] = useState<AbsenceSelection>(() => ({
    from: localDateString(),
    to: localDateString(),
    next: 'from',
    version: 0,
  }));
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleYear = visibleMonth.getFullYear();
  const currentYear = now.getFullYear();

  useEffect(() => {
    let cancelled = false;
    const years = [...new Set([visibleYear, currentYear, currentYear + 1])];
    const visibleCached = data.holidayCache[`${visibleYear}:${data.settings.federalState}`];
    if (years.every((year) => data.holidayCache[`${year}:${data.settings.federalState}`])) {
      setHolidayStatus(
        visibleCached?.source === 'api'
          ? `Feiertage ${visibleYear} stammen aus OpenHolidays API.`
          : `Für ${visibleYear} werden nur bundesweite Offline-Feiertage verwendet.`,
      );
    }

    for (const year of years) {
      const key = `${year}:${data.settings.federalState}`;
      if (data.holidayCache[key]) continue;
      setHolidayStatus(`Feiertage ${year} werden von OpenHolidays API geladen …`);
      void fetchGermanHolidays(year, data.settings.federalState).then((result) => {
        if (cancelled) return;
        setData((previous) => {
          if (previous.holidayCache[key]) return previous;
          return {
            ...previous,
            holidayCache: {
              ...previous.holidayCache,
              [key]: { key, loadedAt: new Date().toISOString(), holidays: result.holidays, source: result.source },
            },
          };
        });
        setHolidayStatus(
          result.source === 'api'
            ? `Feiertage ${year} wurden über OpenHolidays API geladen.`
            : `API nicht erreichbar: Für ${year} werden nur bundesweite Feiertage verwendet.`,
        );
      });
    }

    return () => { cancelled = true; };
  }, [currentYear, data.holidayCache, data.settings.federalState, setData, visibleYear]);

  const holidaysForYear = (year: number) => data.holidayCache[`${year}:${data.settings.federalState}`]?.holidays ?? [];
  const visibleHolidays = holidaysForYear(visibleYear);
  const currentHolidays = holidaysForYear(currentYear);
  const suggestionHolidays = [...currentHolidays, ...holidaysForYear(currentYear + 1)];
  const today = localDateString(now);
  const todayTotals = useMemo(() => calculateTimeTotals(data.events, today, now), [data.events, now, today]);
  const todaySummary = useMemo(() => buildDaySummary(data, today, currentHolidays, now), [currentHolidays, data, now, today]);
  const todayTarget = targetMinutesForDate(data.workPlans, today);
  const activePlan = activeWorkPlan(data.workPlans, today);
  const todayVacation = vacationForDate(data.absences, today);

  const currentYearSummaries = useMemo(
    () => summariesForRange(data, `${currentYear}-01-01`, today, currentHolidays, now),
    [currentHolidays, currentYear, data, now, today],
  );
  const yearTotals = useMemo(() => aggregateSummaries(currentYearSummaries), [currentYearSummaries]);
  const futureOvertime = useMemo(
    () => futureOvertimeDeductionMinutes(data, currentHolidays, today, `${currentYear}-12-31`),
    [currentHolidays, currentYear, data, today],
  );
  const timeAccountBalance = yearTotals.balanceMinutes - futureOvertime;

  const visibleRange = monthRange(visibleMonth);
  const visibleSummaries = useMemo(
    () => summariesForRange(data, visibleRange.from, visibleRange.to, visibleHolidays, now),
    [data, now, visibleHolidays, visibleRange.from, visibleRange.to],
  );
  const monthTotals = useMemo(() => aggregateSummaries(visibleSummaries), [visibleSummaries]);
  const cells = useMemo(() => calendarCells(visibleMonth), [visibleMonth]);
  const selectedSummary = useMemo(
    () => buildDaySummary(data, selectedDate, holidaysForYear(parseLocalDate(selectedDate).getFullYear()), now),
    [data, now, selectedDate],
  );

  const usedVacation = vacationDaysUsed(data, currentHolidays, currentYear);
  const remainingVacation = Math.max(0, data.settings.annualLeaveDays - usedVacation);
  const suggestions = nextEligibleOvertimeDates(data, suggestionHolidays).filter((date) => date.startsWith(`${currentYear}-`));

  useEffect(() => {
    if (!suggestedDate || !suggestions.includes(suggestedDate)) setSuggestedDate(suggestions[0] ?? '');
  }, [suggestedDate, suggestions]);

  const statusClass = todayTotals.state === 'working' ? 'work' : todayTotals.state === 'paused' ? 'pause' : todayTotals.state;
  const statusText = todayTotals.state === 'working'
    ? `Arbeitszeit läuft seit ${timeLabel(todayTotals.openSince)}`
    : todayTotals.state === 'paused'
      ? `Pause läuft seit ${timeLabel(todayTotals.openSince)}`
      : todayTotals.state === 'done'
        ? `Zuletzt ausgestempelt um ${timeLabel(todayTotals.lastClockOut)}`
        : 'Noch nicht eingestempelt';
  const remainingMinutes = Math.max(0, todayTarget - todaySummary.workedMinutes);
  const predictedEnd = todayTotals.state === 'working' || todayTotals.state === 'paused'
    ? new Date(now.getTime() + remainingMinutes * 60000)
    : undefined;

  function selectCalendarDate(date: string): void {
    setSelectedDate(date);
    setAbsenceSelection((previous) => previous.next === 'from'
      ? { from: date, to: '', next: 'to', version: previous.version + 1 }
      : { from: previous.from, to: date, next: 'from', version: previous.version + 1 });
  }

  function addTimerEvent(type: TimeEventType): void {
    if (type === 'CLOCK_IN' && !activePlan) {
      window.alert('Für heute ist kein Arbeitsplan hinterlegt. Lege zuerst einen Arbeitsplan an.');
      return;
    }
    if (type === 'CLOCK_IN' && todayVacation) {
      window.alert('Für heute ist Urlaub eingetragen. An Urlaubstagen kann keine Arbeitszeit erfasst werden.');
      return;
    }
    const timestamp = new Date().toISOString();
    setData((previous) => ({
      ...previous,
      events: [...previous.events, { id: crypto.randomUUID(), type, timestamp, source: 'timer' }],
    }));
  }

  function clockOut(): void {
    const stamp = new Date();
    setData((previous) => {
      const state = calculateTimeTotals(previous.events, localDateString(stamp), stamp).state;
      const additions: TimeEvent[] = [];
      if (state === 'paused') {
        additions.push({ id: crypto.randomUUID(), type: 'BREAK_END', timestamp: stamp.toISOString(), source: 'timer' });
      }
      additions.push({
        id: crypto.randomUUID(),
        type: 'CLOCK_OUT',
        timestamp: new Date(stamp.getTime() + additions.length).toISOString(),
        source: 'timer',
      });
      return { ...previous, events: [...previous.events, ...additions] };
    });
  }

  function addOvertimeDay(): void {
    if (!suggestedDate) return;
    const target = targetMinutesForDate(data.workPlans, suggestedDate);
    if (timeAccountBalance < target) {
      window.alert('Das verfügbare Überstundenguthaben reicht für diesen Tag nicht aus.');
      return;
    }
    if (!window.confirm(`${formatDate(suggestedDate)} als Überstundenabbau eintragen? Das Zeitkonto wird sofort um ${minutesToHours(target)} Stunden reduziert.`)) return;
    setData((previous) => ({
      ...previous,
      absences: [...previous.absences, {
        id: crypto.randomUUID(),
        type: 'overtime',
        from: suggestedDate,
        to: suggestedDate,
        note: 'Vom System auf Überstundenbasis vorgeschlagen und bestätigt',
        createdAt: new Date().toISOString(),
      }],
    }));
  }

  function updateNote(date: string, note: string): void {
    setData((previous) => {
      const notes = { ...previous.notes };
      if (note.trim()) notes[date] = note;
      else delete notes[date];
      return { ...previous, notes };
    });
  }

  function deleteEvent(id: string): void {
    setData((previous) => ({ ...previous, events: previous.events.filter((event) => event.id !== id) }));
  }

  function renderOverview() {
    const monthProgress = monthTotals.targetMinutes
      ? Math.min(100, Math.max(0, ((monthTotals.workedMinutes + monthTotals.creditedMinutes) / monthTotals.targetMinutes) * 100))
      : 0;
    const vacationProgress = data.settings.annualLeaveDays
      ? Math.min(100, (usedVacation / data.settings.annualLeaveDays) * 100)
      : 0;
    const suggestedTarget = suggestedDate ? targetMinutesForDate(data.workPlans, suggestedDate) : 0;
    const canSuggest = Boolean(suggestedDate && suggestedTarget > 0 && timeAccountBalance >= suggestedTarget);
    const clockInBlocked = todayTotals.state === 'working' || todayTotals.state === 'paused' || !activePlan || Boolean(todayVacation);

    return (
      <section className="dashboard-layout">
        <div className="stack dashboard-main">
          <div className="card clock-card modern-card">
            <div className="card-head">
              <div>
                <span className="eyebrow">Heute · {formatDate(today, { weekday: 'long', day: '2-digit', month: 'long' })}</span>
                <h2>Zeiterfassung</h2>
                <p>Nettoarbeitszeit ohne Pausen</p>
              </div>
              <div className={`status ${statusClass}`}><span className="dot" /><span>{statusText}</span></div>
            </div>

            {(!activePlan || todayVacation) && todayTotals.state === 'idle' && (
              <div className={`blocking-notice ${todayVacation ? 'vacation' : ''}`}>
                <Icon name={todayVacation ? 'absence' : 'plan'} />
                <div>
                  <strong>{todayVacation ? 'Urlaub ist eingetragen' : 'Kein Arbeitsplan für heute'}</strong>
                  <span>{todayVacation ? 'Die Zeiterfassung ist an Urlaubstagen gesperrt.' : 'Ohne gültigen Arbeitsplan kann die Zeiterfassung nicht gestartet werden. Das Tagessoll bleibt 0:00 Stunden.'}</span>
                </div>
                {!todayVacation && <button className="small-btn secondary" onClick={() => setSection('workplans')}>Arbeitsplan anlegen</button>}
              </div>
            )}

            <div className="timer-wrap">
              <div className="timer">{secondsToClock(Math.floor(todayTotals.workedMilliseconds / 1000))}</div>
              <div className="timer-target">Soll heute <strong>{minutesToHours(todayTarget)} Std.</strong>{activePlan ? ` · ${activePlan.name}` : ' · kein Arbeitsplan'}</div>
            </div>

            <div className="clock-actions">
              <button className="clock-action start" disabled={clockInBlocked} onClick={() => addTimerEvent('CLOCK_IN')}><Icon name="play" /><span><strong>Einstempeln</strong><small>Arbeitszeit starten</small></span></button>
              <button className="clock-action break" disabled={todayTotals.state !== 'working'} onClick={() => addTimerEvent('BREAK_START')}><Icon name="coffee" /><span><strong>Pause beginnen</strong><small>Zeitnahme stoppen</small></span></button>
              <button className="clock-action resume" disabled={todayTotals.state !== 'paused'} onClick={() => addTimerEvent('BREAK_END')}><Icon name="play" /><span><strong>Pause beenden</strong><small>Zeitnahme fortsetzen</small></span></button>
              <button className="clock-action end" disabled={todayTotals.state === 'idle' || todayTotals.state === 'done'} onClick={clockOut}><Icon name="stop" /><span><strong>Ausstempeln</strong><small>Arbeitstag beenden</small></span></button>
            </div>

            <div className="summary-grid">
              <div className="metric"><span>Beginn</span><strong>{timeLabel(todayTotals.firstClockIn)}</strong></div>
              <div className="metric"><span>Pausen</span><strong>{minutesToHours(todaySummary.breakMinutes)}</strong></div>
              <div className="metric"><span>Vorauss. Ende</span><strong>{predictedEnd ? timeLabel(predictedEnd.toISOString()) : '–'}</strong></div>
              <div className="metric accent"><span>Tagessaldo</span><strong>{minutesToHours(todaySummary.balanceMinutes, true)}</strong></div>
            </div>
          </div>

          <div className="card calendar-card modern-card">
            <div className="calendar-toolbar">
              <div className="month-nav">
                <button className="navbtn" aria-label="Vorheriger Monat" onClick={() => setVisibleMonth((month) => addMonths(month, -1))}>‹</button>
                <div><span className="eyebrow">Arbeitszeitkalender</span><h2>{monthLabel(visibleMonth)}</h2></div>
                <button className="navbtn" aria-label="Nächster Monat" onClick={() => setVisibleMonth((month) => addMonths(month, 1))}>›</button>
              </div>
              <div className="calendar-tools">
                <span className="range-hint">Nächster Kalenderklick setzt <strong>{absenceSelection.next === 'from' ? 'Von' : 'Bis'}</strong></span>
                <button className="small-btn secondary" onClick={() => { setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12)); selectCalendarDate(today); }}>Heute</button>
              </div>
            </div>
            <div className="calendar">
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => <div className="dow" key={day}>{day}</div>)}
              {cells.map((date, index) => {
                if (!date) return <div className="day empty" key={`empty-${index}`} />;
                const day = visibleSummaries.find((entry) => entry.date === date)!;
                const weekend = index % 7 >= 5;
                const future = date > today;
                const noPlan = !activeWorkPlan(data.workPlans, date);
                const classes = ['day', weekend ? 'weekend' : '', day.holiday ? 'holiday' : '', date === today ? 'today' : '', date === selectedDate ? 'selected' : '', future ? 'future' : '', day.absence ? `has-${day.absence.type}` : ''].filter(Boolean).join(' ');
                const primary = day.holiday?.name ?? (day.absence ? absenceLabel(day.absence.type) : day.workedMinutes > 0 ? `${minutesToHours(day.workedMinutes)} Std.` : '');
                const secondary = day.status === 'working' ? 'läuft gerade' : day.status === 'paused' ? 'Pause läuft' : day.note ? day.note : !future && (day.targetMinutes > 0 || day.workedMinutes > 0) ? minutesToHours(day.balanceMinutes, true) : noPlan ? 'Soll 0:00' : '';
                return (
                  <button className={classes} key={date} onClick={() => selectCalendarDate(date)}>
                    <span className="num">{parseLocalDate(date).getDate()}</span>
                    {(primary || secondary) && <span className="entry"><strong>{primary}</strong><span>{secondary}</span></span>}
                  </button>
                );
              })}
            </div>
            <div className="legend">
              <span><i />Arbeitstag</span><span><i className="l-weekend" />Wochenende</span><span><i className="l-holiday" />Feiertag</span><span><i className="l-vacation" />Urlaub</span>
              <span className="legend-source">{holidayStatus}</span>
            </div>
            <DayEditor data={data} setData={setData} date={selectedDate} summary={selectedSummary} updateNote={updateNote} deleteEvent={deleteEvent} />
          </div>
        </div>

        <aside className="stack dashboard-side">
          <div className="card side-card account-card">
            <div className="side-card-title"><div><span className="eyebrow">Stand einschließlich Buchungen</span><h3>Zeitkonto {currentYear}</h3></div><Icon name="clock" /></div>
            <div className="hero-number"><strong>{minutesToHours(timeAccountBalance, true)}</strong><span>{timeAccountBalance >= 0 ? 'verfügbare Überstunden' : 'Minusstunden'}</span></div>
            <div className="progress"><div style={{ width: `${monthProgress}%` }} /></div>
            <div className="mini-list">
              <div className="row"><span>Arbeit im Monat</span><strong>{minutesToHours(monthTotals.workedMinutes)} Std.</strong></div>
              <div className="row"><span>Feiertag/Abwesenheit</span><strong>{minutesToHours(monthTotals.creditedMinutes)} Std.</strong></div>
              <div className="row"><span>Überstundenabbau gebucht</span><strong>−{minutesToHours(futureOvertime)} Std.</strong></div>
              <div className="row"><span>Pausen im Monat</span><strong>{minutesToHours(monthTotals.breakMinutes)} Std.</strong></div>
            </div>
            {suggestedDate && (
              <div className="suggestion">
                <span className="tag">Automatischer Vorschlag</span>
                <h4>{canSuggest ? 'Ein Tag Überstundenabbau ist möglich' : 'Noch kein voller Abbautag möglich'}</h4>
                <p>Nach Bestätigung wird das Zeitkonto sofort um das Tagessoll reduziert.</p>
                <div className="suggestion-actions">
                  <select className="select" value={suggestedDate} onChange={(event) => setSuggestedDate(event.target.value)}>
                    {suggestions.map((date) => <option value={date} key={date}>{formatDate(date, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</option>)}
                  </select>
                  <button className="small-btn primary" disabled={!canSuggest} onClick={addOvertimeDay}>Bestätigen</button>
                </div>
              </div>
            )}
          </div>

          <VacationStatusCard year={currentYear} annual={data.settings.annualLeaveDays} used={usedVacation} remaining={remainingVacation} progress={vacationProgress} />

          <QuickAbsenceForm data={data} setData={setData} selection={absenceSelection} vacationStatus={{ year: currentYear, annual: data.settings.annualLeaveDays, used: usedVacation, remaining: remainingVacation }} />

          <div className="card side-card export-card">
            <div className="export-icon"><Icon name="download" /></div>
            <div className="export"><div><b>Monatsbericht {monthLabel(visibleMonth)}</b><span>Kalender, Arbeits- und Pausenzeiten, Abwesenheiten, Überstundenabbau und Saldo</span></div><button className="pdf-btn" onClick={() => exportMonthlyPdf(data, visibleMonth, visibleHolidays, now)}>PDF exportieren</button></div>
          </div>
        </aside>
      </section>
    );
  }

  const sectionContent = section === 'overview'
    ? renderOverview()
    : section === 'workplans'
      ? <WorkPlansPage data={data} setData={setData} />
      : section === 'absences'
        ? <AbsencesPage data={data} setData={setData} selection={absenceSelection} year={currentYear} holidays={currentHolidays} />
        : <SettingsPage
            data={data}
            setData={setData}
            holidayStatus={holidayStatus}
            onExport={() => exportData(data)}
            onImportClick={() => fileInputRef.current?.click()}
            storageInfo={storageInfo}
            onChangeMode={onChangeMode}
            onLogout={onLogout}
            onReset={() => {
              const location = storageInfo.mode === 'server' ? 'auf dem Datenbank-Server' : 'in diesem Browser';
              if (!window.confirm(`Wirklich alle TimePilot-Daten ${location} löschen und auf Werkseinstellungen zurücksetzen?`)) return;
              void onReset().then(() => {
                setVisibleMonth(new Date());
                setSelectedDate(localDateString());
              }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : 'Zurücksetzen fehlgeschlagen.'));
            }}
          />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brandmark"><Icon name="clock" size={22} /></div><div><span>TimePilot</span><small>Arbeitszeitmanagement</small></div></div>
        <nav className="nav">
          <button className={section === 'overview' ? 'active' : ''} onClick={() => setSection('overview')}><Icon name="calendar" /><span>Übersicht</span></button>
          <button className={section === 'workplans' ? 'active' : ''} onClick={() => setSection('workplans')}><Icon name="plan" /><span>Arbeitspläne</span></button>
          <button className={section === 'absences' ? 'active' : ''} onClick={() => setSection('absences')}><Icon name="absence" /><span>Abwesenheiten</span></button>
          <button className={section === 'settings' ? 'active' : ''} onClick={() => setSection('settings')}><Icon name="settings" /><span>Einstellungen</span></button>
        </nav>
        <div className="sidebar-foot">
          <span className="sidebar-foot-label">Aktiver Speicher</span>
          <div className="storage-mini"><Icon name={storageInfo.mode === 'server' ? 'database' : 'browser'} /><div><strong>{storageInfo.label}</strong><span>{storageInfo.syncState === 'saving' ? 'Synchronisierung …' : storageInfo.syncState === 'error' ? 'Fehler' : 'Aktuell'}</span></div></div>
          <div className="location-mini">{stateName(data.settings.federalState)} · Deutschland</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">{section === 'overview' ? 'Persönliches Dashboard' : SECTION_META[section].subtitle}</span>
            <h1>{section === 'overview' ? `Guten Tag, ${data.settings.employeeName}` : SECTION_META[section].title}</h1>
            {section === 'overview' && <p>{formatLongDate(today)} · {activePlan ? `${activePlan.name} · ${weeklyHours(activePlan).toLocaleString('de-DE')} Std./Woche` : 'Kein Arbeitsplan aktiv · Sollzeit 0:00 Std.'}</p>}
          </div>
          <div className="top-actions">
            <div className={`sync-chip sync-${storageInfo.syncState}`}><span className="sync-dot" />{storageInfo.syncMessage || 'Bereit'}</div>
            <select className="select state-select" aria-label="Bundesland" value={data.settings.federalState} onChange={(event) => setData((previous) => ({ ...previous, settings: { ...previous.settings, federalState: event.target.value } }))}>
              {FEDERAL_STATES.map(([code, name]) => <option value={code} key={code}>{name}</option>)}
            </select>
            <button className="icon-btn" title="Einstellungen" onClick={() => setSection('settings')}><Icon name="settings" /></button>
          </div>
        </header>
        {sectionContent}
        <div className={`footer-note sync-${storageInfo.syncState}`}>{storageInfo.label} · {storageInfo.syncMessage || 'Bereit'}{storageInfo.user ? ` · ${storageInfo.user.email}` : ''}</div>
      </main>

      <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        void importData(file)
          .then((imported) => { setData(imported); window.alert('Backup wurde erfolgreich importiert.'); })
          .catch((error: unknown) => window.alert(error instanceof Error ? error.message : 'Import fehlgeschlagen.'))
          .finally(() => { event.target.value = ''; });
      }} />
    </div>
  );
}

interface DayEditorProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  date: string;
  summary: ReturnType<typeof buildDaySummary>;
  updateNote: (date: string, note: string) => void;
  deleteEvent: (id: string) => void;
}

interface ManualBreak {
  id: string;
  start: string;
  end: string;
}

function timestampFor(date: string, time: string, offsetMilliseconds = 0): string {
  return new Date(new Date(`${date}T${time}:00`).getTime() + offsetMilliseconds).toISOString();
}

function DayEditor({ data, setData, date, summary, updateNote, deleteEvent }: DayEditorProps) {
  const dayEvents = eventsForDate(data.events, date);
  const eventSignature = dayEvents.map((event) => `${event.type}:${event.timestamp}`).join('|');
  const plan = activeWorkPlan(data.workPlans, date);
  const planSignature = plan ? `${plan.id}:${plan.validFrom}:${plan.validTo ?? ''}:${JSON.stringify(plan.hoursByWeekday)}` : 'none';
  const vacation = vacationForDate(data.absences, date);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [breaks, setBreaks] = useState<ManualBreak[]>([]);

  useEffect(() => {
    const windows = timeWindowsForDate(data.events, date);
    if (windows.start) {
      setStart(timeLabel(windows.start));
      setEnd(windows.end ? timeLabel(windows.end) : '');
      setBreaks(windows.breaks.map((entry) => ({ id: crypto.randomUUID(), start: timeLabel(entry.start), end: timeLabel(entry.end) })));
    } else if (plan) {
      const target = targetMinutesForDate(data.workPlans, date);
      const startMinutes = 8 * 60;
      const estimatedEnd = startMinutes + target + (target >= 6 * 60 ? 30 : 0);
      setStart('08:00');
      setEnd(`${String(Math.floor(estimatedEnd / 60)).padStart(2, '0')}:${String(estimatedEnd % 60).padStart(2, '0')}`);
      setBreaks([]);
    } else {
      setStart('');
      setEnd('');
      setBreaks([]);
    }
  }, [date, eventSignature, planSignature]);

  const breakMinutes = breaks.reduce((total, entry) => {
    if (!entry.start || !entry.end) return total;
    const startDate = new Date(`${date}T${entry.start}:00`);
    const endDate = new Date(`${date}T${entry.end}:00`);
    return total + Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  }, 0);

  function saveManualTime(): void {
    if (vacation) {
      window.alert('Für diesen Tag ist Urlaub eingetragen. Entferne zuerst den Urlaubseintrag, bevor du Arbeitszeit erfasst.');
      return;
    }
    if (!start || !end) {
      window.alert('Bitte Start- und Endzeit eintragen.');
      return;
    }
    const startDate = new Date(`${date}T${start}:00`);
    const endDate = new Date(`${date}T${end}:00`);
    const totalMinutes = (endDate.getTime() - startDate.getTime()) / 60000;
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
      window.alert('Die Endzeit muss nach der Startzeit liegen.');
      return;
    }

    const normalizedBreaks = breaks
      .filter((entry) => entry.start || entry.end)
      .map((entry) => ({ ...entry, startDate: new Date(`${date}T${entry.start}:00`), endDate: new Date(`${date}T${entry.end}:00`) }))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    for (const [index, entry] of normalizedBreaks.entries()) {
      if (!entry.start || !entry.end || entry.endDate <= entry.startDate) {
        window.alert(`Bitte die Zeiten für Pause ${index + 1} prüfen.`);
        return;
      }
      if (entry.startDate < startDate || entry.endDate > endDate) {
        window.alert(`Pause ${index + 1} muss vollständig innerhalb der Arbeitszeit liegen.`);
        return;
      }
      const previous = normalizedBreaks[index - 1];
      if (previous && previous.endDate > entry.startDate) {
        window.alert('Pausenzeiten dürfen sich nicht überschneiden.');
        return;
      }
    }

    if (dayEvents.length > 0 && !window.confirm('Vorhandene Stempelereignisse dieses Tages durch den manuellen Eintrag ersetzen?')) return;

    let offset = 0;
    const manualEvents: TimeEvent[] = [{ id: crypto.randomUUID(), type: 'CLOCK_IN', timestamp: timestampFor(date, start, offset++), source: 'manual' }];
    for (const entry of normalizedBreaks) {
      manualEvents.push({ id: crypto.randomUUID(), type: 'BREAK_START', timestamp: timestampFor(date, entry.start, offset++), source: 'manual' });
      manualEvents.push({ id: crypto.randomUUID(), type: 'BREAK_END', timestamp: timestampFor(date, entry.end, offset++), source: 'manual' });
    }
    manualEvents.push({ id: crypto.randomUUID(), type: 'CLOCK_OUT', timestamp: timestampFor(date, end, offset), source: 'manual' });

    setData((previous) => ({
      ...previous,
      events: [...previous.events.filter((event) => timestampDate(event.timestamp) !== date), ...manualEvents],
    }));
  }

  return (
    <div className="day-editor">
      <div className="day-editor-head">
        <div>
          <span className="eyebrow">Tagesdetails</span>
          <h3>{formatLongDate(date)}</h3>
          <p>Soll {minutesToHours(summary.targetMinutes)} · Arbeit {minutesToHours(summary.workedMinutes)} · Pause {minutesToHours(summary.breakMinutes)} · Saldo {minutesToHours(summary.balanceMinutes, true)}</p>
        </div>
        <div className="day-badges">
          {!plan && <span className="pill neutral">Kein Arbeitsplan · Soll 0:00</span>}
          {(summary.holiday || summary.absence) && <span className={`pill ${summary.absence?.type ?? ''}`}>{summary.holiday?.name ?? absenceLabel(summary.absence!.type)}</span>}
        </div>
      </div>

      <div className="day-editor-grid">
        <div className="field note-field">
          <label>Bemerkung für diesen Tag</label>
          <textarea value={data.notes[date] ?? ''} onChange={(event) => updateNote(date, event.target.value)} placeholder="Zum Beispiel Homeoffice, Kundentermin oder Hinweis zur Korrektur" />
        </div>

        <div className="manual-time-panel">
          <div className="manual-time-head"><div><strong>Arbeitszeit manuell erfassen</strong><span>Arbeitsbeginn, Arbeitsende und konkrete Pausenzeiten</span></div><span className="break-total">Pause gesamt {minutesToHours(breakMinutes)}</span></div>
          {vacation && <div className="notice warning">An diesem Tag ist Urlaub eingetragen. Manuelle Arbeitszeiten sind gesperrt.</div>}
          <div className="form-row">
            <div className="field"><label>Arbeitsbeginn</label><input type="time" value={start} disabled={Boolean(vacation)} onChange={(event) => setStart(event.target.value)} /></div>
            <div className="field"><label>Arbeitsende</label><input type="time" value={end} disabled={Boolean(vacation)} onChange={(event) => setEnd(event.target.value)} /></div>
          </div>
          <div className="break-editor">
            <div className="break-editor-title"><strong>Pausenzeiten</strong><button className="small-btn secondary compact" disabled={Boolean(vacation)} onClick={() => setBreaks((previous) => [...previous, { id: crypto.randomUUID(), start: '', end: '' }])}><Icon name="plus" size={16} />Pause hinzufügen</button></div>
            {breaks.length === 0 ? <div className="empty-inline">Keine Pause eingetragen.</div> : breaks.map((entry, index) => (
              <div className="break-row" key={entry.id}>
                <span className="break-index">{index + 1}</span>
                <div className="field"><label>Von</label><input type="time" value={entry.start} disabled={Boolean(vacation)} onChange={(event) => setBreaks((previous) => previous.map((item) => item.id === entry.id ? { ...item, start: event.target.value } : item))} /></div>
                <div className="field"><label>Bis</label><input type="time" value={entry.end} disabled={Boolean(vacation)} onChange={(event) => setBreaks((previous) => previous.map((item) => item.id === entry.id ? { ...item, end: event.target.value } : item))} /></div>
                <button className="icon-btn danger-ghost" title="Pause entfernen" disabled={Boolean(vacation)} onClick={() => setBreaks((previous) => previous.filter((item) => item.id !== entry.id))}><Icon name="trash" size={17} /></button>
              </div>
            ))}
          </div>
          <button className="small-btn primary full" disabled={Boolean(vacation)} onClick={saveManualTime}><Icon name="check" size={17} />Manuelle Zeiten speichern</button>
          <div className="form-hint">Der Eintrag ersetzt vorhandene Stempelereignisse dieses Tages. Ohne Arbeitsplan bleibt das Tagessoll bei 0:00 Stunden.</div>
        </div>
      </div>

      {dayEvents.length > 0 && (
        <div className="event-list">
          <div className="event-list-title">Gespeicherte Zeitereignisse</div>
          {dayEvents.map((event) => (
            <div className="event-item" key={event.id}>
              <span className={`event-dot event-${event.type.toLowerCase()}`} />
              <span><strong>{timeLabel(event.timestamp)}</strong><small>{EVENT_LABELS[event.type]}{event.source === 'manual' ? ' · manuell' : ''}</small></span>
              <button className="icon-btn danger-ghost" title="Ereignis löschen" onClick={() => deleteEvent(event.id)}><Icon name="trash" size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ChildPageProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

interface VacationStatus {
  year: number;
  annual: number;
  used: number;
  remaining: number;
}

function VacationStatusCard({ year, annual, used, remaining, progress }: VacationStatus & { progress: number }) {
  return (
    <div className="card side-card vacation-card">
      <div className="side-card-title"><div><span className="eyebrow">Urlaubsstand</span><h3>Urlaub {year}</h3></div><Icon name="absence" /></div>
      <div className="hero-number vacation-number"><strong>{remaining}</strong><span>Tage verfügbar</span></div>
      <div className="progress vacation-progress"><div style={{ width: `${progress}%` }} /></div>
      <div className="vacation-stats"><div><span>Anspruch</span><strong>{annual}</strong></div><div><span>Gebucht</span><strong>{used}</strong></div><div><span>Rest</span><strong>{remaining}</strong></div></div>
    </div>
  );
}

interface QuickAbsenceFormProps extends ChildPageProps {
  selection?: AbsenceSelection;
  vacationStatus?: VacationStatus;
}

function QuickAbsenceForm({ data, setData, selection, vacationStatus }: QuickAbsenceFormProps) {
  const [type, setType] = useState<AbsenceType>('vacation');
  const [from, setFrom] = useState(selection?.from ?? localDateString());
  const [to, setTo] = useState(selection?.to ?? localDateString());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!selection) return;
    setFrom(selection.from);
    setTo(selection.to);
  }, [selection?.version]);

  function save(): void {
    if (!from || !to) {
      window.alert('Bitte Von- und Bis-Datum eintragen. Ein zweiter Klick im Kalender setzt automatisch das Bis-Datum.');
      return;
    }
    if (from > to) {
      window.alert('Das Bis-Datum muss am oder nach dem Von-Datum liegen.');
      return;
    }
    const overlap = data.absences.some((absence) => rangesOverlap(from, to, absence.from, absence.to));
    if (overlap) {
      window.alert('Für mindestens einen Tag existiert bereits eine Abwesenheit.');
      return;
    }
    if (type === 'vacation' && hasEventsInRange(data.events, from, to)) {
      const affectedDates = [...new Set(data.events.map((event) => timestampDate(event.timestamp)).filter((date) => date >= from && date <= to))];
      window.alert(`Urlaub kann nicht eingetragen werden, weil bereits Arbeitszeiten vorhanden sind: ${affectedDates.slice(0, 4).map((date) => formatDate(date)).join(', ')}${affectedDates.length > 4 ? ' …' : ''}`);
      return;
    }
    setData((previous) => ({
      ...previous,
      absences: [...previous.absences, { id: crypto.randomUUID(), type, from, to, note, createdAt: new Date().toISOString() }],
    }));
    setNote('');
  }

  return (
    <div className="card side-card absence-form-card">
      <div className="side-card-title"><div><span className="eyebrow">Schneller Eintrag</span><h3>Abwesenheit</h3></div><Icon name="absence" /></div>
      {vacationStatus && type === 'vacation' && <div className="vacation-inline"><strong>{vacationStatus.remaining} Tage Resturlaub</strong><span>{vacationStatus.used} von {vacationStatus.annual} Tagen gebucht</span></div>}
      <div className="quickform">
        <div className="field"><label>Typ</label><select value={type} onChange={(event) => setType(event.target.value as AbsenceType)}><option value="vacation">Urlaub</option><option value="sick">Krankheit</option><option value="overtime">Überstundenabbau</option></select></div>
        <div className="form-row"><div className="field"><label>Von</label><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div className="field"><label>Bis</label><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div></div>
        {selection && <div className="form-hint calendar-selection-hint">Kalender: Der nächste Klick setzt <strong>{selection.next === 'from' ? 'Von' : 'Bis'}</strong>.</div>}
        <div className="field"><label>Bemerkung</label><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" /></div>
        <button className="small-btn primary full" onClick={save}><Icon name="plus" size={17} />Eintragen</button>
      </div>
    </div>
  );
}

function emptyHours(): WorkPlanDayHours {
  return { 0: 0, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0 };
}

function WorkPlansPage({ data, setData }: ChildPageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('Neuer Arbeitsplan');
  const [validFrom, setValidFrom] = useState(localDateString());
  const [validTo, setValidTo] = useState('');
  const [hours, setHours] = useState<WorkPlanDayHours>(emptyHours());
  const draftWeekly = Object.values(hours).reduce((sum, value) => sum + value, 0);

  function resetForm(): void {
    setEditingId(null);
    setName('Neuer Arbeitsplan');
    setValidFrom(localDateString());
    setValidTo('');
    setHours(emptyHours());
  }

  function edit(plan: WorkPlan): void {
    setEditingId(plan.id);
    setName(plan.name);
    setValidFrom(plan.validFrom);
    setValidTo(plan.validTo ?? '');
    setHours({ ...plan.hoursByWeekday });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function save(): void {
    if (!name.trim() || !validFrom || (validTo && validFrom > validTo)) {
      window.alert('Bitte Name und Gültigkeitszeitraum prüfen.');
      return;
    }
    const overlaps = data.workPlans.filter((plan) => plan.id !== editingId && rangesOverlap(validFrom, validTo || null, plan.validFrom, plan.validTo));
    if (overlaps.length > 0) {
      window.alert(`Der Zeitraum überschneidet sich mit „${overlaps[0].name}“. Arbeitspläne dürfen sich nicht überschneiden.`);
      return;
    }
    const plan: WorkPlan = {
      id: editingId ?? crypto.randomUUID(),
      name: name.trim(),
      validFrom,
      validTo: validTo || null,
      hoursByWeekday: { ...hours },
    };
    setData((previous) => ({
      ...previous,
      workPlans: editingId
        ? previous.workPlans.map((entry) => entry.id === editingId ? plan : entry).sort((a, b) => a.validFrom.localeCompare(b.validFrom))
        : [...previous.workPlans, plan].sort((a, b) => a.validFrom.localeCompare(b.validFrom)),
    }));
    resetForm();
  }

  function remove(plan: WorkPlan): void {
    if (!window.confirm(`Arbeitsplan „${plan.name}“ wirklich löschen? Für Zeiträume ohne Plan wird das Tagessoll auf 0:00 Stunden gesetzt.`)) return;
    setData((previous) => ({ ...previous, workPlans: previous.workPlans.filter((item) => item.id !== plan.id) }));
    if (editingId === plan.id) resetForm();
  }

  return (
    <section className="section-page">
      <div className="page-grid workplan-layout">
        <div className="card card-pad modern-card form-card-sticky">
          <div className="card-head"><div><span className="eyebrow">{editingId ? 'Bestehenden Plan bearbeiten' : 'Neuer Zeitraum'}</span><h2>{editingId ? 'Arbeitsplan bearbeiten' : 'Arbeitsplan anlegen'}</h2><p>Die Sollzeit pro Wochentag ist die Basis für Saldo, Feiertage und Abwesenheiten.</p></div></div>
          <div className="form-grid">
            <div className="field"><label>Name</label><input value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="form-row"><div className="field"><label>Gültig von</label><input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></div><div className="field"><label>Gültig bis, optional</label><input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} /></div></div>
            <div className="weekday-editor">
              {WEEKDAYS.map(({ key, label, long }) => (
                <label className="weekday-input" key={key}><span><strong>{label}</strong><small>{long}</small></span><div><input type="number" min="0" max="24" step="0.25" value={hours[key]} onChange={(event) => setHours((previous) => ({ ...previous, [key]: Math.max(0, Number(event.target.value)) }))} /><em>Std.</em></div></label>
              ))}
            </div>
            <div className="plan-total"><span>Wöchentliche Sollzeit</span><strong>{draftWeekly.toLocaleString('de-DE')} Stunden</strong></div>
            <div className="split-actions"><button className="small-btn primary" onClick={save}><Icon name={editingId ? 'check' : 'plus'} size={17} />{editingId ? 'Änderungen speichern' : 'Arbeitsplan speichern'}</button>{editingId && <button className="small-btn secondary" onClick={resetForm}>Abbrechen</button>}</div>
          </div>
        </div>

        <div className="card card-pad modern-card">
          <div className="card-head"><div><span className="eyebrow">Historie und zukünftige Pläne</span><h2>Hinterlegte Arbeitspläne</h2><p>Alle Pläne können jederzeit bearbeitet oder gelöscht werden. Ohne gültigen Plan beträgt das Tagessoll 0:00 Stunden.</p></div><span className="count-badge">{data.workPlans.length}</span></div>
          {data.workPlans.length === 0 ? (
            <div className="empty-state rich-empty"><Icon name="plan" size={34} /><strong>Noch kein Arbeitsplan vorhanden</strong><span>Die Zeiterfassung kann erst gestartet werden, sobald für den heutigen Tag ein Arbeitsplan gilt.</span></div>
          ) : (
            <div className="plan-list">
              {data.workPlans.map((plan) => (
                <article className="plan-item" key={plan.id}>
                  <div className="plan-item-head"><div><strong>{plan.name}</strong><span>{formatDate(plan.validFrom)} – {plan.validTo ? formatDate(plan.validTo) : 'unbefristet'}</span></div><div className="plan-actions"><button className="icon-btn" title="Arbeitsplan bearbeiten" onClick={() => edit(plan)}><Icon name="edit" size={17} /></button><button className="icon-btn danger-ghost" title="Arbeitsplan löschen" onClick={() => remove(plan)}><Icon name="trash" size={17} /></button></div></div>
                  <div className="plan-weekly"><strong>{weeklyHours(plan).toLocaleString('de-DE')} Std.</strong><span>pro Woche</span></div>
                  <div className="plan-days">{WEEKDAYS.map(({ key, label }) => <span key={key}><small>{label}</small><strong>{decimalHoursToLabel(plan.hoursByWeekday[key])}</strong></span>)}</div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface AbsencesPageProps extends ChildPageProps {
  selection: AbsenceSelection;
  year: number;
  holidays: Holiday[];
}

function AbsencesPage({ data, setData, selection, year, holidays }: AbsencesPageProps) {
  const used = vacationDaysUsed(data, holidays, year);
  const remaining = Math.max(0, data.settings.annualLeaveDays - used);
  const progress = data.settings.annualLeaveDays ? Math.min(100, (used / data.settings.annualLeaveDays) * 100) : 0;
  return (
    <section className="section-page">
      <div className="absence-overview-grid">
        <VacationStatusCard year={year} annual={data.settings.annualLeaveDays} used={used} remaining={remaining} progress={progress} />
        <div className="card side-card policy-card"><div className="side-card-title"><div><span className="eyebrow">Automatische Regeln</span><h3>Konfliktschutz</h3></div><Icon name="check" /></div><ul><li>Urlaub ist gesperrt, wenn bereits Arbeitszeiten existieren.</li><li>An Urlaubstagen können keine Arbeitszeiten erfasst werden.</li><li>Überstundenabbau reduziert das Zeitkonto um das gültige Tagessoll.</li></ul></div>
        <QuickAbsenceForm data={data} setData={setData} selection={selection} vacationStatus={{ year, annual: data.settings.annualLeaveDays, used, remaining }} />
      </div>
      <div className="card card-pad modern-card">
        <div className="card-head"><div><span className="eyebrow">Abwesenheitshistorie</span><h2>Gespeicherte Abwesenheiten</h2><p>Ganztägige Einträge mit automatischer Sollzeitberechnung.</p></div><span className="count-badge">{data.absences.length}</span></div>
        {data.absences.length === 0 ? <div className="empty-state rich-empty"><Icon name="absence" size={34} /><strong>Noch keine Abwesenheiten</strong><span>Urlaub, Krankheit oder Überstundenabbau können oben eingetragen werden.</span></div> : (
          <div className="table-wrap"><table><thead><tr><th>Typ</th><th>Zeitraum</th><th>Tage</th><th>Bemerkung</th><th /></tr></thead><tbody>{[...data.absences].sort((a, b) => b.from.localeCompare(a.from)).map((absence) => (
            <tr key={absence.id}><td><span className={`pill ${absence.type}`}>{absenceLabel(absence.type)}</span></td><td><strong>{formatDate(absence.from)}</strong><span className="table-sub">bis {formatDate(absence.to)}</span></td><td>{enumerateDates(absence.from, absence.to).length}</td><td>{absence.note || '–'}</td><td><button className="icon-btn danger-ghost" title="Abwesenheit löschen" onClick={() => { if (window.confirm('Abwesenheit löschen?')) setData((previous) => ({ ...previous, absences: previous.absences.filter((item) => item.id !== absence.id) })); }}><Icon name="trash" size={17} /></button></td></tr>
          ))}</tbody></table></div>
        )}
      </div>
    </section>
  );
}

interface SettingsPageProps extends ChildPageProps {
  holidayStatus: string;
  onExport: () => void;
  onImportClick: () => void;
  onReset: () => void;
  storageInfo: StorageInfo;
  onChangeMode: () => void;
  onLogout?: () => Promise<void>;
}

function SettingsPage({ data, setData, holidayStatus, onExport, onImportClick, onReset, storageInfo, onChangeMode, onLogout }: SettingsPageProps) {
  const [draft, setDraft] = useState<Settings>(data.settings);
  useEffect(() => setDraft(data.settings), [data.settings]);

  function save(): void {
    setData((previous) => ({
      ...previous,
      settings: { ...draft, annualLeaveDays: Math.max(0, Math.round(Number(draft.annualLeaveDays))) },
      holidayCache: draft.federalState === previous.settings.federalState ? previous.holidayCache : {},
    }));
    window.alert('Einstellungen wurden gespeichert.');
  }

  const source = data.holidayCache[`${new Date().getFullYear()}:${data.settings.federalState}`]?.source;

  return (
    <section className="section-page">
      <div className="page-grid settings-layout">
        <div className="card card-pad modern-card">
          <div className="card-head"><div><span className="eyebrow">Profil und Regeln</span><h2>Allgemeine Einstellungen</h2><p>Diese Angaben steuern Anzeige, Urlaub und Feiertagsberechnung.</p></div><Icon name="user" /></div>
          <div className="form-grid">
            <div className="field"><label>Name</label><input value={draft.employeeName} onChange={(event) => setDraft((previous) => ({ ...previous, employeeName: event.target.value }))} /></div>
            <div className="field"><label>Bundesland</label><select value={draft.federalState} onChange={(event) => setDraft((previous) => ({ ...previous, federalState: event.target.value }))}>{FEDERAL_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></div>
            <div className="field"><label>Jahresurlaub in Tagen</label><input type="number" min="0" step="1" value={draft.annualLeaveDays} onChange={(event) => setDraft((previous) => ({ ...previous, annualLeaveDays: Number(event.target.value) }))} /></div>
            <div className="field"><label>Feiertagsbewertung</label><select value={draft.holidayCreditMode} onChange={(event) => setDraft((previous) => ({ ...previous, holidayCreditMode: event.target.value as Settings['holidayCreditMode'] }))}><option value="schedule">Tagessoll des Arbeitsplans</option><option value="fixed8">Feste 8 Stunden, sofern Arbeitstag</option></select></div>
            <button className="small-btn primary" onClick={save}><Icon name="check" size={17} />Einstellungen speichern</button>
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad modern-card"><div className="card-head"><div><span className="eyebrow">Kalenderdaten</span><h2>Feiertagsdienst</h2><p>OpenHolidays API wird nach Jahr und Bundesland abgefragt und lokal zwischengespeichert.</p></div><Icon name="calendar" /></div><div className={`notice ${source === 'fallback' ? 'warning' : 'info'}`}>{holidayStatus}</div><div className="mini-list"><div className="row"><span>Bundesland</span><strong>{stateName(data.settings.federalState)}</strong></div><div className="row"><span>Datenquelle</span><strong>{source === 'api' ? 'OpenHolidays API' : source === 'fallback' ? 'Bundesweiter Offline-Fallback' : 'noch nicht geladen'}</strong></div></div></div>
          <div className="card card-pad modern-card"><div className="card-head"><div><span className="eyebrow">Betriebsmodus</span><h2>Speicher und Konto</h2><p>Browser- und Servermodus besitzen denselben Funktionsumfang.</p></div><Icon name={storageInfo.mode === 'server' ? 'database' : 'browser'} /></div><div className={`notice ${storageInfo.syncState === 'error' ? 'warning' : 'info'}`}>{storageInfo.syncMessage || 'Bereit'}</div><div className="mini-list"><div className="row"><span>Speichermodus</span><strong>{storageInfo.label}</strong></div>{storageInfo.user && <div className="row"><span>Benutzerkonto</span><strong>{storageInfo.user.email}</strong></div>}{storageInfo.serverUrl && <div className="row"><span>Server</span><strong className="breakable">{storageInfo.serverUrl}</strong></div>}</div><div className="split-actions"><button className="small-btn secondary" onClick={onChangeMode}>Speichermodus wechseln</button>{onLogout && <button className="small-btn secondary" onClick={() => void onLogout()}>Abmelden</button>}</div></div>
          <div className="card card-pad modern-card"><div className="card-head"><div><span className="eyebrow">Portabilität</span><h2>Datensicherung</h2><p>JSON-Backups können zwischen Browser- und Serverbetrieb übertragen werden.</p></div><Icon name="download" /></div><div className="split-actions"><button className="small-btn primary" onClick={onExport}>JSON-Backup exportieren</button><button className="small-btn secondary" onClick={onImportClick}>Backup importieren</button><button className="small-btn danger" onClick={onReset}>Alle Daten zurücksetzen</button></div></div>
        </div>
      </div>
    </section>
  );
}
