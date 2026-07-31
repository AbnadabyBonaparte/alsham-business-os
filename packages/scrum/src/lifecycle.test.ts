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
  canClose,
  canEditContent,
  hasActiveSprint,
  orderSprints,
  summarizeSprints,
} from './scrum.ts';
import type { Sprint } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0073_scrum.sql');
const MIGRATION_PROJ = resolve(HERE, '../../../supabase/migrations/0068_proj.sql');

function sprint(over: Partial<Sprint> = {}): Sprint {
  return {
    id: 's1',
    projectId: 'p1',
    projectName: 'Projeto',
    name: 'Sprint 1',
    goal: '',
    status: 'planned',
    startsOn: '',
    endsOn: '',
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

describe('o ciclo de vida do sprint', () => {
  test('o caminho feliz: planned → active → closed', () => {
    assert.equal(canTransition('planned', 'active'), true);
    assert.equal(canTransition('active', 'closed'), true);
  });

  test('⭐ closed é terminal: não sai de lá', () => {
    for (const destino of ALL_STATUSES.filter((s) => s !== 'closed')) {
      assert.equal(canTransition('closed', destino), false, `closed → ${destino}`);
    }
  });

  test('⛔ planejado não reabre depois de encerrar; ativar só do planejado', () => {
    assert.equal(canActivate('planned'), true);
    assert.equal(canActivate('active'), false);
    assert.equal(canActivate('closed'), false);
  });

  test('encerrar existe do planejado e do ativo', () => {
    assert.equal(canClose('planned'), true);
    assert.equal(canClose('active'), true);
    assert.equal(canClose('closed'), false);
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
    assert.deepEqual([...nextStatuses('planned')].sort(), ['active', 'closed']);
    assert.deepEqual([...nextStatuses('active')], ['closed']);
    assert.deepEqual([...nextStatuses('closed')], []);
  });

  test('canEditContent: o encerrado não se edita', () => {
    assert.equal(canEditContent('planned'), true);
    assert.equal(canEditContent('active'), true);
    assert.equal(canEditContent('closed'), false);
  });

  test('⭐ hasActiveSprint: o helper de leitura da regra "um ativo por projeto"', () => {
    const lista = [
      sprint({ id: 'a', projectId: 'X', status: 'active' }),
      sprint({ id: 'b', projectId: 'Y', status: 'planned' }),
    ];
    assert.equal(hasActiveSprint(lista, 'X'), true);
    assert.equal(hasActiveSprint(lista, 'Y'), false);
    assert.equal(hasActiveSprint(lista, 'Z'), false);
  });

  test('a leitura ordena ativos primeiro, depois planejados, depois encerrados', () => {
    const lista = [
      sprint({ id: 'c', name: 'C', status: 'closed' }),
      sprint({ id: 'a', name: 'A', status: 'active' }),
      sprint({ id: 'p', name: 'P', status: 'planned' }),
    ];
    assert.deepEqual(orderSprints(lista).map((s) => s.id), ['a', 'p', 'c']);
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      sprint({ status: 'planned' }),
      sprint({ status: 'active' }),
      sprint({ status: 'closed' }),
      sprint({ status: 'closed' }),
    ];
    assert.deepEqual(summarizeSprints(lista), { total: 4, planned: 1, active: 1, closed: 2 });
    assert.deepEqual(summarizeSprints([]), { total: 0, planned: 0, active: 0, closed: 0 });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('scrum.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'scrum.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 3, 'o SQL declara três pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O reaproveitamento do `proj`/`bud` assinado: os dois têm um fim TERMINAL
   * que não reabre. Se alguém der uma volta ao sprint encerrado (ou reabrir o
   * projeto concluído), este teste reprova.
   */
  test('⭐ nem o sprint fechado nem o projeto encerrado reabrem', () => {
    const doScrum = paresDoSql(MIGRATION, 'scrum.allowed_transition');
    const doProj = paresDoSql(MIGRATION_PROJ, 'proj.allowed_transition');
    for (const par of doScrum) {
      const [de] = par.split('→');
      assert.ok(de !== 'closed', `o sprint ganhou uma volta (${par}) — closed é terminal`);
    }
    for (const par of doProj) {
      const [de] = par.split('→');
      assert.ok(
        !['completed', 'cancelled'].includes(de!),
        `o projeto ganhou uma volta (${par}) — o encerrado não reabre`,
      );
    }
  });

  /**
   * ⭐⭐ A regra "um sprint ativo por projeto" mora numa CONSTRAINT do banco,
   * não em código de aplicação — a lição do `spc`/`shift`. Este teste confere
   * que o índice único parcial existe na migration.
   */
  test('⭐⭐ o índice único parcial "um active por projeto" existe na migration', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.match(
      sql,
      /create\s+unique\s+index[\s\S]*?on\s+scrum\.sprints[\s\S]*?where\s+status\s*=\s*'active'/i,
      'o índice único parcial de "um ativo por projeto" sumiu da migration',
    );
  });
});
