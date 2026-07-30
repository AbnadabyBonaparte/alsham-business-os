import type {
  Contribution,
  Expense,
  NewContributionInput,
  NewExpenseInput,
  Problem,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 40 — Fundo de Promoção.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e o gatilho `fund.guard_expense_balance()` do `0055_fund.sql`; o
 * pacote avisa antes, com a MESMA régua: o saldo nunca fica negativo.
 */

/** O saldo = soma das contribuições − soma dos gastos. Espelho de fund.balance. */
export function computeBalance(
  contributions: readonly Pick<Contribution, 'amountCents'>[],
  expenses: readonly Pick<Expense, 'amountCents'>[],
): number {
  const totalContributed = contributions.reduce((acc, c) => acc + c.amountCents, 0);
  const totalSpent = expenses.reduce((acc, e) => acc + e.amountCents, 0);
  return totalContributed - totalSpent;
}

/**
 * ⭐⭐ Espelho de `fund.guard_expense_balance()`: um gasto só é aceito se o
 * saldo, DEPOIS de descontado, não fica negativo. A QUARTA resposta (mais
 * estrita que bank/inv/invest) — ver lifecycle.test.ts.
 */
export function canSpend(balanceCents: number, amountCents: number): boolean {
  return amountCents > 0 && balanceCents - amountCents >= 0;
}

/**
 * Por que um gasto NÃO pode ser lançado — a razão em texto, para a tela
 * explicar antes de submeter (o gatilho no banco é quem realmente decide).
 */
export function whyCannotSpend(
  balanceCents: number,
  amountCents: number,
  reason: string,
): string | null {
  if (amountCents <= 0) {
    return 'O valor do gasto é um valor positivo.';
  }
  if (reason.trim().length === 0) {
    return 'Todo gasto exige uma razão.';
  }
  if (balanceCents - amountCents < 0) {
    return 'o fundo não pode ficar negativo: gastar mais do que arrecadou é descontrole';
  }
  return null;
}

export interface FundSummary {
  readonly totalContributedCents: number;
  readonly totalSpentCents: number;
  readonly balanceCents: number;
}

/** O resumo do fundo — soma honesta, sem número decorativo. */
export function summarize(
  contributions: readonly Pick<Contribution, 'amountCents'>[],
  expenses: readonly Pick<Expense, 'amountCents'>[],
): FundSummary {
  const totalContributedCents = contributions.reduce((acc, c) => acc + c.amountCents, 0);
  const totalSpentCents = expenses.reduce((acc, e) => acc + e.amountCents, 0);
  return {
    totalContributedCents,
    totalSpentCents,
    balanceCents: totalContributedCents - totalSpentCents,
  };
}

const MOEDA_RE = /^[A-Z]{3}$/;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

function moeda(valor: unknown): string | null | undefined {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string' || !MOEDA_RE.test(valor)) return undefined;
  return valor;
}

/** Valida uma contribuição nova. Lojista, competência e valor são obrigatórios. */
export function validateNewContribution(input: NewContributionInput): Validation<Contribution> {
  const problems: Problem[] = [];

  const storeId = texto(input.storeId);
  if (storeId === null) {
    problems.push({ field: 'storeId', message: 'Informe o lojista contribuinte.' });
  }

  const storeName = texto(input.storeName) ?? '';

  const competenceOn = texto(input.competenceOn);
  if (competenceOn === null) {
    problems.push({ field: 'competenceOn', message: 'Informe a competência da contribuição.' });
  }

  const amountCents = typeof input.amountCents === 'number' ? input.amountCents : NaN;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    problems.push({ field: 'amountCents', message: 'A contribuição é um valor positivo.' });
  }

  const currency = moeda(input.currency);
  if (currency === undefined) {
    problems.push({ field: 'currency', message: 'A moeda é um código ISO de três letras.' });
  }

  const note = texto(input.note) ?? '';

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      storeId: storeId!,
      storeName,
      competenceOn: competenceOn!,
      amountCents,
      currency: currency ?? null,
      note,
    },
  };
}

/** Valida um gasto novo. Valor e razão são obrigatórios; a campanha é opcional. */
export function validateNewExpense(input: NewExpenseInput): Validation<Expense> {
  const problems: Problem[] = [];

  const campaignId = texto(input.campaignId);
  const campaignName = texto(input.campaignName) ?? '';

  const amountCents = typeof input.amountCents === 'number' ? input.amountCents : NaN;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    problems.push({ field: 'amountCents', message: 'O gasto é um valor positivo.' });
  }

  const currency = moeda(input.currency);
  if (currency === undefined) {
    problems.push({ field: 'currency', message: 'A moeda é um código ISO de três letras.' });
  }

  const reason = texto(input.reason);
  if (reason === null) {
    problems.push({ field: 'reason', message: 'Todo gasto exige uma razão.' });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      campaignId,
      campaignName,
      amountCents,
      currency: currency ?? null,
      reason: reason!,
    },
  };
}
