import { PERMISSIONS, canClose, validateNewOpportunity } from '@alsham/deals';
import type { NewOpportunity } from '@alsham/deals';

import { DataPortError } from './port';
import type { DealPort, FunnelWithStages, OpportunityRow } from './deal-port';

const agora = () => new Date().toISOString();

let seq = 1;

const funnels: FunnelWithStages[] = [
  {
    funnel: {
      id: 'mock-funnel-1',
      tenantId: 'mock-tenant',
      name: 'Vendas diretas',
      description: '',
      status: 'active',
    },
    stages: [
      { id: 'mock-stage-1', funnelId: 'mock-funnel-1', position: 0, name: 'contato' },
      { id: 'mock-stage-2', funnelId: 'mock-funnel-1', position: 1, name: 'conversa' },
      { id: 'mock-stage-3', funnelId: 'mock-funnel-1', position: 2, name: 'proposta na mesa' },
    ],
  },
];

const opportunities: OpportunityRow[] = [
  {
    id: 'mock-opp-1',
    tenantId: 'mock-tenant',
    funnelId: 'mock-funnel-1',
    currentStageId: 'mock-stage-2',
    title: 'Contrato anual — demo',
    description: '',
    valueCents: 500000,
    currency: 'BRL',
    probability: 40,
    expectedCloseDate: null,
    partyId: null,
    partyName: 'Prospecto Demo',
    tags: [],
    status: 'open',
    outcomeReason: '',
    createdAt: agora(),
  },
];

export function createDealMockPort(): DealPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(Object.values(PERMISSIONS));
    },

    async loadFunnels() {
      return funnels.map((f) => ({ funnel: { ...f.funnel }, stages: f.stages.map((s) => ({ ...s })) }));
    },

    async loadOpportunities() {
      return opportunities.map((o) => ({ ...o, tags: [...o.tags] }));
    },

    async createFunnel(input) {
      const id = `mock-funnel-${++seq}`;
      funnels.unshift({
        funnel: {
          id,
          tenantId: 'mock-tenant',
          name: input.name,
          description: input.description,
          status: 'active',
        },
        stages: input.stages.map((s, i) => ({
          id: `mock-stage-${id}-${i}`,
          funnelId: id,
          position: s.position,
          name: s.name,
        })),
      });
      return { funnelId: id };
    },

    async createOpportunity(input: NewOpportunity) {
      const erro = validateNewOpportunity(input);
      if (erro !== null) throw new DataPortError(erro);
      const funil = funnels.find((f) => f.funnel.id === input.funnelId);
      if (!funil) throw new DataPortError('Funil não encontrado.');
      const primeiro = [...funil.stages].sort((a, b) => a.position - b.position)[0];
      if (!primeiro) throw new DataPortError('O funil não tem estágios.');
      const id = `mock-opp-${++seq}`;
      opportunities.unshift({
        id,
        tenantId: 'mock-tenant',
        funnelId: input.funnelId,
        currentStageId: primeiro.id,
        title: input.title,
        description: input.description ?? '',
        valueCents: input.valueCents ?? null,
        currency: input.currency ?? null,
        probability: input.probability ?? null,
        expectedCloseDate: input.expectedCloseDate ?? null,
        partyId: input.partyId ?? null,
        partyName: input.partyName ?? null,
        tags: input.tags ?? [],
        status: 'open',
        outcomeReason: '',
        createdAt: agora(),
      });
      return { opportunityId: id };
    },

    async moveOpportunity(input) {
      const idx = opportunities.findIndex((o) => o.id === input.opportunityId);
      if (idx < 0) throw new DataPortError('Negociação não encontrada.');
      const atual = opportunities[idx]!;
      if (atual.status !== 'open') {
        throw new DataPortError('Negociação encerrada não se move.');
      }
      opportunities[idx] = { ...atual, currentStageId: input.toStageId };
    },

    async closeOpportunity(input) {
      const idx = opportunities.findIndex((o) => o.id === input.opportunityId);
      if (idx < 0) throw new DataPortError('Negociação não encontrada.');
      const atual = opportunities[idx]!;
      if (!canClose(atual.status)) {
        throw new DataPortError('Negociação encerrada não se encerra de novo.');
      }
      if (input.outcome === 'lost' && input.reason.trim().length === 0) {
        throw new DataPortError('Perder exige a razão.');
      }
      opportunities[idx] = {
        ...atual,
        status: input.outcome,
        outcomeReason: input.reason,
        currentStageId: null,
      };
    },
  };
}
