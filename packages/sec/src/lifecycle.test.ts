import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  CHECKPOINT_TRANSITIONS,
  canArchiveCheckpoint,
  canReopenCheckpoint,
  canTransitionCheckpoint,
  orderCheckpoints,
  orderPatrols,
} from './sec.ts';
import type { Checkpoint, Patrol } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0057_sec.sql');
const MIGRATION_OCC = resolve(HERE, '../../../supabase/migrations/0031_occ.sql');

function posto(over: Partial<Checkpoint> = {}): Checkpoint {
  return { id: 'c1', name: 'Portaria Norte', status: 'active', ...over };
}

function ronda(over: Partial<Patrol> = {}): Patrol {
  return {
    id: 'p1',
    checkpointId: 'c1',
    checkpointName: 'Portaria Norte',
    passedAt: '2026-07-30T10:00:00.000Z',
    note: '',
    ...over,
  };
}

describe('⭐ o ciclo do POSTO (checkpoint) — ele volta do arquivo', () => {
  test('⭐ active ↔ archived (dois sentidos)', () => {
    assert.equal(canTransitionCheckpoint('active', 'archived'), true);
    assert.equal(canTransitionCheckpoint('archived', 'active'), true);
    assert.equal(canArchiveCheckpoint('active'), true);
    assert.equal(canReopenCheckpoint('archived'), true);
    assert.equal(CHECKPOINT_TRANSITIONS.length, 2);
  });

  test('o mapa lê ativos primeiro; arquivados por último', () => {
    const ordenado = orderCheckpoints([
      posto({ id: 'c', status: 'archived', name: 'Zeta' }),
      posto({ id: 'b', status: 'active', name: 'Bravo' }),
      posto({ id: 'a', status: 'active', name: 'Alfa' }),
    ]);
    assert.deepEqual(ordenado.map((c) => c.id), ['a', 'b', 'c']);
  });
});

describe('⭐ a tabela de transições do POSTO é a MESMA nos dois lados', () => {
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

  test('sec.allowed_transition() e CHECKPOINT_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'sec.allowed_transition');
    const doTs = new Set(CHECKPOINT_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, CHECKPOINT_TRANSITIONS.length);
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐⭐ o contraste sec×occ — a RONDA não tem ciclo; o INCIDENTE (occ) tem', () => {
  test('o occ TEM lifecycle de incidente: open → closed, terminal, com desfecho obrigatório', () => {
    const occ = readFileSync(MIGRATION_OCC, 'utf8');
    const corpo = occ.split('occ.allowed_transition')[1]?.split('$$;')[0]?.replace(/--[^\n]*/g, '') ?? '';
    assert.match(corpo, /\(\s*'open'\s*,\s*'closed'\s*\)/, 'o occ perdeu o par open→closed');
    assert.match(occ, /closed_at/, 'o occ perdeu o carimbo de encerramento');
    assert.match(occ, /outcome/, 'o occ perdeu o desfecho obrigatório');
  });

  test('⭐⭐ o sec.patrols NÃO TEM coluna de status nem função de transição própria', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    const migrationCode = migration.replace(/--[^\n]*/g, '');
    const blocoPatrols = migrationCode.split('create table sec.patrols')[1]?.split(');')[0] ?? '';
    assert.ok(blocoPatrols.length > 0, 'sec.patrols não encontrada na migration');
    assert.doesNotMatch(blocoPatrols, /\bstatus\b/, 'a ronda ganhou status — ela é ato pontual, sem ciclo');
    assert.doesNotMatch(migrationCode, /sec\.patrol_allowed_transition/, 'a ronda não tem allowed_transition própria');
  });

  test('⭐⭐ a ronda é IMUTÁVEL: o gatilho recusa update E delete, incondicionalmente', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    assert.match(
      migration,
      /before update or delete on sec\.patrols/,
      'falta o gatilho que torna a ronda imutável em toda edição',
    );
    assert.match(migration, /guard_patrol_immutable/);
  });

  test('a ronda registrada não precisa de "reordenar por ciclo": só a data importa', () => {
    const ordenado = orderPatrols([
      ronda({ id: 'p2', passedAt: '2026-07-30T09:00:00.000Z' }),
      ronda({ id: 'p3', passedAt: '2026-07-30T11:00:00.000Z' }),
      ronda({ id: 'p1', passedAt: '2026-07-30T10:00:00.000Z' }),
    ]);
    assert.deepEqual(ordenado.map((p) => p.id), ['p3', 'p1', 'p2']);
  });
});
