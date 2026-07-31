import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { validateNewEntry, computeBalance, canConsume, summarizeBySubscription } from './creditbalance.ts';
import type { CreditEntry } from './types.ts';

const ASSIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FONTE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0099_creditbalance.sql');
const migrationCode = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

function lancamento(over: Partial<CreditEntry> = {}): CreditEntry {
  return {
    id: 'm1',
    creditType: 'generated',
    quantityKwh: 100,
    subscriptionId: ASSIN,
    subscriptionName: 'UC 1',
    reason: '',
    ...over,
  };
}

describe('validateNewEntry — o registro de um lançamento de crédito', () => {
  test('um generated bom passa, nasce com id vazio (o servidor carimba quem/quando)', () => {
    const r = validateNewEntry({
      creditType: 'generated',
      quantityKwh: 120.5,
      subscriptionId: `  ${ASSIN}  `,
      subscriptionName: '  UC 1  ',
      reason: '  geração de julho  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.creditType, 'generated');
      assert.equal(r.value.quantityKwh, 120.5); // ⭐ kWh admite fração (o DIVERGE do loyalty)
      assert.equal(r.value.subscriptionId, ASSIN); // trim
      assert.equal(r.value.subscriptionName, 'UC 1');
      assert.equal(r.value.reason, 'geração de julho');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ um consumed com assinatura ausente (balcão geral do tenant) passa — subscriptionId null', () => {
    const r = validateNewEntry({ creditType: 'consumed', quantityKwh: 50 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.creditType, 'consumed');
      assert.equal(r.value.quantityKwh, 50);
      assert.equal(r.value.subscriptionId, null); // ⭐ a assinatura é OPCIONAL
      assert.equal(r.value.subscriptionName, '');
      assert.equal(r.value.reason, '');
    }
  });

  test('⭐ o credit_type inválido é recusado (só generated/consumed)', () => {
    for (const creditType of [undefined, null, '', 'earn', 'gen', 'GENERATED', 42]) {
      const r = validateNewEntry({ creditType, quantityKwh: 10 });
      assert.equal(r.ok, false, `creditType=${String(creditType)} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'creditType'));
    }
  });

  test('⭐⭐ quantityKwh <= 0 é recusado (zero é linha muda; negativo não existe — o sinal é o tipo)', () => {
    for (const quantityKwh of [0, -1, -100.5]) {
      const r = validateNewEntry({ creditType: 'generated', quantityKwh });
      assert.equal(r.ok, false, `quantityKwh=${quantityKwh} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'quantityKwh'));
    }
  });

  test('⭐ quantityKwh NÃO precisa ser inteiro (é kWh — o DIVERGE do loyalty)', () => {
    for (const quantityKwh of [1.5, 99.9, 0.25]) {
      const r = validateNewEntry({ creditType: 'generated', quantityKwh });
      assert.equal(r.ok, true, `quantityKwh=${quantityKwh} deveria passar (fração é leitura real)`);
    }
  });

  test('quantityKwh inválida (não número, NaN, Infinity, ausente) é recusada', () => {
    for (const quantityKwh of [undefined, 'muito', Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = validateNewEntry({ creditType: 'generated', quantityKwh });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'quantityKwh'));
    }
  });
});

describe('computeBalance — Σ(generated) − Σ(consumed)', () => {
  test('generated soma, consumed subtrai; livro vazio dá zero', () => {
    assert.equal(computeBalance([]), 0);
    const livro = [
      lancamento({ id: 'a', creditType: 'generated', quantityKwh: 100 }),
      lancamento({ id: 'b', creditType: 'generated', quantityKwh: 50 }),
      lancamento({ id: 'c', creditType: 'consumed', quantityKwh: 30 }),
    ];
    assert.equal(computeBalance(livro), 120);
  });
});

describe('⭐⭐ canConsume — a TERCEIRA resposta: consumir mais que o saldo é recusado', () => {
  const livro = [
    lancamento({ id: 'a', creditType: 'generated', quantityKwh: 100 }),
    lancamento({ id: 'b', creditType: 'consumed', quantityKwh: 40 }),
  ]; // saldo = 60

  test('true quando o consumo cabe no saldo (inclusive o saldo cheio)', () => {
    assert.equal(canConsume(livro, 60), true);
    assert.equal(canConsume(livro, 1), true);
  });

  test('false quando o consumo passa do saldo', () => {
    assert.equal(canConsume(livro, 61), false);
    assert.equal(canConsume([], 1), false);
  });

  test('false para consumo <= 0 ou inválido', () => {
    assert.equal(canConsume(livro, 0), false);
    assert.equal(canConsume(livro, -10), false);
    assert.equal(canConsume(livro, Number.NaN), false);
  });
});

describe('summarizeBySubscription — o saldo por assinatura (espelho da VIEW)', () => {
  test('agrupa e conta generated/consumed por assinatura, com o balcão geral (null)', () => {
    const OUTRA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const livro = [
      lancamento({ id: 'a', subscriptionId: ASSIN, creditType: 'generated', quantityKwh: 100 }),
      lancamento({ id: 'b', subscriptionId: ASSIN, creditType: 'consumed', quantityKwh: 30 }),
      lancamento({ id: 'c', subscriptionId: OUTRA, creditType: 'generated', quantityKwh: 5 }),
      lancamento({ id: 'd', subscriptionId: null, creditType: 'generated', quantityKwh: 7 }),
    ];
    assert.deepEqual(summarizeBySubscription(livro), [
      { subscriptionId: ASSIN, balanceKwh: 70, generatedCount: 1, consumedCount: 1 },
      { subscriptionId: OUTRA, balanceKwh: 5, generatedCount: 1, consumedCount: 0 },
      { subscriptionId: null, balanceKwh: 7, generatedCount: 1, consumedCount: 0 },
    ]);
    assert.deepEqual(summarizeBySubscription([]), []);
  });

  test('⭐ o balcão geral (subscriptionId null) vira uma linha própria', () => {
    const livro = [
      lancamento({ id: 'a', subscriptionId: null, creditType: 'generated', quantityKwh: 40 }),
      lancamento({ id: 'b', subscriptionId: null, creditType: 'consumed', quantityKwh: 15 }),
    ];
    assert.deepEqual(summarizeBySubscription(livro), [
      { subscriptionId: null, balanceKwh: 25, generatedCount: 1, consumedCount: 1 },
    ]);
  });
});

describe('⭐ o schema é livro imutável (lido da migration)', () => {
  test('a migration NÃO declara allowed_transition e NÃO tem coluna status', () => {
    assert.doesNotMatch(migrationCode, /allowed_transition/i);
    assert.doesNotMatch(migrationCode, /status\s+text/i);
    assert.doesNotMatch(migrationCode, /updated_at/i);
  });

  // A origem (FONTE) é só um id solto opcional — sem FK cruzada. Só para deixar
  // a constante em uso e documentar a intenção do dado de origem.
  test('a origem por id solto é aceita sem afetar o saldo', () => {
    const r = validateNewEntry({ creditType: 'generated', quantityKwh: 10, reason: FONTE });
    assert.equal(r.ok, true);
  });
});
