import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  statusForSettlement,
  canCancel,
  outstandingCents,
  isOverdue,
} from './payable.ts';
import type { Payable, PayableStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0007_ap.sql');

const TODOS: readonly PayableStatus[] = ['open', 'partially_settled', 'settled', 'cancelled'];

describe('o ciclo de vida do título', () => {
  test('ficar parado é sempre permitido — não é transição', () => {
    for (const s of TODOS) {
      assert.equal(canTransition(s, s), true, `${s} → ${s} devia ser permitido`);
    }
  });

  test('cancelado é terminal: não sai de lá para lugar nenhum', () => {
    for (const destino of TODOS.filter((s) => s !== 'cancelled')) {
      assert.equal(
        canTransition('cancelled', destino),
        false,
        `cancelado não devia poder virar ${destino}`,
      );
    }
  });

  test('⛔ liquidado NÃO se cancela — estorna primeiro, cancela depois', () => {
    assert.equal(canTransition('settled', 'cancelled'), false);
    // E o caminho honesto existe: estorna e aí sim cancela.
    assert.equal(canTransition('settled', 'open'), true);
    assert.equal(canTransition('open', 'cancelled'), true);
  });

  test('o estorno existe nos dois sentidos — pagamento volta na vida real', () => {
    assert.equal(canTransition('settled', 'partially_settled'), true);
    assert.equal(canTransition('partially_settled', 'open'), true);
  });

  test('canCancel responde só pelo ciclo de vida, e não mente sobre isso', () => {
    assert.equal(canCancel('open'), true);
    assert.equal(canCancel('partially_settled'), true);
    assert.equal(canCancel('settled'), false);
    // Já cancelado não se cancela de novo, mesmo com `canTransition` dizendo
    // que ficar parado é permitido.
    assert.equal(canCancel('cancelled'), false);
  });

  test('nextStatuses devolve o que a tela pode oferecer, em ordem estável', () => {
    assert.deepEqual(nextStatuses('open'), ['partially_settled', 'settled', 'cancelled']);
    assert.deepEqual(nextStatuses('cancelled'), []);
  });
});

/**
 * ⭐ **O TESTE QUE FAZ DA DUPLICAÇÃO UMA ARQUITETURA.**
 *
 * A tabela de transições existe em dois lugares — aqui e em
 * `ap.allowed_transition()`, no `0007_ap.sql` — e existe nos dois de propósito:
 * regra que só vive no TypeScript não protege quem escreve SQL à mão nem o
 * correio; regra que só vive no SQL faz a tela descobrir o "não" depois do
 * round-trip.
 *
 * O que torna isso arquitetura em vez de descuido é este teste. Ele LÊ o
 * arquivo da migration, extrai os pares literais e compara conjunto a conjunto.
 * Se alguém acrescentar `settled → cancelled` num lado só, quebra aqui — antes
 * de o CI chegar no banco, e antes de a divergência virar comportamento.
 */
describe('o schema e o domínio contam a mesma história', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  const paresDoSql = (() => {
    const inicio = sql.indexOf('create or replace function ap.allowed_transition');
    assert.notEqual(inicio, -1, 'a migration não declara ap.allowed_transition');
    const corpo = sql.slice(inicio, sql.indexOf('$$;', inicio));
    // Só as linhas de código: a prosa acima da função também tem setas e nomes
    // de estado, e ela não é a lista.
    const semComentario = corpo.replace(/--[^\n]*/g, '');
    const achados = [...semComentario.matchAll(/\(\s*'(\w+)'\s*,\s*'(\w+)'\s*\)/g)];
    return achados.map(([, de, para]) => `${de}→${para}`);
  })();

  const paresDoDominio = ALLOWED_TRANSITIONS.map(([de, para]) => `${de}→${para}`);

  test('a migration declara a tabela de transições de forma legível', () => {
    assert.ok(paresDoSql.length > 0, 'nenhum par extraído do SQL — o teste ficou cego');
  });

  test('cada transição do domínio existe no schema', () => {
    for (const par of paresDoDominio) {
      assert.ok(paresDoSql.includes(par), `${par} está no TypeScript e não está no SQL`);
    }
  });

  test('cada transição do schema existe no domínio', () => {
    for (const par of paresDoSql) {
      assert.ok(paresDoDominio.includes(par), `${par} está no SQL e não está no TypeScript`);
    }
  });

  test('e são exatamente as mesmas, sem repetição de nenhum lado', () => {
    assert.deepEqual([...paresDoSql].sort(), [...paresDoDominio].sort());
    assert.equal(new Set(paresDoSql).size, paresDoSql.length);
  });
});

describe('o estado que o valor liquidado implica', () => {
  test('nada pago é aberto; tudo pago é liquidado; no meio é parcial', () => {
    assert.equal(statusForSettlement(10_000, 0), 'open');
    assert.equal(statusForSettlement(10_000, 10_000), 'settled');
    assert.equal(statusForSettlement(10_000, 4_000), 'partially_settled');
  });

  test('cancelamento é ato de gente, não consequência de aritmética', () => {
    assert.equal(statusForSettlement(10_000, 0, 'cancelled'), 'cancelled');
    assert.equal(statusForSettlement(10_000, 10_000, 'cancelled'), 'cancelled');
  });

  test('pagar a mais não inventa um quinto estado — continua liquidado', () => {
    // O banco recusa (`payables_no_overpay`); aqui o que importa é não
    // devolver um estado que não existe.
    assert.equal(statusForSettlement(10_000, 12_000), 'settled');
  });
});

const TITULO: Payable = {
  externalRef: 'DOC-1',
  dueDate: '2026-09-10',
  amountCents: 150_000,
  settledAmountCents: 0,
  currency: 'BRL',
  supplierName: 'Fornecedor Alfa',
  counterpartyTaxId: null,
  description: 'serviço prestado',
  paymentMethod: null,
  status: 'open',
};

describe('saldo e atraso', () => {
  test('o saldo devedor é o que falta', () => {
    assert.equal(outstandingCents({ ...TITULO, settledAmountCents: 50_000 }), 100_000);
  });

  test('título cancelado não deve nada — não se deve o que não vale', () => {
    assert.equal(outstandingCents({ ...TITULO, status: 'cancelled' }), 0);
  });

  test('o relógio vem de fora: a função é pura e o teste não envelhece', () => {
    assert.equal(isOverdue(TITULO, '2026-09-11'), true);
    assert.equal(isOverdue(TITULO, '2026-09-10'), false, 'vencer hoje não é estar vencido');
    assert.equal(isOverdue(TITULO, '2026-01-01'), false);
  });

  test('liquidado e cancelado não atrasam', () => {
    assert.equal(isOverdue({ ...TITULO, status: 'settled' }, '2030-01-01'), false);
    assert.equal(isOverdue({ ...TITULO, status: 'cancelled' }, '2030-01-01'), false);
  });
});
