/**
 * Tipos do Módulo 96 — Patrocínios (Vertical Eventos).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐⭐ NÃO reescreve o ctr, o deal nem o evt: o contrato jurídico é do
 * `ctr.contracts` (Módulo 13), a negociação é do `deal` (Módulo 10), o evento
 * é do `evt` (Módulo 11) — referenciados aqui por `contractId`, (implícito no
 * `deal`) e `eventId` — todos ID SOLTO, sem FK. Aqui mora só a cota
 * (`tier`, TEXTO LIVRE), o valor opcional e o checklist de entregáveis de
 * ativação por evento.
 *
 * @see supabase/migrations/0111_sponsor.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-SPONSOR-SPEC.md — o fluxo de negócio
 */

export type SponsorshipStatus = 'active' | 'archived';

export interface Sponsorship {
  readonly id: string;
  /** ID SOLTO ao evt — sem FK. O evento vive lá. Obrigatório. */
  readonly eventId: string;
  readonly eventRef: string;
  /** O patrocinador — TEXTO LIVRE (razão social/marca). */
  readonly sponsorName: string;
  /** ID SOLTO ao crm — sem FK, OPCIONAL. O patrocinador como contraparte. */
  readonly partyId: string | null;
  /** A cota — TEXTO LIVRE (ouro/prata/apoio), NUNCA enum. */
  readonly tier: string;
  /** O valor da cota — OPCIONAL (pode ser permuta). */
  readonly amountCents: number | null;
  readonly currency: string | null;
  /** ID SOLTO ao ctr — sem FK, OPCIONAL. O contrato jurídico vive lá. */
  readonly contractId: string | null;
  readonly contractRef: string;
  /** active ↔ archived: o patrocinador volta (o DIVERGE do lease terminal). */
  readonly status: SponsorshipStatus;
}

export interface NewSponsorshipInput {
  readonly eventId?: unknown;
  readonly eventRef?: unknown;
  readonly sponsorName?: unknown;
  readonly partyId?: unknown;
  readonly tier?: unknown;
  readonly amountCents?: unknown;
  readonly currency?: unknown;
  readonly contractId?: unknown;
  readonly contractRef?: unknown;
}

export interface Deliverable {
  readonly id: string;
  readonly sponsorshipId: string;
  /** O entregável de ativação — TEXTO LIVRE. */
  readonly description: string;
  readonly delivered: boolean;
  /** Carimbado pelo servidor quando marcado feito. */
  readonly deliveredAt: string | null;
}

export interface NewDeliverableInput {
  readonly sponsorshipId?: unknown;
  readonly description?: unknown;
  readonly delivered?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
