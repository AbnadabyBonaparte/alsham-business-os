import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  ALL_STATUSES,
  canTransition,
  canArchive,
  canRestore,
} from './catalog.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0087_catalog.sql');
const MIGRATION_HR = resolve(HERE, '../../../supabase/migrations/0048_hr.sql');

function paresDoSql(caminho: string, fn: string): Set<string> {
  const texto = readFileSync(caminho, 'utf8');
  const corpo = texto.split(`create or replace function ${fn}`)[1];
  assert.ok(corpo !== undefined, `${fn} não encontrada em ${caminho}`);
  const bloco = corpo.split('$$;')[0] ?? '';
  const semComentario = bloco.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  const pares = new Set<string>();
  for (const m of semComentario.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) {
    pares.add(`${m[1]}→${m[2]}`);
  }
  return pares;
}

describe('o ciclo de vida do produto', () => {
  test('⭐ active ↔ archived é REVERSÍVEL (o produto descontinuado que volta é o MESMO)', () => {
    assert.equal(canTransition('active', 'archived'), true);
    assert.equal(canTransition('archived', 'active'), true);
  });

  test('a matriz N×N: canTransition concorda com a tabela', () => {
    const permitidos = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    for (const de of ALL_STATUSES) {
      for (const para of ALL_STATUSES) {
        const esperado = de === para || permitidos.has(`${de}→${para}`);
        assert.equal(canTransition(de, para), esperado, `${de} → ${para}`);
      }
    }
  });

  test('canArchive/canRestore concordam com a tabela', () => {
    assert.equal(canArchive('active'), true);
    assert.equal(canArchive('archived'), false);
    assert.equal(canRestore('archived'), true);
    assert.equal(canRestore('active'), false);
  });

  test('⭐ a tabela de transições é a MESMA nos dois lados (SQL × TS)', () => {
    const doSql = paresDoSql(MIGRATION, 'catalog.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

describe('⭐ o DIVERGE assinado vs hr: relação comercial que volta × desligamento terminal', () => {
  test('o hr tem `terminated` TERMINAL — nenhuma transição PARTE dele', () => {
    const doHr = paresDoSql(MIGRATION_HR, 'hr.allowed_transition');
    const saemDeTerminated = [...doHr].filter((p) => p.startsWith('terminated→'));
    assert.deepEqual(saemDeTerminated, [], 'terminated do hr não deveria ter saída');
  });

  test('⭐ o catalog DIVERGE: `archived` VOLTA a `active` — o produto é o MESMO', () => {
    // O contraste: o colaborador desligado que retorna é admissão NOVA (registro
    // novo); o produto descontinuado que a loja volta a vender é o MESMO produto
    // (obrigá-lo a renascer partiria o histórico de venda em dois). Por isso a
    // física do vendor/mall, não a do hr.
    const doCatalog = paresDoSql(MIGRATION, 'catalog.allowed_transition');
    assert.ok(doCatalog.has('archived→active'), 'archived deve voltar a active no catalog');
    const doHr = paresDoSql(MIGRATION_HR, 'hr.allowed_transition');
    assert.ok(!doHr.has('terminated→active'), 'terminated do hr NÃO volta — o contraste');
  });
});
