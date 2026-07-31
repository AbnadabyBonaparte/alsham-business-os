import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  ALL_STATUSES,
  TERMINAL_STATUSES,
  canTransition,
  nextStatuses,
  canReview,
  canResolve,
  canDismiss,
  isTerminal,
} from './whistle.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0092_whistle.sql');
const migration = readFileSync(MIGRATION, 'utf8');

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

/** Extrai o corpo de uma função da migration (sem comentários de linha). */
function corpoDaFuncao(fn: string): string {
  const corpo = migration.split(`create or replace function ${fn}`)[1];
  assert.ok(corpo !== undefined, `${fn} não encontrada na migration`);
  return (corpo.split('$$;')[0] ?? '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

describe('o ciclo de vida da denúncia', () => {
  test('o caminho feliz: open → under_review → resolved', () => {
    assert.equal(canTransition('open', 'under_review'), true);
    assert.equal(canTransition('under_review', 'resolved'), true);
  });

  test('arquivar existe de open e de under_review', () => {
    assert.equal(canDismiss('open'), true);
    assert.equal(canDismiss('under_review'), true);
    assert.equal(canDismiss('resolved'), false);
    assert.equal(canDismiss('dismissed'), false);
  });

  test('analisar só de open; resolver só de under_review', () => {
    assert.equal(canReview('open'), true);
    assert.equal(canReview('under_review'), false);
    assert.equal(canResolve('under_review'), true);
    assert.equal(canResolve('open'), false);
  });

  test('⭐ resolved e dismissed são TERMINAIS: não têm saída', () => {
    assert.deepEqual([...TERMINAL_STATUSES].sort(), ['dismissed', 'resolved']);
    for (const terminal of TERMINAL_STATUSES) {
      assert.equal(isTerminal(terminal), true);
      for (const destino of ALL_STATUSES.filter((s) => s !== terminal)) {
        assert.equal(canTransition(terminal, destino), false, `${terminal} → ${destino}`);
      }
      assert.deepEqual([...nextStatuses(terminal)], []);
    }
    assert.equal(isTerminal('open'), false);
    assert.equal(isTerminal('under_review'), false);
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
    assert.deepEqual([...nextStatuses('open')].sort(), ['dismissed', 'under_review']);
    assert.deepEqual([...nextStatuses('under_review')].sort(), ['dismissed', 'resolved']);
    assert.deepEqual([...nextStatuses('resolved')], []);
    assert.deepEqual([...nextStatuses('dismissed')], []);
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('whistle.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'whistle.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 4, 'o SQL declara quatro pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  test('⭐ nenhum estado terminal ganha uma volta no SQL', () => {
    const doSql = paresDoSql(MIGRATION, 'whistle.allowed_transition');
    for (const par of doSql) {
      const [de] = par.split('→');
      assert.ok(
        !['resolved', 'dismissed'].includes(de!),
        `a denúncia encerrada ganhou uma volta (${par}) — resolved/dismissed são terminais`,
      );
    }
  });
});

describe('⭐ o relato CONGELA — fato consumado não se reescreve', () => {
  test('guard_report_update recusa mudança em subject/description/category/is_anonymous/reporter_id', () => {
    const corpo = corpoDaFuncao('whistle.guard_report_update()');
    assert.match(corpo, /new\.subject\s+is distinct from\s+old\.subject/i);
    assert.match(corpo, /new\.description\s+is distinct from\s+old\.description/i);
    assert.match(corpo, /new\.category\s+is distinct from\s+old\.category/i);
    assert.match(corpo, /new\.is_anonymous\s+is distinct from\s+old\.is_anonymous/i);
    assert.match(corpo, /new\.reporter_id\s+is distinct from\s+old\.reporter_id/i);
  });
});

describe('⭐⭐ a lei do anonimato está em TRÊS lugares no banco', () => {
  test('1. o gatilho de inserção descarta o denunciante quando anônima', () => {
    const corpo = corpoDaFuncao('whistle.guard_report_insert()');
    assert.match(
      corpo,
      /if\s+new\.is_anonymous\s+then[\s\S]{0,120}?new\.reporter_id\s*:=\s*null/i,
      'o gatilho de inserção não zera reporter_id quando is_anonymous',
    );
  });

  test('2. a CHECK constraint recusa anônima COM denunciante', () => {
    assert.match(
      migration,
      /not\s+is_anonymous\s+or\s+reporter_id\s+is\s+null/i,
      'a constraint da lei do anonimato sumiu',
    );
  });

  test('3. a policy de SELECT casa por reporter_id = auth.uid() — a anônima nem o autor reencontra', () => {
    // Com reporter_id null para sempre, a igualdade nunca casa: a denúncia
    // anônima é invisível até para quem a submeteu (só o comitê, via can_handle, a vê).
    assert.match(
      migration,
      /reporter_id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)/i,
      'a policy de SELECT deixou de casar por reporter_id = auth.uid()',
    );
  });
});
