/**
 * Tipos do Módulo 10 — Funil Comercial.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐ **A LEI DAS ETAPAS vive aqui por ausência, pela segunda vez:** não há
 * `type Stage = 'prospecção' | ...`. O estágio é DADO DO TENANT — linha de
 * `deal.funnel_stages` com o nome que a casa escolheu.
 *
 * ⭐ **E a fronteira com o crm vive no TIPO:** `partyId` é `string | null`
 * SOLTA + `partyName` carimbado — nunca um objeto importado de `@alsham/crm`.
 *
 * @see supabase/migrations/0025_deal.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-DEAL-SPEC.md — o fluxo de negócio
 */

export type FunnelId = string;
export type StageId = string;
export type OpportunityId = string;
export type TenantId = string;

export type FunnelStatus = 'active' | 'archived';

/**
 * O estado de uma negociação. `won` e `lost` são TERMINAIS: o desfecho é
 * registrado com razão, e o cliente que volta é negociação NOVA.
 */
export type OpportunityStatus = 'open' | 'won' | 'lost';

/** O tipo de um movimento na trilha. */
export type DealMovementKind = 'opened' | 'moved' | 'won' | 'lost';

/** Um estágio do funil — só posição e nome, ambos do tenant. */
export interface FunnelStage {
  readonly id: StageId;
  readonly funnelId: FunnelId;
  readonly position: number;
  readonly name: string;
}

export interface Funnel {
  readonly id: FunnelId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description: string;
  readonly status: FunnelStatus;
}

export interface Opportunity {
  readonly id: OpportunityId;
  readonly tenantId: TenantId;
  readonly funnelId: FunnelId;
  readonly currentStageId: StageId | null;
  readonly title: string;
  readonly description: string;
  /** Valor e moeda andam JUNTOS — valor sem moeda é número que mente. */
  readonly valueCents: number | null;
  readonly currency: string | null;
  /** 0–100, da MÃO HUMANA. Score de máquina seria outra coluna, outro dia. */
  readonly probability: number | null;
  /** `AAAA-MM-DD`, opcional. */
  readonly expectedCloseDate: string | null;
  /** ⭐ ID SOLTO — nunca FK. O crm pode nem estar instalado. */
  readonly partyId: string | null;
  /** ⭐ O NOME CARIMBADO no momento do vínculo. Sobrevive a tudo. */
  readonly partyName: string | null;
  readonly tags: readonly string[];
  readonly status: OpportunityStatus;
  readonly outcomeReason: string;
}

/** Uma linha da trilha — imutável por contrato, nas três camadas do banco. */
export interface OpportunityMovement {
  readonly id: string;
  readonly opportunityId: OpportunityId;
  readonly kind: DealMovementKind;
  readonly fromStageId: StageId | null;
  readonly fromStageName: string | null;
  readonly toStageId: StageId | null;
  readonly toStageName: string | null;
  readonly note: string;
  readonly occurredAt: string;
}

export interface NewOpportunity {
  readonly funnelId: FunnelId;
  readonly title: string;
  readonly description?: string;
  readonly valueCents?: number | null;
  readonly currency?: string | null;
  readonly probability?: number | null;
  readonly expectedCloseDate?: string | null;
  readonly partyId?: string | null;
  readonly partyName?: string | null;
  readonly tags?: readonly string[];
}

export interface NewFunnelStage {
  readonly name: string;
  readonly position: number;
}

/** Uma coluna do quadro: o estágio e as negociações ABERTAS nele. */
export interface FunnelColumn {
  readonly stage: FunnelStage;
  readonly opportunities: readonly Opportunity[];
}
