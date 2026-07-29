import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { activeFunnels, validateFunnelStages, validateNewOpportunity } from './deal.ts';
import type { Funnel } from './types.ts';

describe('validar oportunidade nova', () => {
  const boa = { funnelId: 'f', title: 'Contrato anual' };

  test('título e funil são obrigatórios', () => {
    assert.match(validateNewOpportunity({ funnelId: 'f', title: ' ' }) ?? '', /título/);
    assert.match(validateNewOpportunity({ funnelId: ' ', title: 'x' }) ?? '', /funil/);
    assert.equal(validateNewOpportunity(boa), null);
  });

  test('⭐ valor e moeda andam JUNTOS — um sem o outro é recusado', () => {
    assert.match(validateNewOpportunity({ ...boa, valueCents: 1000 }) ?? '', /juntos/);
    assert.match(validateNewOpportunity({ ...boa, currency: 'BRL' }) ?? '', /juntos/);
    assert.equal(validateNewOpportunity({ ...boa, valueCents: 1000, currency: 'BRL' }), null);
  });

  test('probabilidade é inteiro de 0 a 100 — da mão humana', () => {
    assert.equal(validateNewOpportunity({ ...boa, probability: 0 }), null);
    assert.equal(validateNewOpportunity({ ...boa, probability: 100 }), null);
    assert.match(validateNewOpportunity({ ...boa, probability: 101 }) ?? '', /0 a 100/);
    assert.match(validateNewOpportunity({ ...boa, probability: 12.5 }) ?? '', /inteiro/);
  });

  test('expectativa de fechamento é AAAA-MM-DD ou nada', () => {
    assert.equal(validateNewOpportunity({ ...boa, expectedCloseDate: '2026-12-01' }), null);
    assert.match(
      validateNewOpportunity({ ...boa, expectedCloseDate: '01/12/2026' }) ?? '',
      /AAAA-MM-DD/,
    );
  });

  test('⭐ o vínculo com a contraparte é OPCIONAL — negociar não exige cadastrar', () => {
    assert.equal(validateNewOpportunity({ ...boa, partyId: null, partyName: null }), null);
    assert.equal(
      validateNewOpportunity({ ...boa, partyId: 'uuid-solto', partyName: 'Fulano' }),
      null,
    );
  });
});

describe('validar o desenho do funil', () => {
  test('funil sem estágio não existe', () => {
    assert.match(validateFunnelStages([]) ?? '', /pelo menos um/);
  });

  test('nome vazio, nome repetido e posição repetida são recusados', () => {
    assert.match(validateFunnelStages([{ name: ' ', position: 0 }]) ?? '', /nome/);
    assert.match(
      validateFunnelStages([
        { name: 'Contato', position: 0 },
        { name: 'contato', position: 1 },
      ]) ?? '',
      /mesmo nome/,
    );
    assert.match(
      validateFunnelStages([
        { name: 'a', position: 0 },
        { name: 'b', position: 0 },
      ]) ?? '',
      /posição/,
    );
  });

  test('o funil de qualquer ofício passa — a Lei das Etapas', () => {
    assert.equal(
      validateFunnelStages([
        { name: 'edital publicado', position: 0 },
        { name: 'proposta protocolada', position: 1 },
        { name: 'habilitação', position: 2 },
      ]),
      null,
    );
  });
});

describe('funis ativos', () => {
  function f(over: Partial<Funnel>): Funnel {
    return {
      id: 'f1',
      tenantId: 't1',
      name: 'Vendas',
      description: '',
      status: 'active',
      ...over,
    };
  }

  test('o seletor mostra só os ativos', () => {
    const r = activeFunnels([f({ id: 'a' }), f({ id: 'b', status: 'archived' })]);
    assert.deepEqual(r.map((x) => x.id), ['a']);
  });
});
