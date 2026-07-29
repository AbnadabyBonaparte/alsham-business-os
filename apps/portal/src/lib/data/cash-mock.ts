import type { Category } from '@alsham/cashflow';

import type { CashPort, EntryRow } from './cash-port';

const agora = () => new Date().toISOString();
const dia = (delta: number) => new Date(Date.now() + delta * 86400000).toISOString().slice(0, 10);

let seq = 1;

const categories: Category[] = [
  { id: 'mock-cat-1', name: 'aluguel', status: 'active' },
  { id: 'mock-cat-2', name: 'vendas', status: 'active' },
];

const entries: EntryRow[] = [
  {
    id: 'mock-cash-1',
    kind: 'in',
    amountCents: 250000,
    currency: 'BRL',
    description: 'vendas da semana',
    reason: '',
    categoryId: 'mock-cat-2',
    account: null,
    externalRef: null,
    occurredOn: dia(-2),
    createdAt: agora(),
  },
  {
    id: 'mock-cash-2',
    kind: 'out',
    amountCents: 350000,
    currency: 'BRL',
    description: 'aluguel do mês',
    reason: '',
    categoryId: 'mock-cat-1',
    account: null,
    externalRef: null,
    occurredOn: dia(-1),
    createdAt: agora(),
  },
  {
    id: 'mock-cash-3',
    kind: 'in',
    amountCents: 90000,
    currency: 'BRL',
    description: 'recebimento avulso',
    reason: '',
    categoryId: null,
    account: 'caixa loja',
    externalRef: null,
    occurredOn: dia(0),
    createdAt: agora(),
  },
];

export function createCashMockPort(): CashPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['cash.entry.register', 'cash.entry.adjust', 'cash.category.manage']);
    },

    async loadEntries() {
      return [...entries];
    },

    async loadCategories() {
      return [...categories];
    },

    async createEntry(input) {
      const id = `mock-cash-${(seq += 1)}`;
      entries.unshift({
        id,
        kind: input.kind,
        amountCents: input.amountCents,
        currency: input.currency,
        description: input.description,
        reason: input.reason,
        categoryId: input.categoryId,
        account: input.account,
        externalRef: null,
        occurredOn: input.occurredOn,
        createdAt: agora(),
      });
      return { entryId: id };
    },

    async createCategory(input) {
      const id = `mock-cat-${(seq += 1)}`;
      categories.push({ id, name: input.name, status: 'active' });
      return { categoryId: id };
    },

    async setCategoryStatus(input) {
      const i = categories.findIndex((c) => c.id === input.categoryId);
      if (i >= 0) categories[i] = { ...categories[i]!, status: input.status };
    },
  };
}
