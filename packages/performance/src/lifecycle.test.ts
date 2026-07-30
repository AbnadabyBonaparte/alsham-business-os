import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { CYCLE_TRANSITIONS, canCloseCycle, isCycleTerminal, whyCannotReview } from './performance.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0051_perf.sql');
const MIGRATION_GOAL = resolve(HERE, '../../../supabase/migrations/0038_goal.sql');

describe('⭐ o ciclo — UM par só, e closed é terminal', () => {
  test('open → closed; closed não volta', () => {
    assert.equal(canCloseCycle('open'), true);
    assert.equal(canCloseCycle('closed'), false);
    assert.equal(isCycleTerminal('closed'), true);
    assert.equal(isCycleTerminal('open'), false);
  });

  test('avaliação só em ciclo aberto', () => {
    assert.equal(whyCannotReview({ status: 'open' }), null);
    assert.match(whyCannotReview({ status: 'closed' })!, /fechado/);
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

  test('perf.allowed_transition() e CYCLE_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'perf.allowed_transition');
    const doTs = new Set(CYCLE_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, CYCLE_TRANSITIONS.length, 'o SQL e o TS têm o mesmo número de pares');
    assert.equal(doSql.size, 1, 'perf tem UM par só: open → closed');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐ o contraste goal×perf: a meta é a PRÓPRIA ambição; a avaliação é o JULGAMENTO de outro', () => {
  const goal = readFileSync(MIGRATION_GOAL, 'utf8');
  const goalCode = goal.replace(/--[^\n]*/g, '');
  const perf = readFileSync(MIGRATION, 'utf8');
  const perfCode = perf.replace(/--[^\n]*/g, '');

  test('goal mede a PRÓPRIA ambição — o livro é goal.checkins, reportado por quem persegue o próprio número', () => {
    assert.match(goalCode, /create table goal\.checkins/, 'o goal deixou de ter o livro de check-ins — re-pergunte o contraste');
    assert.match(goalCode, /reported_value\s+numeric/, 'o check-in do goal deixou de reportar um valor — re-pergunte o contraste');
    // O goal não tem dois papéis: quem reporta é o mesmo lado da meta.
    assert.doesNotMatch(goalCode, /reviewer_id|reviewee_id/, 'o goal ganhou vocabulário de avaliador/avaliado — isso é do perf');
  });

  test('perf é o JULGAMENTO de outro — reviewer_id (carimbado) e reviewee_id (id solto) são papéis DISTINTOS', () => {
    assert.match(perfCode, /reviewee_id\s+uuid\s+not null/, 'o avaliado é obrigatório e é ID SOLTO');
    assert.match(perfCode, /reviewer_id\s+uuid\s+references auth\.users/, 'o avaliador falta ou não referencia auth.users');
    assert.match(perfCode, /new\.reviewer_id\s*:=\s*\(select auth\.uid\(\)\)/, 'o avaliador precisa ser carimbado pelo SERVIDOR no insert');
    // Os dois campos nunca podem colapsar num só: são pessoas diferentes.
    assert.notEqual(
      perfCode.includes('reviewee_id'),
      false,
    );
    assert.ok(
      perfCode.includes('reviewee_id') && perfCode.includes('reviewer_id'),
      'perf precisa dos DOIS papéis — avaliado e avaliador — nunca um só',
    );
  });

  test('⭐ a avaliação é IMUTÁVEL (fato consumado) — o goal.checkins também é, mas o goal NÃO julga ninguém', () => {
    assert.match(perfCode, /before update or delete on perf\.reviews/, 'a avaliação deixou de ser imutável — re-pergunte o contraste');
    assert.match(goalCode, /before update or delete on goal\.checkins/, 'o check-in do goal deixou de ser imutável');
    // A diferença não é a imutabilidade (os dois livros são imutáveis) — é
    // QUEM está sendo medido: no goal, o próprio; no perf, um terceiro.
    assert.doesNotMatch(goalCode, /reviewee_name/, 'o goal não tem "avaliado" — quem mede é quem é medido');
  });
});
