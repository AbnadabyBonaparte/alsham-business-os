/**
 * Tipos puros do Módulo 95 — Programação/line-up.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o
 * item da grade de programação de um evento.
 *
 * ⭐⭐ A agenda é PLANO MUTÁVEL (a física do `gantt`/`edcal`), NÃO livro
 * imutável: o item se edita e se apaga. NÃO há `status` nem ciclo de vida — o
 * DIVERGE do `sched`, cujo marco tem máquina de estados. Por isso este arquivo
 * NÃO declara nenhum tipo `SlotStatus`: a decisão vive por AUSÊNCIA.
 *
 * @see supabase/migrations/0110_lineup.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-LINEUP-SPEC.md — o fluxo de negócio
 */

/**
 * Um item da grade — uma atração/sessão/palestra do programa de um evento.
 * O evento entra por id solto + nome carimbado pela tela; palco, horário e
 * atração são OPCIONAIS (o programa pode nascer TBD).
 */
export interface Slot {
  readonly id: string;
  /** Id solto ao módulo universal de eventos — sem FK. Congela na criação. */
  readonly eventId: string;
  /** Nome do evento carimbado pela tela — sobrevive ao redesenho do cadastro. */
  readonly eventName: string;
  /** A atração/sessão/palestra — texto livre, obrigatório. */
  readonly title: string;
  /** Palco/sala/trilha — texto livre, opcional (vazio quando não informado). */
  readonly stage: string;
  /** Início — opcional (ISO 8601; null quando TBD). */
  readonly startsAt: string | null;
  /** Fim — opcional (ISO 8601; null quando TBD ou aberto). */
  readonly endsAt: string | null;
  /** Atração/palestrante — texto livre, opcional (vazio quando não informado). */
  readonly performer: string;
  /** Posição para a ordenação manual da grade (>= 0). */
  readonly position: number;
}

export interface NewSlotInput {
  readonly eventId?: unknown;
  readonly eventName?: unknown;
  readonly title?: unknown;
  readonly stage?: unknown;
  readonly startsAt?: unknown;
  readonly endsAt?: unknown;
  readonly performer?: unknown;
  readonly position?: unknown;
}

/** Um resumo contável da grade. Todo número é `.length`, nunca chute. */
export interface LineupSummary {
  readonly total: number;
  /** Itens com horário de início definido (o resto é TBD). */
  readonly scheduled: number;
  readonly tbd: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
