import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canEditAsset,
  canTransition,
  canWriteOff,
  currentLocation,
  orderAssets,
  whyCannotTransfer,
  whyCannotWriteOff,
} from './assets.ts';
import type { Asset, AssetTransfer } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0033_pat.sql');
const MIGRATION_CRM = resolve(HERE, '../../../supabase/migrations/0009_crm.sql');

function bem(over: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    name: 'Empilhadeira 03',
    code: 'ETQ-0031',
    description: '',
    categoryId: null,
    originalLocation: 'galpão 1',
    acquisitionCostCents: null,
    currency: null,
    acquiredOn: null,
    status: 'active',
    writtenOffAt: null,
    writeOffReason: '',
    ...over,
  };
}

function ato(over: Partial<AssetTransfer> = {}): AssetTransfer {
  return {
    id: 't1',
    assetId: 'a1',
    fromLocation: 'galpão 1',
    toLocation: 'obra da av. central',
    note: '',
    movedAt: '2026-07-10T10:00:00Z',
    ...over,
  };
}

describe('⭐ o ciclo — a baixa é terminal', () => {
  test('⭐ UM par só: active → written_off', () => {
    assert.equal(ALLOWED_TRANSITIONS.length, 1);
    assert.equal(canTransition('active', 'written_off'), true);
    assert.equal(canWriteOff('active'), true);
  });

  test('⭐ o bem baixado NÃO volta — o que volta é aquisição nova', () => {
    assert.equal(canTransition('written_off', 'active'), false);
    assert.equal(canWriteOff('written_off'), false);
    assert.equal(canEditAsset('written_off'), false);
  });

  test('⭐ a baixa exige a razão — a recusa tem nome', () => {
    const ativo = bem();
    assert.match(whyCannotWriteOff(ativo, '')!, /razão/);
    assert.equal(whyCannotWriteOff(ativo, 'vendida no leilão de julho'), null);
    assert.match(whyCannotWriteOff(bem({ status: 'written_off' }), 'x')!, /aquisição nova/);
  });

  test('bem baixado não se transfere; destino vazio não é transferência', () => {
    assert.match(whyCannotTransfer(bem({ status: 'written_off' }), 'sala 2')!, /baixado/);
    assert.match(whyCannotTransfer(bem(), '  ')!, /destino/);
    assert.equal(whyCannotTransfer(bem(), 'sala 2'), null);
  });
});

describe('⭐ a localização vigente é consequência calculada', () => {
  test('sem ato, vale a original congelada no cadastro', () => {
    assert.equal(currentLocation(bem(), []), 'galpão 1');
  });

  test('⭐ vale o ÚLTIMO ato do livro — nunca uma coluna', () => {
    const atos = [
      ato({ id: 't1', toLocation: 'obra da av. central', movedAt: '2026-07-10T10:00:00Z' }),
      ato({ id: 't2', fromLocation: 'obra da av. central', toLocation: 'galpão 2', movedAt: '2026-07-20T10:00:00Z' }),
    ];
    assert.equal(currentLocation(bem(), atos), 'galpão 2');
  });

  test('o livro de outro bem não conta', () => {
    const atos = [ato({ assetId: 'OUTRO', toLocation: 'sala 9' })];
    assert.equal(currentLocation(bem(), atos), 'galpão 1');
  });

  test('o livro na ordem de leitura: ativos por nome, baixados por último', () => {
    const ordenado = orderAssets([
      bem({ id: 'x', name: 'Van 12', status: 'written_off', writtenOffAt: '2026-07-01T00:00:00Z', writeOffReason: 'vendida' }),
      bem({ id: 'y', name: 'Betoneira' }),
      bem({ id: 'z', name: 'Andaime' }),
    ]);
    assert.deepEqual(ordenado.map((a) => a.name), ['Andaime', 'Betoneira', 'Van 12']);
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

  test('pat.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'pat.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 1, 'o SQL declara um par só');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O DIVERGE também se assina: o crm deixa `archived → active` (a
   * contraparte que volta é a MESMA pessoa); o pat NÃO deixa a baixa voltar
   * (o bem que volta é aquisição NOVA). Se um dos dois lados mudar, este
   * teste obriga a re-perguntar em vez de herdar em silêncio.
   */
  test('⭐ o contraste crm×pat: a pessoa volta; o bem baixado não', () => {
    const crm = readFileSync(MIGRATION_CRM, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(
      crm,
      /\(\s*'archived'\s*,\s*'active'\s*\)/,
      'o crm deixou de reativar a contraparte — re-pergunte o contraste',
    );
    const doPat = paresDoSql(MIGRATION, 'pat.allowed_transition');
    assert.equal(doPat.has('written_off→active'), false, 'a baixa virou reversível — isso é decisão de canon');
  });

  test('⭐ a localização vigente NÃO é coluna — é view calculada', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(sql, /current_location\s+text/, 'apareceu coluna de localização vigente');
    assert.match(sql, /create view pat\.asset_locations\s+with \(security_invoker = true\)/);
    assert.match(sql, /original_location\s+text\s+not null/);
  });
});
