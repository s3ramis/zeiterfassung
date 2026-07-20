import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultData } from './data.mjs';
import { validateAppData } from './validation.mjs';

test('default data is accepted', () => {
  const data = createDefaultData('Test User');
  assert.equal(validateAppData(data), data);
});

test('overlapping work plans are rejected', () => {
  const data = createDefaultData('Test User');
  data.workPlans.push({
    ...data.workPlans[0],
    id: crypto.randomUUID(),
    name: 'Overlap',
    validFrom: data.workPlans[0].validFrom,
  });
  assert.throws(() => validateAppData(data), /überschneiden/);
});

test('invalid event sequences still preserve data but invalid event types are rejected', () => {
  const data = createDefaultData('Test User');
  data.events.push({ id: crypto.randomUUID(), type: 'INVALID', timestamp: new Date().toISOString() });
  assert.throws(() => validateAppData(data), /Ereignistyp/);
});


test('impossible calendar dates are rejected', () => {
  const data = createDefaultData('Test User');
  data.absences.push({
    id: crypto.randomUUID(),
    type: 'vacation',
    from: '2026-02-31',
    to: '2026-02-31',
    note: '',
    createdAt: new Date().toISOString(),
  });
  assert.throws(() => validateAppData(data), /Abwesenheitszeitraum/);
});
