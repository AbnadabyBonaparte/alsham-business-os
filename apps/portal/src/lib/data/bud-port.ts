import type { Budget, BudgetStatus } from '@alsham/budgets';

export interface BudgetRow extends Budget {
  readonly createdAt: string;
  /** O realizado e o saldo — SEMPRE da view, nunca colunas do orçamento. */
  readonly realizedCents: number;
  readonly remainingCents: number;
  readonly movementCount: number;
}

/**
 * Porta de dados do Módulo 29 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: apagar orçamento (fecha-se o período), digitar o
 * realizado (é view calculada do livro do cash), escrever a projeção à mão
 * (quem escreve é a composição do apps/api, service_role). A tela só cria,
 * ativa (congela a trave) e fecha (terminal).
 */
export interface BudPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadBudgets(): Promise<BudgetRow[]>;
  createBudget(input: {
    name: string;
    category: string;
    startsOn: string;
    endsOn: string;
    limitCents: number;
    currency: string;
  }): Promise<{ budgetId: string }>;
  renameBudget(input: { budgetId: string; name: string }): Promise<void>;
  setBudgetStatus(input: { budgetId: string; status: BudgetStatus }): Promise<void>;
}
