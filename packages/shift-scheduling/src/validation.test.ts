import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeSchedules, validateNewSchedule } from './shift.ts';
import type { Schedule } from './types.ts';

function escala(over: Partial<Schedule> = {}): Schedule {
  return {
    id: 's1',
    employeeId: 'ee000000-0000-4000-8000-000000000001',
    employeeName: 'Ana Vendedora',
    shiftLabel: 'Manhã',
    startsAt: '2026-07-30T08:00:00Z',
    endsAt: '2026-07-30T12:00:00Z',
    status: 'scheduled',
    cancelledAt: null,
    cancelReason: '',
    ...over,
  };
}

describe('validateNewSchedule', () => {
  test('o mínimo honesto: colaborador, nome, turno e período', () => {
    const r = validateNewSchedule({
      employeeId: 'ee000000-0000-4000-8000-000000000001',
      employeeName: 'Ana Vendedora',
      shiftLabel: 'Manhã',
      startsAt: '2026-07-30T08:00:00Z',
      endsAt: '2026-07-30T12:00:00Z',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.status, 'scheduled');
  });

  test('⛔ sem colaborador, sem nome, sem turno ou sem período não escala', () => {
    assert.equal(
      validateNewSchedule({
        employeeName: 'Ana',
        shiftLabel: 'Manhã',
        startsAt: '2026-07-30T08:00:00Z',
        endsAt: '2026-07-30T12:00:00Z',
      }).ok,
      false,
    );
    assert.equal(
      validateNewSchedule({
        employeeId: 'id',
        shiftLabel: 'Manhã',
        startsAt: '2026-07-30T08:00:00Z',
        endsAt: '2026-07-30T12:00:00Z',
      }).ok,
      false,
    );
    assert.equal(
      validateNewSchedule({
        employeeId: 'id',
        employeeName: 'Ana',
        startsAt: '2026-07-30T08:00:00Z',
        endsAt: '2026-07-30T12:00:00Z',
      }).ok,
      false,
    );
    assert.equal(
      validateNewSchedule({ employeeId: 'id', employeeName: 'Ana', shiftLabel: 'Manhã' }).ok,
      false,
    );
  });

  test('o fim precisa vir depois do início', () => {
    const r = validateNewSchedule({
      employeeId: 'id',
      employeeName: 'Ana',
      shiftLabel: 'Manhã',
      startsAt: '2026-07-30T12:00:00Z',
      endsAt: '2026-07-30T08:00:00Z',
    });
    assert.equal(r.ok, false);
  });

  test('⭐ o PASSADO é permitido — registrar o turno que já rodou é fato consumado', () => {
    const r = validateNewSchedule({
      employeeId: 'id',
      employeeName: 'Ana',
      shiftLabel: 'Manhã',
      startsAt: '2020-01-06T08:00:00Z',
      endsAt: '2020-01-06T12:00:00Z',
    });
    assert.equal(r.ok, true);
  });

  test('nasce sempre scheduled, sem carimbo de cancelamento', () => {
    const r = validateNewSchedule({
      employeeId: 'id',
      employeeName: 'Ana',
      shiftLabel: 'Manhã',
      startsAt: '2026-07-30T08:00:00Z',
      endsAt: '2026-07-30T12:00:00Z',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.cancelReason, '');
  });
});

describe('summarizeSchedules', () => {
  test('conta a agenda por estado sem inventar número', () => {
    const r = summarizeSchedules(
      [
        escala({ id: 's1', status: 'scheduled', endsAt: '2099-01-01T00:00:00Z' }),
        escala({ id: 's2', status: 'cancelled', cancelledAt: 'x', cancelReason: 'y' }),
        escala({ id: 's3', status: 'scheduled', endsAt: '2000-01-01T00:00:00Z' }),
      ],
      '2026-07-30T00:00:00Z',
    );
    assert.deepEqual(r, { total: 3, scheduled: 2, cancelled: 1, upcoming: 1 });
  });
});
