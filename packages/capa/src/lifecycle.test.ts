import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  ALL_STATUSES,
  canTransition,
  nextStatuses,
  canVerify,
  canClose,
  orderActions,
  summarizeActions,
} from './capa.ts';
import type { Action } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0080_capa.sql');

function action(over: Partial<Action> = {}): Action {
  return {
    id: 'a1',
    actionType: 'corrective',
    description: 'Ação',
    responsible: 'Fulano',
    dueDate: null,
    ncEntryId: null,
    status: 'open',
    verificationNote: '',
    ...over,
  };
}

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

describe('o ciclo de vida da ação', () => {
  test('o caminho: open → verified → closed', () => {
    assert.equal(canTransition('open', 'verified'), true);
    assert.equal(canTransition('verified', 'closed'), true);
  });

  test('⭐ verificar existe do aberto; fechar existe SÓ do verificado', () => {
    assert.equal(canVerify('open'), true);
    assert.equal(canVerify('verified'), false);
    assert.equal(canVerify('closed'), false);
    assert.equal(canClose('verified'), true);
    // ⭐ sem verificação, não fecha — é o que a CAPA não empresta de um marco.
    assert.equal(canClose('open'), false);
    assert.equal(canClose('closed'), false);
  });

  test('⛔ NÃO existe open → closed direto: a verificação é o ponto', () => {
    assert.equal(canTransition('open', 'closed'), false);
  });

  test('⛔ closed é TERMINAL — nada sai dele (a ação que volta é ação nova)', () => {
    assert.deepEqual([...nextStatuses('closed')], []);
    for (const para of ALL_STATUSES) {
      if (para !== 'closed') assert.equal(canTransition('closed', para), false, `closed → ${para}`);
    }
  });

  test('⭐ a matriz N×N: canTransition concorda com a tabela (o mesmo estado é no-op)', () => {
    const permitidos = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    for (const de of ALL_STATUSES) {
      for (const para of ALL_STATUSES) {
        const esperado = de === para || permitidos.has(`${de}→${para}`);
        assert.equal(canTransition(de, para), esperado, `${de} → ${para}`);
      }
    }
  });

  test('nextStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextStatuses('open')], ['verified']);
    assert.deepEqual([...nextStatuses('verified')], ['closed']);
    assert.deepEqual([...nextStatuses('closed')], []);
  });

  test('a leitura ordena abertas, depois verificadas, depois fechadas; dentro, por prazo', () => {
    const lista = [
      action({ id: 'c', status: 'closed', dueDate: '2027-01-01' }),
      action({ id: 'v', status: 'verified', dueDate: '2027-03-01' }),
      action({ id: 'o2', status: 'open', dueDate: '2027-05-01' }),
      action({ id: 'o1', status: 'open', dueDate: '2027-02-01' }),
    ];
    assert.deepEqual(orderActions(lista).map((a) => a.id), ['o1', 'o2', 'v', 'c']);
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      action({ status: 'open' }),
      action({ status: 'verified' }),
      action({ status: 'closed' }),
      action({ status: 'closed' }),
    ];
    assert.deepEqual(summarizeActions(lista), { total: 4, open: 1, verified: 1, closed: 2 });
    assert.deepEqual(summarizeActions([]), { total: 0, open: 0, verified: 0, closed: 0 });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('capa.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'capa.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
    assert.deepEqual([...doSql].sort(), ['open→verified', 'verified→closed']);
  });

  /**
   * ⭐ O ponto do módulo: a VERIFICAÇÃO é o que diferencia a CAPA de um marco de
   * cronograma (`sched.milestone`), que só é "feito". O SQL não tem o par
   * `open → closed` — sem passar por `verified`, não fecha. Este teste prova o
   * contraste lendo a migration e conferindo o motor.
   */
  test('⭐ o SQL NÃO tem open → closed direto — sem verificação, não fecha', () => {
    const doSql = paresDoSql(MIGRATION, 'capa.allowed_transition');
    assert.ok(!doSql.has('open→closed'), 'apareceu um atalho open → closed no SQL');
    assert.ok(doSql.has('open→verified'), 'a verificação sumiu do SQL');
    assert.ok(doSql.has('verified→closed'), 'o fechamento após a verificação sumiu do SQL');
    // e o motor concorda: fechar do aberto é falso.
    assert.equal(canClose('open'), false);
  });
});
