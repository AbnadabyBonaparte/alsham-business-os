import type { BudgetRow, BudPort } from './bud-port';

const agora = () => new Date().toISOString();
let seq = 10;

interface Store extends BudgetRow {}

const budgets: Store[] = [
  {
    id: 'mock-bud-1',
    name: 'Marketing Q3',
    category: 'Marketing',
    startsOn: '2026-07-01',
    endsOn: '2026-09-30',
    limitCents: 500000,
    currency: 'BRL',
    status: 'active',
    createdAt: agora(),
    realizedCents: 320000,
    remainingCents: 180000,
    movementCount: 4,
  },
  {
    id: 'mock-bud-2',
    name: 'Viagens (rascunho)',
    category: 'Viagens',
    startsOn: '2026-07-01',
    endsOn: '2026-12-31',
    limitCents: 150000,
    currency: 'BRL',
    status: 'draft',
    createdAt: agora(),
    realizedCents: 0,
    remainingCents: 150000,
    movementCount: 0,
  },
  {
    id: 'mock-bud-3',
    name: 'Infraestrutura Q2',
    category: 'Infraestrutura',
    startsOn: '2026-04-01',
    endsOn: '2026-06-30',
    limitCents: 300000,
    currency: 'BRL',
    status: 'closed',
    createdAt: agora(),
    realizedCents: 305000,
    remainingCents: -5000,
    movementCount: 6,
  },
];

export function createBudMockPort(): BudPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['bud.budget.manage', 'bud.budget.close']);
    },

    async loadBudgets() {
      return budgets.map((b) => ({ ...b }));
    },

    async createBudget(input) {
      const id = `mock-bud-${(seq += 1)}`;
      budgets.push({
        id,
        name: input.name,
        category: input.category,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        limitCents: input.limitCents,
        currency: input.currency,
        status: 'draft',
        createdAt: agora(),
        realizedCents: 0,
        remainingCents: input.limitCents,
        movementCount: 0,
      });
      return { budgetId: id };
    },

    async renameBudget(input) {
      const b = budgets.find((x) => x.id === input.budgetId);
      if (b) (b as { name: string }).name = input.name;
    },

    async setBudgetStatus(input) {
      const b = budgets.find((x) => x.id === input.budgetId);
      if (!b) throw new Error('orçamento não encontrado');
      if (input.status === 'active' && b.status !== 'draft') throw new Error('só o rascunho ativa');
      if (input.status === 'closed' && b.status !== 'active') throw new Error('só o ativo fecha');
      (b as { status: string }).status = input.status;
    },
  };
}
