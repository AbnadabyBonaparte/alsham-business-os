import type { NewEntryInput, ParkEntry, Problem, Validation } from './types.ts';

/**
 * O motor do Módulo 41 — Estacionamento.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0056_park.sql`; o pacote avisa antes, com a MESMA
 * régua.
 *
 * ⭐ Sem `ALLOWED_TRANSITIONS`: dentro/fora é IMPLÍCITO por `exitedAt` — não
 * há estado explícito nem tabela de transições para espelhar. A física
 * inteira é: nasce dentro, sai uma vez, congela.
 */

/** `exitedAt === null` é o "dentro" — a identidade do vis, no veículo. */
export function isInside(entry: Pick<ParkEntry, 'exitedAt'>): boolean {
  return entry.exitedAt === null;
}

/** Só se registra a saída de quem está dentro. */
export function canRecordExit(entry: Pick<ParkEntry, 'exitedAt'>): boolean {
  return isInside(entry);
}

/** Minutos de permanência — até `exitedAt`, ou até `nowIso` se ainda dentro. */
export function durationMinutes(
  entry: Pick<ParkEntry, 'enteredAt' | 'exitedAt'>,
  nowIso?: string,
): number {
  const fim = entry.exitedAt ?? nowIso ?? new Date().toISOString();
  const ms = new Date(fim).getTime() - new Date(entry.enteredAt).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

export interface ParkSummary {
  readonly total: number;
  readonly inside: number;
  readonly exited: number;
}

/** O pátio agora: quantos estão dentro, quantos já saíram — sem inventar. */
export function summarize(entries: readonly Pick<ParkEntry, 'exitedAt'>[]): ParkSummary {
  let inside = 0;
  let exited = 0;
  for (const e of entries) {
    if (isInside(e)) inside += 1;
    else exited += 1;
  }
  return { total: entries.length, inside, exited };
}

const PLACA_MAX = 32;
const FEE_MAX = 60;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma entrada nova. Placa/identificador é obrigatório; a tarifa é
 * OPCIONAL em texto — o tenant decide se cobra, este motor não calcula nada.
 */
export function validateNewEntry(
  input: NewEntryInput,
): Validation<{ vehiclePlate: string; fee: string }> {
  const problems: Problem[] = [];

  const vehiclePlate = texto(input.vehiclePlate);
  if (vehiclePlate === null) {
    problems.push({ field: 'vehiclePlate', message: 'Informe a placa/identificador do veículo.' });
  } else if (vehiclePlate.length > PLACA_MAX) {
    problems.push({
      field: 'vehiclePlate',
      message: `Placa/identificador com no máximo ${PLACA_MAX} caracteres.`,
    });
  }

  const fee = texto(input.fee) ?? '';
  if (fee.length > FEE_MAX) {
    problems.push({ field: 'fee', message: `Tarifa com no máximo ${FEE_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, value: { vehiclePlate: vehiclePlate!, fee } };
}
