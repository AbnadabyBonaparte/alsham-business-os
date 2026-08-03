import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  TARGET_TRANSITIONS,
  canArchiveTarget,
  canReopenTarget,
  canTransitionTarget,
  orderTargets,
  orderInspections,
} from './fisc.ts';
import type { Target, Inspection } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0108_fisc.sql');

function alvo(over: Partial<Target> = {}): Target {
  return { id: 't1', name: 'Padaria da Praça', status: 'active', ...over };
}

function vistoria(over: Partial<Inspection> = {}): Inspection {
  return {
    id: 'i1',
    targetId: 't1',
    targetName: 'Padaria da Praça',
    inspectedAt: '2026-08-03T10:00:00.000Z',
    finding: '',
    ...over,
  };
}

describe('⭐ o ciclo do ALVO (target) — ele volta do arquivo', () => {
  test('⭐ active ↔ archived (dois sentidos)', () => {
    assert.equal(canTransitionTarget('active', 'archived'), true);
    assert.equal(canTransitionTarget('archived', 'active'), true);
    assert.equal(canArchiveTarget('active'), true);
    assert.equal(canReopenTarget('archived'), true);
    assert.equal(TARGET_TRANSITIONS.length, 2);
  });

  test('o rol lê ativos primeiro; arquivados por último', () => {
    const ordenado = orderTargets([
      alvo({ id: 'c', status: 'archived', name: 'Zeta' }),
      alvo({ id: 'b', status: 'active', name: 'Bravo' }),
      alvo({ id: 'a', status: 'active', name: 'Alfa' }),
    ]);
    assert.deepEqual(ordenado.map((t) => t.id), ['a', 'b', 'c']);
  });
});

describe('⭐ a tabela de transições do ALVO é a MESMA nos dois lados', () => {
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

  test('fisc.allowed_transition() e TARGET_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'fisc.allowed_transition');
    const doTs = new Set(TARGET_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, TARGET_TRANSITIONS.length);
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐⭐ a VISTORIA é ato pontual — sem ciclo, imutável', () => {
  test('⭐⭐ a fisc.inspections NÃO TEM coluna de status nem função de transição própria', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    const migrationCode = migration.replace(/--[^\n]*/g, '');
    const blocoInspections = migrationCode.split('create table fisc.inspections')[1]?.split(');')[0] ?? '';
    assert.ok(blocoInspections.length > 0, 'fisc.inspections não encontrada na migration');
    assert.doesNotMatch(blocoInspections, /\bstatus\b/, 'a vistoria ganhou status — ela é ato pontual, sem ciclo');
    assert.doesNotMatch(migrationCode, /fisc\.inspection_allowed_transition/, 'a vistoria não tem allowed_transition própria');
  });

  test('⭐⭐ a vistoria é IMUTÁVEL: o gatilho recusa update E delete, incondicionalmente', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    assert.match(
      migration,
      /before update or delete on fisc\.inspections/,
      'falta o gatilho que torna a vistoria imutável em toda edição',
    );
    assert.match(migration, /guard_inspection_immutable/);
  });

  test('⛔ nenhum auto de infração/penalidade é construído (Lei 3)', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    const migrationCode = migration.replace(/--[^\n]*/g, '');
    assert.doesNotMatch(migrationCode, /create\s+table\s+fisc\.(auto|autos|infrac\w*|penalt\w*|fines?|multas?)/i);
  });

  test('a vistoria registrada não precisa de "reordenar por ciclo": só a data importa', () => {
    const ordenado = orderInspections([
      vistoria({ id: 'i2', inspectedAt: '2026-08-03T09:00:00.000Z' }),
      vistoria({ id: 'i3', inspectedAt: '2026-08-03T11:00:00.000Z' }),
      vistoria({ id: 'i1', inspectedAt: '2026-08-03T10:00:00.000Z' }),
    ]);
    assert.deepEqual(ordenado.map((i) => i.id), ['i3', 'i1', 'i2']);
  });
});
