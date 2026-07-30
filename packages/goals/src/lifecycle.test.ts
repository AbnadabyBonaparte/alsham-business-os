import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canActivate,
  canCancel,
  canEditTarget,
  canReport,
  canTransition,
  currentValue,
  orderGoals,
  whyCannotCancel,
  whyCannotClose,
  whyCannotReport,
} from './goals.ts';
import type { Goal, GoalCheckin, GoalStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0038_goal.sql');
const MIGRATION_PAT = resolve(HERE, '../../../supabase/migrations/0033_pat.sql');

const TODOS: readonly GoalStatus[] = ['draft', 'active', 'achieved', 'missed', 'cancelled'];

function meta(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'Faturamento do trimestre',
    description: '',
    metric: 'faturamento',
    targetValue: 300000,
    currency: 'BRL',
    startsOn: '2026-07-01',
    endsOn: '2026-09-30',
    assigneeUserId: null,
    status: 'active',
    decidedAt: null,
    cancelReason: '',
    ...over,
  };
}

function checkin(over: Partial<GoalCheckin> = {}): GoalCheckin {
  return {
    id: 'c1',
    seq: 1,
    goalId: 'g1',
    reportedValue: 120000,
    note: 'fechamento de julho',
    reportedAt: '2026-07-31T18:00:00Z',
    ...over,
  };
}

describe('⭐ o ciclo — cinco pares; os três fins terminais', () => {
  test('o rascunho ativa ou morre com razão', () => {
    assert.equal(canActivate('draft'), true);
    assert.equal(canCancel('draft'), true);
  });

  test('a ativa fecha batida, perdida ou cancelada', () => {
    assert.equal(canTransition('active', 'achieved'), true);
    assert.equal(canTransition('active', 'missed'), true);
    assert.equal(canCancel('active'), true);
  });

  test('⭐ os fins são TERMINAIS: a meta do próximo período é meta nova', () => {
    for (const fim of ['achieved', 'missed', 'cancelled'] as const) {
      for (const destino of TODOS.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não existe`);
      }
    }
  });

  test('⭐ a trave congela na ativação: alvo edita-se só no rascunho', () => {
    assert.equal(canEditTarget('draft'), true);
    assert.equal(canEditTarget('active'), false);
  });

  test('⭐ fechar sem check-in é achismo — a recusa tem nome', () => {
    assert.match(whyCannotClose(meta(), 0, 'achieved')!, /achismo/);
    assert.equal(whyCannotClose(meta(), 3, 'achieved'), null);
    assert.equal(whyCannotClose(meta(), 3, 'missed'), null);
    assert.match(whyCannotClose(meta({ status: 'achieved', decidedAt: 'x' }), 3, 'achieved')!, /terminal/);
  });

  test('cancelar exige a razão escrita', () => {
    assert.match(whyCannotCancel(meta(), '')!, /razão/);
    assert.equal(whyCannotCancel(meta(), 'o projeto mudou de rumo'), null);
  });
});

describe('⭐ o progresso é o último check-in — calculado, nunca coluna', () => {
  test('sem check-in, não há progresso — e não se inventa zero', () => {
    assert.equal(currentValue(meta(), []), null);
  });

  test('⭐ vale o ÚLTIMO do livro, pela sequência — nunca por uuid', () => {
    const valor = currentValue(meta(), [
      checkin({ id: 'z', seq: 1, reportedValue: 100000 }),
      checkin({ id: 'a', seq: 2, reportedValue: 180000 }),
    ]);
    assert.equal(valor, 180000);
  });

  test('o livro de outra meta não conta', () => {
    assert.equal(currentValue(meta(), [checkin({ goalId: 'OUTRA' })]), null);
  });

  test('check-in só em meta ativa — rascunho não corre, época fechada não recebe', () => {
    assert.equal(canReport('active'), true);
    assert.match(whyCannotReport(meta({ status: 'draft' }))!, /rascunho/);
    assert.match(whyCannotReport(meta({ status: 'cancelled', decidedAt: 'x', cancelReason: 'y' }))!, /época fechou/);
  });

  test('o quadro na ordem da urgência: ativas que vencem primeiro', () => {
    const ordenado = orderGoals([
      meta({ id: 'hist', status: 'achieved', decidedAt: '2026-06-30T00:00:00Z' }),
      meta({ id: 'longa', endsOn: '2026-12-31' }),
      meta({ id: 'curta', endsOn: '2026-08-15' }),
      meta({ id: 'rascunho', status: 'draft' }),
    ]);
    assert.deepEqual(ordenado.map((g) => g.id), ['curta', 'longa', 'rascunho', 'hist']);
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

  test('goal.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'goal.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 5, 'o SQL declara cinco pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O MANTIDO também se assina: o livro de check-ins herda do pat a
   * ordem por seq identity E a imutabilidade em três camadas — de
   * propósito. Se o pat mudar a física do livro, o goal re-pergunta em
   * vez de herdar em silêncio.
   */
  test('⭐ o contraste pat×goal: os dois livros ordenam por seq e não se rasuram', () => {
    const pat = readFileSync(MIGRATION_PAT, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(pat, /seq\s+bigint\s+generated always as identity/, 'o pat perdeu o seq — re-pergunte');
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /seq\s+bigint\s+generated always as identity/);
    assert.match(sql, /goal_checkins_immutable/);
  });

  test('⭐ o progresso NÃO é coluna — é view calculada; e não há % mágico', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(sql, /progress\s+numeric|current_value\s+numeric/, 'apareceu coluna de progresso');
    assert.match(sql, /create view goal\.goal_progress\s+with \(security_invoker = true\)/);
    assert.doesNotMatch(sql, /percent|pct/i, 'apareceu percentual mágico');
    assert.doesNotMatch(sql, /create\s+type\s+goal\./i);
  });

  test('⭐ moeda declarada exige valor — e o fechamento exige o número na mesa', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /currency is null or target_value is not null/);
    assert.match(sql, /achismo/);
  });
});
