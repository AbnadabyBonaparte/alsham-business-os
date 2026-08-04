import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { composeMesa, explainDivergence } from './mesa.ts';
import type { SourcedStatementLine } from './mesa.ts';
import type {
  MatchingSettings,
  Payable,
  Receivable,
  ReconciliationMatch,
} from './types.ts';

/**
 * Testes da MESA — puros, sem banco. Provam o que os gaps 2 e 4 pediram:
 *  · o casamento GRAVADO manda sobre o recálculo (score de origem preservado);
 *  · a divergência tem MOTIVO, pela mesma régua do motor.
 */

const TENANT = '00000000-0000-4000-8000-000000000001';

const SETTINGS: MatchingSettings = {
  amountToleranceCents: 100,
  dateToleranceDays: 5,
  minScore: 0.6,
};

function line(over: Partial<SourcedStatementLine> & { id: string }): SourcedStatementLine {
  return {
    tenantId: TENANT,
    statementId: 'stmt-1',
    lineNo: 1,
    postedAt: '2026-07-10',
    amountCents: -150_00,
    currency: 'BRL',
    description: '',
    status: 'unmatched',
    source: { accountRef: 'conta-1', periodStart: '2026-07-01', periodEnd: '2026-07-31' },
    ...over,
  };
}

function payable(over: Partial<Payable> & { id: string }): Payable {
  return {
    tenantId: TENANT,
    source: 'imported',
    externalRef: 'NF-1001',
    dueDate: '2026-07-10',
    amountCents: 150_00,
    settledAmountCents: 0,
    currency: 'BRL',
    description: '',
    status: 'open',
    ...over,
  };
}

function receivable(over: Partial<Receivable> & { id: string }): Receivable {
  return {
    tenantId: TENANT,
    source: 'imported',
    externalRef: 'DOC-R-1001',
    dueDate: '2026-07-10',
    amountCents: 150_00,
    receivedAmountCents: 0,
    currency: 'BRL',
    description: '',
    status: 'open',
    ...over,
  };
}

function match(over: Partial<ReconciliationMatch> & { id: string }): ReconciliationMatch {
  return {
    tenantId: TENANT,
    statementLineId: 'l-1',
    payableId: null,
    receivableId: null,
    matchedAmountCents: 150_00,
    score: null,
    origin: 'auto',
    strategy: null,
    status: 'suggested',
    decidedAt: null,
    decidedBy: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// GAP 4 — a divergência com MOTIVO
// ---------------------------------------------------------------------------

describe('explainDivergence — o porquê, não "sem correspondência"', () => {
  test('órfã: não há título da direção certa', () => {
    const l = line({ id: 'l-1', amountCents: -150_00, description: 'TARIFA' });
    const exp = explainDivergence(l, [], [], SETTINGS);
    assert.equal(exp.reason, 'orphan');
    assert.equal(exp.nearest, null);
  });

  test('crédito não olha para título a pagar — é órfã', () => {
    const l = line({ id: 'l-1', amountCents: 150_00 });
    const p = payable({ id: 'p-1', amountCents: 150_00 });
    const exp = explainDivergence(l, [p], [], SETTINGS);
    assert.equal(exp.reason, 'orphan');
  });

  test('valor diverge: título próximo na data, valor além da tolerância', () => {
    const l = line({ id: 'l-1', amountCents: -150_00, postedAt: '2026-07-10' });
    // mesmo vencimento, mas valor 500 acima da tolerância de 100
    const p = payable({ id: 'p-1', amountCents: 200_00, dueDate: '2026-07-10' });
    const exp = explainDivergence(l, [p], [], SETTINGS);
    assert.equal(exp.reason, 'amount-mismatch');
    assert.equal(exp.nearest?.targetId, 'p-1');
    assert.equal(exp.nearest?.amountDeltaCents, 50_00);
  });

  test('data fora da janela: valor bate, mas o vencimento está longe', () => {
    const l = line({ id: 'l-1', amountCents: -150_00, postedAt: '2026-07-10' });
    // valor idêntico, vencimento 20 dias fora (tolerância é 5)
    const p = payable({ id: 'p-1', amountCents: 150_00, dueDate: '2026-07-30' });
    const exp = explainDivergence(l, [p], [], SETTINGS);
    assert.equal(exp.reason, 'date-out-of-window');
    assert.equal(exp.nearest?.dateDeltaDays, 20);
  });

  test('quase casou: dentro das tolerâncias, mas score abaixo do limiar', () => {
    // Valor e data batem (amount+date em cheio), mas o id fiscal e a referência
    // DIVERGEM (pesos 4 e 3 com força 0), arrastando o score para 7/14 = 0.5 —
    // abaixo do minScore 0.6. Dentro das duas tolerâncias, logo below-threshold.
    const l = line({
      id: 'l-1',
      amountCents: -150_00,
      postedAt: '2026-07-10',
      description: 'PAGAMENTO XYZ',
      counterpartyName: null,
      counterpartyTaxId: '99.999.999/0001-99',
    });
    const p = payable({
      id: 'p-1',
      amountCents: 150_00,
      dueDate: '2026-07-10',
      externalRef: 'NF-2041', // len ≥ 4 e ausente da descrição → sinal referência com força 0
      supplierName: null,
      supplierTaxId: '11111111000111', // ≠ id fiscal da linha → sinal tax-id com força 0
    });
    const exp = explainDivergence(l, [p], [], SETTINGS);
    assert.equal(exp.reason, 'below-threshold');
    assert.equal(exp.nearest?.targetId, 'p-1');
    assert.ok((exp.nearest?.score ?? 1) < SETTINGS.minScore);
  });
});

// ---------------------------------------------------------------------------
// GAP 2 — o gravado manda sobre o recalculado
// ---------------------------------------------------------------------------

describe('composeMesa — casamento gravado é verdade, não se recalcula', () => {
  test('a sugestão gravada aparece com o SCORE DO BANCO, não recomputado', () => {
    const l = line({
      id: 'l-1',
      amountCents: -150_00,
      description: 'PAGTO NF-1001',
      counterpartyTaxId: '11.111.111/0001-11',
      counterpartyName: 'Fornecedor Alfa',
    });
    const p = payable({
      id: 'p-1',
      amountCents: 150_00,
      supplierTaxId: '11111111000111',
      supplierName: 'Fornecedor Alfa',
    });
    // Gravado com um score deliberadamente "impossível" para o motor de hoje
    // (0.42) — se a mesa mostrar 0.42, é porque leu o banco, não recalculou.
    const m = match({
      id: 'm-1',
      statementLineId: 'l-1',
      payableId: 'p-1',
      score: 0.42,
      strategy: 'regra-legada',
      status: 'suggested',
    });

    const mesa = composeMesa([l], [m], [p], SETTINGS);
    assert.equal(mesa.suggestions.length, 1);
    const only = mesa.suggestions[0]!;
    assert.equal(only.source, 'stored');
    assert.equal(only.suggestion.score, 0.42, 'o score é o gravado, não o recalculado');
    assert.equal(only.suggestion.strategy, 'regra-legada');
    assert.equal(mesa.divergences.length, 0);
  });

  test('título reivindicado por casamento gravado sai do bolo do motor', () => {
    // Duas linhas disputam o MESMO título. Uma já tem casamento gravado; o
    // motor não pode reoferecer o título à outra — ela vira divergência.
    const l1 = line({ id: 'l-1', amountCents: -150_00, description: 'A' });
    const l2 = line({ id: 'l-2', amountCents: -150_00, description: 'B' });
    const p = payable({ id: 'p-1', amountCents: 150_00, dueDate: '2026-07-10' });
    const m = match({
      id: 'm-1',
      statementLineId: 'l-1',
      payableId: 'p-1',
      score: 0.99,
      strategy: 'amount+date',
      status: 'suggested',
    });

    const mesa = composeMesa([l1, l2], [m], [p], SETTINGS);
    assert.equal(mesa.suggestions.length, 1);
    assert.equal(mesa.suggestions[0]!.suggestion.statementLineId, 'l-1');
    // l-2 ficou sem título (o único foi reivindicado) → divergência.
    assert.equal(mesa.divergences.length, 1);
    assert.equal(mesa.divergences[0]!.line.id, 'l-2');
  });

  test('casamento gravado cujo título já não está aberto é ignorado (stale)', () => {
    const l = line({ id: 'l-1', amountCents: -150_00 });
    const p = payable({ id: 'p-1', amountCents: 150_00, status: 'settled' });
    const m = match({
      id: 'm-1',
      statementLineId: 'l-1',
      payableId: 'p-1',
      score: 0.9,
      status: 'suggested',
    });
    const mesa = composeMesa([l], [m], [p], SETTINGS);
    // título liquidado não é candidato → a sugestão gravada não vale; a linha
    // vira divergência (órfã: não há título aberto da direção certa).
    assert.equal(mesa.suggestions.length, 0);
    assert.equal(mesa.divergences.length, 1);
    assert.equal(mesa.divergences[0]!.explanation.reason, 'orphan');
  });

  test('sem casamento gravado, o motor propõe (computed)', () => {
    const l = line({
      id: 'l-1',
      amountCents: -150_00,
      postedAt: '2026-07-10',
      description: 'PAGTO NF-1001',
      counterpartyTaxId: '11.111.111/0001-11',
    });
    const p = payable({ id: 'p-1', amountCents: 150_00, supplierTaxId: '11111111000111' });
    const mesa = composeMesa([l], [], [p], SETTINGS);
    assert.equal(mesa.suggestions.length, 1);
    assert.equal(mesa.suggestions[0]!.source, 'computed');
    assert.equal(mesa.divergences.length, 0);
  });

  test('casamento manual gravado: sem score, procedência manual', () => {
    const l = line({ id: 'l-1', amountCents: 150_00 });
    const r = receivable({ id: 'r-1', amountCents: 150_00 });
    const m = match({
      id: 'm-1',
      statementLineId: 'l-1',
      payableId: null,
      receivableId: 'r-1',
      score: null,
      strategy: null,
      origin: 'manual',
      status: 'suggested',
    });
    const mesa = composeMesa([l], [m], [], SETTINGS, [r]);
    assert.equal(mesa.suggestions.length, 1);
    assert.equal(mesa.suggestions[0]!.matchOrigin, 'manual');
    assert.equal(mesa.suggestions[0]!.suggestion.strategy, 'manual');
  });
});
