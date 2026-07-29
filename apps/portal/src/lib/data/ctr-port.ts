import type { Adjustment, Contract, Renewal } from '@alsham/contracts';

export interface ContractRow extends Contract {
  readonly id: string;
  readonly createdAt: string;
}

export interface NewContractDraft {
  readonly externalRef: string;
  readonly title: string;
  readonly description: string;
  readonly contractType: string | null;
  readonly counterpartyName: string | null;
  readonly counterpartyTaxId: string | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly valueCents: number | null;
  readonly currency: string | null;
}

/**
 * Porta de dados do Módulo 13 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: editar reajuste ou renovação (livros imutáveis),
 * apagar contrato (desfecho é status) e editar termo de contrato em vigor
 * (muda por ATO). A porta não promete o que o schema nega.
 */
export interface CtrPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadContracts(): Promise<ContractRow[]>;
  loadAdjustments(): Promise<Adjustment[]>;
  loadRenewals(): Promise<Renewal[]>;
  createContract(input: NewContractDraft): Promise<{ contractId: string }>;
  setStatus(input: {
    contractId: string;
    status: 'active' | 'ended' | 'terminated' | 'cancelled';
    reason?: string;
  }): Promise<void>;
  registerAdjustment(input: {
    contractId: string;
    adjustedOn: string;
    indexName: string;
    newValueCents: number;
    note: string;
  }): Promise<void>;
  renewContract(input: { contractId: string; newEndsOn: string; note: string }): Promise<void>;
}
