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
  canArchive,
  canRestore,
  orderPlans,
} from './continuity.ts';
import * as continuity from './continuity.ts';
import type { ContinuityPlan } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0095_continuity.sql');
const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, ''); // sem comentários

function plano(over: Partial<ContinuityPlan> = {}): ContinuityPlan {
  return { id: 'p1', name: 'Plano', scope: '', rto: '', rpo: '', status: 'active', ...over };
}

/** Os pares `('a','b')` de uma função `allowed_transition` na migration. */
function paresDoSql(fn: string): Set<string> {
  const corpo = sql.split(`create or replace function ${fn}`)[1];
  assert.ok(corpo !== undefined, `${fn} não encontrada na migration`);
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

describe('o ciclo de vida do PLANO: active ↔ archived (a física do vendor)', () => {
  test('o caminho feliz: arquiva e reabre', () => {
    assert.equal(canTransition('active', 'archived'), true);
    assert.equal(canTransition('archived', 'active'), true);
    assert.equal(canArchive('active'), true);
    assert.equal(canRestore('archived'), true);
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
    assert.deepEqual([...nextStatuses('active')], ['archived']);
    assert.deepEqual([...nextStatuses('archived')], ['active']);
  });

  test('a leitura ordena ativos primeiro, depois por nome', () => {
    const lista = [
      plano({ id: 'z', name: 'Zeta', status: 'active' }),
      plano({ id: 'a', name: 'Alfa', status: 'archived' }),
      plano({ id: 'b', name: 'Beta', status: 'active' }),
    ];
    assert.deepEqual(
      orderPlans(lista).map((p) => p.id),
      ['b', 'z', 'a'],
    );
  });

  test('⭐ continuity.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql('continuity.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐⭐ o DRILL é LANÇAMENTO IMUTÁVEL — a física do timesheet, não a do plano', () => {
  test('o motor NÃO exporta transição para o drill: só o PLANO tem ciclo', () => {
    // Não há status de drill, nem transição de drill — a ausência é a lei.
    assert.equal((continuity as Record<string, unknown>)['DRILL_TRANSITIONS'], undefined);
    assert.equal((continuity as Record<string, unknown>)['canTransitionDrill'], undefined);
  });

  test('⭐ a migration dá ciclo ao PLANO (allowed_transition) mas NÃO ao drill', () => {
    // O plano tem a função de transição...
    assert.match(code, /create\s+or\s+replace\s+function\s+continuity\.allowed_transition/i);
    // ...e a tabela de drills NÃO tem coluna de status nem transição própria.
    const drills = code.split(/create\s+table\s+continuity\.drills/i)[1]?.split('create table')[0] ?? '';
    assert.doesNotMatch(drills, /\bstatus\s+text/i);
    assert.doesNotMatch(code, /allowed_transition_drill/i);
  });

  test('⭐ o drill é imutável nas DUAS camadas: sem grant de reescrita ao cliente + gatilho que RAISE', () => {
    // CAMADA 1: só select, insert no livro.
    assert.match(sql, /grant\s+select,\s*insert\s+on\s+continuity\.drills\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+update\s+on\s+continuity\.drills/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+delete\s+on\s+continuity\.drills/i);
    // CAMADA 2: o gatilho recusa até para o dono, com fato consumado.
    assert.match(code, /before\s+update\s+or\s+delete\s+on\s+continuity\.drills/i);
    const corpo = sql.split('guard_drill_immutable')[1] ?? '';
    assert.match(corpo, /fato consumado/);
  });

  test('⭐ O RECORTE assinado: o DOCUMENTO detalhado do plano é o pol (FORA); os DRILLS justificam o módulo', () => {
    // O cabeçalho da migration declara o recorte: o documento é o pol.
    assert.match(sql, /pol/);
    assert.match(sql, /FORA/);
    // E o que este módulo guarda de verdade é a tabela de drills — a prova.
    assert.match(code, /create\s+table\s+continuity\.drills/i);
    // O contraste de físicas mora aqui: o plano MUDA de estado (tem gatilho de
    // transição); o drill NÃO muda nada (tem gatilho de imutabilidade).
    assert.match(code, /continuity\.guard_plan_transition/i);
    assert.match(code, /continuity\.guard_drill_immutable/i);
  });
});
