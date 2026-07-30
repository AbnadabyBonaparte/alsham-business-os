import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  summarizeOccurrences,
  validateNewOccurrence,
  validateTreatment,
} from './occurrence.ts';
import type { Occurrence } from './types.ts';

const AGORA = '2026-07-30T12:00:00Z';

function ocorrencia(over: Partial<Occurrence> = {}): Occurrence {
  return {
    id: 'o1',
    title: 'Queda de energia',
    description: 'Setor B sem energia por 20 minutos.',
    location: null,
    involved: null,
    severityId: null,
    occurredAt: '2026-07-29T10:00:00Z',
    status: 'open',
    closedAt: null,
    outcome: '',
    ...over,
  };
}

describe('validateNewOccurrence', () => {
  test('o mínimo honesto: título e relato', () => {
    const r = validateNewOccurrence(
      { title: 'Alarme disparado', description: 'Alarme da doca disparou às 3h.' },
      AGORA,
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'open');
      assert.equal(r.value.occurredAt, AGORA);
    }
  });

  test('⛔ sem relato não há registro — o registro É o relato', () => {
    const r = validateNewOccurrence({ title: 'X' }, AGORA);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.problems.some((p) => p.field === 'description'));
    }
  });

  test('⭐ o passado entra; o futuro é recusado — fato consumado', () => {
    assert.equal(
      validateNewOccurrence(
        { title: 'X', description: 'Y', occurredAt: '2026-07-01T00:00:00Z' },
        AGORA,
      ).ok,
      true,
    );
    const r = validateNewOccurrence(
      { title: 'X', description: 'Y', occurredAt: '2026-08-01T00:00:00Z' },
      AGORA,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.problems.some((p) => p.message.includes('futuro')));
    }
  });

  test('local e envolvidos são texto livre — qualquer vocabulário passa', () => {
    const r = validateNewOccurrence(
      {
        title: 'X',
        description: 'Y',
        location: 'prateleira B3 do almoxarifado',
        involved: 'motorista da placa ABC1D23',
      },
      AGORA,
    );
    assert.equal(r.ok, true);
  });
});

describe('validateTreatment e o resumo', () => {
  test('tratativa vazia é recusada — ela registra o que foi FEITO', () => {
    assert.equal(validateTreatment('   ').ok, false);
    assert.equal(validateTreatment('acionada a manutenção; área isolada').ok, true);
  });

  test('o resumo conta abertas e encerradas', () => {
    const s = summarizeOccurrences([
      ocorrencia(),
      ocorrencia({ id: 'o2' }),
      ocorrencia({ id: 'o3', status: 'closed', closedAt: AGORA, outcome: 'apurado' }),
    ]);
    assert.deepEqual(s, { total: 3, open: 2, closed: 1 });
  });
});
