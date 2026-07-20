import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AbsenceType, AppData, AppSection, Settings, TimeEvent, TimeEventType, WorkPlanDayHours } from './types';
import {
  addDays,
  addMonths,
  calendarCells,
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
  nextEligibleOvertimeDates,
  summariesForRange,
  targetMinutesForDate,
  vacationDaysUsed,
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
  absences: { title: 'Abwesenheiten', subtitle: 'Urlaub, Krankheit und Überstundenausgleich' },
  settings: { title: 'Einstellungen', subtitle: 'Person, Feiertage, Urlaub und Datensicherung' },
};

const WEEKDAYS: Array<{ key: keyof WorkPlanDayHours; label: string }> = [
  { key: 1, label: 'Mo' },
  { key: 2, label: 'Di' },
  { key: 3, label: 'Mi' },
  { key: 4, label: 'Do' },
  { key: 5, label: 'Fr' },
  { key: 6, label: 'Sa' },
  { key: 0, label: 'So' },
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

export default function TimePilotApp({ data, setData, storageInfo, onChangeMode, onLogout, onReset }: TimePilotAppProps) {
  const [section, setSection] = useState<AppSection>('overview');
  const [now, setNow] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [selectedDate, setSelectedDate] = useState(() => localDateString());
  const [holidayStatus, setHolidayStatus] = useState('Feiertage werden geprüft …');
  const [suggestedDate, setSuggestedDate] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);


  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleYear = visibleMonth.getFullYear();
  const currentYear = now.getFullYear();

  useEffect(() => {
    let cancelled = false;
    const years = [...new Set([visibleYear, currentYear])];
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
              [key]: {
                key,
                loadedAt: new Date().toISOString(),
                holidays: result.holidays,
                source: result.source,
              },
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

    return () => {
      cancelled = true;
    };
  }, [currentYear, data.settings.federalState, visibleYear]);

  const holidaysForYear = (year: number) =>
    data.holidayCache[`${year}:${data.settings.federalState}`]?.holidays ?? [];
  const visibleHolidays = holidaysForYear(visibleYear);
  const currentHolidays = holidaysForYear(currentYear);
  const today = localDateString(now);
  const todayTotals = useMemo(() => calculateTimeTotals(data.events, today, now), [data.events, now, today]);
  const todaySummary = useMemo(
    () => buildDaySummary(data, today, currentHolidays, now),
    [currentHolidays, data, now, today],
  );
  const todayTarget = targetMinutesForDate(data.workPlans, today);
  const activePlan = activeWorkPlan(data.workPlans, today);

  const currentYearSummaries = useMemo(
    () => summariesForRange(data, `${currentYear}-01-01`, today, currentHolidays, now),
    [currentHolidays, currentYear, data, now, today],
  );
  const yearTotals = useMemo(() => aggregateSummaries(currentYearSummaries), [currentYearSummaries]);

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
  const suggestions = nextEligibleOvertimeDates(data, currentHolidays);

  useEffect(() => {
    if (!suggestedDate || !suggestions.includes(suggestedDate)) setSuggestedDate(suggestions[0] ?? '');
  }, [suggestedDate, suggestions]);

  const statusClass = todayTotals.state === 'working' ? 'work' : todayTotals.state === 'paused' ? 'pause' : todayTotals.state;
  const statusText =
    todayTotals.state === 'working'
      ? `Arbeitszeit läuft seit ${timeLabel(todayTotals.openSince)}`
      : todayTotals.state === 'paused'
        ? `Pause läuft seit ${timeLabel(todayTotals.openSince)}`
        : todayTotals.state === 'done'
          ? `Zuletzt ausgestempelt um ${timeLabel(todayTotals.lastClockOut)}`
          : 'Noch nicht eingestempelt';
  const remainingMinutes = Math.max(0, todayTarget - todaySummary.workedMinutes);
  const predictedEnd =
    todayTotals.state === 'working' || todayTotals.state === 'paused'
      ? new Date(now.getTime() + remainingMinutes * 60000)
      : undefined;

  function addTimerEvent(type: TimeEventType): void {
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
        additions.push({ id: crypto.randomUUID(), type: 'BREAK_END' as const, timestamp: stamp.toISOString(), source: 'timer' as const });
      }
      additions.push({
        id: crypto.randomUUID(),
        type: 'CLOCK_OUT' as const,
        timestamp: new Date(stamp.getTime() + additions.length).toISOString(),
        source: 'timer' as const,
      });
      return { ...previous, events: [...previous.events, ...additions] };
    });
  }

  function addOvertimeDay(): void {
    if (!suggestedDate) return;
    const target = targetMinutesForDate(data.workPlans, suggestedDate);
    if (yearTotals.balanceMinutes < target) {
      window.alert('Das aktuelle Überstundenguthaben reicht für diesen Tag nicht aus.');
      return;
    }
    if (!window.confirm(`${formatDate(suggestedDate)} als Überstundenausgleich eintragen?`)) return;
    setData((previous) => ({
      ...previous,
      absences: [
        ...previous.absences,
        {
          id: crypto.randomUUID(),
          type: 'overtime',
          from: suggestedDate,
          to: suggestedDate,
          note: 'Vom System auf Überstundenbasis vorgeschlagen und bestätigt',
          createdAt: new Date().toISOString(),
        },
      ],
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
    const canSuggest = suggestedDate && yearTotals.balanceMinutes >= targetMinutesForDate(data.workPlans, suggestedDate);

    return (
      <section className="layout">
        <div className="stack">
          <div className="card clock-card">
            <div className="card-head">
              <div>
                <h2>Heutige Zeiterfassung</h2>
                <p>Arbeitszeit ohne Pausen</p>
              </div>
              <div className={`status ${statusClass}`}><span className="dot" /><span>{statusText}</span></div>
            </div>
            <div className="timer">
              {secondsToClock(Math.floor(todayTotals.workedMilliseconds / 1000))}
              <small>von {minutesToHours(todayTarget)} Std.</small>
            </div>
            <div className="buttons">
              <button className="action primary" disabled={todayTotals.state === 'working' || todayTotals.state === 'paused'} onClick={() => addTimerEvent('CLOCK_IN')}>Einstempeln</button>
              <button className="action warning" disabled={todayTotals.state !== 'working'} onClick={() => addTimerEvent('BREAK_START')}>Pause Anfang</button>
              <button className="action success" disabled={todayTotals.state !== 'paused'} onClick={() => addTimerEvent('BREAK_END')}>Pause Ende</button>
              <button className="action danger" disabled={todayTotals.state === 'idle' || todayTotals.state === 'done'} onClick={clockOut}>Ausstempeln</button>
            </div>
            <div className="summary-grid">
              <div className="metric"><span>Beginn</span><strong>{timeLabel(todayTotals.firstClockIn)}</strong></div>
              <div className="metric"><span>Pause</span><strong>{minutesToHours(todaySummary.breakMinutes)}</strong></div>
              <div className="metric"><span>Vorauss. Ende</span><strong>{predictedEnd ? timeLabel(predictedEnd.toISOString()) : '–'}</strong></div>
              <div className="metric"><span>Heute</span><strong>{minutesToHours(todaySummary.balanceMinutes, true)}</strong></div>
            </div>
          </div>

          <div className="card calendar-card">
            <div className="calendar-toolbar">
              <div className="month-nav">
                <button className="navbtn" onClick={() => setVisibleMonth((month) => addMonths(month, -1))}>‹</button>
                <h2>{monthLabel(visibleMonth)}</h2>
                <button className="navbtn" onClick={() => setVisibleMonth((month) => addMonths(month, 1))}>›</button>
              </div>
              <button className="small-btn" onClick={() => { setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12)); setSelectedDate(today); }}>Heute</button>
            </div>
            <div className="calendar">
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => <div className="dow" key={day}>{day}</div>)}
              {cells.map((date, index) => {
                if (!date) return <div className="day empty" key={`empty-${index}`} />;
                const day = visibleSummaries.find((entry) => entry.date === date)!;
                const weekend = index % 7 >= 5;
                const future = date > today;
                const classes = ['day', weekend ? 'weekend' : '', day.holiday ? 'holiday' : '', date === today ? 'today' : '', date === selectedDate ? 'selected' : '', future ? 'future' : ''].filter(Boolean).join(' ');
                const primary = day.holiday?.name ?? (day.absence ? absenceLabel(day.absence.type) : day.workedMinutes > 0 ? `${minutesToHours(day.workedMinutes)} Std.` : '');
                const secondary = day.status === 'working' ? 'läuft gerade' : day.status === 'paused' ? 'Pause läuft' : day.note ? day.note : !future && day.targetMinutes > 0 ? minutesToHours(day.balanceMinutes, true) : '';
                return (
                  <button className={classes} key={date} onClick={() => setSelectedDate(date)}>
                    <span className="num">{parseLocalDate(date).getDate()}</span>
                    {(primary || secondary) && <span className="entry"><strong>{primary}</strong><span>{secondary}</span></span>}
                  </button>
                );
              })}
            </div>
            <div className="legend">
              <span><i />Arbeitstag</span><span><i className="l-weekend" />Wochenende</span><span><i className="l-holiday" />Feiertag</span>
              <span>{holidayStatus}</span>
            </div>
            <DayEditor
              data={data}
              setData={setData}
              date={selectedDate}
              summary={selectedSummary}
              updateNote={updateNote}
              deleteEvent={deleteEvent}
            />
          </div>
        </div>

        <aside className="stack">
          <div className="card side-card">
            <h3>Zeitkonto {currentYear}</h3>
            <div className="balance">
              <div><strong>{minutesToHours(yearTotals.balanceMinutes, true)}</strong><span>{yearTotals.balanceMinutes >= 0 ? 'Überstunden' : 'Minusstunden'}</span></div>
              <span>Monatssoll {minutesToHours(monthTotals.targetMinutes)}</span>
            </div>
            <div className="progress"><div style={{ width: `${monthProgress}%` }} /></div>
            <div className="mini-list">
              <div className="row"><span>Arbeit im Monat</span><strong>{minutesToHours(monthTotals.workedMinutes)} Std.</strong></div>
              <div className="row"><span>Gutschriften</span><strong>{minutesToHours(monthTotals.creditedMinutes)} Std.</strong></div>
              <div className="row"><span>Pausen</span><strong>{minutesToHours(monthTotals.breakMinutes)} Std.</strong></div>
            </div>
            {suggestedDate && (
              <div className="suggestion">
                <span className="tag">Vorschlag</span>
                <h4>{canSuggest ? 'Ein Ausgleichstag ist möglich' : 'Noch kein voller Ausgleichstag'}</h4>
                <p>Der Eintrag wird erst nach deiner ausdrücklichen Bestätigung gespeichert.</p>
                <div className="suggestion-actions">
                  <select className="select" value={suggestedDate} onChange={(event) => setSuggestedDate(event.target.value)}>
                    {suggestions.map((date) => <option value={date} key={date}>{formatDate(date, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</option>)}
                  </select>
                  <button className="small-btn primary" disabled={!canSuggest} onClick={addOvertimeDay}>Bestätigen</button>
                </div>
              </div>
            )}
          </div>

          <div className="card side-card">
            <h3>Urlaub {currentYear}</h3>
            <div className="balance"><div><strong style={{ color: 'var(--primary)' }}>{remainingVacation}</strong><span>Tage verfügbar</span></div><span>{data.settings.annualLeaveDays} Tage/Jahr</span></div>
            <div className="progress"><div style={{ width: `${vacationProgress}%` }} /></div>
            <div className="mini-list">
              <div className="row"><span>Genommen/geplant</span><strong>{usedVacation} Tage</strong></div>
              <div className="row"><span>Rest</span><strong>{remainingVacation} Tage</strong></div>
            </div>
          </div>

          <QuickAbsenceForm data={data} setData={setData} />

          <div className="card side-card">
            <div className="export">
              <div><b>Monatsbericht {monthLabel(visibleMonth)}</b><span>Kalender, Zeiten, Pausen, Gutschriften und Saldo</span></div>
              <button className="pdf-btn" onClick={() => exportMonthlyPdf(data, visibleMonth, visibleHolidays, now)}>PDF exportieren</button>
            </div>
          </div>
        </aside>
      </section>
    );
  }

  function renderWorkPlans() {
    return <WorkPlansPage data={data} setData={setData} />;
  }

  function renderAbsences() {
    return <AbsencesPage data={data} setData={setData} />;
  }

  function renderSettings() {
    return (
      <SettingsPage
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
      />
    );
  }

  const sectionContent = section === 'overview' ? renderOverview() : section === 'workplans' ? renderWorkPlans() : section === 'absences' ? renderAbsences() : renderSettings();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><div className="brandmark">◷</div><span>TimePilot</span></div>
        <nav className="nav">
          <button className={section === 'overview' ? 'active' : ''} onClick={() => setSection('overview')}><span className="icon">▦</span><span>Übersicht</span></button>
          <button className={section === 'workplans' ? 'active' : ''} onClick={() => setSection('workplans')}><span className="icon">⌁</span><span>Arbeitspläne</span></button>
          <button className={section === 'absences' ? 'active' : ''} onClick={() => setSection('absences')}><span className="icon">☂</span><span>Abwesenheiten</span></button>
          <button className={section === 'settings' ? 'active' : ''} onClick={() => setSection('settings')}><span className="icon">⚙</span><span>Einstellungen</span></button>
        </nav>
        <div className="sidebar-foot"><strong>Standort</strong>{stateName(data.settings.federalState)} · Deutschland</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{section === 'overview' ? `Guten Tag, ${data.settings.employeeName}` : SECTION_META[section].title}</h1>
            <p>{section === 'overview' ? `${formatLongDate(today)} · Arbeitsplan: ${activePlan ? `${weeklyHours(activePlan).toLocaleString('de-DE')} Std./Woche` : 'nicht hinterlegt'}` : SECTION_META[section].subtitle}</p>
          </div>
          <div className="top-actions">
            <select
              className="select"
              aria-label="Bundesland"
              value={data.settings.federalState}
              onChange={(event) => setData((previous) => ({ ...previous, settings: { ...previous.settings, federalState: event.target.value } }))}
            >
              {FEDERAL_STATES.map(([code, name]) => <option value={code} key={code}>{name}</option>)}
            </select>
            <button className="icon-btn" title="Einstellungen" onClick={() => setSection('settings')}>⚙</button>
          </div>
        </header>
        {sectionContent}
        <div className={`footer-note sync-${storageInfo.syncState}`}>{storageInfo.label} · {storageInfo.syncMessage || 'Bereit'}{storageInfo.user ? ` · ${storageInfo.user.email}` : ''}</div>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void importData(file)
            .then((imported) => {
              setData(imported);
              window.alert('Backup wurde erfolgreich importiert.');
            })
            .catch((error: unknown) => window.alert(error instanceof Error ? error.message : 'Import fehlgeschlagen.'))
            .finally(() => { event.target.value = ''; });
        }}
      />
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

function DayEditor({ data, setData, date, summary, updateNote, deleteEvent }: DayEditorProps) {
  const dayEvents = eventsForDate(data.events, date);
  const totals = calculateTimeTotals(data.events, date, new Date());
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('16:30');
  const [pauseMinutes, setPauseMinutes] = useState(30);

  useEffect(() => {
    setStart(totals.firstClockIn ? timeLabel(totals.firstClockIn) : '08:00');
    setEnd(totals.lastClockOut ? timeLabel(totals.lastClockOut) : '16:30');
    setPauseMinutes(Math.round(totals.breakMilliseconds / 60000) || 30);
  }, [date, totals.breakMilliseconds, totals.firstClockIn, totals.lastClockOut]);

  function saveManualTime(): void {
    const startDate = new Date(`${date}T${start}:00`);
    const endDate = new Date(`${date}T${end}:00`);
    const totalMinutes = (endDate.getTime() - startDate.getTime()) / 60000;
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
      window.alert('Die Endzeit muss nach der Startzeit liegen.');
      return;
    }
    if (pauseMinutes < 0 || pauseMinutes >= totalMinutes) {
      window.alert('Die Pause muss kleiner als die gesamte Anwesenheitszeit sein.');
      return;
    }
    if (dayEvents.length > 0 && !window.confirm('Vorhandene Stempelereignisse dieses Tages durch den manuellen Eintrag ersetzen?')) return;

    const manualEvents: TimeEvent[] = [
      { id: crypto.randomUUID(), type: 'CLOCK_IN', timestamp: startDate.toISOString(), source: 'manual' },
    ];
    if (pauseMinutes > 0) {
      const breakStart = new Date(endDate.getTime() - pauseMinutes * 60000);
      manualEvents.push({ id: crypto.randomUUID(), type: 'BREAK_START', timestamp: breakStart.toISOString(), source: 'manual' });
      manualEvents.push({ id: crypto.randomUUID(), type: 'BREAK_END', timestamp: endDate.toISOString(), source: 'manual' });
      manualEvents.push({ id: crypto.randomUUID(), type: 'CLOCK_OUT', timestamp: new Date(endDate.getTime() + 1).toISOString(), source: 'manual' });
    } else {
      manualEvents.push({ id: crypto.randomUUID(), type: 'CLOCK_OUT', timestamp: endDate.toISOString(), source: 'manual' });
    }
    setData((previous) => ({
      ...previous,
      events: [...previous.events.filter((event) => timestampDate(event.timestamp) !== date), ...manualEvents],
    }));
  }

  return (
    <div className="day-editor">
      <div className="day-editor-head">
        <div>
          <h3>{formatLongDate(date)}</h3>
          <p>
            Soll {minutesToHours(summary.targetMinutes)} · Arbeit {minutesToHours(summary.workedMinutes)} · Pause {minutesToHours(summary.breakMinutes)} · Saldo {minutesToHours(summary.balanceMinutes, true)}
          </p>
        </div>
        {(summary.holiday || summary.absence) && <span className={`pill ${summary.absence?.type ?? ''}`}>{summary.holiday?.name ?? absenceLabel(summary.absence!.type)}</span>}
      </div>
      <div className="form-row">
        <div className="field">
          <label>Bemerkung für diesen Tag</label>
          <textarea value={data.notes[date] ?? ''} onChange={(event) => updateNote(date, event.target.value)} placeholder="Zum Beispiel Homeoffice, Kundentermin oder Hinweis zur Korrektur" />
        </div>
        <div className="quickform">
          <div className="form-row four">
            <div className="field"><label>Start</label><input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></div>
            <div className="field"><label>Ende</label><input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
            <div className="field"><label>Pause Min.</label><input type="number" min="0" step="5" value={pauseMinutes} onChange={(event) => setPauseMinutes(Number(event.target.value))} /></div>
            <div className="field"><label>&nbsp;</label><button className="small-btn primary" onClick={saveManualTime}>Zeit speichern</button></div>
          </div>
          <div className="notice info">Der manuelle Eintrag ersetzt die Stempelereignisse des ausgewählten Tages. Die Pause wird von der Anwesenheitszeit abgezogen.</div>
        </div>
      </div>
      {dayEvents.length > 0 && (
        <div className="event-list">
          {dayEvents.map((event) => (
            <div className="event-item" key={event.id}>
              <span><strong>{timeLabel(event.timestamp)}</strong> · {EVENT_LABELS[event.type]}{event.source === 'manual' ? ' · manuell' : ''}</span>
              <button className="small-btn danger" onClick={() => deleteEvent(event.id)}>Löschen</button>
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

function QuickAbsenceForm({ data, setData }: ChildPageProps) {
  const [type, setType] = useState<AbsenceType>('vacation');
  const [from, setFrom] = useState(localDateString());
  const [to, setTo] = useState(localDateString());
  const [note, setNote] = useState('');

  function save(): void {
    if (from > to) {
      window.alert('Das Bis-Datum muss am oder nach dem Von-Datum liegen.');
      return;
    }
    const overlap = data.absences.some((absence) => rangesOverlap(from, to, absence.from, absence.to));
    if (overlap) {
      window.alert('Für mindestens einen Tag existiert bereits eine Abwesenheit.');
      return;
    }
    setData((previous) => ({
      ...previous,
      absences: [...previous.absences, { id: crypto.randomUUID(), type, from, to, note, createdAt: new Date().toISOString() }],
    }));
    setNote('');
  }

  return (
    <div className="card side-card">
      <h3>Abwesenheit eintragen</h3>
      <div className="quickform">
        <div className="field"><label>Typ</label><select value={type} onChange={(event) => setType(event.target.value as AbsenceType)}><option value="vacation">Urlaub</option><option value="sick">Krankheit</option><option value="overtime">Überstundenausgleich</option></select></div>
        <div className="form-row"><div className="field"><label>Von</label><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div className="field"><label>Bis</label><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div></div>
        <div className="field"><label>Bemerkung</label><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" /></div>
        <button className="small-btn primary" onClick={save}>Eintragen</button>
      </div>
    </div>
  );
}

function WorkPlansPage({ data, setData }: ChildPageProps) {
  const [name, setName] = useState('Neuer Arbeitsplan');
  const [validFrom, setValidFrom] = useState(localDateString());
  const [validTo, setValidTo] = useState('');
  const [hours, setHours] = useState<WorkPlanDayHours>({ 0: 0, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0 });
  const draftWeekly = Object.values(hours).reduce((sum, value) => sum + value, 0);

  function save(): void {
    if (!name.trim() || (validTo && validFrom > validTo)) {
      window.alert('Bitte Name und Gültigkeitszeitraum prüfen.');
      return;
    }
    const overlaps = data.workPlans.filter((plan) => rangesOverlap(validFrom, validTo || null, plan.validFrom, plan.validTo));
    let updatedPlans = data.workPlans;
    if (overlaps.length > 0) {
      const predecessor = overlaps.length === 1 && overlaps[0].validFrom < validFrom ? overlaps[0] : undefined;
      if (!predecessor || !window.confirm(`Der neue Plan überschneidet sich mit „${predecessor.name}“. Diesen Plan am Vortag beenden?`)) {
        window.alert('Arbeitspläne dürfen sich nicht überschneiden. Passe die Datumswerte an.');
        return;
      }
      updatedPlans = data.workPlans.map((plan) => plan.id === predecessor.id ? { ...plan, validTo: addDays(validFrom, -1) } : plan);
    }
    setData((previous) => ({
      ...previous,
      workPlans: [
        ...updatedPlans,
        { id: crypto.randomUUID(), name: name.trim(), validFrom, validTo: validTo || null, hoursByWeekday: hours },
      ].sort((a, b) => a.validFrom.localeCompare(b.validFrom)),
    }));
  }

  return (
    <section className="section-page">
      <div className="page-grid">
        <div className="card card-pad">
          <div className="card-head"><div><h2>Arbeitsplan hinzufügen</h2><p>Die Verteilung pro Wochentag ist für Feiertage und Abwesenheiten maßgeblich.</p></div></div>
          <div className="form-grid">
            <div className="field"><label>Name</label><input value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="form-row"><div className="field"><label>Gültig von</label><input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></div><div className="field"><label>Gültig bis, optional</label><input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} /></div></div>
            <div className="week-grid">
              {WEEKDAYS.map(({ key, label }) => (
                <div className="field" key={key}><label>{label}</label><input type="number" min="0" max="24" step="0.25" value={hours[key]} onChange={(event) => setHours((previous) => ({ ...previous, [key]: Math.max(0, Number(event.target.value)) }))} /></div>
              ))}
            </div>
            <div className="notice info">Wochensumme: <strong>{draftWeekly.toLocaleString('de-DE')} Stunden</strong>. Bei einem Feiertag oder einer ganztägigen Abwesenheit wird das Soll des jeweiligen Wochentags gutgeschrieben.</div>
            <button className="small-btn primary" onClick={save}>Arbeitsplan speichern</button>
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-head"><div><h2>Hinterlegte Arbeitspläne</h2><p>Bei mehreren Treffern würde der Plan mit dem jüngsten Startdatum gelten; Überschneidungen werden beim Anlegen verhindert.</p></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Zeitraum</th><th>Woche</th><th>Verteilung</th><th /></tr></thead>
              <tbody>
                {data.workPlans.map((plan) => (
                  <tr key={plan.id}>
                    <td><strong>{plan.name}</strong></td>
                    <td>{formatDate(plan.validFrom)} – {plan.validTo ? formatDate(plan.validTo) : 'offen'}</td>
                    <td>{weeklyHours(plan).toLocaleString('de-DE')} Std.</td>
                    <td>{WEEKDAYS.map(({ key, label }) => `${label} ${decimalHoursToLabel(plan.hoursByWeekday[key])}`).join(' · ')}</td>
                    <td><button className="small-btn danger" disabled={data.workPlans.length === 1} onClick={() => { if (window.confirm(`Arbeitsplan „${plan.name}“ löschen?`)) setData((previous) => ({ ...previous, workPlans: previous.workPlans.filter((item) => item.id !== plan.id) })); }}>Löschen</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function AbsencesPage({ data, setData }: ChildPageProps) {
  return (
    <section className="section-page">
      <div className="page-grid">
        <QuickAbsenceForm data={data} setData={setData} />
        <div className="card card-pad">
          <div className="card-head"><div><h2>Gespeicherte Abwesenheiten</h2><p>Ganztägige Einträge; das Soll wird anhand des gültigen Arbeitsplans berechnet.</p></div></div>
          {data.absences.length === 0 ? <div className="empty-state">Noch keine Abwesenheiten eingetragen.</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Typ</th><th>Von</th><th>Bis</th><th>Bemerkung</th><th /></tr></thead>
                <tbody>
                  {[...data.absences].sort((a, b) => b.from.localeCompare(a.from)).map((absence) => (
                    <tr key={absence.id}>
                      <td><span className={`pill ${absence.type}`}>{absenceLabel(absence.type)}</span></td>
                      <td>{formatDate(absence.from)}</td><td>{formatDate(absence.to)}</td><td>{absence.note || '–'}</td>
                      <td><button className="small-btn danger" onClick={() => { if (window.confirm('Abwesenheit löschen?')) setData((previous) => ({ ...previous, absences: previous.absences.filter((item) => item.id !== absence.id) })); }}>Löschen</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
      <div className="page-grid">
        <div className="card card-pad">
          <div className="card-head"><div><h2>Allgemein</h2><p>Diese Angaben steuern Anzeige, Urlaub und Feiertagsberechnung.</p></div></div>
          <div className="form-grid">
            <div className="field"><label>Name</label><input value={draft.employeeName} onChange={(event) => setDraft((previous) => ({ ...previous, employeeName: event.target.value }))} /></div>
            <div className="field"><label>Bundesland</label><select value={draft.federalState} onChange={(event) => setDraft((previous) => ({ ...previous, federalState: event.target.value }))}>{FEDERAL_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></div>
            <div className="field"><label>Jahresurlaub in Tagen</label><input type="number" min="0" step="1" value={draft.annualLeaveDays} onChange={(event) => setDraft((previous) => ({ ...previous, annualLeaveDays: Number(event.target.value) }))} /></div>
            <div className="field"><label>Feiertagsgutschrift</label><select value={draft.holidayCreditMode} onChange={(event) => setDraft((previous) => ({ ...previous, holidayCreditMode: event.target.value as Settings['holidayCreditMode'] }))}><option value="schedule">Tagessoll des Arbeitsplans</option><option value="fixed8">Feste 8 Stunden, sofern Arbeitstag</option></select></div>
            <button className="small-btn primary" onClick={save}>Einstellungen speichern</button>
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad">
            <div className="card-head"><div><h2>Feiertagsdienst</h2><p>OpenHolidays API wird nach Jahr und Bundesland abgefragt und lokal zwischengespeichert.</p></div></div>
            <div className={`notice ${source === 'fallback' ? 'warning' : 'info'}`}>{holidayStatus}</div>
            <div className="mini-list">
              <div className="row"><span>Bundesland</span><strong>{stateName(data.settings.federalState)}</strong></div>
              <div className="row"><span>Datenquelle</span><strong>{source === 'api' ? 'OpenHolidays API' : source === 'fallback' ? 'Bundesweiter Offline-Fallback' : 'noch nicht geladen'}</strong></div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-head"><div><h2>Speicher und Konto</h2><p>Der Funktionsumfang ist in Browser- und Servermodus identisch.</p></div></div>
            <div className={`notice ${storageInfo.syncState === 'error' ? 'warning' : 'info'}`}>{storageInfo.syncMessage || 'Bereit'}</div>
            <div className="mini-list">
              <div className="row"><span>Speichermodus</span><strong>{storageInfo.label}</strong></div>
              {storageInfo.user && <div className="row"><span>Benutzerkonto</span><strong>{storageInfo.user.email}</strong></div>}
              {storageInfo.serverUrl && <div className="row"><span>Server</span><strong className="breakable">{storageInfo.serverUrl}</strong></div>}
            </div>
            <div className="split-actions">
              <button className="small-btn" onClick={onChangeMode}>Speichermodus wechseln</button>
              {onLogout && <button className="small-btn" onClick={() => void onLogout()}>Abmelden</button>}
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-head"><div><h2>Datensicherung</h2><p>JSON-Backups funktionieren in beiden Modi und können zwischen Browser- und Serverbetrieb übertragen werden.</p></div></div>
            <div className="split-actions">
              <button className="small-btn primary" onClick={onExport}>JSON-Backup exportieren</button>
              <button className="small-btn" onClick={onImportClick}>Backup importieren</button>
              <button className="small-btn danger" onClick={onReset}>Alle Daten zurücksetzen</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
