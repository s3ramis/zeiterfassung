const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_TYPES = new Set(['CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT']);
const ABSENCE_TYPES = new Set(['vacation', 'sick', 'overtime']);
const SOURCES = new Set(['timer', 'manual', undefined]);

const BERLIN_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function berlinDateFromTimestamp(value) {
  const parts = Object.fromEntries(BERLIN_DATE_FORMATTER.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function assert(condition, message) {
  if (!condition) throw Object.assign(new Error(message), { statusCode: 400 });
}

function validIsoDate(value) {
  if (!DATE_RE.test(String(value))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function rangeEnd(value) {
  return value ?? '9999-12-31';
}

export function validateAppData(data) {
  try {
    return validateDataStructure(data);
  } catch (error) {
    if (error?.statusCode === 400) throw error;
    throw Object.assign(new Error('Ungültige Datenstruktur.'), { statusCode: 400 });
  }
}

function validateDataStructure(data) {
  assert(data && typeof data === 'object', 'Ungültiger Datensatz.');
  assert(data.version === 1, 'Nicht unterstützte Datenversion.');
  assert(Array.isArray(data.events), 'events muss eine Liste sein.');
  assert(Array.isArray(data.absences), 'absences muss eine Liste sein.');
  assert(Array.isArray(data.workPlans), 'workPlans muss eine Liste sein.');
  assert(data.notes && typeof data.notes === 'object' && !Array.isArray(data.notes), 'notes muss ein Objekt sein.');
  assert(data.settings && typeof data.settings === 'object', 'settings fehlt.');
  assert(data.holidayCache && typeof data.holidayCache === 'object', 'holidayCache fehlt.');

  assert(typeof data.settings.employeeName === 'string' && data.settings.employeeName.trim().length >= 1, 'Name fehlt.');
  assert(/^DE-[A-Z]{2}$/.test(data.settings.federalState), 'Ungültiges Bundesland.');
  assert(Number.isInteger(data.settings.annualLeaveDays) && data.settings.annualLeaveDays >= 0 && data.settings.annualLeaveDays <= 366, 'Ungültiger Jahresurlaub.');
  assert(['schedule', 'fixed8'].includes(data.settings.holidayCreditMode), 'Ungültige Feiertagsbewertung.');

  const ids = new Set();
  for (const event of data.events) {
    assert(validId(event.id) && !ids.has(event.id), 'Ungültige oder doppelte Ereignis-ID.');
    ids.add(event.id);
    assert(EVENT_TYPES.has(event.type), 'Ungültiger Ereignistyp.');
    assert(validIsoTimestamp(event.timestamp), 'Ungültiger Ereigniszeitpunkt.');
    assert(SOURCES.has(event.source), 'Ungültige Ereignisquelle.');
  }

  for (const absence of data.absences) {
    assert(validId(absence.id) && !ids.has(absence.id), 'Ungültige oder doppelte Abwesenheits-ID.');
    ids.add(absence.id);
    assert(ABSENCE_TYPES.has(absence.type), 'Ungültiger Abwesenheitstyp.');
    assert(validIsoDate(absence.from) && validIsoDate(absence.to) && absence.from <= absence.to, 'Ungültiger Abwesenheitszeitraum.');
    assert(validIsoTimestamp(absence.createdAt), 'Ungültiges Erstellungsdatum der Abwesenheit.');
    assert(typeof absence.note === 'string' && absence.note.length <= 5000, 'Ungültige Abwesenheitsnotiz.');
  }

  const vacationRanges = data.absences.filter((absence) => absence.type === 'vacation');
  for (const event of data.events) {
    const eventDate = berlinDateFromTimestamp(event.timestamp);
    assert(!vacationRanges.some((absence) => eventDate >= absence.from && eventDate <= absence.to), 'Urlaub darf nicht mit vorhandenen Arbeitszeiten überlappen.');
  }

  const sortedPlans = [...data.workPlans].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  for (const [index, plan] of sortedPlans.entries()) {
    assert(validId(plan.id) && !ids.has(plan.id), 'Ungültige oder doppelte Arbeitsplan-ID.');
    ids.add(plan.id);
    assert(typeof plan.name === 'string' && plan.name.trim().length > 0 && plan.name.length <= 200, 'Ungültiger Arbeitsplanname.');
    assert(validIsoDate(plan.validFrom), 'Ungültiger Beginn eines Arbeitsplans.');
    assert(plan.validTo === null || validIsoDate(plan.validTo), 'Ungültiges Ende eines Arbeitsplans.');
    assert(plan.validTo === null || plan.validTo >= plan.validFrom, 'Arbeitsplan endet vor seinem Beginn.');
    assert(plan.hoursByWeekday && typeof plan.hoursByWeekday === 'object', 'Wochentage des Arbeitsplans fehlen.');
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      const hours = Number(plan.hoursByWeekday[weekday]);
      assert(Number.isFinite(hours) && hours >= 0 && hours <= 24, 'Ungültige tägliche Sollzeit.');
    }
    if (index > 0) {
      const previous = sortedPlans[index - 1];
      assert(rangeEnd(previous.validTo) < plan.validFrom, 'Arbeitspläne dürfen sich nicht überschneiden.');
    }
  }

  for (const [date, note] of Object.entries(data.notes)) {
    assert(validIsoDate(date), 'Ungültiges Datum einer Tagesnotiz.');
    assert(typeof note === 'string' && note.length <= 10000, 'Ungültige Tagesnotiz.');
  }

  for (const [key, cache] of Object.entries(data.holidayCache)) {
    assert(cache && typeof cache === 'object' && cache.key === key, 'Ungültiger Feiertags-Cache.');
    assert(validIsoTimestamp(cache.loadedAt), 'Ungültiger Cache-Zeitpunkt.');
    assert(['api', 'fallback'].includes(cache.source), 'Ungültige Feiertagsquelle.');
    assert(Array.isArray(cache.holidays), 'Ungültige Feiertagsliste.');
    for (const holiday of cache.holidays) {
      assert(validIsoDate(holiday.date) && typeof holiday.name === 'string' && holiday.name.length <= 300 && typeof holiday.nationwide === 'boolean', 'Ungültiger Feiertag.');
    }
  }
  return data;
}
