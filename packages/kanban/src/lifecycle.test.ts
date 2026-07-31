import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as kanban from './kanban.ts';
import { orderStages, orderCards, groupCardsByStage } from './kanban.ts';
import type { Card, Stage } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0070_kanban.sql');
const MIGRATION_OPS = resolve(HERE, '../../../supabase/migrations/0018_ops.sql');

function stage(over: Partial<Stage> = {}): Stage {
  return { id: 's', projectId: 'p1', projectName: 'Obra', name: 'Coluna', position: 0, ...over };
}
function card(over: Partial<Card> = {}): Card {
  return { id: 'c', projectId: 'p1', projectName: 'Obra', stageId: 's', title: 'Tarefa', description: '', ...over };
}

describe('a leitura do quadro — pura apresentação, nenhuma decisão', () => {
  test('orderStages ordena pela posição do tenant (empate pelo nome)', () => {
    const cols = [
      stage({ id: 'c', name: 'Feito', position: 2 }),
      stage({ id: 'a', name: 'A Fazer', position: 0 }),
      stage({ id: 'b', name: 'Fazendo', position: 1 }),
    ];
    assert.deepEqual(orderStages(cols).map((s) => s.id), ['a', 'b', 'c']);
  });

  test('orderCards ordena por título', () => {
    const cards = [card({ id: '2', title: 'Zebra' }), card({ id: '1', title: 'Alfa' })];
    assert.deepEqual(orderCards(cards).map((c) => c.id), ['1', '2']);
  });

  test('⭐ groupCardsByStage monta cada coluna (na ordem do tenant) com seus cartões', () => {
    const cols = [
      stage({ id: 'todo', name: 'A Fazer', position: 0 }),
      stage({ id: 'doing', name: 'Fazendo', position: 1 }),
      stage({ id: 'done', name: 'Feito', position: 2 }),
    ];
    const cards = [
      card({ id: 'x', stageId: 'todo', title: 'X' }),
      card({ id: 'y', stageId: 'done', title: 'Y' }),
      card({ id: 'z', stageId: 'todo', title: 'A' }),
    ];
    const quadro = groupCardsByStage(cols, cards);
    assert.deepEqual(quadro.map((col) => col.stage.id), ['todo', 'doing', 'done']);
    assert.deepEqual(quadro[0]!.cards.map((c) => c.id), ['z', 'x']); // ordenados por título
    assert.deepEqual(quadro[1]!.cards.map((c) => c.id), []); // coluna vazia
    assert.deepEqual(quadro[2]!.cards.map((c) => c.id), ['y']);
  });

  test('cartão numa coluna que não está na lista (redesenho) é ignorado', () => {
    const quadro = groupCardsByStage([stage({ id: 'a' })], [card({ stageId: 'inexistente' })]);
    assert.equal(quadro.length, 1);
    assert.deepEqual(quadro[0]!.cards, []);
  });
});

// =============================================================================
// ⭐⭐ O ARGUMENTO ASSINADO: por que isto NÃO é "instalar o `ops` de novo"
// =============================================================================
describe('⭐⭐ kanban × ops — a MESMA física, TERRITÓRIO diferente (ESCOPO)', () => {
  const mig = readFileSync(MIGRATION, 'utf8');
  const migOps = readFileSync(MIGRATION_OPS, 'utf8');

  test('⭐ o CARTÃO do kanban carrega project_id OBRIGATÓRIO — a assinatura do escopo', () => {
    // O cartão do kanban pertence a um projeto: project_id not null.
    const bloco = mig.slice(mig.indexOf('create table kanban.cards'));
    assert.match(bloco, /project_id\s+uuid\s+not null/, 'kanban.cards deve ter project_id NOT NULL');
    // A validação pura exige projectId no cartão.
    const semProjeto = kanban.validateNewCard({ title: 'T', stageId: 's' });
    assert.equal(semProjeto.ok, false);
    if (!semProjeto.ok) assert.ok(semProjeto.problems.some((p) => p.field === 'projectId'));
  });

  test('⭐ a ORDEM DE SERVIÇO do ops NÃO tem project_id — ela é genérica, solta', () => {
    // Se um dia o ops ganhar project_id, este teste avisa: os dois deixaram de
    // divergir, e "instalar o ops de novo" passaria a ser a mesma coisa.
    const bloco = migOps.slice(migOps.indexOf('create table ops.orders'), migOps.indexOf('create index orders_board_idx'));
    assert.doesNotMatch(bloco, /project_id/, 'a OS do ops não deve ter project_id — ela é genérica');
  });

  test('⭐ o kanban NÃO tem máquina de transição — o cartão anda LIVRE (a liberdade do ops)', () => {
    // Não há ALLOWED_TRANSITIONS no pacote: mover é UPDATE simples do stage_id.
    assert.equal(
      Object.prototype.hasOwnProperty.call(kanban, 'ALLOWED_TRANSITIONS'),
      false,
      'o kanban não deve exportar ALLOWED_TRANSITIONS — o cartão move-se sem gate',
    );
    // E a migration não tem função de transição gated para o cartão.
    assert.doesNotMatch(mig, /allowed_transition/, 'o cartão do kanban não tem porteiro de transição');
  });

  test('⛔ NÃO há enum de etapa nem de status de cartão — a Lei das Etapas (a do ops)', () => {
    assert.doesNotMatch(mig.replace(/--[^\n]*/g, ''), /create\s+type\s+kanban\./i);
    // Sem coluna de status no cartão: "concluído" é uma COLUNA do tenant.
    const bloco = mig.slice(mig.indexOf('create table kanban.cards'), mig.indexOf('create index kanban_cards_board_idx'));
    assert.doesNotMatch(bloco, /\bstatus\b/, 'o cartão do kanban não tem status — a coluna é o estado');
  });
});
