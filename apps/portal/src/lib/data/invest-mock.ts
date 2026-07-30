import type { HoldingRow, InvestPort, PositionRow } from './invest-port';

const agora = () => new Date().toISOString();
let seq = 10;

interface MovMock {
  holdingId: string;
  kind: 'application' | 'yield' | 'redemption';
  amountCents: number;
}

const holdings: HoldingRow[] = [
  { id: 'mock-iv-1', name: 'CDB Banco Alfa', kind: 'CDB', institution: 'Banco Alfa', currency: 'BRL', status: 'active', createdAt: agora() },
  { id: 'mock-iv-2', name: 'Fundo Multimercado', kind: 'Fundo', institution: 'Gestora Beta', currency: 'BRL', status: 'active', createdAt: agora() },
  { id: 'mock-iv-3', name: 'Poupança Antiga', kind: 'Poupança', institution: 'Banco Gama', currency: 'BRL', status: 'archived', createdAt: agora() },
];

const movements: MovMock[] = [
  { holdingId: 'mock-iv-1', kind: 'application', amountCents: 1000000 },
  { holdingId: 'mock-iv-1', kind: 'yield', amountCents: 45000 },
  { holdingId: 'mock-iv-2', kind: 'application', amountCents: 500000 },
  { holdingId: 'mock-iv-2', kind: 'redemption', amountCents: 100000 },
];

function positions(): PositionRow[] {
  const out: PositionRow[] = [];
  for (const h of holdings) {
    const movs = movements.filter((m) => m.holdingId === h.id);
    if (movs.length === 0) continue;
    const signed = (m: MovMock) => (m.kind === 'redemption' ? -m.amountCents : m.amountCents);
    out.push({
      holdingId: h.id,
      holdingName: h.name,
      currency: h.currency,
      positionCents: movs.reduce((n, m) => n + signed(m), 0),
      investedCents: movs.filter((m) => m.kind === 'application').reduce((n, m) => n + m.amountCents, 0),
      yieldCents: movs.filter((m) => m.kind === 'yield').reduce((n, m) => n + m.amountCents, 0),
      redeemedCents: movs.filter((m) => m.kind === 'redemption').reduce((n, m) => n + m.amountCents, 0),
      movementCount: movs.length,
    });
  }
  return out;
}

export function createInvestMockPort(): InvestPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['invest.holding.manage', 'invest.movement.register']);
    },

    async loadHoldings() {
      return holdings.map((h) => ({ ...h }));
    },
    async loadPositions() {
      return positions();
    },

    async createHolding(input) {
      const id = `mock-iv-${(seq += 1)}`;
      holdings.push({ id, ...input, status: 'active', createdAt: agora() });
      return { holdingId: id };
    },
    async setHoldingStatus(input) {
      const h = holdings.find((x) => x.id === input.holdingId);
      if (h) (h as { status: string }).status = input.status;
    },
    async registerMovement(input) {
      if (input.kind === 'redemption') {
        const movs = movements.filter((m) => m.holdingId === input.holdingId);
        const signed = (m: MovMock) => (m.kind === 'redemption' ? -m.amountCents : m.amountCents);
        const pos = movs.reduce((n, m) => n + signed(m), 0);
        if (input.amountCents > pos) throw new Error('resgate excede a posição');
      }
      movements.push({ holdingId: input.holdingId, kind: input.kind, amountCents: input.amountCents });
    },
  };
}
