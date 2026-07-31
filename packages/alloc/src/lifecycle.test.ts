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
  canReopen,
  orderAllocations,
  summarizeAllocations,
} from './alloc.ts';
import type { Allocation } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0071_alloc.sql');
const MIGRATION_VENDOR = resolve(HERE, '../../../supabase/migrations/0058_vendor.sql');
const MIGRATION_DC = resolve(HERE, '../../../supabase/migrations/0065_dc.sql');
const MIGRATION_HR = resolve(HERE, '../../../supabase/migrations/0048_hr.sql');

function alocacao(over: Partial<Allocation> = {}): Allocation {
  return {
    id: 'a1',
    projectId: 'p1',
    projectName: 'Projeto',
    resourceName: 'Recurso',
    employeeId: null,
    allocationPct: 50,
    startsOn: null,
    endsOn: null,
    status: 'active',
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

describe('o ciclo de vida da alocação: active ↔ archived', () => {
  test('o caminho feliz: arquiva e reabre', () => {
    assert.equal(canTransition('active', 'archived'), true);
    assert.equal(canTransition('archived', 'active'), true);
    assert.equal(canArchive('active'), true);
    assert.equal(canReopen('archived'), true);
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

  test('a leitura ordena ativas primeiro, depois por projeto e recurso', () => {
    const lista = [
      alocacao({ id: 'z', projectName: 'Zeta', status: 'active' }),
      alocacao({ id: 'a', projectName: 'Alfa', status: 'archived' }),
      alocacao({ id: 'b', projectName: 'Beta', status: 'active' }),
    ];
    assert.deepEqual(
      orderAllocations(lista).map((a) => a.id),
      ['b', 'z', 'a'],
    );
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      alocacao({ status: 'active' }),
      alocacao({ status: 'active' }),
      alocacao({ status: 'archived' }),
    ];
    assert.deepEqual(summarizeAllocations(lista), { total: 3, active: 2, archived: 1 });
    assert.deepEqual(summarizeAllocations([]), { total: 0, active: 0, archived: 0 });
  });

  test('alloc.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'alloc.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  test('⭐ o REUSO assinado: a alocação VOLTA (archived→active), como o vendor e o dc', () => {
    const allocPares = paresDoSql(MIGRATION, 'alloc.allowed_transition');
    const vendorPares = paresDoSql(MIGRATION_VENDOR, 'vendor.allowed_transition');
    const dcPares = paresDoSql(MIGRATION_DC, 'dc.allowed_transition');
    // A alocação é linha de planejamento que volta — a mesma física do vendor/dc.
    assert.ok(allocPares.has('archived→active'), 'alloc precisa permitir a volta');
    assert.ok(vendorPares.has('archived→active'), 'o precedente vendor permite a volta');
    assert.ok(dcPares.has('archived→active'), 'o precedente dc permite a volta');
    assert.deepEqual([...allocPares].sort(), [...vendorPares].sort());
  });

  test('⭐ o DIVERGE assinado: a alocação VOLTA; o hr NÃO (terminated é terminal)', () => {
    const allocPares = paresDoSql(MIGRATION, 'alloc.allowed_transition');
    const hrPares = paresDoSql(MIGRATION_HR, 'hr.allowed_transition');
    // A linha de planejamento que volta é a MESMA.
    assert.ok(allocPares.has('archived→active'), 'alloc precisa permitir a volta');
    // O colaborador desligado não volta — quem retorna é admissão nova.
    assert.ok(
      !hrPares.has('terminated→active'),
      'o contraste depende de terminated ser terminal no hr',
    );
  });
});
