/**
 * Tipos do Módulo 16 — Ocorrências.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * A ocorrência é FATO CONSUMADO: o registro nasce imutável (a física que
 * DIVERGE do `care` de propósito), a tratativa é cadeia de atos, e o
 * encerramento é ato terminal com desfecho escrito.
 *
 * @see supabase/migrations/0031_occ.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-OCC-SPEC.md — o fluxo de negócio
 */

export type OccurrenceStatus = 'open' | 'closed';

export type SeverityStatus = 'active' | 'archived';

export interface Severity {
  readonly id: string;
  readonly name: string;
  /** ⭐ 0 = mais grave. Ordenar o livro é o ofício da gravidade. */
  readonly position: number;
  readonly status: SeverityStatus;
}

export interface Occurrence {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** TEXTO LIVRE — "doca 3", "corredor B". */
  readonly location: string | null;
  /** TEXTO LIVRE — nas palavras de quem registrou. */
  readonly involved: string | null;
  readonly severityId: string | null;
  /** ISO. Aceita passado; nunca futuro — fato consumado. */
  readonly occurredAt: string;
  readonly status: OccurrenceStatus;
  /** O ato do encerramento — carimbado pelo servidor, com desfecho. */
  readonly closedAt: string | null;
  readonly outcome: string;
}

export interface Treatment {
  readonly id: string;
  readonly occurrenceId: string;
  readonly actionTaken: string;
  readonly occurredAt: string;
}

export interface NewOccurrenceInput {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly location?: unknown;
  readonly involved?: unknown;
  readonly severityId?: unknown;
  readonly occurredAt?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
