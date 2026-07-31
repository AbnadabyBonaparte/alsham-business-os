/**
 * Tipos puros do Módulo 81 — Usinas (e Geração distribuída).
 *
 * Nem banco, nem rede, nem relógio, nem UI: só o cadastro da unidade geradora.
 * Uma usina tem nome, localização em TEXTO LIVRE, capacidade instalada em kWp
 * (> 0) e um TIPO/PORTE em TEXTO LIVRE (a consolidação de Geração distribuída —
 * nunca enum). O ciclo é `active` ↔ `archived` (a usina desativada que volta a
 * operar é a MESMA — a física do catalog/vendor).
 *
 * @see supabase/migrations/0096_plant.sql
 * @see docs/canon/MODULO-PLANT-SPEC.md
 */

/** O ciclo da usina: `active` ↔ `archived` (a física do catalog — reversível). */
export type PlantStatus = 'active' | 'archived';

/** Uma usina do cadastro. `capacityKwp` é a capacidade instalada de placa. */
export interface Plant {
  readonly id: string;
  /** Nome da usina. Obrigatório. */
  readonly name: string;
  /** ⭐ Localização em texto livre — OPCIONAL (endereço, coordenada). `''` quando ausente. */
  readonly location: string;
  /** Capacidade instalada em kWp. `> 0` (a placa de uma usina real é positiva). */
  readonly capacityKwp: number;
  /** ⭐ Tipo/porte em texto livre — a consolidação de GD. `''` quando ausente. */
  readonly plantType: string;
  readonly status: PlantStatus;
}

/** A entrada crua de uma usina nova — nasce sempre `active`. */
export interface NewPlantInput {
  readonly name?: unknown;
  readonly location?: unknown;
  readonly capacityKwp?: unknown;
  readonly plantType?: unknown;
}

/** Um resumo contável do parque de usinas. */
export interface PlantSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
