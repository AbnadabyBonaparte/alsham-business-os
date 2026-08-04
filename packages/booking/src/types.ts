/**
 * Tipos do Módulo 97 — Agendamento (Vertical 💇 Beleza).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐ REAPROVEITA a física do no-show do `appointment` (Módulo da Saúde) — nasce
 * `scheduled`, o desfecho é `attended | no_show | cancelled`, os três TERMINAIS.
 * Mas DIVERGE de propósito:
 *   - o cliente é a contraparte do `crm` por ID SOLTO (`clientId` + `clientName`
 *     carimbado), NÃO um paciente e NÃO PHI — agendar um corte não é ato de
 *     saúde. Logo, **sem trilha de leitura clínica**;
 *   - o serviço é TEXTO LIVRE (`service` — "corte"/"coloração"/"limpeza de
 *     pele"), NUNCA enum: o salão de bairro e a clínica estética avançada usam
 *     o mesmo módulo sem uma linha diferente (anti-viés);
 *   - o profissional é ID SOLTO (`professionalId`) ao módulo `professional` —
 *     sem FK, sem ler aquele schema.
 *
 * @see supabase/migrations/0112_booking.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-BOOKING-SPEC.md — o fluxo de negócio
 */

export type BookingStatus = 'scheduled' | 'attended' | 'no_show' | 'cancelled';

export interface Booking {
  readonly id: string;
  /** ID SOLTO ao crm — sem FK, OPCIONAL (o encaixe/walk-in não tem cadastro). */
  readonly clientId: string | null;
  /** O cliente — TEXTO LIVRE, carimbado pela tela. Obrigatório. */
  readonly clientName: string;
  /** ID SOLTO ao módulo professional — sem FK, OPCIONAL. */
  readonly professionalId: string | null;
  /** O serviço — TEXTO LIVRE (corte/coloração/…), NUNCA enum. Obrigatório. */
  readonly service: string;
  /** O horário do agendamento. */
  readonly scheduledAt: string;
  /**
   * scheduled → attended | no_show | cancelled — os três TERMINAIS (a física do
   * no-show do appointment: quem remarca abre OUTRO).
   */
  readonly status: BookingStatus;
  /** Cancelar exige razão; os demais desfechos, não. */
  readonly cancelReason: string;
}

export interface NewBookingInput {
  readonly clientId?: unknown;
  readonly clientName?: unknown;
  readonly professionalId?: unknown;
  readonly service?: unknown;
  readonly scheduledAt?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
