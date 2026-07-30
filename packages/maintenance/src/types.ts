/**
 * Tipos do Módulo 17 — Manutenção.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * A ordem é corretiva ou preventiva (física do domínio, não vocabulário de
 * casa); `done` volta (trabalho tem identidade por serviço — o ops
 * mantido); a recorrência da preventiva é desenho do tenant, e a próxima
 * devida é consequência calculada.
 *
 * @see supabase/migrations/0032_mnt.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-MNT-SPEC.md — o fluxo de negócio
 */

export type OrderStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

/** ⭐ Física do domínio: a falha que JÁ aconteceu ou a que ainda NÃO. */
export type OrderKind = 'corrective' | 'preventive';

export type PriorityStatus = 'active' | 'archived';

export interface MntPriority {
  readonly id: string;
  readonly name: string;
  /** 0 = mais urgente. */
  readonly position: number;
  readonly status: PriorityStatus;
}

export interface MaintenanceOrder {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: OrderKind;
  /** ⭐ O alvo em TEXTO LIVRE — "elevador 2", "ar da sala 5". */
  readonly target: string;
  /** ⭐ ID SOLTO opcional para o Patrimônio (Onda 2) — nunca FK. */
  readonly assetId: string | null;
  readonly priorityId: string | null;
  readonly assigneeUserId: string | null;
  /** ⭐ "a cada N dias após a conclusão" — só na preventiva. */
  readonly recurrenceDays: number | null;
  readonly costCents: number | null;
  readonly currency: string | null;
  readonly status: OrderStatus;
  /** O ato da conclusão — do servidor. A volta limpa. */
  readonly completedAt: string | null;
  readonly completionNote: string;
}

export interface NewOrderInput {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly kind?: unknown;
  readonly target?: unknown;
  readonly priorityId?: unknown;
  readonly recurrenceDays?: unknown;
  readonly costCents?: unknown;
  readonly currency?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
