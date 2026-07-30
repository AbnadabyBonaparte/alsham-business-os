import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canActivate,
  canClose,
  canEditTrave,
  canTransition,
  isOverBudget,
  orderBudgets,
  remaining,
  usedPercent,
} from './budgets.ts';
import type { Budget, BudgetStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0044_bud.sql');
const MIGRATION_GOAL = resolve(HERE, '../../../supabase/migrations/0038_goal.sql');

function orc(over: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    name: 'Marketing Q3',
    category: 'Marketing',
    startsOn: '2026-07-01',
    endsOn: '2026-09-30',
    limitCents: 500000,
    currency: 'BRL',
    status: 'draft',
    ...over,
  };
}

describe('o ciclo de vida — espelho da migration', () => {
  /**
   * ⭐ O teste LÊ a migration e confere que o SQL e o TS dizem a mesma coisa.
   * Espelho de `bud.allowed_transition()` — closed é TERMINAL.
   */
  test('ALLOWED_TRANSITIONS é idêntico ao corpo de bud.allowed_transition()', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    const corpo = sql.match(/allowed_transition[\s\S]*?\(p_from, p_to\) in \(([\s\S]*?)\)\s*;/);
    assert.ok(corpo, 'não achei o corpo de bud.allowed_transition na migration');
    const listaSql = corpo[1] ?? '';
    const paresSql = [...listaSql.matchAll(/\('([a-z]+)',\s*'([a-z]+)'\)/g)]
      .map((m) => `${m[1]}->${m[2]}`)
      .sort();
    const paresTs = ALLOWED_TRANSITIONS.map(([f, t]) => `${f}->${t}`).sort();
    assert.deepEqual(paresTs, paresSql);
  });

  test('draft ativa; active fecha; closed é terminal', () => {
    assert.ok(canActivate('draft'));
    assert.ok(!canActivate('active'));
    assert.ok(!canActivate('closed'));
    assert.ok(canClose('active'));
    assert.ok(!canClose('draft'));
    assert.ok(!canClose('closed'));
  });

  test('nenhuma transição sai de closed — o período fechado é orçamento acabado', () => {
    const todos: BudgetStatus[] = ['draft', 'active', 'closed'];
    for (const to of todos) {
      assert.ok(!canTransition('closed', to), `closed → ${to} não deveria existir`);
    }
  });

  test('⭐ só o rascunho edita a trave — ativar congela', () => {
    assert.ok(canEditTrave('draft'));
    assert.ok(!canEditTrave('active'));
    assert.ok(!canEditTrave('closed'));
  });
});

/**
 * ⭐⭐ O CONTRASTE goal×bud — a DECISÃO ASSINADA.
 *
 * O `bud` MANTÉM a física do `goal`: ativar congela a trave. Não é cópia por
 * consistência — é a mesma verdade ("a régua não se move no meio do jogo")
 * aplicada ao dinheiro. Este teste prova que os DOIS congelam na ativação,
 * lendo as duas migrations. Se um dia o `goal` deixasse de congelar, este
 * teste cairia e forçaria a re-decisão — que é exatamente o ponto.
 */
describe('⭐⭐ contraste goal×bud — os dois congelam a trave na ativação', () => {
  test('a migration do goal congela alvo/período ao ativar', () => {
    const g = readFileSync(MIGRATION_GOAL, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(g, /target_value is distinct from old\.target_value/);
    assert.match(g, /congelam na ativação|não muda de trave/);
  });

  test('a migration do bud congela categoria/período/teto ao ativar', () => {
    const b = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(b, /new\.category is distinct from old\.category/);
    assert.match(b, /new\.limit_cents is distinct from old\.limit_cents/);
    assert.match(b, /a trave congelou na ativação/);
  });

  test('e no TS os dois são o mesmo predicado: só draft edita a trave', () => {
    // O bud expõe canEditTrave; a igualdade de VERDADE é: fora do rascunho,
    // a trave não se move. É a asserção do produto, não do banco.
    for (const s of ['active', 'closed'] as BudgetStatus[]) {
      assert.equal(canEditTrave(s), false);
    }
    assert.equal(canEditTrave('draft'), true);
  });
});

describe('o saldo e o estouro — calculados, honestos', () => {
  test('saldo é teto menos realizado', () => {
    assert.equal(remaining(orc({ limitCents: 500000 }), 120000), 380000);
    assert.equal(remaining(orc({ limitCents: 500000 }), 500000), 0);
    assert.equal(remaining(orc({ limitCents: 500000 }), 600000), -100000);
  });

  test('o percentual gasto passa de 100 quando estoura — o estouro não se esconde', () => {
    assert.equal(usedPercent(orc({ limitCents: 500000 }), 250000), 50);
    assert.equal(usedPercent(orc({ limitCents: 500000 }), 500000), 100);
    assert.equal(usedPercent(orc({ limitCents: 500000 }), 600000), 120);
  });

  test('estouro é realizado maior que o teto', () => {
    assert.ok(!isOverBudget(orc({ limitCents: 500000 }), 500000));
    assert.ok(isOverBudget(orc({ limitCents: 500000 }), 500001));
  });
});

describe('a ordem de leitura do quadro', () => {
  test('ativos primeiro, depois rascunhos, depois fechados; dentro, período recente no topo', () => {
    const lista: Budget[] = [
      orc({ id: 'f', status: 'closed', startsOn: '2026-01-01' }),
      orc({ id: 'd', status: 'draft', startsOn: '2026-05-01' }),
      orc({ id: 'a1', status: 'active', startsOn: '2026-04-01' }),
      orc({ id: 'a2', status: 'active', startsOn: '2026-07-01' }),
    ];
    const ordem = orderBudgets(lista).map((b) => b.id);
    assert.deepEqual(ordem, ['a2', 'a1', 'd', 'f']);
  });
});
