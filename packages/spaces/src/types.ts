/**
 * Tipos do Módulo 20 — Reserva de Espaços.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * A física do domínio: dois usos não ocupam o MESMO espaço ao MESMO tempo —
 * quem recusa de verdade é a EXCLUSION constraint do banco; o pacote avisa
 * antes, com a mesma régua (período meio-aberto).
 *
 * @see supabase/migrations/0035_spc.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-SPC-SPEC.md — o fluxo de negócio
 */

export type ReservationStatus = 'booked' | 'cancelled';

export type SpaceStatus = 'active' | 'archived';

export interface Space {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Opcional — o produto não sabe se é sala, quadra ou van. */
  readonly capacity: number | null;
  /** `archived → active` existe: a sala reformada que reabre é a MESMA sala. */
  readonly status: SpaceStatus;
}

export interface Reservation {
  readonly id: string;
  readonly spaceId: string;
  readonly purpose: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: ReservationStatus;
  /** O ato do cancelamento — do servidor. Terminal. */
  readonly cancelledAt: string | null;
  readonly cancelReason: string;
}

export interface NewReservationInput {
  readonly spaceId?: unknown;
  readonly purpose?: unknown;
  readonly startsAt?: unknown;
  readonly endsAt?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
