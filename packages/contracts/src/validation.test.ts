import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExpiryQueue,
  currentEndsOn,
  currentValueCents,
  daysToEnd,
  summarizeContracts,
  validateNewContract,
} from './contract.ts';
import type { Adjustment, Contract, Renewal } from './types.ts';

function contrato(over: Partial<Contract> = {}): Contract {
  return {
    externalRef: 'CTR-1',
    title: 'Locação de sala',
    description: '',
    contractType: 'locação',
    counterpartyName: 'Contraparte Demo',
    counterpartyTaxId: null,
    partyId: null,
    startsOn: '2026-01-01',
    endsOn: '2026-12-31',
    valueCents: 300_000,
    currency: 'BRL',
    status: 'active',
    outcomeReason: '',
    decidedAt: null,
    ...over,
  };
}

function reajuste(over: Partial<Adjustment> = {}): Adjustment {
  return {
    id: 'adj-1',
    contractId: 'ctr-1',
    adjustedOn: '2026-06-01',
    indexName: 'IGP-M',
    previousValueCents: 300_000,
    newValueCents: 321_000,
    note: '',
    registeredAt: '2026-06-01T10:00:00Z',
    ...over,
  };
}

describe('⭐ o termo vigente NÃO é campo — é o original + o último ato', () => {
  test('sem reajuste, vale o original; com reajustes, vale o ÚLTIMO por data', () => {
    const c = contrato();
    assert.equal(currentValueCents(c, []), 300_000);
    assert.equal(
      currentValueCents(c, [
        reajuste({ adjustedOn: '2026-03-01', newValueCents: 310_000 }),
        reajuste({ id: 'adj-2', adjustedOn: '2026-06-01', newValueCents: 321_000 }),
      ]),
      321_000,
    );
  });

  test('dois reajustes no MESMO dia: desempata quem foi registrado depois', () => {
    const c = contrato();
    assert.equal(
      currentValueCents(c, [
        reajuste({ registeredAt: '2026-06-01T10:00:00Z', newValueCents: 310_000 }),
        reajuste({ id: 'adj-2', registeredAt: '2026-06-01T11:00:00Z', newValueCents: 315_000 }),
      ]),
      315_000,
    );
  });

  test('o fim vigente segue a última renovação', () => {
    const c = contrato({ endsOn: '2026-12-31' });
    assert.equal(currentEndsOn(c, []), '2026-12-31');
    const rens: Renewal[] = [
      {
        id: 'r1', contractId: 'c', previousEndsOn: '2026-12-31', newEndsOn: '2027-12-31',
        note: '', renewedAt: '2026-12-01T00:00:00Z',
      },
      {
        id: 'r2', contractId: 'c', previousEndsOn: '2027-12-31', newEndsOn: '2028-12-31',
        note: '', renewedAt: '2027-11-01T00:00:00Z',
      },
    ];
    assert.equal(currentEndsOn(c, rens), '2028-12-31');
  });

  test('daysToEnd conta pelo fim VIGENTE; sem prazo, é null — não número inventado', () => {
    assert.equal(daysToEnd(contrato({ endsOn: '2026-08-09' }), [], '2026-07-30'), 10);
    assert.equal(daysToEnd(contrato({ endsOn: '2026-07-20' }), [], '2026-07-30'), -10);
    assert.equal(daysToEnd(contrato({ endsOn: null }), [], '2026-07-30'), null);
  });
});

describe('a fila de vencimentos', () => {
  test('só EM VIGOR com prazo entra; vencido vem primeiro; sem prazo fica fora', () => {
    const fila = buildExpiryQueue(
      [
        contrato({ externalRef: 'A', endsOn: '2026-08-05' }),
        contrato({ externalRef: 'B', endsOn: '2026-07-01' }),
        contrato({ externalRef: 'C', endsOn: null }),
        contrato({ externalRef: 'D', endsOn: '2026-12-01' }),
        contrato({ externalRef: 'E', status: 'draft', endsOn: '2026-08-01' }),
      ],
      new Map(),
      '2026-07-30',
      30,
    );
    assert.deepEqual(
      fila.map((r) => r.contract.externalRef),
      ['B', 'A'],
    );
    assert.equal(fila[0]!.daysToEnd < 0, true);
  });

  test('a renovação tira o contrato da janela', () => {
    const rens = new Map<string, readonly Renewal[]>([
      [
        'A',
        [{
          id: 'r', contractId: 'a', previousEndsOn: '2026-08-05', newEndsOn: '2027-08-05',
          note: '', renewedAt: '2026-07-01T00:00:00Z',
        }],
      ],
    ]);
    const fila = buildExpiryQueue(
      [contrato({ externalRef: 'A', endsOn: '2026-08-05' })],
      rens,
      '2026-07-30',
      30,
    );
    assert.deepEqual(fila, []);
  });
});

describe('validateNewContract', () => {
  test('o mínimo honesto: referência e objeto', () => {
    const r = validateNewContract({ externalRef: 'CTR-9', title: 'Fornecimento mensal' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'draft');
      assert.equal(r.value.valueCents, null);
      assert.equal(r.value.endsOn, null);
    }
  });

  test('⛔ valor e moeda andam juntos — nos dois sentidos', () => {
    const semMoeda = validateNewContract({ externalRef: 'X', title: 'T', valueCents: 1000 });
    assert.equal(semMoeda.ok, false);
    if (!semMoeda.ok) {
      assert.ok(semMoeda.problems.some((p) => p.field === 'currency'));
    }
    const semValor = validateNewContract({ externalRef: 'X', title: 'T', currency: 'BRL' });
    assert.equal(semValor.ok, false);
    if (!semValor.ok) {
      assert.ok(semValor.problems.some((p) => p.field === 'valueCents'));
    }
  });

  test('⛔ fim antes do início é recusado', () => {
    const r = validateNewContract({
      externalRef: 'X', title: 'T', startsOn: '2026-06-01', endsOn: '2026-01-01',
    });
    assert.equal(r.ok, false);
  });

  test('sem referência e sem objeto, os problemas têm nome de campo', () => {
    const r = validateNewContract({});
    assert.equal(r.ok, false);
    if (!r.ok) {
      const campos = r.problems.map((p) => p.field);
      assert.ok(campos.includes('externalRef'));
      assert.ok(campos.includes('title'));
    }
  });

  test('tipo é texto livre — qualquer vocabulário passa', () => {
    for (const tipo of ['locação', 'prestação', 'fornecimento', 'convênio de pesquisa']) {
      const r = validateNewContract({ externalRef: 'X', title: 'T', contractType: tipo });
      assert.equal(r.ok, true);
    }
  });
});

describe('summarizeContracts', () => {
  test('conta rascunhos, em vigor e encerrados', () => {
    const s = summarizeContracts([
      contrato({ status: 'draft' }),
      contrato({ status: 'active' }),
      contrato({ status: 'active' }),
      contrato({ status: 'ended' }),
      contrato({ status: 'terminated' }),
      contrato({ status: 'cancelled' }),
    ]);
    assert.deepEqual(s, { total: 6, drafts: 1, active: 2, closed: 3 });
  });
});
