/**
 * Tipos do Módulo 21 — Visitas.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * A visita é o EVENTO DE PRESENÇA — a quarta identidade: não é a pessoa
 * (crm), não é o pedido (care), não é só o fato escrito (occ); é a passagem
 * pela portaria, com dois carimbos do servidor. Quem volta amanhã é visita
 * nova.
 *
 * @see supabase/migrations/0036_vis.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-VIS-SPEC.md — o fluxo de negócio
 */

export type VisitStatus =
  | 'scheduled'
  | 'checked_in'
  | 'checked_out'
  | 'no_show'
  | 'cancelled';

export interface Visit {
  readonly id: string;
  readonly visitorName: string;
  /** Opcional, texto livre — e NUNCA sai no envelope do correio. */
  readonly visitorDocument: string;
  readonly visitorContact: string;
  /** Para quem / para onde — texto livre. */
  readonly host: string;
  readonly reason: string;
  readonly status: VisitStatus;
  readonly expectedAt: string | null;
  /** ⭐ Os dois carimbos do fato — sempre do servidor. */
  readonly checkedInAt: string | null;
  readonly checkedOutAt: string | null;
  readonly cancelReason: string;
  /** ⭐ Corrigir é registro novo apontando o errado — nunca rasura. */
  readonly correctsVisitId: string | null;
}

export interface NewVisitInput {
  readonly visitorName?: unknown;
  readonly visitorDocument?: unknown;
  readonly visitorContact?: unknown;
  readonly host?: unknown;
  readonly reason?: unknown;
  /** `true` agenda (exige `expectedAt`); `false` registra a entrada agora. */
  readonly scheduled?: unknown;
  readonly expectedAt?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
