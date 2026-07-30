import type { Holding, HoldingStatus, Movement, Problem, Validation } from './types.ts';

/**
 * O motor do Módulo 31 — Investimentos.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

/**
 * ⭐ Espelho de `invest.allowed_transition()` no `0046_invest.sql` — há teste
 * que lê a migration e compara. O investimento volta do arquivo.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [HoldingStatus, HoldingStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export function canTransition(from: HoldingStatus, to: HoldingStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canArchive(status: HoldingStatus): boolean {
  return canTransition(status, 'archived');
}

export function canRestore(status: HoldingStatus): boolean {
  return canTransition(status, 'active');
}

/** A posição de um investimento — soma dos atos (aplicação + rendimento − resgate). */
export function positionOf(movements: readonly Movement[]): number {
  return movements.reduce((n, m) => n + m.signedAmountCents, 0);
}

/**
 * ⭐⭐ A TERCEIRA RESPOSTA — resgatar mais que a posição é RECUSADO.
 *
 * Diferente do `ar` (recebe a maior) e do `inv`/`bank` (saldo negativo): não
 * se resgata o que não está no papel. Espelho do gatilho da migration.
 */
export function canRedeem(positionCents: number, amountCents: number): boolean {
  return amountCents > 0 && amountCents <= positionCents;
}

/** Os investimentos na ordem de leitura: ativos primeiro, arquivados depois; por nome. */
export function orderHoldings(holdings: readonly Holding[]): readonly Holding[] {
  return [...holdings].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

const NAME_MAX = 200;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export interface NewHoldingInput {
  readonly name?: unknown;
  readonly kind?: unknown;
  readonly institution?: unknown;
  readonly currency?: unknown;
}

/** Valida um investimento novo — nome obrigatório, moeda ISO; tipo/instituição livres. */
export function validateNewHolding(
  input: NewHoldingInput,
): Validation<{ name: string; kind: string; institution: string; currency: string }> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) problems.push({ field: 'name', message: 'Dê um nome ao investimento.' });
  else if (name.length > NAME_MAX) problems.push({ field: 'name', message: `Nome com no máximo ${NAME_MAX} caracteres.` });

  const currency = texto(input.currency);
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'A moeda é um código ISO — o investimento tem uma moeda.' });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      name: name!,
      kind: (texto(input.kind) ?? ''),
      institution: (texto(input.institution) ?? ''),
      currency: currency!,
    },
  };
}

export interface NewMovementInput {
  readonly kind?: unknown;
  readonly amountCents?: unknown;
  readonly currency?: unknown;
  readonly occurredOn?: unknown;
}

/** Valida um ato — tipo, valor positivo, moeda, competência. O teto do resgate é do banco. */
export function validateMovement(
  input: NewMovementInput,
): Validation<{ kind: 'application' | 'yield' | 'redemption'; amountCents: number; currency: string; occurredOn: string }> {
  const problems: Problem[] = [];

  const kind = input.kind;
  if (kind !== 'application' && kind !== 'yield' && kind !== 'redemption') {
    problems.push({ field: 'kind', message: 'O ato é aplicação, rendimento ou resgate.' });
  }

  const amountCents = input.amountCents;
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    problems.push({ field: 'amountCents', message: 'O valor do ato é positivo.' });
  }

  const currency = texto(input.currency);
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'A moeda é um código ISO — a do ato é a do investimento.' });
  }

  const occurredOn = texto(input.occurredOn);
  if (occurredOn === null || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    problems.push({ field: 'occurredOn', message: 'A competência é uma data.' });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      kind: kind as 'application' | 'yield' | 'redemption',
      amountCents: amountCents as number,
      currency: currency!,
      occurredOn: occurredOn!,
    },
  };
}
