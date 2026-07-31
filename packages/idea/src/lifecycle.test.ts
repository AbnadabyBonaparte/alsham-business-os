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
  canPromote,
  canArchive,
  canRestore,
  canMove,
  orderStages,
  loadByStage,
  summarizeIdeas,
} from './idea.ts';
import type { Idea, IdeaStage } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0083_idea.sql');
const MIGRATION_KANBAN = resolve(HERE, '../../../supabase/migrations/0070_kanban.sql');

const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, '');

function ideia(over: Partial<Idea> = {}): Idea {
  return {
    id: 'i1',
    title: 'Ideia',
    description: '',
    currentStageId: 's1',
    status: 'active',
    promotedProjectId: null,
    promotedProjectName: '',
    ...over,
  };
}

function paresDoSql(caminho: string, fn: string): Set<string> {
  const texto = readFileSync(caminho, 'utf8');
  const corpo = texto.split(`create or replace function ${fn}`)[1];
  assert.ok(corpo !== undefined, `${fn} não encontrada em ${caminho}`);
  const bloco = corpo.split('$$;')[0] ?? '';
  const semComentario = bloco.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  const pares = new Set<string>();
  for (const m of semComentario.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) {
    pares.add(`${m[1]}→${m[2]}`);
  }
  return pares;
}

describe('o ciclo de vida da ideia', () => {
  test('o caminho: active → promoted (virou projeto) / active → archived (descartada)', () => {
    assert.equal(canTransition('active', 'promoted'), true);
    assert.equal(canTransition('active', 'archived'), true);
  });

  test('⭐⭐ promoted é TERMINAL — a ideia que virou projeto não volta', () => {
    for (const destino of ALL_STATUSES.filter((s) => s !== 'promoted')) {
      assert.equal(canTransition('promoted', destino), false, `promoted → ${destino} não pode existir`);
    }
  });

  test('⭐ archived ↔ active é REVERSÍVEL (a gaveta que volta é a MESMA ideia)', () => {
    assert.equal(canTransition('archived', 'active'), true);
    // mas não pode saltar de archived direto para promoted.
    assert.equal(canTransition('archived', 'promoted'), false);
  });

  test('⭐ a matriz N×N: canTransition concorda com a tabela', () => {
    const permitidos = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    for (const de of ALL_STATUSES) {
      for (const para of ALL_STATUSES) {
        const esperado = de === para || permitidos.has(`${de}→${para}`);
        assert.equal(canTransition(de, para), esperado, `${de} → ${para}`);
      }
    }
  });

  test('nextStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextStatuses('active')].sort(), ['archived', 'promoted']);
    assert.deepEqual([...nextStatuses('archived')], ['active']);
    assert.deepEqual([...nextStatuses('promoted')], []);
  });

  test('canPromote/canArchive/canRestore/canMove concordam com a tabela', () => {
    assert.equal(canPromote('active'), true);
    assert.equal(canPromote('archived'), false);
    assert.equal(canArchive('active'), true);
    assert.equal(canRestore('archived'), true);
    assert.equal(canRestore('active'), false);
    // ⭐ mover só enquanto ativa.
    assert.equal(canMove('active'), true);
    assert.equal(canMove('promoted'), false);
    assert.equal(canMove('archived'), false);
  });

  test('⭐ a tabela de transições é a MESMA nos dois lados (SQL × TS)', () => {
    const doSql = paresDoSql(MIGRATION, 'idea.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 3, 'o SQL declara três pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐⭐ o DIVERGE assinado: idea × kanban — a ideia existe ANTES do projeto', () => {
  const kanban = readFileSync(MIGRATION_KANBAN, 'utf8').replace(/--[^\n]*/g, '');

  test('o kanban EXIGE project_id (a coluna E o cartão pertencem a um projeto)', () => {
    assert.match(kanban, /project_id\s+uuid\s+not null/i);
  });

  test('⭐⭐ o idea NÃO tem project_id em lugar nenhum — o oposto de propósito', () => {
    // Nenhuma COLUNA `project_id` — o `promoted_project_id` (o elo de destino)
    // é outra coisa, e a prosa do comentário de schema não conta.
    assert.doesNotMatch(code, /^\s*project_id\s+uuid/im);
  });

  test('⭐ o único elo com projeto é o promoted_project_id — o DESTINO, id solto, opcional', () => {
    // existe como coluna...
    assert.match(code, /promoted_project_id\s+uuid/i);
    // ...mas NÃO é not null (é opcional até a promoção)...
    assert.doesNotMatch(code, /promoted_project_id\s+uuid\s+not null/i);
    // ...e não referencia o schema proj (id solto, Lei do Lego).
    assert.doesNotMatch(code, /references\s+proj\./i);
  });
});

describe('a leitura do funil', () => {
  test('orderStages ordena por posição', () => {
    const stages: IdeaStage[] = [
      { id: 'a', name: 'Piloto', position: 2 },
      { id: 'b', name: 'Captação', position: 0 },
      { id: 'c', name: 'Triagem', position: 1 },
    ];
    assert.deepEqual(orderStages(stages).map((s) => s.id), ['b', 'c', 'a']);
  });

  test('⭐ loadByStage conta só as ideias ATIVAS por etapa', () => {
    const ideas = [
      ideia({ id: 'a', currentStageId: 's1', status: 'active' }),
      ideia({ id: 'b', currentStageId: 's1', status: 'active' }),
      ideia({ id: 'c', currentStageId: 's2', status: 'active' }),
      ideia({ id: 'd', currentStageId: 's1', status: 'archived' }),
      ideia({ id: 'e', currentStageId: 's2', status: 'promoted', promotedProjectId: 'p1' }),
    ];
    assert.deepEqual(loadByStage(ideas), [
      { stageId: 's1', count: 2 },
      { stageId: 's2', count: 1 },
    ]);
  });

  test('summarizeIdeas conta por estado — todo número é length', () => {
    const ideas = [
      ideia({ status: 'active' }),
      ideia({ status: 'active' }),
      ideia({ status: 'promoted', promotedProjectId: 'p1' }),
      ideia({ status: 'archived' }),
    ];
    assert.deepEqual(summarizeIdeas(ideas), { total: 4, active: 2, promoted: 1, archived: 1 });
    assert.deepEqual(summarizeIdeas([]), { total: 0, active: 0, promoted: 0, archived: 0 });
  });
});
