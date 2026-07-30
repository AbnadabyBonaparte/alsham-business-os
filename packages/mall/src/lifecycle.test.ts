import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canArchive,
  canReopen,
  canTransition,
  orderStores,
} from './mall.ts';
import type { Store } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0053_mall.sql');
const MIGRATION_HR = resolve(HERE, '../../../supabase/migrations/0048_hr.sql');

function loja(over: Partial<Store> = {}): Store {
  return {
    id: 's1',
    storeName: 'Loja do Térreo',
    segment: 'moda',
    spaceId: null,
    spaceName: '',
    status: 'active',
    ...over,
  };
}

describe('⭐ o ciclo — o lojista volta do arquivo', () => {
  test('⭐ active ↔ archived (dois sentidos)', () => {
    assert.equal(canTransition('active', 'archived'), true);
    assert.equal(canTransition('archived', 'active'), true);
    assert.equal(canArchive('active'), true);
    assert.equal(canReopen('archived'), true);
    assert.equal(ALLOWED_TRANSITIONS.length, 2);
  });

  test('o mapa lê ativos primeiro; arquivados por último', () => {
    const ordenado = orderStores([
      loja({ id: 'c', status: 'archived', storeName: 'Zeta' }),
      loja({ id: 'b', status: 'active', storeName: 'Bravo' }),
      loja({ id: 'a', status: 'active', storeName: 'Alfa' }),
    ]);
    assert.deepEqual(ordenado.map((s) => s.id), ['a', 'b', 'c']);
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

  test('mall.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'mall.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, ALLOWED_TRANSITIONS.length);
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O DIVERGE consciente do hr: lá `terminated` é TERMINAL (o ex-colaborador
   * que volta assina contrato NOVO); aqui `archived → active` EXISTE (o lojista
   * é relação comercial que volta — a mesma marca reaberta é a mesma relação).
   * Dois cadastros de "gente/negócio", physics opostas de propósito.
   */
  test('⭐ o contraste hr×mall: o desligado não volta; o lojista arquivado volta', () => {
    const hr = readFileSync(MIGRATION_HR, 'utf8');
    const corpoHr = hr.split('hr.allowed_transition')[1]?.split('$$;')[0]?.replace(/--[^\n]*/g, '') ?? '';
    assert.doesNotMatch(corpoHr, /\(\s*'terminated'\s*,/, 'o hr deixou o terminated voltar — re-pergunte o contraste');
    assert.equal(canReopen('archived'), true, 'o mall precisa deixar o lojista voltar');
  });
});
