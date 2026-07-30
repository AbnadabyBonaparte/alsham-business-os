/**
 * Tipos do Módulo 22 — Leads.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * O lead é a MANIFESTAÇÃO DE INTERESSE — a quinta identidade: um evento
 * comercial datado, com origem própria. Os desfechos são terminais; quem
 * volta é lead novo, com origem nova.
 *
 * @see supabase/migrations/0037_lead.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-LEAD-SPEC.md — o fluxo de negócio
 */

export type LeadStatus = 'new' | 'in_contact' | 'qualified' | 'discarded';

export interface Lead {
  readonly id: string;
  readonly name: string;
  /** Neutro, texto livre — e NUNCA sai no envelope do correio. */
  readonly contact: string;
  /** ⭐ DE ONDE veio — o dado que a fila existe para guardar. Texto livre. */
  readonly source: string;
  readonly interest: string;
  readonly assigneeUserId: string | null;
  readonly status: LeadStatus;
  /** O ato do desfecho — do servidor. Terminal. */
  readonly decidedAt: string | null;
  readonly discardReason: string;
  /** ⭐ Vínculos SOLTOS do qualificado — id + nome carimbado, pela tela. */
  readonly partyId: string | null;
  readonly partyName: string;
  readonly opportunityId: string | null;
  readonly opportunityTitle: string;
  readonly createdAt: string;
}

export interface NewLeadInput {
  readonly name?: unknown;
  readonly contact?: unknown;
  readonly source?: unknown;
  readonly interest?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
