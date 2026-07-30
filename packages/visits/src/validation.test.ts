import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeVisits, validateNewVisit } from './visits.ts';
import type { Visit } from './types.ts';

function visita(over: Partial<Visit> = {}): Visit {
  return {
    id: 'v1',
    visitorName: 'Visitante',
    visitorDocument: '',
    visitorContact: '',
    host: 'compras',
    reason: '',
    status: 'checked_in',
    expectedAt: null,
    checkedInAt: '2026-07-30T14:00:00Z',
    checkedOutAt: null,
    cancelReason: '',
    correctsVisitId: null,
    ...over,
  };
}

describe('validateNewVisit', () => {
  test('o walk-in honesto: nome e destino — entra AGORA, carimbo do servidor', () => {
    const r = validateNewVisit({ visitorName: 'Entregador da tarde', host: 'almoxarifado' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'checked_in');
      assert.equal(r.value.checkedInAt, null);   // o carimbo NUNCA nasce aqui.
    }
  });

  test('⛔ sem nome não entra; sem destino é alguém vagando', () => {
    const semNome = validateNewVisit({ host: 'x' });
    assert.equal(semNome.ok, false);

    const semDestino = validateNewVisit({ visitorName: 'X' });
    assert.equal(semDestino.ok, false);
    if (!semDestino.ok) assert.match(semDestino.problems[0]!.message, /vagando/);
  });

  test('⭐ agendar exige o quando', () => {
    const semQuando = validateNewVisit({ visitorName: 'X', host: 'y', scheduled: true });
    assert.equal(semQuando.ok, false);

    const ok = validateNewVisit({
      visitorName: 'X',
      host: 'y',
      scheduled: true,
      expectedAt: '2026-08-01T10:00:00Z',
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.value.status, 'scheduled');
  });

  test('documento e contato são opcionais — o visitante é neutro', () => {
    const r = validateNewVisit({
      visitorName: 'X',
      host: 'y',
      visitorDocument: 'RG 12.345',
      visitorContact: '(62) 9 9999-0000',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.visitorDocument, 'RG 12.345');
  });
});

describe('summarizeVisits', () => {
  test('conta o pátio sem inventar número', () => {
    const r = summarizeVisits([
      visita(),
      visita({ id: 'v2', status: 'scheduled', expectedAt: 'x', checkedInAt: null }),
      visita({ id: 'v3', status: 'checked_out', checkedOutAt: 'x' }),
    ]);
    assert.deepEqual(r, { total: 3, inside: 1, scheduled: 1 });
  });
});
