/**
 * Tipos do Módulo 100 — Pacotes (Vertical Beleza).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐⭐ O pacote fechado de sessões — a física do `loyalty`/`invest` (saldo é
 * cálculo, consumo > saldo é recusado), com o DIVERGE assinado: o ponto de
 * fidelidade é fungível (uma carteira), o pacote é amarrado a UM serviço
 * (`service`, texto livre) e UM cliente (`clientId`, id solto ao crm), com
 * identidade de COMPRA própria — o `totalSessions` congela na compra.
 *
 * @see supabase/migrations/0115_pack.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-PACK-SPEC.md — o fluxo de negócio
 */

export interface Package {
  readonly id: string;
  /** ID SOLTO ao crm — sem FK. O cliente vive lá. Obrigatório. */
  readonly clientId: string;
  readonly clientName: string;
  /** O serviço — TEXTO LIVRE (corte/massagem/laser), NUNCA enum. */
  readonly service: string;
  /** A trave: o total de sessões compradas. Congela na compra; > 0. */
  readonly totalSessions: number;
  readonly note: string;
}

export interface NewPackageInput {
  readonly clientId?: unknown;
  readonly clientName?: unknown;
  readonly service?: unknown;
  readonly totalSessions?: unknown;
  readonly note?: unknown;
}

export interface Use {
  readonly id: string;
  /** FK REAL intra-schema ao pacote (o contraste com o clientId solto). */
  readonly packageId: string;
  readonly usedOn: string;
  readonly note: string;
}

export interface NewUseInput {
  readonly packageId?: unknown;
  readonly usedOn?: unknown;
  readonly note?: unknown;
}

/** O saldo calculado de um pacote — o espelho da VIEW `pack.package_balances`. */
export interface PackageBalance {
  readonly totalSessions: number;
  readonly usedCount: number;
  readonly remaining: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
