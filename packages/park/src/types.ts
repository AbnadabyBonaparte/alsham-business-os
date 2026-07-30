/**
 * Tipos do Módulo 41 — Estacionamento (Vertical Shopping Centers).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⚠️ Anti-viés: `vehiclePlate` é TEXTO LIVRE — carro, moto, bike, veículo de
 * visitante sem placa do país. `fee` é OPCIONAL e também texto — o tenant
 * decide se cobra e quanto; este pacote NUNCA calcula tarifa.
 *
 * ⭐ Não há `status`/enum: dentro ou fora é IMPLÍCITO — `exitedAt === null`
 * é o "dentro" (a identidade do `vis`, aplicada ao veículo).
 *
 * @see supabase/migrations/0056_park.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-PARK-SPEC.md — o fluxo de negócio
 */

export interface ParkEntry {
  readonly id: string;
  /** Placa/identificador do veículo — texto livre, nunca vocabulário fixo. */
  readonly vehiclePlate: string;
  /** ISO — carimbado pelo SERVIDOR no ato de entrada. */
  readonly enteredAt: string;
  /** ISO ou null — null é "dentro"; carimbado pelo SERVIDOR no ato de saída. */
  readonly exitedAt: string | null;
  /** Tarifa OPCIONAL em texto — o tenant decide se cobra. Sem cálculo aqui. */
  readonly fee: string;
}

export interface NewEntryInput {
  readonly vehiclePlate?: unknown;
  readonly fee?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
