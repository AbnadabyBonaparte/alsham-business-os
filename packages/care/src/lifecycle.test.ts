import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  canReopen,
  canResolve,
  canClose,
  canEditTicket,
  canInteract,
  isOverdue,
  orderTickets,
} from './care.ts';
import type { CarePriority, Ticket, TicketStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0030_care.sql');
const MIGRATION_OPS = resolve(HERE, '../../../supabase/migrations/0018_ops.sql');
const MIGRATION_QUOTE = resolve(HERE, '../../../supabase/migrations/0024_quote.sql');

const TODOS: readonly TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

function caso(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1',
    subject: 'Produto chegou avariado',
    description: '',
    requesterName: 'Solicitante Demo',
    requesterContact: null,
    partyId: null,
    categoryId: null,
    priorityId: null,
    assigneeUserId: null,
    dueAt: null,
    status: 'open',
    resolvedAt: null,
    resolutionNote: '',
    ...over,
  };
}

describe('⭐ a decisão de canon: o caso que volta é o MESMO caso — e fechado é o fim', () => {
  test('⭐ resolved → open EXISTE: reabrir é do mesmo caso', () => {
    assert.equal(canTransition('resolved', 'open'), true);
    assert.equal(canReopen('resolved'), true);
  });

  test('⭐ closed é TERMINAL: quem volta depois é caso novo', () => {
    for (const destino of TODOS.filter((s) => s !== 'closed')) {
      assert.equal(canTransition('closed', destino), false, `closed → ${destino} não pode existir`);
    }
    assert.equal(canReopen('closed'), false);
  });

  test('a fila anda nos dois sentidos: pegar o caso e devolvê-lo à fila', () => {
    assert.equal(canTransition('open', 'in_progress'), true);
    assert.equal(canTransition('in_progress', 'open'), true);
  });

  test('resolver e fechar existem do caso vivo; fechar também de resolved', () => {
    assert.equal(canResolve('open'), true);
    assert.equal(canResolve('in_progress'), true);
    assert.equal(canClose('open'), true);
    assert.equal(canClose('resolved'), true);
    assert.equal(canResolve('resolved'), false);
  });

  test('nextStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextStatuses('resolved')].sort(), ['closed', 'open']);
    assert.deepEqual([...nextStatuses('closed')], []);
  });

  test('caso encerrado congela: não edita; fechado não conversa', () => {
    assert.equal(canEditTicket('open'), true);
    assert.equal(canEditTicket('resolved'), false);
    assert.equal(canInteract('resolved'), true);
    assert.equal(canInteract('closed'), false);
  });
});

describe('o atraso e a ordem da fila são DECISÃO do pacote', () => {
  test('atraso: só caso vivo, com prazo, e prazo vencido', () => {
    const AGORA = '2026-07-30T12:00:00Z';
    assert.equal(isOverdue(caso({ dueAt: '2026-07-29T00:00:00Z' }), AGORA), true);
    assert.equal(isOverdue(caso({ dueAt: '2026-08-01T00:00:00Z' }), AGORA), false);
    assert.equal(isOverdue(caso({ dueAt: null }), AGORA), false);
    assert.equal(
      isOverdue(caso({ status: 'resolved', dueAt: '2026-07-01T00:00:00Z', resolvedAt: AGORA }), AGORA),
      false,
    );
  });

  test('⭐ a fila ordena pela prioridade DO TENANT (posição), depois pelo prazo', () => {
    const prioridades: CarePriority[] = [
      { id: 'p-urgente', name: 'urgente', position: 0, status: 'active' },
      { id: 'p-normal', name: 'normal', position: 1, status: 'active' },
    ];
    const fila = orderTickets(
      [
        caso({ id: 'a', priorityId: 'p-normal' }),
        caso({ id: 'b', priorityId: 'p-urgente', dueAt: '2026-08-02T00:00:00Z' }),
        caso({ id: 'c', priorityId: 'p-urgente', dueAt: '2026-08-01T00:00:00Z' }),
        caso({ id: 'd', priorityId: null }),
      ],
      prioridades,
    );
    assert.deepEqual(
      fila.map((t) => t.id),
      ['c', 'b', 'a', 'd'],
    );
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  function paresDoSql(caminho: string, fn: string): Set<string> {
    const sql = readFileSync(caminho, 'utf8');
    const corpo = sql.split(`create or replace function ${fn}`)[1];
    assert.ok(corpo !== undefined, `${fn} não encontrada em ${caminho}`);
    const bloco = corpo.split('$$;')[0] ?? '';
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

  test('care.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'care.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 8, 'o SQL declara oito pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐⭐ O contraste TRIPLO é EXIGIDO: o `ops` reabre o concluído
   * (`done → in_progress` — trabalho), o `quote` não reabre nada
   * (documento), e o `care` fica NO MEIO de propósito: reabre de
   * `resolved` (o pedido é o mesmo) mas nunca de `closed` (o fim
   * confirmado é fim). Quem "uniformizar" qualquer um dos três reprova
   * aqui e escreve a decisão de novo.
   */
  test('⭐⭐ ops reabre, quote não, care fica no meio — os três de propósito', () => {
    const doOps = paresDoSql(MIGRATION_OPS, 'ops.allowed_transition');
    const doQuote = paresDoSql(MIGRATION_QUOTE, 'quote.allowed_transition');
    const doCare = paresDoSql(MIGRATION, 'care.allowed_transition');

    assert.equal(doOps.has('done→in_progress'), true, 'o ops reabre o trabalho');
    for (const par of doQuote) {
      const [de] = par.split('→');
      assert.ok(!['accepted', 'declined', 'expired', 'cancelled'].includes(de!));
    }
    assert.equal(doCare.has('resolved→open'), true, 'o care reabre o resolvido');
    for (const par of doCare) {
      const [de] = par.split('→');
      assert.ok(de !== 'closed', `o care ganhou volta do fechado (${par}) — fechado é terminal`);
    }
  });
});
