/**
 * Tipos do Módulo 15 — Atendimento.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * O caso tem identidade pelo PEDIDO do solicitante: reabre de `resolved`
 * (o mesmo caso), e `closed` é terminal (quem volta depois é caso novo).
 * Categoria e prioridade são DADO DO TENANT; solicitante é NEUTRO.
 *
 * @see supabase/migrations/0030_care.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-CARE-SPEC.md — o fluxo de negócio
 */

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type SetupStatus = 'active' | 'archived';

export interface CareCategory {
  readonly id: string;
  readonly name: string;
  readonly status: SetupStatus;
}

export interface CarePriority {
  readonly id: string;
  readonly name: string;
  /** ⭐ Posição 0 = mais urgente. Ordenar a fila é o ofício da prioridade. */
  readonly position: number;
  readonly status: SetupStatus;
}

export interface Ticket {
  readonly id: string;
  readonly subject: string;
  readonly description: string;
  /** Solicitante NEUTRO — pode não ser contraparte do crm. */
  readonly requesterName: string;
  readonly requesterContact: string | null;
  /** ⭐ ID SOLTO opcional para o crm — nunca FK. */
  readonly partyId: string | null;
  readonly categoryId: string | null;
  readonly priorityId: string | null;
  readonly assigneeUserId: string | null;
  /** ISO com hora, opcional. O atraso é consequência calculada. */
  readonly dueAt: string | null;
  readonly status: TicketStatus;
  /** O carimbo do ATO — do SERVIDOR. Reabrir limpa. */
  readonly resolvedAt: string | null;
  readonly resolutionNote: string;
}

export interface Interaction {
  readonly id: string;
  readonly ticketId: string;
  readonly body: string;
  /** TEXTO LIVRE — a lição do canal do crm. */
  readonly channel: string | null;
  readonly occurredAt: string;
}

export interface NewTicketInput {
  readonly subject?: unknown;
  readonly description?: unknown;
  readonly requesterName?: unknown;
  readonly requesterContact?: unknown;
  readonly categoryId?: unknown;
  readonly priorityId?: unknown;
  readonly dueAt?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
