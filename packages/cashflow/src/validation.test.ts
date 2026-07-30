import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  balancesByCurrency,
  monthlyFlow,
  summarizeEntries,
  totalsByCategory,
  validateNewCategory,
  validateNewEntry,
} from './cashflow.ts';
import type { Entry } from './types.ts';

function lancamento(over: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    kind: 'in',
    amountCents: 10000,
    currency: 'BRL',
    description: '',
    reason: '',
    categoryId: null,
    account: null,
    externalRef: null,
    occurredOn: '2026-07-15',
    ...over,
  };
}

describe('⭐ o saldo é SOMA do livro — por moeda, sem misturar', () => {
  test('entradas, saídas e ajustes somam com o sinal do tipo', () => {
    const saldos = balancesByCurrency([
      lancamento({ kind: 'in', amountCents: 10000 }),
      lancamento({ id: 'e2', kind: 'out', amountCents: 3000 }),
      lancamento({ id: 'e3', kind: 'adjustment', amountCents: -500, reason: 'quebra de caixa' }),
      lancamento({ id: 'e4', kind: 'in', amountCents: 200, currency: 'USD' }),
    ]);
    assert.equal(saldos.length, 2);
    const brl = saldos.find((s) => s.currency === 'BRL')!;
    assert.equal(brl.balanceCents, 6500);
    assert.equal(brl.inflowCents, 10000);
    assert.equal(brl.outflowCents, 3500);
    const usd = saldos.find((s) => s.currency === 'USD')!;
    assert.equal(usd.balanceCents, 200);
  });

  test('livro vazio: nenhum saldo — não um zero inventado', () => {
    assert.deepEqual(balancesByCurrency([]), []);
  });
});

describe('a visão por categoria — e o "sem categoria" honesto', () => {
  test('agrupa por categoria e moeda; o nulo aparece', () => {
    const totais = totalsByCategory(
      [
        lancamento({ categoryId: 'c1', kind: 'out', amountCents: 5000 }),
        lancamento({ id: 'e2', categoryId: 'c1', kind: 'out', amountCents: 2000 }),
        lancamento({ id: 'e3', categoryId: null, kind: 'in', amountCents: 1000 }),
      ],
      [{ id: 'c1', name: 'aluguel', status: 'active' }],
    );
    const aluguel = totais.find((t) => t.categoryId === 'c1')!;
    assert.equal(aluguel.categoryName, 'aluguel');
    assert.equal(aluguel.netCents, -7000);
    const sem = totais.find((t) => t.categoryId === null)!;
    assert.equal(sem.categoryName, null);
    assert.equal(sem.netCents, 1000);
  });
});

describe('o fluxo por mês', () => {
  test('agrupa por AAAA-MM e moeda, mais recente primeiro', () => {
    const fluxo = monthlyFlow([
      lancamento({ occurredOn: '2026-06-10', kind: 'in', amountCents: 1000 }),
      lancamento({ id: 'e2', occurredOn: '2026-07-01', kind: 'out', amountCents: 400 }),
      lancamento({ id: 'e3', occurredOn: '2026-07-20', kind: 'in', amountCents: 900 }),
    ]);
    assert.equal(fluxo.length, 2);
    assert.equal(fluxo[0]!.month, '2026-07');
    assert.equal(fluxo[0]!.netCents, 500);
    assert.equal(fluxo[1]!.month, '2026-06');
  });
});

describe('validateNewEntry', () => {
  const HOJE = '2026-07-30';

  test('o mínimo honesto: tipo, valor, moeda', () => {
    const r = validateNewEntry({ kind: 'in', amountCents: 5000, currency: 'brl' }, HOJE);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.currency, 'BRL');
      assert.equal(r.value.occurredOn, HOJE);
    }
  });

  test('⭐ o FUTURO é recusado — previsão é Orçamento, não caixa', () => {
    const r = validateNewEntry(
      { kind: 'in', amountCents: 5000, currency: 'BRL', occurredOn: '2026-08-01' },
      HOJE,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.problems.some((p) => p.message.includes('previsão')));
    }
  });

  test('o passado entra — o registro chega depois do fato', () => {
    const r = validateNewEntry(
      { kind: 'out', amountCents: 100, currency: 'BRL', occurredOn: '2026-01-05' },
      HOJE,
    );
    assert.equal(r.ok, true);
  });

  test('⛔ entrada/saída negativas são recusadas — o sinal é do tipo', () => {
    const r = validateNewEntry({ kind: 'out', amountCents: -100, currency: 'BRL' }, HOJE);
    assert.equal(r.ok, false);
  });

  test('⛔ ajuste sem razão é a linha muda', () => {
    const r = validateNewEntry({ kind: 'adjustment', amountCents: -300, currency: 'BRL' }, HOJE);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.problems.some((p) => p.field === 'reason'));
    }
  });

  test('ajuste negativo COM razão passa — contagem que achou menos existe', () => {
    const r = validateNewEntry(
      { kind: 'adjustment', amountCents: -300, currency: 'BRL', reason: 'diferença de caixa' },
      HOJE,
    );
    assert.equal(r.ok, true);
  });

  test('⛔ ajuste de zero não ajusta nada', () => {
    const r = validateNewEntry(
      { kind: 'adjustment', amountCents: 0, currency: 'BRL', reason: 'x' },
      HOJE,
    );
    assert.equal(r.ok, false);
  });
});

describe('validateNewCategory e o resumo', () => {
  test('nome obrigatório, tamanho honesto', () => {
    assert.equal(validateNewCategory('  ').ok, false);
    assert.equal(validateNewCategory('aluguel').ok, true);
    assert.equal(validateNewCategory('x'.repeat(81)).ok, false);
  });

  test('o resumo conta sem categoria e ajustes', () => {
    const s = summarizeEntries([
      lancamento(),
      lancamento({ id: 'e2', categoryId: 'c1' }),
      lancamento({ id: 'e3', kind: 'adjustment', amountCents: -1, reason: 'r' }),
    ]);
    assert.deepEqual(s, { total: 3, uncategorized: 2, adjustments: 1 });
  });
});
