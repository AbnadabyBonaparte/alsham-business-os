import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MANIFEST, EVENTS } from './manifest.ts';
import { DEPENDENCY_TYPES } from './gantt.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0074_gantt.sql');
const SPEC = resolve(HERE, '../../../docs/canon/MODULO-GANTT-SPEC.md');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

describe('o Gantt não tem ciclo de vida — tem arestas', () => {
  test('a migration e a spec existem', () => {
    assert.ok(existsSync(MIGRATION), '0074_gantt.sql não existe');
    assert.ok(existsSync(SPEC), 'MODULO-GANTT-SPEC.md não existe');
  });

  test('⛔ não há máquina de estados — sem allowed_transition, sem coluna status na tabela', () => {
    assert.doesNotMatch(migrationCode, /allowed_transition/i);
    // A aresta não tem ciclo de vida: nenhuma coluna `status` na tabela (o
    // `status` do core.event_outbox no emit_event não conta).
    assert.doesNotMatch(migrationCode, /status\s+text\s+not\s+null/i);
    assert.doesNotMatch(migrationCode, /check\s*\(\s*status\s+in/i);
  });

  test('os dois fatos do manifesto são registrar e remover', () => {
    assert.deepEqual(
      MANIFEST.events.emits.map((e) => e.type).sort(),
      [EVENTS.registered, EVENTS.removed].sort(),
    );
  });
});

describe('⭐ a migration guarda a física da aresta', () => {
  test('⭐ o CHECK da aresta laço existe: predecessor <> successor', () => {
    assert.match(
      migrationCode,
      /check\s*\(\s*predecessor_id\s*<>\s*successor_id\s*\)/i,
      'o CHECK predecessor_id <> successor_id sumiu da migration',
    );
  });

  test('⭐ o índice único da aresta existe: (tenant, predecessor, successor)', () => {
    assert.match(
      migrationCode,
      /unique\s*\(\s*tenant_id\s*,\s*predecessor_id\s*,\s*successor_id\s*\)/i,
      'a unique da aresta (tenant, predecessor, successor) sumiu da migration',
    );
  });

  test('⭐ o tipo é o CHECK das quatro relações clássicas — não texto livre nem enum', () => {
    assert.doesNotMatch(migrationCode, /create\s+type\s+gantt\./i);
    for (const t of DEPENDENCY_TYPES) {
      assert.ok(migrationCode.includes(`'${t}'`), `o tipo ${t} não está no CHECK da migration`);
    }
  });

  test('⭐⭐ REGISTRO MUTÁVEL: há policy E grant de DELETE — o DIVERGE dos livros imutáveis', () => {
    assert.match(migrationCode, /for\s+delete\s+to\s+authenticated/i, 'falta a policy de DELETE');
    assert.match(
      migrationCode,
      /grant[\s\S]*?delete[\s\S]*?on\s+gantt\.dependencies\s+to\s+authenticated/i,
      'falta o grant de DELETE em gantt.dependencies',
    );
    assert.match(
      migrationCode,
      /after\s+delete\s+on\s+gantt\.dependencies/i,
      'falta o gatilho AFTER DELETE que emite gantt.dependency.removed',
    );
  });
});

describe('🔴 a Lei do Lego: o vínculo ao sched é id solto', () => {
  test('🔴 a migration NÃO referencia o schema sched — zero `sched.`', () => {
    assert.doesNotMatch(migrationCode, /\bsched\./, 'a migration referencia o schema sched — o vínculo deve ser id solto');
    // A prova crua, sobre o texto integral (inclui comentários): nenhuma
    // ocorrência de `sched.` em lugar nenhum do arquivo.
    assert.equal(
      (migration.match(/\bsched\./g) ?? []).length,
      0,
      'o arquivo inteiro (código + comentários) não pode conter `sched.`',
    );
  });

  test('o cinto de emit_event confere o prefixo do módulo', () => {
    const cinto = migrationCode.match(/p_event_type not like '([a-z0-9-]+)\.%'/);
    assert.ok(cinto, 'a migration não tem cinto em emit_event');
    assert.equal(cinto![1], MANIFEST.id);
  });
});
