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
  orderCenters,
  summarizeCenters,
} from './dc.ts';
import type { Center } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0065_dc.sql');
const MIGRATION_HR = resolve(HERE, '../../../supabase/migrations/0048_hr.sql');

function centro(over: Partial<Center> = {}): Center {
  return { id: 'c1', name: 'Centro', address: '', status: 'active', ...over };
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

describe('o ciclo de vida do centro de distribuição: active ↔ archived', () => {
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

  test('a leitura ordena ativos primeiro, depois por nome', () => {
    const lista = [
      centro({ id: 'z', name: 'Zeta', status: 'active' }),
      centro({ id: 'a', name: 'Alfa', status: 'archived' }),
      centro({ id: 'b', name: 'Beta', status: 'active' }),
    ];
    assert.deepEqual(
      orderCenters(lista).map((c) => c.id),
      ['b', 'z', 'a'],
    );
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      centro({ status: 'active' }),
      centro({ status: 'active' }),
      centro({ status: 'archived' }),
    ];
    assert.deepEqual(summarizeCenters(lista), { total: 3, active: 2, archived: 1 });
    assert.deepEqual(summarizeCenters([]), { total: 0, active: 0, archived: 0 });
  });

  test('dc.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'dc.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  test('⭐ o DIVERGE assinado: o CD VOLTA (archived→active); o hr NÃO (terminated é terminal)', () => {
    const dcPares = paresDoSql(MIGRATION, 'dc.allowed_transition');
    const hrPares = paresDoSql(MIGRATION_HR, 'hr.allowed_transition');
    // O centro de distribuição é ativo de operação que volta.
    assert.ok(dcPares.has('archived→active'), 'dc precisa permitir a volta');
    // O colaborador desligado não volta — quem retorna é admissão nova.
    assert.ok(
      !hrPares.has('terminated→active'),
      'o contraste depende de terminated ser terminal no hr',
    );
  });
});
