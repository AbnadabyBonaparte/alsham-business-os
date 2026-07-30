import type { Budget, BudgetStatus, Problem, Validation } from './types.ts';

/**
 * O motor do Módulo 29 — Orçamentos.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

/**
 * ⭐ Espelho de `bud.allowed_transition()` no `0044_bud.sql` — há teste que
 * lê a migration e compara. closed é TERMINAL: o período que vem é orçamento
 * novo.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [BudgetStatus, BudgetStatus])[] = [
  ['draft', 'active'],
  ['active', 'closed'],
];

export function canTransition(from: BudgetStatus, to: BudgetStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canActivate(status: BudgetStatus): boolean {
  return canTransition(status, 'active');
}

export function canClose(status: BudgetStatus): boolean {
  return canTransition(status, 'closed');
}

/** ⭐ Só o rascunho é plano — ativar congela a trave. */
export function canEditTrave(status: BudgetStatus): boolean {
  return status === 'draft';
}

/** O saldo (teto − realizado) — calculado; espelho da view. */
export function remaining(budget: Budget, realizedCents: number): number {
  return budget.limitCents - realizedCents;
}

/** Quanto do teto já se gastou, 0–100+ (pode passar de 100 — o estouro é honesto). */
export function usedPercent(budget: Budget, realizedCents: number): number {
  if (budget.limitCents <= 0) return 0;
  return Math.round((realizedCents * 100) / budget.limitCents);
}

export function isOverBudget(budget: Budget, realizedCents: number): boolean {
  return realizedCents > budget.limitCents;
}

/** O quadro na ordem de leitura: ativos primeiro, depois rascunhos, depois fechados. */
export function orderBudgets(budgets: readonly Budget[]): readonly Budget[] {
  const peso = (b: Budget) => (b.status === 'active' ? 0 : b.status === 'draft' ? 1 : 2);
  return [...budgets].sort((a, b) => {
    const pa = peso(a);
    const pb = peso(b);
    if (pa !== pb) return pa - pb;
    return b.startsOn.localeCompare(a.startsOn);
  });
}

const NAME_MAX = 200;
const CAT_MAX = 200;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export interface NewBudgetInput {
  readonly name?: unknown;
  readonly category?: unknown;
  readonly startsOn?: unknown;
  readonly endsOn?: unknown;
  readonly limitCents?: unknown;
  readonly currency?: unknown;
}

/** Valida um orçamento novo — período coerente, teto positivo, valor+moeda juntos. */
export function validateNewBudget(
  input: NewBudgetInput,
): Validation<{ name: string; category: string; startsOn: string; endsOn: string; limitCents: number; currency: string }> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) problems.push({ field: 'name', message: 'Dê um nome ao orçamento.' });
  else if (name.length > NAME_MAX) problems.push({ field: 'name', message: `Nome com no máximo ${NAME_MAX} caracteres.` });

  const category = texto(input.category);
  if (category === null) {
    problems.push({ field: 'category', message: 'A categoria é O dado: sem ela, não há o que casar com o caixa.' });
  } else if (category.length > CAT_MAX) {
    problems.push({ field: 'category', message: `Categoria com no máximo ${CAT_MAX} caracteres.` });
  }

  const startsOn = texto(input.startsOn);
  const endsOn = texto(input.endsOn);
  const dataOk = (d: string | null) => d !== null && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!dataOk(startsOn)) problems.push({ field: 'startsOn', message: 'O início do período é uma data.' });
  if (!dataOk(endsOn)) problems.push({ field: 'endsOn', message: 'O fim do período é uma data.' });
  if (dataOk(startsOn) && dataOk(endsOn) && endsOn! < startsOn!) {
    problems.push({ field: 'endsOn', message: 'O fim não vem antes do início.' });
  }

  const limitCents = input.limitCents;
  if (typeof limitCents !== 'number' || !Number.isInteger(limitCents) || limitCents <= 0) {
    problems.push({ field: 'limitCents', message: 'O teto é um valor positivo.' });
  }

  const currency = texto(input.currency);
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'A moeda é um código ISO — valor e moeda andam juntos.' });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      name: name!, category: category!, startsOn: startsOn!, endsOn: endsOn!,
      limitCents: limitCents as number, currency: currency!,
    },
  };
}
