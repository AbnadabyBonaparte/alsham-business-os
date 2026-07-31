import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ARCHIVE_TRANSITIONS,
  ALL_STATUSES,
  ALL_COMPLIANCE,
  canArchiveTransition,
  nextArchiveStatuses,
  canArchive,
  canRestore,
  canReassess,
  orderRequirements,
  summarizeRequirements,
} from './iso.ts';
import type { Requirement } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0081_iso.sql');

function requirement(over: Partial<Requirement> = {}): Requirement {
  return {
    id: 'r1',
    clauseReference: 'ISO 9001:2015 — 8.5.1',
    description: 'Controle da produção',
    compliance: 'compliant',
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

describe('o ciclo de ARQUIVAMENTO do requisito (não da conformidade)', () => {
  test('o caminho: active ↔ archived, nos dois sentidos', () => {
    assert.equal(canArchiveTransition('active', 'archived'), true);
    assert.equal(canArchiveTransition('archived', 'active'), true);
  });

  test('⭐ arquivar existe do ativo; reabrir existe do arquivado', () => {
    assert.equal(canArchive('active'), true);
    assert.equal(canArchive('archived'), true); // já arquivado → no-op verdadeiro
    assert.equal(canRestore('archived'), true);
    assert.equal(canRestore('active'), true); // já ativo → no-op verdadeiro
  });

  test('⭐ a matriz N×N: canArchiveTransition concorda com a tabela (o mesmo estado é no-op)', () => {
    const permitidos = new Set(ARCHIVE_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    for (const de of ALL_STATUSES) {
      for (const para of ALL_STATUSES) {
        const esperado = de === para || permitidos.has(`${de}→${para}`);
        assert.equal(canArchiveTransition(de, para), esperado, `${de} → ${para}`);
      }
    }
  });

  test('nextArchiveStatuses devolve exatamente o que a tabela permite', () => {
    assert.deepEqual([...nextArchiveStatuses('active')], ['archived']);
    assert.deepEqual([...nextArchiveStatuses('archived')], ['active']);
  });

  test('a leitura ordena ativos primeiro, depois arquivados; dentro, por cláusula', () => {
    const lista = [
      requirement({ id: 'z', clauseReference: 'ISO 9001 — 9.1', status: 'active' }),
      requirement({ id: 'a', clauseReference: 'ISO 9001 — 4.1', status: 'archived' }),
      requirement({ id: 'm', clauseReference: 'ISO 9001 — 5.1', status: 'active' }),
    ];
    assert.deepEqual(orderRequirements(lista).map((r) => r.id), ['m', 'z', 'a']);
  });

  test('o resumo conta por estado E por conformidade — todo número é length', () => {
    const lista = [
      requirement({ status: 'active', compliance: 'compliant' }),
      requirement({ status: 'archived', compliance: 'non_compliant' }),
      requirement({ status: 'archived', compliance: 'not_applicable' }),
    ];
    assert.deepEqual(summarizeRequirements(lista), {
      total: 3,
      active: 1,
      archived: 2,
      compliant: 1,
      nonCompliant: 1,
      notApplicable: 1,
    });
    assert.deepEqual(summarizeRequirements([]), {
      total: 0,
      active: 0,
      archived: 0,
      compliant: 0,
      nonCompliant: 0,
      notApplicable: 0,
    });
  });
});

describe('⭐ a tabela de ARQUIVAMENTO é a MESMA nos dois lados', () => {
  test('iso.allowed_transition() e ARCHIVE_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'iso.allowed_transition');
    const doTs = new Set(ARCHIVE_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), ['active→archived', 'archived→active']);
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });
});

/**
 * ⭐⭐ O DIVERGE ASSINADO — a conformidade é MUTÁVEL, não um ciclo terminal.
 *
 * Todo módulo com ciclo de vida terminal (o `nc`: open→closed; o `audit`/`capa`:
 * fins terminais) tem uma máquina de estados com transições fixas. O requisito
 * ISO NÃO tem — a conformidade é uma AVALIAÇÃO que muda a cada auditoria:
 * qualquer valor vai para qualquer valor. A prova é dupla: (1) NÃO existe no
 * motor nem na migration uma tabela de transição de conformidade; (2) o único
 * gate é o ESCOPO — só cláusula ativa se reavalia (arquivada saiu de escopo).
 */
describe('⭐⭐ a conformidade é MUTÁVEL — o DIVERGE de todo módulo com ciclo terminal', () => {
  test('há os três valores de conformidade, e nenhum é terminal', () => {
    assert.deepEqual([...ALL_COMPLIANCE].sort(), ['compliant', 'non_compliant', 'not_applicable']);
  });

  test('⛔ NÃO existe transição de conformidade na migration (nenhum par compliant→non_compliant)', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const semComentario = sql
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    // A única allowed_transition é a de ARQUIVAMENTO (active/archived). Um par de
    // conformidade dentro de qualquer allowed_transition seria uma máquina de
    // estados de conformidade — exatamente o que este módulo NÃO tem.
    assert.doesNotMatch(
      semComentario,
      /\(\s*'(?:compliant|non_compliant|not_applicable)'\s*,\s*'(?:compliant|non_compliant|not_applicable)'\s*\)/,
      'apareceu um par de transição de conformidade — a conformidade deixaria de ser mutável',
    );
    // E os pares de allowed_transition são só os de arquivamento.
    const pares = paresDoSql(MIGRATION, 'iso.allowed_transition');
    for (const par of pares) {
      const [de, para] = par.split('→');
      assert.ok(
        ['active', 'archived'].includes(de!) && ['active', 'archived'].includes(para!),
        `allowed_transition tem um par que não é de arquivamento: ${par}`,
      );
    }
  });

  test('⭐ só cláusula ATIVA se reavalia; a arquivada saiu de escopo', () => {
    assert.equal(canReassess('active'), true);
    assert.equal(canReassess('archived'), false);
  });

  test('⛔ não há função de transição de conformidade exportada no motor', async () => {
    const motor = await import('./iso.ts');
    assert.ok(!('canComplianceTransition' in motor), 'a conformidade não tem máquina de estados');
    assert.ok(!('COMPLIANCE_TRANSITIONS' in motor), 'a conformidade não tem tabela de pares');
  });
});
