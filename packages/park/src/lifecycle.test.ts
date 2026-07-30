import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { canRecordExit, isInside, summarize } from './park.ts';
import type { ParkEntry } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0056_park.sql');
const MIGRATION_VIS = resolve(HERE, '../../../supabase/migrations/0036_vis.sql');

function entrada(over: Partial<ParkEntry> = {}): ParkEntry {
  return {
    id: 'e1',
    vehiclePlate: 'ABC1D23',
    enteredAt: '2026-07-30T10:00:00.000Z',
    exitedAt: null,
    fee: '',
    ...over,
  };
}

describe('⭐ a identidade do vis aplicada ao veículo — sem tabela de transições', () => {
  test('dentro/fora é IMPLÍCITO — exitedAt null é dentro', () => {
    assert.equal(isInside(entrada()), true);
    assert.equal(isInside(entrada({ exitedAt: '2026-07-30T11:00:00.000Z' })), false);
  });

  test('só se registra a saída de quem está dentro', () => {
    assert.equal(canRecordExit(entrada()), true);
    assert.equal(canRecordExit(entrada({ exitedAt: '2026-07-30T11:00:00.000Z' })), false);
  });

  test('summarize conta o pátio sem inventar número', () => {
    const r = summarize([
      entrada({ id: 'a' }),
      entrada({ id: 'b', exitedAt: '2026-07-30T12:00:00.000Z' }),
      entrada({ id: 'c' }),
    ]);
    assert.deepEqual(r, { total: 3, inside: 2, exited: 1 });
  });
});

describe('⭐ o contraste park×vis: a mesma identidade, dois ofícios', () => {
  const park = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
  const vis = readFileSync(MIGRATION_VIS, 'utf8').replace(/--[^\n]*/g, '');

  test('⭐ AMBOS carimbam os dois atos PELO SERVIDOR — now()/auth.uid() no guard, nunca a tela', () => {
    assert.match(park, /new\.entered_at\s*:=\s*now\(\)/);
    assert.match(park, /new\.exited_at\s*:=\s*now\(\)/);
    assert.match(park, /new\.entered_by\s*:=\s*\(select auth\.uid\(\)\)/);
    assert.match(park, /new\.exited_by\s*:=\s*\(select auth\.uid\(\)\)/);

    assert.match(vis, /new\.checked_in_at\s*:=\s*now\(\)/);
    assert.match(vis, /new\.checked_out_at\s*:=\s*now\(\)/);
  });

  test('⭐ AMBOS congelam depois do fato — corrigir é registro novo, nunca rasura', () => {
    assert.match(park, /não se rasura/);
    assert.match(vis, /não se rasura/);
  });

  test('⛔ o park NÃO tem coluna de documento pessoal — a placa é identificador NEUTRO do veículo', () => {
    // Checa a COLUNA (padrão "nome_coluna  tipo"), não a prosa — o cabeçalho
    // do próprio módulo usa a palavra "documento" para narrar a ausência.
    assert.doesNotMatch(park, /\bcpf\b/i);
    assert.doesNotMatch(park, /\w*document\w*\s+(text|varchar)\b/i);
    assert.match(park, /vehicle_plate/);
  });

  test('⭐ a divergência de forma: o vis tem plano anterior (scheduled/no_show); o park nasce direto', () => {
    assert.match(vis, /scheduled/);
    assert.doesNotMatch(park, /scheduled/);
    assert.doesNotMatch(park, /no_show/);
  });
});
