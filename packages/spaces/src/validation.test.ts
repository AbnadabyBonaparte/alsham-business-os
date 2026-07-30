import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeReservations, validateNewReservation } from './spaces.ts';
import type { Reservation } from './types.ts';

function reserva(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    spaceId: 's1',
    purpose: '',
    startsAt: '2026-07-30T10:00:00Z',
    endsAt: '2026-07-30T12:00:00Z',
    status: 'booked',
    cancelledAt: null,
    cancelReason: '',
    ...over,
  };
}

describe('validateNewReservation', () => {
  test('o mínimo honesto: espaço e período', () => {
    const r = validateNewReservation({
      spaceId: 's1',
      startsAt: '2026-07-30T10:00:00Z',
      endsAt: '2026-07-30T12:00:00Z',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.status, 'booked');
  });

  test('⛔ período vazio ou invertido não reserva nada', () => {
    const invertido = validateNewReservation({
      spaceId: 's1',
      startsAt: '2026-07-30T12:00:00Z',
      endsAt: '2026-07-30T10:00:00Z',
    });
    assert.equal(invertido.ok, false);

    const vazio = validateNewReservation({
      spaceId: 's1',
      startsAt: '2026-07-30T12:00:00Z',
      endsAt: '2026-07-30T12:00:00Z',
    });
    assert.equal(vazio.ok, false);
  });

  test('⭐ o PASSADO é permitido — fato consumado, sem parâmetro de hoje', () => {
    const r = validateNewReservation({
      spaceId: 's1',
      startsAt: '2020-01-01T10:00:00Z',
      endsAt: '2020-01-01T12:00:00Z',
    });
    assert.equal(r.ok, true);
  });

  test('sem espaço não há reserva', () => {
    const r = validateNewReservation({ startsAt: '2026-07-30T10:00:00Z', endsAt: '2026-07-30T12:00:00Z' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'spaceId'));
  });
});

describe('summarizeReservations', () => {
  test('conta a agenda sem inventar número — o relógio vem de fora', () => {
    const r = summarizeReservations(
      [
        reserva(),
        reserva({ id: 'r2', startsAt: '2026-08-01T10:00:00Z', endsAt: '2026-08-01T12:00:00Z' }),
        reserva({ id: 'r3', status: 'cancelled', cancelledAt: 'x', cancelReason: 'desmarcaram' }),
      ],
      '2026-07-31T00:00:00Z',
    );
    assert.deepEqual(r, { total: 3, booked: 2, cancelled: 1, upcoming: 1 });
  });
});
