/**
 * Tipos do Módulo 9 — Propostas / Orçamentos.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * Contraparte NEUTRA: `prospectName` + `counterpartyTaxId` — quem recebe a
 * proposta pode não ser cliente ainda, e amarrá-la a um cadastro (lead_id
 * NOT NULL, como na pedreira 360° PRIMA) obrigaria a cadastrar antes de
 * propor. Item = texto + quantidade + unitário em cents, molde do `po`.
 *
 * @see supabase/migrations/0024_quote.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-QUOTE-SPEC.md — o fluxo de negócio
 */

/**
 * O estado de uma proposta.
 *
 * ⭐ Os quatro fins são TERMINAIS: a proposta tem identidade por DOCUMENTO
 * (a régua do `ap`, não a do `ops`). O cliente aceitou ou recusou UMA
 * proposta específica — renegociar é documento novo, com referência nova.
 */
export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled';

export interface ProposalItem {
  readonly lineNo: number;
  readonly description: string;
  /** Quantidade proposta (> 0). */
  readonly quantity: number;
  readonly unitAmountCents: number;
  readonly lineTotalCents: number;
}

export interface Proposal {
  readonly externalRef: string;
  readonly currency: string;
  /** Quem recebe a proposta. Pode não ser cliente ainda — e tudo bem. */
  readonly prospectName: string | null;
  readonly counterpartyTaxId: string | null;
  readonly description: string;
  /** `AAAA-MM-DD`, opcional. Proposta sem validade existe — e não expira. */
  readonly validUntil: string | null;
  readonly totalCents: number;
  readonly status: ProposalStatus;
  /** O carimbo do ATO: quando o aceite/recusa foi registrado. Do servidor. */
  readonly decidedAt: string | null;
  readonly decisionNote: string;
  readonly items: readonly ProposalItem[];
}

export interface NewProposalItemInput {
  readonly description?: unknown;
  readonly quantity?: unknown;
  readonly unitAmountCents?: unknown;
}

export interface NewProposalInput {
  readonly externalRef?: unknown;
  readonly currency?: unknown;
  readonly prospectName?: unknown;
  readonly counterpartyTaxId?: unknown;
  readonly description?: unknown;
  readonly validUntil?: unknown;
  readonly items?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
