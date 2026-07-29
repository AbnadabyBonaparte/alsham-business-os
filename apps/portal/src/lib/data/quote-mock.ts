import { PERMISSIONS, canTransition } from '@alsham/quotes';
import type { Proposal, ProposalStatus } from '@alsham/quotes';

import { DataPortError } from './port';
import type { ProposalRow, QuotePort } from './quote-port';

const agora = () => new Date().toISOString();

let seq = 1;
const store: ProposalRow[] = [
  {
    id: 'mock-quote-1',
    externalRef: 'PROP-DEMO-0001',
    currency: 'BRL',
    prospectName: 'Prospecto Demo',
    counterpartyTaxId: null,
    description: 'Proposta de demonstração',
    validUntil: null,
    totalCents: 150000,
    status: 'draft',
    decidedAt: null,
    decisionNote: '',
    createdAt: agora(),
    items: [
      {
        lineNo: 1,
        description: 'Consultoria — pacote mensal',
        quantity: 10,
        unitAmountCents: 15000,
        lineTotalCents: 150000,
      },
    ],
  },
];

export function createQuoteMockPort(): QuotePort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(Object.values(PERMISSIONS));
    },

    async loadProposals() {
      return store.map((p) => ({ ...p, items: p.items.map((i) => ({ ...i })) }));
    },

    async createProposal(proposal: Proposal) {
      const id = `mock-quote-${++seq}`;
      store.unshift({
        ...proposal,
        id,
        createdAt: agora(),
        items: proposal.items.map((i) => ({ ...i })),
      });
      return { proposalId: id };
    },

    async updateStatus(input: {
      proposalId: string;
      status: ProposalStatus;
      decisionNote?: string;
    }) {
      const idx = store.findIndex((p) => p.id === input.proposalId);
      if (idx < 0) throw new DataPortError('Proposta não encontrada.');
      const atual = store[idx]!;
      if (!canTransition(atual.status, input.status)) {
        throw new DataPortError('Esta mudança de estado não existe no ciclo de vida.');
      }
      const decidida = input.status === 'accepted' || input.status === 'declined';
      store[idx] = {
        ...atual,
        status: input.status,
        decidedAt: decidida ? agora() : atual.decidedAt,
        decisionNote: input.decisionNote ?? atual.decisionNote,
      };
    },
  };
}
