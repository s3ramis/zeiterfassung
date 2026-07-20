import crypto from 'node:crypto';
import { validateAppData } from './validation.mjs';

export function createDefaultData(employeeName = 'Alex') {
  const year = new Date().getFullYear();
  return {
    version: 1,
    events: [],
    absences: [],
    workPlans: [{
      id: crypto.randomUUID(),
      name: 'Standard 40 Stunden',
      validFrom: `${year}-01-01`,
      validTo: null,
      hoursByWeekday: { 0: 0, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 0 },
    }],
    notes: {},
    settings: {
      employeeName,
      federalState: 'DE-BY',
      annualLeaveDays: 30,
      holidayCreditMode: 'schedule',
    },
    holidayCache: {},
  };
}

export async function loadUserData(poolOrClient, userId) {
  const [userResult, eventResult, absenceResult, planResult, dayResult, noteResult, cacheResult] = await Promise.all([
    poolOrClient.query(
      `SELECT employee_name, federal_state, annual_leave_days, holiday_credit_mode, data_revision
         FROM users WHERE id = $1`,
      [userId],
    ),
    poolOrClient.query(
      `SELECT id, event_type, occurred_at, source
         FROM time_events WHERE user_id = $1 ORDER BY occurred_at, id`,
      [userId],
    ),
    poolOrClient.query(
      `SELECT id, absence_type, date_from::text, date_to::text, note, created_at
         FROM absences WHERE user_id = $1 ORDER BY date_from, id`,
      [userId],
    ),
    poolOrClient.query(
      `SELECT id, name, valid_from::text, valid_to::text
         FROM work_plans WHERE user_id = $1 ORDER BY valid_from, id`,
      [userId],
    ),
    poolOrClient.query(
      `SELECT wpd.work_plan_id, wpd.weekday, wpd.minutes
         FROM work_plan_days wpd
         JOIN work_plans wp ON wp.id = wpd.work_plan_id
        WHERE wp.user_id = $1`,
      [userId],
    ),
    poolOrClient.query(
      `SELECT work_date::text, note FROM daily_notes WHERE user_id = $1 ORDER BY work_date`,
      [userId],
    ),
    poolOrClient.query(
      `SELECT cache_key, loaded_at, source, holidays FROM holiday_cache WHERE user_id = $1`,
      [userId],
    ),
  ]);

  if (!userResult.rowCount) throw Object.assign(new Error('Benutzerkonto nicht gefunden.'), { statusCode: 404 });
  const user = userResult.rows[0];
  const daysByPlan = new Map();
  for (const row of dayResult.rows) {
    if (!daysByPlan.has(row.work_plan_id)) daysByPlan.set(row.work_plan_id, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
    daysByPlan.get(row.work_plan_id)[row.weekday] = Number(row.minutes) / 60;
  }

  const notes = Object.fromEntries(noteResult.rows.map((row) => [row.work_date, row.note]));
  const holidayCache = Object.fromEntries(cacheResult.rows.map((row) => [row.cache_key, {
    key: row.cache_key,
    loadedAt: new Date(row.loaded_at).toISOString(),
    holidays: row.holidays,
    source: row.source,
  }]));

  return {
    revision: Number(user.data_revision),
    data: {
      version: 1,
      events: eventResult.rows.map((row) => ({
        id: row.id,
        type: row.event_type,
        timestamp: new Date(row.occurred_at).toISOString(),
        ...(row.source ? { source: row.source } : {}),
      })),
      absences: absenceResult.rows.map((row) => ({
        id: row.id,
        type: row.absence_type,
        from: row.date_from,
        to: row.date_to,
        note: row.note,
        createdAt: new Date(row.created_at).toISOString(),
      })),
      workPlans: planResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        validFrom: row.valid_from,
        validTo: row.valid_to,
        hoursByWeekday: daysByPlan.get(row.id) ?? { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      })),
      notes,
      settings: {
        employeeName: user.employee_name,
        federalState: user.federal_state,
        annualLeaveDays: Number(user.annual_leave_days),
        holidayCreditMode: user.holiday_credit_mode,
      },
      holidayCache,
    },
  };
}

async function clearUserTables(client, userId) {
  await client.query('DELETE FROM time_events WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM absences WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM work_plans WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM daily_notes WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM holiday_cache WHERE user_id = $1', [userId]);
}

async function insertData(client, userId, data) {
  for (const event of data.events) {
    await client.query(
      `INSERT INTO time_events(id, user_id, event_type, occurred_at, source)
       VALUES($1, $2, $3, $4, $5)`,
      [event.id, userId, event.type, event.timestamp, event.source ?? null],
    );
  }

  for (const absence of data.absences) {
    await client.query(
      `INSERT INTO absences(id, user_id, absence_type, date_from, date_to, note, created_at)
       VALUES($1, $2, $3, $4, $5, $6, $7)`,
      [absence.id, userId, absence.type, absence.from, absence.to, absence.note, absence.createdAt],
    );
  }

  for (const plan of data.workPlans) {
    await client.query(
      `INSERT INTO work_plans(id, user_id, name, valid_from, valid_to)
       VALUES($1, $2, $3, $4, $5)`,
      [plan.id, userId, plan.name, plan.validFrom, plan.validTo],
    );
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      await client.query(
        `INSERT INTO work_plan_days(work_plan_id, weekday, minutes) VALUES($1, $2, $3)`,
        [plan.id, weekday, Math.round(Number(plan.hoursByWeekday[weekday]) * 60)],
      );
    }
  }

  for (const [date, note] of Object.entries(data.notes)) {
    if (!String(note).trim()) continue;
    await client.query(
      `INSERT INTO daily_notes(user_id, work_date, note) VALUES($1, $2, $3)`,
      [userId, date, note],
    );
  }

  for (const [key, cache] of Object.entries(data.holidayCache)) {
    await client.query(
      `INSERT INTO holiday_cache(user_id, cache_key, loaded_at, source, holidays)
       VALUES($1, $2, $3, $4, $5::jsonb)`,
      [userId, key, cache.loadedAt, cache.source, JSON.stringify(cache.holidays)],
    );
  }
}

export async function replaceUserData(pool, userId, inputData, expectedRevision) {
  const data = validateAppData(inputData);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const revisionResult = await client.query('SELECT data_revision FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!revisionResult.rowCount) throw Object.assign(new Error('Benutzerkonto nicht gefunden.'), { statusCode: 404 });
    const currentRevision = Number(revisionResult.rows[0].data_revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) {
      throw Object.assign(new Error('Die Daten wurden bereits in einer anderen Sitzung geändert.'), { statusCode: 409 });
    }

    await clearUserTables(client, userId);
    await insertData(client, userId, data);
    const updateResult = await client.query(
      `UPDATE users
          SET employee_name = $2,
              federal_state = $3,
              annual_leave_days = $4,
              holiday_credit_mode = $5,
              data_revision = data_revision + 1,
              updated_at = now()
        WHERE id = $1
        RETURNING data_revision`,
      [userId, data.settings.employeeName.trim(), data.settings.federalState, data.settings.annualLeaveDays, data.settings.holidayCreditMode],
    );
    await client.query('COMMIT');
    return { data, revision: Number(updateResult.rows[0].data_revision) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function initializeUserData(client, userId, employeeName) {
  const data = createDefaultData(employeeName);
  validateAppData(data);
  await insertData(client, userId, data);
  return data;
}

export async function resetUserData(pool, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query('SELECT display_name FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!userResult.rowCount) throw Object.assign(new Error('Benutzerkonto nicht gefunden.'), { statusCode: 404 });
    const data = createDefaultData(userResult.rows[0].display_name);
    await clearUserTables(client, userId);
    await insertData(client, userId, data);
    const revisionResult = await client.query(
      `UPDATE users
          SET employee_name = $2,
              federal_state = $3,
              annual_leave_days = $4,
              holiday_credit_mode = $5,
              data_revision = data_revision + 1,
              updated_at = now()
        WHERE id = $1
        RETURNING data_revision`,
      [userId, data.settings.employeeName, data.settings.federalState, data.settings.annualLeaveDays, data.settings.holidayCreditMode],
    );
    await client.query('COMMIT');
    return { data, revision: Number(revisionResult.rows[0].data_revision) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
