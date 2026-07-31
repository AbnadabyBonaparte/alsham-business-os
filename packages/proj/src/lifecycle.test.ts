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
  canActivate,
  canComplete,
  canCancel,
  canEditContent,
  orderProjects,
  summarizeProjects,
} from './proj.ts';
import type { Project } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0068_proj.sql');
const MIGRATION_DEM = resolve(HERE, '../../../supabase/migrations/0063_dem.sql');

function projeto(over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Projeto',
    description: '',
    status: 'planning',
    completionNote: '',
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

describe('o ciclo de vida do projeto', () => {
  test('o caminho feliz: planning → active → completed', () => {
    assert.equal(canTransition('planning', 'active'), true);
    assert.equal(canTransition('active', 'completed'), true);
  });

  /** ⭐ completed e cancelled são TERMINAIS: o projeto encerrado não reabre. */
  test('⭐ concluído e cancelado não saem de lá', () => {
    for (const fim of ['completed', 'cancelled'] as const) {
      for (const destino of ALL_STATUSES.filter((s) => s !== fim)) {
        assert.equal(canTransition(fim, destino), false, `${fim} → ${destino} não pode existir`);
      }
    }
  });

  test('⛔ planejamento não se conclui: concluir é sobre projeto EM ANDAMENTO', () => {
    assert.equal(canTransition('planning', 'completed'), false);
  });

  test('cancelar existe do planejamento e do andamento', () => {
    assert.equal(canTransition('planning', 'cancelled'), true);
    assert.equal(canTransition('active', 'cancelled'), true);
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
    assert.deepEqual([...nextStatuses('planning')].sort(), ['active', 'cancelled']);
    assert.deepEqual([...nextStatuses('active')].sort(), ['cancelled', 'completed']);
    assert.deepEqual([...nextStatuses('completed')], []);
    assert.deepEqual([...nextStatuses('cancelled')], []);
  });

  test('canActivate, canComplete, canCancel e canEditContent concordam com a tabela', () => {
    assert.equal(canActivate('planning'), true);
    assert.equal(canActivate('active'), false);
    assert.equal(canComplete('active'), true);
    assert.equal(canComplete('planning'), false);
    assert.equal(canCancel('planning'), true);
    assert.equal(canCancel('active'), true);
    assert.equal(canCancel('completed'), false);
    assert.equal(canEditContent('active'), true);
    assert.equal(canEditContent('completed'), false);
  });

  test('a leitura ordena ativos primeiro, depois planejamento, depois os fins', () => {
    const lista = [
      projeto({ id: 'c', name: 'Cancelado', status: 'cancelled', cancelReason: 'x' }),
      projeto({ id: 'a', name: 'Ativo', status: 'active' }),
      projeto({ id: 'p', name: 'Planejando', status: 'planning' }),
      projeto({ id: 'k', name: 'Concluído', status: 'completed' }),
    ];
    assert.deepEqual(
      orderProjects(lista).map((p) => p.id),
      ['a', 'p', 'k', 'c'],
    );
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      projeto({ status: 'planning' }),
      projeto({ status: 'active' }),
      projeto({ status: 'active' }),
      projeto({ status: 'completed' }),
      projeto({ status: 'cancelled', cancelReason: 'x' }),
    ];
    assert.deepEqual(summarizeProjects(lista), {
      total: 5,
      planning: 1,
      active: 2,
      completed: 1,
      cancelled: 1,
    });
    assert.deepEqual(summarizeProjects([]), {
      total: 0,
      planning: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
    });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('proj.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'proj.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 4, 'o SQL declara quatro pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O reaproveitamento do `dem`/`bud` assinado: os dois têm fins TERMINAIS
   * que não reabrem. Se alguém der uma volta a um projeto encerrado (ou ao
   * plano publicado do `dem`), este teste reprova.
   */
  test('⭐ nem o projeto encerrado nem o plano publicado reabrem', () => {
    const doProj = paresDoSql(MIGRATION, 'proj.allowed_transition');
    const doDem = paresDoSql(MIGRATION_DEM, 'dem.allowed_transition');

    for (const par of doProj) {
      const [de] = par.split('→');
      assert.ok(
        !['completed', 'cancelled'].includes(de!),
        `o projeto ganhou uma volta (${par}) — o encerrado não reabre`,
      );
    }
    for (const par of doDem) {
      const [de] = par.split('→');
      assert.ok(
        !['published', 'cancelled'].includes(de!),
        `o plano ganhou uma volta (${par}) — o publicado é terminal`,
      );
    }
  });
});
