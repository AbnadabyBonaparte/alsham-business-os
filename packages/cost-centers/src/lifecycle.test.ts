import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  CENTER_TRANSITIONS,
  FULL_ALLOCATION_BP,
  RULE_TRANSITIONS,
  canCenterTransition,
  canEditRule,
  canRuleTransition,
  computeAllocations,
  isRuleComplete,
  orderCenters,
  sumBasisPoints,
  whyCannotActivate,
} from './cost-centers.ts';
import type { AllocationRule, CostCenter, RuleLine } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0043_cc.sql');
const MIGRATION_CRM = resolve(HERE, '../../../supabase/migrations/0009_crm.sql');

function regra(over: Partial<AllocationRule> = {}): AllocationRule {
  return {
    id: 'r1',
    name: 'Rateio administrativo',
    status: 'draft',
    lines: [
      { centerId: 'c1', basisPoints: 6000 },
      { centerId: 'c2', basisPoints: 4000 },
    ],
    ...over,
  };
}

describe('⭐ os ciclos — centro volta, regra é terminal', () => {
  test('o centro arquiva E volta do arquivo', () => {
    assert.equal(canCenterTransition('active', 'archived'), true);
    assert.equal(canCenterTransition('archived', 'active'), true);
  });

  test('a regra: rascunho ativa ou arquiva; ativa arquiva; arquivada é terminal', () => {
    assert.equal(canRuleTransition('draft', 'active'), true);
    assert.equal(canRuleTransition('active', 'archived'), true);
    assert.equal(canRuleTransition('draft', 'archived'), true);
    for (const to of ['draft', 'active', 'archived'] as const) {
      assert.equal(canRuleTransition('archived', to), false, `archived → ${to} não existe`);
    }
    assert.equal(canRuleTransition('active', 'draft'), false);
  });

  test('só o rascunho é plano — a regra ativa congela o desenho', () => {
    assert.equal(canEditRule('draft'), true);
    assert.equal(canEditRule('active'), false);
    assert.equal(canEditRule('archived'), false);
  });

  test('a prateleira: centros ativos primeiro, por nome', () => {
    const ordenado = orderCenters([
      { id: 'z', name: 'zeladoria', status: 'archived' },
      { id: 'b', name: 'comercial', status: 'active' },
      { id: 'a', name: 'administrativo', status: 'active' },
    ] satisfies CostCenter[]);
    assert.deepEqual(ordenado.map((c) => c.id), ['a', 'b', 'z']);
  });
});

describe('⭐ a física do 100%', () => {
  test('a regra completa soma exatamente 10000 pontos-base', () => {
    assert.equal(FULL_ALLOCATION_BP, 10000);
    assert.equal(sumBasisPoints(regra().lines), 10000);
    assert.equal(isRuleComplete(regra()), true);
  });

  test('⛔ a regra que não fecha 100% não ativa — a recusa com nome', () => {
    assert.equal(whyCannotActivate(regra()), null);
    assert.match(whyCannotActivate(regra({ lines: [] }))!, /vazia/);
    assert.match(
      whyCannotActivate(regra({ lines: [{ centerId: 'c1', basisPoints: 8300 }] }))!,
      /83,00% — o rateio fecha 100/,
    );
    assert.match(whyCannotActivate(regra({ status: 'active' }))!, /já corre/);
  });
});

describe('⭐ a matemática do rateio — cent nenhum se perde', () => {
  function total(shares: readonly { amountCents: number }[]): number {
    return shares.reduce((n, s) => n + s.amountCents, 0);
  }

  test('divisão exata: 100000 em 60/40 → 60000 e 40000', () => {
    const shares = computeAllocations(100000, regra().lines);
    assert.equal(total(shares), 100000);
    const porCentro = Object.fromEntries(shares.map((s) => [s.centerId, s.amountCents]));
    assert.equal(porCentro['c1'], 60000);
    assert.equal(porCentro['c2'], 40000);
  });

  test('⭐ divisão com resto: 100 em 3 terços (3333/3333/3334) fecha em 100', () => {
    const lines: RuleLine[] = [
      { centerId: 'a', basisPoints: 3333 },
      { centerId: 'b', basisPoints: 3333 },
      { centerId: 'c', basisPoints: 3334 },
    ];
    const shares = computeAllocations(100, lines);
    assert.equal(total(shares), 100, 'a soma é EXATAMENTE o total — nada some');
    // O último (por basis desc, depois id) leva o resto.
    assert.ok(shares.every((s) => s.amountCents >= 0));
  });

  test('⭐ o pior caso do arredondamento ainda fecha: 1 centavo em três iguais', () => {
    const lines: RuleLine[] = [
      { centerId: 'a', basisPoints: 3333 },
      { centerId: 'b', basisPoints: 3333 },
      { centerId: 'c', basisPoints: 3334 },
    ];
    const shares = computeAllocations(1, lines);
    assert.equal(total(shares), 1, 'um centavo não vira zero centavos');
  });

  test('regra vazia não rateia', () => {
    assert.deepEqual(computeAllocations(1000, []), []);
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

  test('cc.allowed_center_transition() casa com CENTER_TRANSITIONS', () => {
    const doSql = paresDoSql(MIGRATION, 'cc.allowed_center_transition');
    const doTs = new Set(CENTER_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  test('cc.allowed_rule_transition() casa com RULE_TRANSITIONS', () => {
    const doSql = paresDoSql(MIGRATION, 'cc.allowed_rule_transition');
    const doTs = new Set(RULE_TRANSITIONS.map(([f, t]) => `${f}→${t}`));
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /** ⭐ O MANTIDO assinado: o centro volta do arquivo como a contraparte do crm. */
  test('⭐ o contraste crm×cc: o arquivado volta', () => {
    const crm = readFileSync(MIGRATION_CRM, 'utf8').replace(/--[^\n]*/g, '');
    assert.ok(crm.includes("('archived', 'active')"), 'o crm perdeu a volta do arquivo — re-pergunte');
    const doSql = paresDoSql(MIGRATION, 'cc.allowed_center_transition');
    assert.ok(doSql.has('archived→active'), 'o centro deixou de voltar — a decisão era voltar');
  });

  test('⭐ a física do 100% e o livro imutável no CÓDIGO; origem por id solto; sem cron', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(sql, /v_sum <> 10000/, 'a física do 100% saiu do porteiro');
    assert.match(sql, /cc_executions_immutable/);
    assert.match(sql, /cc_allocations_immutable/);
    // A origem é id solto: source_ref sem FK.
    const exec = sql.split('create table cc.executions')[1]?.split(');')[0] ?? '';
    assert.match(exec, /source_ref\s+uuid,/);
    assert.doesNotMatch(exec, /source_ref[^,]*references/);
    assert.doesNotMatch(sql, /pg_cron|cron\.schedule/i, 'apareceu cron — o rateio é ato de gente');
    // O resto vai ao último centro: nenhum centavo se perde.
    assert.match(sql, /p_total_cents - v_acc/);
  });
});
