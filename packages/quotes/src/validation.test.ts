import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { lineTotalCents, summarizeProposals, sumItems, validateNewProposal } from './quote.ts';
import type { Proposal } from './types.ts';

function base() {
  return {
    externalRef: 'PROP-2026-001',
    currency: 'brl',
    prospectName: 'Prospecto Demo',
    counterpartyTaxId: null,
    description: 'Proposta de serviços',
    validUntil: '2026-08-31',
    items: [{ description: 'Consultoria', quantity: 10, unitAmountCents: 15000 }],
  };
}

describe('validar proposta nova', () => {
  test('a proposta boa passa, nasce rascunho e soma as linhas', () => {
    const r = validateNewProposal(base());
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'draft');
      assert.equal(r.value.totalCents, 150000);
      assert.equal(r.value.currency, 'BRL', 'a moeda sobe para caixa alta');
      assert.equal(r.value.decidedAt, null);
    }
  });

  test('sem referência, sem moeda ou sem item: recusada com o campo apontado', () => {
    const r = validateNewProposal({ ...base(), externalRef: ' ', currency: 'reais', items: [] });
    assert.equal(r.ok, false);
    if (!r.ok) {
      const campos = r.problems.map((p) => p.field);
      assert.ok(campos.includes('externalRef'));
      assert.ok(campos.includes('currency'));
      assert.ok(campos.includes('items'));
    }
  });

  test('⭐ a contraparte é NEUTRA e OPCIONAL — propor não exige cadastrar', () => {
    const r = validateNewProposal({ ...base(), prospectName: undefined });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.prospectName, null);
  });

  test('validade é opcional; com formato errado, recusada', () => {
    assert.equal(validateNewProposal({ ...base(), validUntil: undefined }).ok, true);
    const r = validateNewProposal({ ...base(), validUntil: '31/08/2026' });
    assert.equal(r.ok, false);
  });

  test('item com quantidade zero ou unitário quebrado é apontado linha a linha', () => {
    const r = validateNewProposal({
      ...base(),
      items: [
        { description: 'ok', quantity: 1, unitAmountCents: 100 },
        { description: ' ', quantity: 0, unitAmountCents: 10.5 },
      ],
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      const campos = r.problems.map((p) => p.field);
      assert.ok(campos.includes('items.1.description'));
      assert.ok(campos.includes('items.1.quantity'));
      assert.ok(campos.includes('items.1.unitAmountCents'));
    }
  });
});

describe('a soma é do pacote', () => {
  test('lineTotalCents arredonda como o banco (round)', () => {
    assert.equal(lineTotalCents(1.5, 333), 500);
  });

  test('sumItems soma os totais de linha', () => {
    assert.equal(
      sumItems([
        { lineNo: 1, description: 'a', quantity: 1, unitAmountCents: 100, lineTotalCents: 100 },
        { lineNo: 2, description: 'b', quantity: 2, unitAmountCents: 50, lineTotalCents: 100 },
      ]),
      200,
    );
  });
});

describe('o resumo conta, nunca estima', () => {
  function p(over: Partial<Proposal>): Proposal {
    return {
      externalRef: `P-${Math.abs(JSON.stringify(over).length)}`,
      currency: 'BRL',
      prospectName: null,
      counterpartyTaxId: null,
      description: '',
      validUntil: null,
      totalCents: 1000,
      status: 'sent',
      decidedAt: null,
      decisionNote: '',
      items: [],
      ...over,
    };
  }

  test('conta por estado e soma aceitas por moeda', () => {
    const r = summarizeProposals([
      p({ externalRef: 'a', status: 'sent' }),
      p({ externalRef: 'b', status: 'accepted', totalCents: 5000 }),
      p({ externalRef: 'c', status: 'accepted', totalCents: 2000, currency: 'USD' }),
      p({ externalRef: 'd', status: 'declined' }),
    ]);
    assert.equal(r.total, 4);
    assert.equal(r.onTheTable, 1);
    assert.equal(r.accepted, 2);
    assert.equal(r.declined, 1);
    assert.equal(r.acceptedCentsByCurrency.get('BRL'), 5000);
    assert.equal(r.acceptedCentsByCurrency.get('USD'), 2000);
  });
});
