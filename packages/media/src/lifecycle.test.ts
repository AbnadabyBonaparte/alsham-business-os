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
  orderShelf,
  usageCount,
  usagesOf,
  whyCannotRecordUsage,
} from './media.ts';
import type { MediaAsset, MediaUsage } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0041_media.sql');
const MIGRATION_PAT = resolve(HERE, '../../../supabase/migrations/0033_pat.sql');
const MIGRATION_CRM = resolve(HERE, '../../../supabase/migrations/0009_crm.sql');

function obra(over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'a1',
    title: 'Logo Bonaparte dourado',
    description: 'versão vetorial',
    assetType: 'vetor',
    location: 'drive da agência / pasta marca',
    status: 'active',
    ...over,
  };
}

function uso(over: Partial<MediaUsage> = {}): MediaUsage {
  return {
    id: 'u1',
    seq: 1,
    assetId: 'a1',
    usedIn: 'campanha de natal',
    note: '',
    referenceId: null,
    usedAt: '2026-07-30T10:00:00Z',
    ...over,
  };
}

describe('⭐ o ciclo — ida e volta, de propósito', () => {
  test('o acervo arquiva E devolve', () => {
    assert.equal(canArchive('active'), true);
    assert.equal(canRestore('archived'), true);
    assert.equal(canTransition('active', 'active'), false);
    assert.equal(canTransition('archived', 'archived'), false);
  });

  test('⭐ fora do acervo não se usa — a recusa com nome', () => {
    assert.match(whyCannotRecordUsage(obra({ status: 'archived' }), 'campanha')!, /devolva/);
    assert.match(whyCannotRecordUsage(obra(), '  ')!, /Em quê/);
    assert.equal(whyCannotRecordUsage(obra(), 'post do dia 12'), null);
  });

  test('o livro na ordem da SEQUÊNCIA — nunca do relógio', () => {
    const livro = [uso({ id: 'u2', seq: 2, usedAt: '2026-07-30T10:00:00Z' }), uso()];
    assert.deepEqual(usagesOf(obra(), livro).map((u) => u.id), ['u2', 'u1']);
    assert.equal(usageCount(obra(), [...livro, uso({ id: 'x', assetId: 'OUTRA' })]), 2);
  });

  test('a prateleira: acervo vivo por título; o arquivo depois', () => {
    const ordenado = orderShelf([
      obra({ id: 'z', title: 'zebra', status: 'archived' }),
      obra({ id: 'b', title: 'banner do evento' }),
      obra({ id: 'a', title: 'abertura em vídeo' }),
    ]);
    assert.deepEqual(ordenado.map((a) => a.id), ['a', 'b', 'z']);
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

  test('media.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'media.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 2, 'o SQL declara dois pares — ida e volta');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O DIVERGE assinado nos DOIS lados: o pat baixa e não volta
   * (identidade fiscal — o bem que volta é aquisição nova); a obra de
   * mídia volta do arquivo (identidade de OBRA — o argumento do crm, cuja
   * contraparte também volta). Se um dos três mudar, re-pergunte em vez
   * de herdar em silêncio.
   */
  test('⭐ o contraste pat×crm×media: a baixa é terminal; a obra volta', () => {
    const pat = paresDoSql(MIGRATION_PAT, 'pat.allowed_transition');
    assert.ok(!pat.has('written_off→active'), 'o pat passou a devolver a baixa — re-pergunte o contraste');
    const crm = readFileSync(MIGRATION_CRM, 'utf8').replace(/--[^\n]*/g, '');
    assert.ok(crm.includes("('archived', 'active')"), 'o crm perdeu a volta do arquivo — re-pergunte');
    const doSql = paresDoSql(MIGRATION, 'media.allowed_transition');
    assert.ok(doSql.has('archived→active'), 'a obra deixou de voltar — a decisão era voltar');
  });

  test('⭐ o livro de uso: carimbo do servidor, sequência própria, imutável', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /new\.used_at := now\(\)/);
    assert.match(sql, /new\.used_by := \(select auth\.uid\(\)\)/);
    assert.match(sql, /seq\s+bigint\s+generated always as identity/);
    assert.match(sql, /media_usages_immutable/);
    // O vínculo é SOLTO: reference_id sem FK.
    const usages = sql.split('create table media.usages')[1]?.split(');')[0] ?? '';
    assert.match(usages, /reference_id uuid,/);
    assert.doesNotMatch(usages, /reference_id[^,]*references/);
  });

  test('⭐ catálogo, não cofre: sem upload, sem miniatura, sem enum', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /location\s+text\s+not null check/);
    assert.doesNotMatch(sql, /storage\.objects|bucket|upload/i);
    assert.doesNotMatch(sql, /thumbnail|preview_url/i);
    assert.doesNotMatch(sql, /create\s+type\s+media\./i);
  });
});
