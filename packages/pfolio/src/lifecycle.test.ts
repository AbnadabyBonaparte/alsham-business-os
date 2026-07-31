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
  canRestore,
  orderPortfolios,
  summarizePortfolios,
} from './pfolio.ts';
import type { Portfolio } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0077_pfolio.sql');
const MIGRATION_PROJ = resolve(HERE, '../../../supabase/migrations/0068_proj.sql');

function portfolio(over: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 'p1',
    name: 'Portfólio',
    description: '',
    status: 'active',
    ...over,
  };
}

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

describe('o ciclo de vida do portfólio', () => {
  test('o caminho: active ↔ archived, nos dois sentidos', () => {
    assert.equal(canTransition('active', 'archived'), true);
    assert.equal(canTransition('archived', 'active'), true);
  });

  test('⭐ arquivar existe do ativo; reabrir existe do arquivado', () => {
    assert.equal(canArchive('active'), true);
    assert.equal(canArchive('archived'), true); // já arquivado → no-op verdadeiro
    assert.equal(canRestore('archived'), true);
    assert.equal(canRestore('active'), true); // já ativo → no-op verdadeiro
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

  test('a leitura ordena ativos primeiro, depois arquivados; dentro, por nome', () => {
    const lista = [
      portfolio({ id: 'z', name: 'Zebra', status: 'active' }),
      portfolio({ id: 'a', name: 'Alfa', status: 'archived' }),
      portfolio({ id: 'm', name: 'Meio', status: 'active' }),
    ];
    assert.deepEqual(orderPortfolios(lista).map((p) => p.id), ['m', 'z', 'a']);
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      portfolio({ status: 'active' }),
      portfolio({ status: 'archived' }),
      portfolio({ status: 'archived' }),
    ];
    assert.deepEqual(summarizePortfolios(lista), { total: 3, active: 1, archived: 2 });
    assert.deepEqual(summarizePortfolios([]), { total: 0, active: 0, archived: 0 });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('pfolio.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'pfolio.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐ O DIVERGE assinado: o portfólio VOLTA (active ↔ archived), enquanto os
   * fins do `proj` (completed/cancelled) são TERMINAIS e NÃO reabrem. Este
   * teste lê as duas migrations e prova o contraste: nenhuma volta do proj
   * parte de um fim; as duas voltas do pfolio existem.
   */
  test('⭐ o pfolio reabre nos dois sentidos; o proj NÃO reabre de fim nenhum', () => {
    const doPfolio = paresDoSql(MIGRATION, 'pfolio.allowed_transition');
    assert.ok(doPfolio.has('active→archived'), 'arquivar existe');
    assert.ok(doPfolio.has('archived→active'), '⭐ reabrir existe — o portfólio volta');

    const doProj = paresDoSql(MIGRATION_PROJ, 'proj.allowed_transition');
    for (const par of doProj) {
      const [de] = par.split('→');
      assert.ok(
        !['completed', 'cancelled'].includes(de!),
        `o projeto ganhou uma volta (${par}) — o encerrado é terminal`,
      );
    }
  });

  /**
   * ⭐⭐ O ponto do módulo: a unicidade dos membros é por (portfólio, projeto),
   * NÃO global em project_id — provando que o MESMO projeto pode viver em
   * VÁRIOS portfólios. Este teste lê a constraint na migration e confere que
   * ela inclui portfolio_id junto de project_id, e que não existe unique só de
   * project_id.
   */
  test('⭐⭐ o único de membros é por (portfólio, projeto) — nunca global em project_id', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.match(
      sql,
      /unique\s*\(\s*tenant_id\s*,\s*portfolio_id\s*,\s*project_id\s*\)/i,
      'a unicidade (tenant, portfólio, projeto) sumiu — um projeto viveria uma vez só',
    );
    assert.doesNotMatch(
      sql,
      /unique\s*\(\s*(?:tenant_id\s*,\s*)?project_id\s*\)/i,
      'apareceu um unique GLOBAL de project_id — isso proibiria o projeto em vários portfólios',
    );
  });
});
