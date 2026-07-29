import type { Funnel, FunnelStage, NewOpportunity, Opportunity } from '@alsham/deals';

export interface FunnelWithStages {
  readonly funnel: Funnel;
  readonly stages: readonly FunnelStage[];
}

export interface OpportunityRow extends Opportunity {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 10 — própria (Lei do Lego §5.5.8).
 *
 * Mover e encerrar são `rpc()`: as funções do banco escrevem a trilha e
 * conferem a permissão do ato — a porta não replica o rito, só o chama.
 * Sem DELETE de negociação: o desfecho é status.
 */
export interface DealPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadFunnels(): Promise<FunnelWithStages[]>;
  loadOpportunities(): Promise<OpportunityRow[]>;
  createFunnel(input: {
    name: string;
    description: string;
    stages: readonly { name: string; position: number }[];
  }): Promise<{ funnelId: string }>;
  createOpportunity(input: NewOpportunity): Promise<{ opportunityId: string }>;
  moveOpportunity(input: {
    opportunityId: string;
    toStageId: string;
    note: string;
  }): Promise<void>;
  closeOpportunity(input: {
    opportunityId: string;
    outcome: 'won' | 'lost';
    reason: string;
  }): Promise<void>;
}
