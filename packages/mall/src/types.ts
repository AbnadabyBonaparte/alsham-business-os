/**
 * Tipos do Módulo 38 — Gestão de Lojistas (Vertical Shopping Centers).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⚠️ Anti-viés: segmento é TEXTO LIVRE — o vocabulário de cada praça. A
 * unidade física é o `spc.space`, referenciado por id solto (sem FK): o mall
 * não recria cadastro de espaço (Lei do Reaproveitamento).
 *
 * @see supabase/migrations/0053_mall.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-MALL-SPEC.md — o fluxo de negócio
 */

export type StoreStatus = 'active' | 'archived';

export interface Store {
  readonly id: string;
  readonly storeName: string;
  /** Segmento TEXTO LIVRE — vocabulário de cada praça, nunca enum. */
  readonly segment: string;
  /** A unidade física por id solto ao spc — sem FK. */
  readonly spaceId: string | null;
  readonly spaceName: string;
  /** `archived → active` existe: o lojista é relação comercial que volta. */
  readonly status: StoreStatus;
}

export interface NewStoreInput {
  readonly storeName?: unknown;
  readonly segment?: unknown;
  readonly spaceId?: unknown;
  readonly spaceName?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
