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
  orderControls,
} from './control.ts';
import type { InternalControl } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0091_control.sql');
const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, ''); // sem comentários

function controle(over: Partial<InternalControl> = {}): InternalControl {
  return {
    id: 'c1',
    name: 'Controle',
    description: '',
    controlType: 'preventive',
    owner: '',
    frequency: '',
    eriskId: null,
    status: 'active',
    ...over,
  };
}

/** Os pares `('a','b')` de uma função `allowed_transition` na migration. */
function paresDoSql(caminho: string, fn: string): Set<string> {
  const conteudo = readFileSync(caminho, 'utf8');
  const corpo = conteudo.split(`create or replace function ${fn}`)[1];
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

/** O corpo de uma tabela `create table X (...)` na migration (sem comentários). */
function corpoTabela(nome: string): string {
  const m = code.match(new RegExp(`create table ${nome.replace('.', '\\.')} \\(([\\s\\S]*?)\\n\\);`, 'i'));
  assert.ok(m, `tabela ${nome} não encontrada na migration`);
  return m![1] as string;
}

describe('o ciclo de vida do controle: active ↔ archived', () => {
  test('o caminho feliz: arquiva e reativa', () => {
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
      controle({ id: 'z', name: 'Zeta', status: 'active' }),
      controle({ id: 'a', name: 'Alfa', status: 'archived' }),
      controle({ id: 'b', name: 'Beta', status: 'active' }),
    ];
    assert.deepEqual(
      orderControls(lista).map((c) => c.id),
      ['b', 'z', 'a'],
    );
  });

  test('⭐ control.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'control.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares (active ↔ archived)');
    assert.ok(doSql.has('active→archived'), 'o controle arquiva');
    assert.ok(doSql.has('archived→active'), 'o controle volta');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐ o contraste assinado: control.controls (CADASTRO) × control.tests (LIVRO IMUTÁVEL)', () => {
  test('control.controls TEM o ciclo de vida: coluna status e a transição active ↔ archived', () => {
    const controls = corpoTabela('control.controls');
    // O cadastro tem status, com o CHECK dos dois estados.
    assert.match(controls, /status\s+text/i);
    assert.match(controls, /check\s*\(\s*status\s+in\s*\(\s*'active'\s*,\s*'archived'\s*\)\s*\)/i);
    // E a migration declara a função de transição (a física do vendor).
    assert.match(code, /create\s+or\s+replace\s+function\s+control\.allowed_transition/i);
  });

  test('⭐⭐ control.tests é FATO CONSUMADO: SEM status, SEM allowed_transition, SEM updated_at', () => {
    const tests = corpoTabela('control.tests');
    // O livro de testes não tem coluna de estado nem de atualização.
    assert.doesNotMatch(tests, /\bstatus\b/i);
    assert.doesNotMatch(tests, /updated_at/i);
    // Não existe transição de teste — a única allowed_transition é a do cadastro.
    assert.doesNotMatch(code, /create\s+or\s+replace\s+function\s+control\.tests?_allowed_transition/i);
  });

  test('⭐⭐ control.tests TEM o gatilho de imutabilidade (before update or delete, RAISE 42501)', () => {
    // A física do timesheet: nem o dono do banco reescreve o fato.
    assert.match(code, /before\s+update\s+or\s+delete\s+on\s+control\.tests/i);
    assert.match(code, /guard_test_immutable/);
    const corpo = sql.split('guard_test_immutable')[1] ?? '';
    assert.match(corpo, /fato consumado[\s\S]*?errcode\s*=\s*'42501'/);
  });

  test('⭐ CAMADA 1: o cliente não tem porta de reescrita no livro — só select, insert', () => {
    assert.match(sql, /grant\s+select,\s*insert\s+on\s+control\.tests\s+to\s+authenticated/i);
    assert.doesNotMatch(code, /create\s+policy[\s\S]*?for\s+update\s+on\s+control\.tests/i);
    assert.doesNotMatch(code, /create\s+policy[\s\S]*?for\s+delete\s+on\s+control\.tests/i);
  });
});
