import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canArchive,
  canReactivate,
  canTransition,
  isArchived,
  orderProfessionals,
} from './professional.ts';
import type { Professional } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0113_professional.sql');
const MIGRATION_HR = resolve(HERE, '../../../supabase/migrations/0048_hr.sql');

function profissional(over: Partial<Professional> = {}): Professional {
  return {
    id: 'p1',
    name: 'Ana Corte',
    specialty: 'cabeleireiro',
    hrEmployeeId: null,
    status: 'active',
    ...over,
  };
}

describe('⭐ o ciclo — active ↔ archived (a pessoa que volta)', () => {
  test('⭐ active ↔ archived: as duas transições, e nada mais', () => {
    assert.equal(canTransition('active', 'archived'), true);
    assert.equal(canTransition('archived', 'active'), true);
    assert.equal(canArchive('active'), true);
    assert.equal(canReactivate('archived'), true);
    assert.equal(canArchive('archived'), false);
    assert.equal(isArchived('archived'), true);
    assert.equal(isArchived('active'), false);
    assert.equal(ALLOWED_TRANSITIONS.length, 2);
  });

  test('o roster lê ativos primeiro, depois por nome', () => {
    const ordenado = orderProfessionals([
      profissional({ id: 'c', status: 'archived', name: 'Zeca' }),
      profissional({ id: 'b', status: 'active', name: 'Bruno' }),
      profissional({ id: 'a', status: 'active', name: 'Aline' }),
    ]);
    assert.deepEqual(ordenado.map((p) => p.id), ['a', 'b', 'c']);
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

  test('professional.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'professional.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, ALLOWED_TRANSITIONS.length);
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐⭐ o contraste professional×hr: a mesma pergunta, física OPOSTA de propósito', () => {
  const professionalCode = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
  const hrCode = readFileSync(MIGRATION_HR, 'utf8').replace(/--[^\n]*/g, '');

  test('o hr é TERMINAL: active → terminated, e NÃO volta', () => {
    assert.match(hrCode, /\(\s*'active'\s*,\s*'terminated'\s*\)/);
    // O hr NÃO reabre: não há ('terminated','active').
    assert.doesNotMatch(hrCode, /\(\s*'terminated'\s*,\s*'active'\s*\)/);
  });

  test('⭐⭐ o professional DIVERGE: active ↔ archived — o profissional VOLTA', () => {
    assert.match(professionalCode, /\(\s*'active'\s*,\s*'archived'\s*\)/);
    assert.match(professionalCode, /\(\s*'archived'\s*,\s*'active'\s*\)/);
    // E NÃO copiou o terminal do hr.
    assert.doesNotMatch(professionalCode, /'terminated'/);
    assert.equal(canReactivate('archived'), true);
  });

  test('o professional NÃO lê o hr — o vínculo é id solto', () => {
    assert.doesNotMatch(professionalCode, /references\s+hr\./i);
    assert.match(professionalCode, /hr_employee_id\s+uuid/);
  });
});
