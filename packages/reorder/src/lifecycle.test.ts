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
  orderRules,
  summarizeRules,
  needsReorder,
  flagLowStock,
} from './reorder.ts';
import type { Rule } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0062_reorder.sql');
const MIGRATION_HR = resolve(HERE, '../../../supabase/migrations/0048_hr.sql');

function regra(over: Partial<Rule> = {}): Rule {
  return {
    id: 'r1',
    product: 'Parafuso 8mm',
    invItemId: null,
    invItemName: '',
    minimumQuantity: 5,
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

describe('o ciclo de vida da regra: active ↔ archived', () => {
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

  test('a leitura ordena ativas primeiro, depois por produto', () => {
    const lista = [
      regra({ id: 'z', product: 'Zinco', status: 'active' }),
      regra({ id: 'a', product: 'Alumínio', status: 'archived' }),
      regra({ id: 'b', product: 'Bronze', status: 'active' }),
    ];
    assert.deepEqual(
      orderRules(lista).map((r) => r.id),
      ['b', 'z', 'a'],
    );
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      regra({ status: 'active' }),
      regra({ status: 'active' }),
      regra({ status: 'archived' }),
    ];
    assert.deepEqual(summarizeRules(lista), { total: 3, active: 2, archived: 1 });
    assert.deepEqual(summarizeRules([]), { total: 0, active: 0, archived: 0 });
  });

  test('reorder.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'reorder.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  test('⭐ o DIVERGE assinado: a regra VOLTA (archived→active); o hr NÃO (terminated é terminal)', () => {
    const reorderPares = paresDoSql(MIGRATION, 'reorder.allowed_transition');
    const hrPares = paresDoSql(MIGRATION_HR, 'hr.allowed_transition');
    // A regra é configuração que volta.
    assert.ok(reorderPares.has('archived→active'), 'reorder precisa permitir a volta');
    // O colaborador desligado não volta — quem retorna é admissão nova.
    assert.ok(
      !hrPares.has('terminated→active'),
      'o contraste depende de terminated ser terminal no hr',
    );
  });
});

describe('⭐⭐ a comparação é PURA e alimentada de FORA — este módulo não lê o inv', () => {
  test('needsReorder confronta o saldo (que vem por parâmetro) com o mínimo', () => {
    assert.equal(needsReorder(3, regra({ minimumQuantity: 5 })), true); // abaixo
    assert.equal(needsReorder(5, regra({ minimumQuantity: 5 })), false); // no ponto
    assert.equal(needsReorder(10, regra({ minimumQuantity: 5 })), false); // acima
  });

  test('flagLowStock devolve só as regras ativas, com item vinculado e saldo abaixo', () => {
    const abaixo = regra({ id: 'a', invItemId: 'item-a', minimumQuantity: 5 });
    const acima = regra({ id: 'b', invItemId: 'item-b', minimumQuantity: 5 });
    const arquivada = regra({ id: 'c', invItemId: 'item-c', minimumQuantity: 99, status: 'archived' });
    const semItem = regra({ id: 'd', invItemId: null, minimumQuantity: 99 });
    const semSaldo = regra({ id: 'e', invItemId: 'item-e', minimumQuantity: 5 });

    const saldos = new Map<string, number>([
      ['item-a', 2], // abaixo do mínimo
      ['item-b', 8], // acima
      ['item-c', 0], // mas a regra está arquivada
      // 'item-e' ausente de propósito: sem saldo informado, não se chuta
    ]);

    assert.deepEqual(
      flagLowStock([abaixo, acima, arquivada, semItem, semSaldo], saldos).map((r) => r.id),
      ['a'],
    );
  });
});
