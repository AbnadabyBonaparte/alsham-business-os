import type { DreLineRow, DrePort, DreResultRow, DreStatementRow } from './dre-port';

const agora = () => new Date().toISOString();
let seq = 10;

const lines: DreLineRow[] = [
  { id: 'mock-dl-1', name: 'Vendas', kind: 'revenue', matchCategory: 'Vendas', position: 0, currency: 'BRL', status: 'active', createdAt: agora() },
  { id: 'mock-dl-2', name: 'Custo dos Serviços', kind: 'cost', matchCategory: 'CSV', position: 1, currency: 'BRL', status: 'active', createdAt: agora() },
  { id: 'mock-dl-3', name: 'Aluguel', kind: 'expense', matchCategory: 'Aluguel', position: 2, currency: 'BRL', status: 'active', createdAt: agora() },
  { id: 'mock-dl-4', name: 'Salários (sem lançamento)', kind: 'expense', matchCategory: 'Salários', position: 3, currency: 'BRL', status: 'active', createdAt: agora() },
];

// ⭐ A linha "Salários" existe no plano mas NÃO tem lançamento — não aparece no
// demonstrativo (a lição do nps), reproduzindo o INNER JOIN da view.
const statement: DreStatementRow[] = [
  { lineId: 'mock-dl-1', lineName: 'Vendas', kind: 'revenue', position: 0, currency: 'BRL', competenceMonth: '2026-07-01', amountCents: 500000, entryCount: 4 },
  { lineId: 'mock-dl-2', lineName: 'Custo dos Serviços', kind: 'cost', position: 1, currency: 'BRL', competenceMonth: '2026-07-01', amountCents: -180000, entryCount: 3 },
  { lineId: 'mock-dl-3', lineName: 'Aluguel', kind: 'expense', position: 2, currency: 'BRL', competenceMonth: '2026-07-01', amountCents: -60000, entryCount: 1 },
];

function result(): DreResultRow[] {
  const rev = statement.filter((s) => s.kind === 'revenue').reduce((n, s) => n + s.amountCents, 0);
  const cost = statement.filter((s) => s.kind === 'cost').reduce((n, s) => n + s.amountCents, 0);
  const exp = statement.filter((s) => s.kind === 'expense').reduce((n, s) => n + s.amountCents, 0);
  return [{ currency: 'BRL', competenceMonth: '2026-07-01', revenueCents: rev, costCents: cost, expenseCents: exp, resultCents: rev + cost + exp }];
}

export function createDreMockPort(): DrePort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['dre.line.manage', 'dre.statement.read']);
    },

    async loadLines() {
      return lines.map((l) => ({ ...l }));
    },
    async loadStatement() {
      return statement.map((s) => ({ ...s }));
    },
    async loadResult() {
      return result();
    },

    async createLine(input) {
      const id = `mock-dl-${(seq += 1)}`;
      lines.push({ id, ...input, status: 'active', createdAt: agora() });
      return { lineId: id };
    },
    async setLineStatus(input) {
      const l = lines.find((x) => x.id === input.lineId);
      if (l) (l as { status: string }).status = input.status;
    },
  };
}
