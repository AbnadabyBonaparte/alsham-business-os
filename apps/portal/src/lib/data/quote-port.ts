import type { Proposal, ProposalStatus } from '@alsham/quotes';

export interface ProposalRow extends Proposal {
  readonly id: string;
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 9 — própria (Lei do Lego §5.5.8).
 *
 * Sem DELETE: retirar a proposta é status. E repare que não há
 * `updateItems` fora do rascunho — o banco congela a mesa, e a porta não
 * promete o que o schema nega.
 */
export interface QuotePort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadProposals(): Promise<ProposalRow[]>;
  createProposal(proposal: Proposal): Promise<{ proposalId: string }>;
  updateStatus(input: {
    proposalId: string;
    status: ProposalStatus;
    decisionNote?: string;
  }): Promise<void>;
}
