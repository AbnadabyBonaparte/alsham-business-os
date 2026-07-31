import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canArchive,
  canRestore,
  canTransition,
  summarizePlants,
  validateNewPlant,
} from './plant.ts';
import type { Plant } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0096_plant.sql');
const migrationCode = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

describe('o ciclo de vida da usina — active ↔ archived (a física do catalog)', () => {
  test('active ↔ archived são as ÚNICAS transições', () => {
    assert.ok(canTransition('active', 'archived'));
    assert.ok(canTransition('archived', 'active'));
    // idempotência
    assert.ok(canTransition('active', 'active'));
  });

  test('⭐ o espelho bate com o allowed_transition do banco', () => {
    // o banco tem exatamente estes dois pares
    assert.match(migrationCode, /\('active',\s*'archived'\)/);
    assert.match(migrationCode, /\('archived',\s*'active'\)/);
    // e o motor tem exatamente dois pares
    assert.equal(ALLOWED_TRANSITIONS.length, 2);
  });

  test('só a ativa arquiva; só a arquivada volta', () => {
    assert.ok(canArchive('active'));
    assert.ok(!canArchive('archived'));
    assert.ok(canRestore('archived'));
    assert.ok(!canRestore('active'));
  });

  test('o resumo conta ativas e arquivadas', () => {
    const plants: Plant[] = [
      { id: '1', name: 'A', location: '', capacityKwp: 10, plantType: '', status: 'active' },
      { id: '2', name: 'B', location: '', capacityKwp: 20, plantType: '', status: 'archived' },
      { id: '3', name: 'C', location: '', capacityKwp: 5, plantType: '', status: 'active' },
    ];
    assert.deepEqual(summarizePlants(plants), { total: 3, active: 2, archived: 1 });
  });
});

describe('a validação da usina nova', () => {
  test('nome obrigatório, capacidade > 0; localização e tipo opcionais', () => {
    const ok = validateNewPlant({ name: 'Usina Solar Cerrado', capacityKwp: 750.5 });
    assert.ok(ok.ok);
    if (ok.ok) {
      assert.equal(ok.value.name, 'Usina Solar Cerrado');
      assert.equal(ok.value.capacityKwp, 750.5);
      assert.equal(ok.value.location, '');
      assert.equal(ok.value.plantType, '');
      assert.equal(ok.value.status, 'active');
      assert.equal(ok.value.id, '');
    }
  });

  test('a capacidade > 0 é exigida — zero e negativo são recusados', () => {
    const zero = validateNewPlant({ name: 'X', capacityKwp: 0 });
    assert.ok(!zero.ok);
    const neg = validateNewPlant({ name: 'X', capacityKwp: -5 });
    assert.ok(!neg.ok);
  });

  test('sem nome não passa', () => {
    const semNome = validateNewPlant({ capacityKwp: 100 });
    assert.ok(!semNome.ok);
    if (!semNome.ok) assert.ok(semNome.problems.some((p) => p.field === 'name'));
  });

  test('⭐ o tipo/porte é texto livre (a consolidação de GD) — vale qualquer coisa', () => {
    const gd = validateNewPlant({ name: 'Telhado 3', capacityKwp: 8, plantType: 'geração distribuída — telhado' });
    assert.ok(gd.ok);
    if (gd.ok) assert.equal(gd.value.plantType, 'geração distribuída — telhado');
  });
});
