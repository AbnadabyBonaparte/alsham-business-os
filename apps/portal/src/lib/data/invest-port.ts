import type { Holding, Position } from '@alsham/investments';

export interface HoldingRow extends Holding {
  readonly createdAt: string;
}

export type PositionRow = Position;

/**
 * Porta de dados do Módulo 31 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: apagar investimento (arquiva-se), editar o livro
 * (imutável), cotação de mercado (a posição é a soma dos atos). O resgate além
 * da posição é barrado pelo banco.
 */
export interface InvestPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadHoldings(): Promise<HoldingRow[]>;
  loadPositions(): Promise<PositionRow[]>;
  createHolding(input: { name: string; kind: string; institution: string; currency: string }): Promise<{ holdingId: string }>;
  setHoldingStatus(input: { holdingId: string; status: 'active' | 'archived' }): Promise<void>;
  registerMovement(input: {
    holdingId: string;
    kind: 'application' | 'yield' | 'redemption';
    amountCents: number;
    currency: string;
    note: string;
    occurredOn: string;
  }): Promise<void>;
}
