/**
 * Tipos do Módulo 11 — Eventos.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⚠️ **O pacote se chama `event-management`, e não `events`, de propósito:**
 * "evento" já é o vocabulário do CORAÇÃO da plataforma (`EventEnvelope`,
 * `core.event_outbox`). Um `@alsham/events` ao lado de `@alsham/workflow`
 * confundiria o correio com a feira — Sol Único.
 *
 * @see supabase/migrations/0026_evt.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-EVT-SPEC.md — o fluxo de negócio
 */

export type EventId = string;
export type RegistrationId = string;
export type TenantId = string;

/**
 * O estado de um evento. `published → draft` NÃO existe: publicado com
 * inscritos é compromisso público. `held` e `cancelled` são terminais.
 */
export type EventStatus = 'draft' | 'published' | 'held' | 'cancelled';

/**
 * O estado de uma inscrição. Presença e cancelamento são terminais: quem
 * cancelou e voltou atrás é inscrição NOVA — a linha antiga conta a
 * história da desistência.
 */
export type RegistrationStatus = 'registered' | 'confirmed' | 'cancelled' | 'attended';

export interface TenantEvent {
  readonly id: EventId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description: string;
  /** ISO. Obrigatório: evento sem data é ideia, não evento. */
  readonly startsAt: string;
  readonly endsAt: string | null;
  /** TEXTO LIVRE: "salão 2", "sede", "Zoom". Online nem tem endereço. */
  readonly location: string | null;
  /** Opcional. Quando informada, a lotação RECUSA — nunca aceita calada. */
  readonly capacity: number | null;
  readonly status: EventStatus;
}

export interface Registration {
  readonly id: RegistrationId;
  readonly eventId: EventId;
  readonly attendeeName: string;
  /**
   * TEXTO LIVRE — e-mail, telefone, "@fulano no instagram". Colunas
   * email/phone congelariam o instrumento de uma década (a lição do canal
   * do crm).
   */
  readonly contact: string | null;
  readonly note: string;
  readonly status: RegistrationStatus;
  /** O carimbo do ATO da presença — do servidor, nunca da tela. */
  readonly attendedAt: string | null;
}

export interface NewEvent {
  readonly name: string;
  readonly startsAt: string;
  readonly endsAt?: string | null;
  readonly location?: string | null;
  readonly capacity?: number | null;
  readonly description?: string;
}

export interface NewRegistration {
  readonly eventId: EventId;
  readonly attendeeName: string;
  readonly contact?: string | null;
  readonly note?: string;
}
