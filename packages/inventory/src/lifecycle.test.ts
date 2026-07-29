import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  canArchive,
  canReactivate,
  signedQuantity,
  balanceFor,
  balanceState,
  buildBalances,
  ledgerFor,
} from './inventory.ts';
import type { InventoryItem, ItemStatus, StockMovement } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0023_inv.sql');
const MIGRATION_CRM = resolve(HERE, '../../../supabase/migrations/0009_crm.sql');
const MIGRATION_AP = resolve(HERE, '../../../supabase/migrations/0007_ap.sql');

const TODOS: readonly ItemStatus[] = ['active', 'archived'];

function item(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'i1',
    tenantId: 't1',
    description: 'Parafuso 8mm',
    unit: 'un',
    sku: null,
    status: 'active',
    ...over,
  };
}

function mov(over: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 'm1',
    itemId: 'i1',
    kind: 'in',
    quantity: 10,
    reason: '',
    externalRef: null,
    location: null,
    occurredAt: '2026-07-20T10:00:00Z',
    ...over,
  };
}

describe('o ciclo de vida do item', () => {
  test('ficar parado não é transição', () => {
    for (const s of TODOS) assert.equal(canTransition(s, s), false);
  });

  /**
   * ⭐ A decisão do Módulo 4, re-perguntada e MANTIDA: o item que volta ao
   * catálogo é o MESMO item, e o livro dele é UM livro. Obrigar um item novo
   * partiria o histórico em dois — e o saldo junto, que aqui é a soma dele.
   */
  test('⭐ arquivado VOLTA: o item que retorna é o mesmo item', () => {
    assert.equal(canTransition('archived', 'active'), true);
    assert.equal(canReactivate('archived'), true);
  });

  test('canArchive e canReactivate concordam com a tabela', () => {
    assert.equal(canArchive('active'), true);
    assert.equal(canArchive('archived'), false);
    assert.equal(canReactivate('active'), false);
  });
});

/**
 * ⭐ **O ESPELHO SQL ↔ TypeScript.** Este teste LÊ a migration e compara par a
 * par: mudar um lado só reprova, nos dois sentidos.
 */
describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  function paresDoSql(caminho: string, fn: string): Set<string> {
    const sql = readFileSync(caminho, 'utf8');
    const corpo = sql.split(`create or replace function ${fn}`)[1];
    assert.ok(corpo !== undefined, `${fn} não encontrada em ${caminho}`);
    const bloco = corpo.split('$$;')[0] ?? '';
    // Comentários fora ANTES de casar — comentário casa com regex de código.
    const semComentario = bloco
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    const pares = new Set<string>();
    for (const m of semComentario.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) {
      pares.add(`${m[1]}→${m[2]}`);
    }
    return pares;
  }

  test('inv.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'inv.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O espelho é CONSCIENTE: o `crm` tem a MESMA volta (`archived→active`),
   * pelo MESMO motivo — identidade que sobrevive ao arquivo. E o `ap` segue
   * SEM ela no seu terminal. Se alguém "uniformizar" qualquer um dos três,
   * este teste reprova e obriga a decisão a ser tomada de novo, por escrito.
   */
  test('⭐ o crm tem a mesma volta; o ap continua sem a dele', () => {
    const doCrm = paresDoSql(MIGRATION_CRM, 'crm.allowed_transition');
    const doInv = paresDoSql(MIGRATION, 'inv.allowed_transition');
    const doAp = paresDoSql(MIGRATION_AP, 'ap.allowed_transition');

    assert.equal(doCrm.has('archived→active'), true, 'a contraparte que volta é a mesma pessoa');
    assert.equal(doInv.has('archived→active'), true, 'e o item que volta é o mesmo item');
    assert.equal(doAp.has('cancelled→open'), false, 'título cancelado não volta — documento é documento');
  });
});

/**
 * ⭐⭐ **A LEI DO MÓDULO, CONFERIDA NO ARQUIVO: o saldo NÃO é coluna.**
 *
 * Se um dia alguém acrescentar `balance`/`quantity_on_hand` a `inv.items`
 * "para performance", o estoque vira um número que esquece como chegou lá —
 * e este teste reprova antes do primeiro UPDATE perdido.
 */
describe('⭐⭐ o saldo é consequência calculada, jamais coluna', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const codigo = sql.replace(/--[^\n]*/g, '');

  test('a tabela de itens não tem coluna de saldo', () => {
    const tabelaItems = codigo.split('create table inv.items')[1]?.split(';')[0] ?? '';
    assert.ok(tabelaItems.length > 0, 'create table inv.items sumiu da migration');
    assert.doesNotMatch(tabelaItems, /balance|on_hand|saldo|quantity/i);
  });

  test('o saldo vem de uma VIEW que soma o livro, com security_invoker', () => {
    assert.match(codigo, /create view inv\.balances\s+with \(security_invoker = true\)/);
    assert.match(codigo, /sum\(m\.signed_quantity\)/);
  });

  test('⭐ e NÃO existe constraint de saldo não-negativo — a decisão de §4.1', () => {
    // O físico já saiu; recusar obrigaria o operador a mentir. Ver 0023 §4.1.
    assert.doesNotMatch(codigo, /no_negative|balance\s*>=\s*0/i);
  });
});

describe('o sinal é do tipo, nunca do operador', () => {
  test('entrada soma, saída subtrai, ajuste carrega o sinal', () => {
    assert.equal(signedQuantity('in', 10), 10);
    assert.equal(signedQuantity('out', 10), -10);
    assert.equal(signedQuantity('adjustment', -3), -3);
    assert.equal(signedQuantity('adjustment', 5), 5);
  });
});

describe('⭐ o saldo negativo é PERMITIDO — e sinalizado', () => {
  test('sair mais do que entrou devolve saldo negativo, não erro', () => {
    const livro = [
      mov({ id: 'a', kind: 'in', quantity: 5 }),
      mov({ id: 'b', kind: 'out', quantity: 8 }),
    ];
    assert.equal(balanceFor(livro, 'i1'), -3);
    assert.equal(balanceState(-3), 'negative');
  });

  test('o ajuste com razão corrige o livro sem apagar nada', () => {
    const livro = [
      mov({ id: 'a', kind: 'in', quantity: 5 }),
      mov({ id: 'b', kind: 'out', quantity: 8 }),
      mov({ id: 'c', kind: 'adjustment', quantity: 3, reason: 'contagem física de 30/07' }),
    ];
    assert.equal(balanceFor(livro, 'i1'), 0);
    assert.equal(livro.length, 3, 'as três linhas continuam no livro');
  });

  test('balanceState separa ok, zero e negativo', () => {
    assert.equal(balanceState(10), 'ok');
    assert.equal(balanceState(0), 'zero');
    assert.equal(balanceState(-1), 'negative');
  });
});

describe('saldo por local — texto livre, sem cadastro', () => {
  const livro = [
    mov({ id: 'a', kind: 'in', quantity: 10, location: 'depósito 1' }),
    mov({ id: 'b', kind: 'in', quantity: 4, location: 'loja centro' }),
    mov({ id: 'c', kind: 'out', quantity: 3, location: 'depósito 1' }),
    mov({ id: 'd', kind: 'in', quantity: 2, location: null }),
  ];

  test('o saldo geral soma tudo; o por local, só o local', () => {
    assert.equal(balanceFor(livro, 'i1'), 13);
    assert.equal(balanceFor(livro, 'i1', 'depósito 1'), 7);
    assert.equal(balanceFor(livro, 'i1', 'loja centro'), 4);
  });

  test('movimento sem local soma no local nulo — o livro não inventa onde', () => {
    assert.equal(balanceFor(livro, 'i1', null), 2);
  });
});

describe('o extrato e a lista', () => {
  test('ledgerFor ordena pelo momento do FÍSICO, mais recente primeiro', () => {
    const livro = [
      mov({ id: 'a', occurredAt: '2026-07-01T00:00:00Z' }),
      mov({ id: 'c', occurredAt: '2026-07-20T00:00:00Z' }),
      // Registrado por último, aconteceu no meio — o livro aceita o passado.
      mov({ id: 'b', occurredAt: '2026-07-10T00:00:00Z' }),
    ];
    assert.deepEqual(ledgerFor(livro, 'i1').map((m) => m.id), ['c', 'b', 'a']);
  });

  test('buildBalances conta movimentos e estado por item', () => {
    const itens = [item({ id: 'i1' }), item({ id: 'i2', description: 'Tinta 18L' })];
    const livro = [
      mov({ id: 'a', itemId: 'i1', kind: 'in', quantity: 2 }),
      mov({ id: 'b', itemId: 'i2', kind: 'out', quantity: 1 }),
    ];
    const b = buildBalances(itens, livro);
    assert.equal(b[0]!.balance, 2);
    assert.equal(b[0]!.state, 'ok');
    assert.equal(b[1]!.balance, -1);
    assert.equal(b[1]!.state, 'negative');
    assert.equal(b[1]!.movementCount, 1);
  });

  test('item sem movimento tem saldo zero, não ausência', () => {
    const b = buildBalances([item()], []);
    assert.equal(b.length, 1);
    assert.equal(b[0]!.balance, 0);
    assert.equal(b[0]!.state, 'zero');
  });
});
