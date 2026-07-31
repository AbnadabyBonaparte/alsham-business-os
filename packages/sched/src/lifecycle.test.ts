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
  canComplete,
  canReopen,
  canCancel,
  orderMilestones,
  summarizeMilestones,
} from './sched.ts';
import type { Milestone } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0069_sched.sql');
const MIGRATION_DEM = resolve(HERE, '../../../supabase/migrations/0063_dem.sql');

function marco(over: Partial<Milestone> = {}): Milestone {
  return {
    id: 'm1',
    projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    projectName: 'Projeto',
    title: 'Marco',
    dueOn: null,
    status: 'planned',
    cancelReason: '',
    ...over,
  };
}

/** Os pares `('a','b')` de uma função `allowed_transition` na migration. */
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

describe('o ciclo de vida do marco', () => {
  test('o caminho feliz: planned → done', () => {
    assert.equal(canTransition('planned', 'done'), true);
  });

  /** ⭐ O REABRIR: done → planned existe (a física do ops; o DIVERGE do dem/bud). */
  test('⭐ o concluído REABRE: done → planned é permitido', () => {
    assert.equal(canTransition('done', 'planned'), true);
    assert.equal(canReopen('done'), true);
    assert.equal(canReopen('planned'), false);
    assert.equal(canReopen('cancelled'), false);
  });

  /** ⭐ cancelled é TERMINAL: o abandonado não volta de lugar nenhum. */
  test('⭐ cancelado não sai de lá — é terminal', () => {
    for (const destino of ALL_STATUSES.filter((s) => s !== 'cancelled')) {
      assert.equal(canTransition('cancelled', destino), false, `cancelled → ${destino} não pode existir`);
    }
  });

  test('cancelar existe do planejamento e da conclusão, nunca do cancelado', () => {
    assert.equal(canCancel('planned'), true);
    assert.equal(canCancel('done'), true);
    assert.equal(canCancel('cancelled'), false);
  });

  test('concluir só existe para o marco planejado', () => {
    assert.equal(canComplete('planned'), true);
    assert.equal(canComplete('done'), false);
    assert.equal(canComplete('cancelled'), false);
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
    assert.deepEqual([...nextStatuses('planned')].sort(), ['cancelled', 'done']);
    assert.deepEqual([...nextStatuses('done')].sort(), ['cancelled', 'planned']);
    assert.deepEqual([...nextStatuses('cancelled')], []);
  });

  test('a leitura ordena planejados primeiro, por data prevista (sem data ao fim)', () => {
    const lista = [
      marco({ id: 'c', title: 'Cancelado', status: 'cancelled', cancelReason: 'x' }),
      marco({ id: 'd', title: 'Concluído', status: 'done' }),
      marco({ id: 'sem', title: 'Sem data', status: 'planned', dueOn: null }),
      marco({ id: 'jan', title: 'Janeiro', status: 'planned', dueOn: '2027-01-10' }),
      marco({ id: 'fev', title: 'Fevereiro', status: 'planned', dueOn: '2027-02-01' }),
    ];
    assert.deepEqual(
      orderMilestones(lista).map((m) => m.id),
      ['jan', 'fev', 'sem', 'd', 'c'],
    );
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      marco({ status: 'planned' }),
      marco({ status: 'done' }),
      marco({ status: 'done' }),
      marco({ status: 'cancelled', cancelReason: 'x' }),
    ];
    assert.deepEqual(summarizeMilestones(lista), {
      total: 4,
      planned: 1,
      done: 2,
      cancelled: 1,
    });
    assert.deepEqual(summarizeMilestones([]), {
      total: 0,
      planned: 0,
      done: 0,
      cancelled: 0,
    });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('sched.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'sched.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 4, 'o SQL declara quatro pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐⭐ O DIVERGE ASSINADO sched × dem: os dois têm um "fim natural" (o marco
   * concluído; o plano publicado), mas se comportam de modo OPOSTO — e a
   * divergência é a decisão de canon, não um acidente.
   *
   *   - O `sched` TEM `done → planned`: um marco concluído por engano é correção
   *     de rota rotineira num projeto (a física do `ops`).
   *   - O `dem` NÃO tem transição alguma a partir de `published`: um plano
   *     publicado é um fato de planejamento fechado (a física do `bud`).
   *
   * Se alguém apagar o reabrir do `sched` (por "consistência" com o dem) OU der
   * uma volta ao `published` do dem, este teste reprova.
   */
  test('⭐⭐ o sched REABRE o done; o dem NÃO reabre o published — o DIVERGE assinado', () => {
    const doSched = paresDoSql(MIGRATION, 'sched.allowed_transition');
    const doDem = paresDoSql(MIGRATION_DEM, 'dem.allowed_transition');

    // O sched REABRE: done → planned existe.
    assert.ok(
      doSched.has('done→planned'),
      'o sched perdeu o reabrir (done→planned) — o marco concluído por engano precisa voltar',
    );

    // O dem NÃO reabre: nenhuma transição sai de published.
    for (const par of doDem) {
      const [de] = par.split('→');
      assert.ok(
        !['published', 'cancelled'].includes(de!),
        `o dem ganhou uma volta (${par}) — o publicado é terminal (o DIVERGE)`,
      );
    }

    // E o cancelado do sched continua terminal — o reabrir é SÓ do done.
    for (const par of doSched) {
      const [de] = par.split('→');
      assert.notEqual(de, 'cancelled', `o cancelado do sched ganhou uma volta (${par}) — deve ser terminal`);
    }
  });
});
