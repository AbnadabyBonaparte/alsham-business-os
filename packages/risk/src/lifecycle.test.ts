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
  canReopen,
  canClose,
  canMitigate,
  canEditContent,
  severity,
  orderRisks,
  summarizeRisks,
} from './risk.ts';
import type { Risk } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0075_risk.sql');
const MIGRATION_PROJ = resolve(HERE, '../../../supabase/migrations/0068_proj.sql');

function risco(over: Partial<Risk> = {}): Risk {
  return {
    id: 'r1',
    projectId: 'p1',
    projectName: 'Projeto',
    description: 'Um risco',
    probability: 3,
    impact: 3,
    mitigationPlan: '',
    status: 'open',
    createdAt: '2027-01-01T00:00:00Z',
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

describe('o ciclo de vida do risco', () => {
  test('o caminho feliz: open → mitigated → closed', () => {
    assert.equal(canTransition('open', 'mitigated'), true);
    assert.equal(canTransition('mitigated', 'closed'), true);
  });

  test('encerrar direto do aberto também existe', () => {
    assert.equal(canTransition('open', 'closed'), true);
  });

  test('⭐⭐ O DIVERGE: mitigated REABRE (mitigated → open)', () => {
    assert.equal(canTransition('mitigated', 'open'), true);
    assert.equal(canReopen('mitigated'), true);
    assert.equal(canReopen('open'), false);
    assert.equal(canReopen('closed'), false);
  });

  test('⭐ closed é terminal: não sai de lá', () => {
    for (const destino of ALL_STATUSES.filter((s) => s !== 'closed')) {
      assert.equal(canTransition('closed', destino), false, `closed → ${destino}`);
    }
  });

  test('mitigar só do aberto; encerrar do aberto e do mitigado', () => {
    assert.equal(canMitigate('open'), true);
    assert.equal(canMitigate('mitigated'), false);
    assert.equal(canMitigate('closed'), false);
    assert.equal(canClose('open'), true);
    assert.equal(canClose('mitigated'), true);
    assert.equal(canClose('closed'), false);
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
    assert.deepEqual([...nextStatuses('open')].sort(), ['closed', 'mitigated']);
    assert.deepEqual([...nextStatuses('mitigated')].sort(), ['closed', 'open']);
    assert.deepEqual([...nextStatuses('closed')], []);
  });

  test('canEditContent: o encerrado não se edita', () => {
    assert.equal(canEditContent('open'), true);
    assert.equal(canEditContent('mitigated'), true);
    assert.equal(canEditContent('closed'), false);
  });

  test('⭐ severity é probabilidade × impacto (leitura, nunca decisão)', () => {
    assert.equal(severity(1, 1), 1);
    assert.equal(severity(3, 4), 12);
    assert.equal(severity(5, 5), 25);
  });

  test('a leitura ordena abertos, depois mitigados, depois fechados; dentro, mais severo primeiro', () => {
    const lista = [
      risco({ id: 'c', status: 'closed', probability: 5, impact: 5 }),
      risco({ id: 'a-baixo', status: 'open', probability: 1, impact: 2 }),
      risco({ id: 'a-alto', status: 'open', probability: 4, impact: 5 }),
      risco({ id: 'm', status: 'mitigated', probability: 2, impact: 2 }),
    ];
    assert.deepEqual(orderRisks(lista).map((r) => r.id), ['a-alto', 'a-baixo', 'm', 'c']);
  });

  test('empate de severidade desfeito pela ordem de criação (mais antigo primeiro)', () => {
    const lista = [
      risco({ id: 'novo', status: 'open', probability: 2, impact: 2, createdAt: '2027-03-01T00:00:00Z' }),
      risco({ id: 'velho', status: 'open', probability: 2, impact: 2, createdAt: '2027-01-01T00:00:00Z' }),
    ];
    assert.deepEqual(orderRisks(lista).map((r) => r.id), ['velho', 'novo']);
  });

  test('o resumo conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      risco({ status: 'open' }),
      risco({ status: 'mitigated' }),
      risco({ status: 'closed' }),
      risco({ status: 'closed' }),
    ];
    assert.deepEqual(summarizeRisks(lista), { total: 4, open: 1, mitigated: 1, closed: 2 });
    assert.deepEqual(summarizeRisks([]), { total: 0, open: 0, mitigated: 0, closed: 0 });
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  test('risk.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'risk.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.equal(doSql.size, 4, 'o SQL declara quatro pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐⭐ O DIVERGE assinado. Duas afirmações que têm de continuar verdadeiras ao
   * mesmo tempo:
   *   1. no `risk`, `mitigated → open` EXISTE (reabrir — o mesmo risco volta) e
   *      `closed → *` NÃO existe (terminal);
   *   2. no `proj`, NENHUM fim reabre (completed/cancelled são terminais).
   * Se alguém "uniformizar" os dois — tirar a reabertura do risk, ou dar uma
   * volta ao projeto — este teste reprova.
   */
  test('⭐⭐ risk reabre de mitigated mas NÃO de closed; proj não reabre de fim nenhum', () => {
    const doRisk = paresDoSql(MIGRATION, 'risk.allowed_transition');
    assert.ok(doRisk.has('mitigated→open'), 'o risk perdeu a reabertura (mitigated → open)');
    for (const par of doRisk) {
      const [de] = par.split('→');
      assert.ok(de !== 'closed', `o risco encerrado ganhou uma volta (${par}) — closed é terminal`);
    }

    const doProj = paresDoSql(MIGRATION_PROJ, 'proj.allowed_transition');
    for (const par of doProj) {
      const [de] = par.split('→');
      assert.ok(
        !['completed', 'cancelled'].includes(de!),
        `o projeto ganhou uma volta (${par}) — o encerrado não reabre`,
      );
    }
  });

  /**
   * ⭐ A régua 1–5 é física do método — mora numa CHECK constraint no banco, não
   * em validação de aplicação apenas. Este teste confere que as duas colunas
   * carregam o CHECK de 1..5 na migration.
   */
  test('⭐ a régua 1–5 é CHECK no banco, nas duas colunas', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.match(sql, /probability\s+int\s+not null\s+check \(probability between 1 and 5\)/i);
    assert.match(sql, /impact\s+int\s+not null\s+check \(impact between 1 and 5\)/i);
  });

  /**
   * ⭐ A severidade NÃO é coluna: é leitura (`orderRisks`). Este teste confere
   * que nenhuma coluna de severidade nasceu na migration.
   */
  test('⭐ severidade não é coluna — é leitura do pacote', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.doesNotMatch(sql, /\bseverity\s+(int|smallint|numeric|integer)/i);
  });
});
