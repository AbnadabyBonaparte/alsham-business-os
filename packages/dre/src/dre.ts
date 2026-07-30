import type { DreLine, LineKind, LineStatus, Problem, StatementRow, Validation } from './types.ts';

/**
 * O motor do Módulo 32 — DRE Gerencial.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

/**
 * ⭐ Espelho de `dre.allowed_transition()` no `0047_dre.sql` — há teste que lê
 * a migration e compara. A linha volta do arquivo.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [LineStatus, LineStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export function canTransition(from: LineStatus, to: LineStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canArchive(status: LineStatus): boolean {
  return canTransition(status, 'archived');
}

export function canRestore(status: LineStatus): boolean {
  return canTransition(status, 'active');
}

/** ⭐ A natureza é física contábil — vocabulário fixo, único enum do módulo. */
export const LINE_KINDS: readonly LineKind[] = ['revenue', 'cost', 'expense'];

/** As linhas do plano na ordem de leitura: por posição, depois por nome. */
export function orderLines(lines: readonly DreLine[]): readonly DreLine[] {
  return [...lines].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.name.localeCompare(b.name);
  });
}

/**
 * O resultado a partir das linhas do demonstrativo — receita soma, custo e
 * despesa (que chegam com sinal negativo dos livros) subtraem. O resultado é a
 * soma dos sinais. Espelho da `dre.result`.
 */
export function computeResult(rows: readonly StatementRow[]): {
  revenueCents: number;
  costCents: number;
  expenseCents: number;
  resultCents: number;
} {
  let revenue = 0;
  let cost = 0;
  let expense = 0;
  for (const r of rows) {
    if (r.kind === 'revenue') revenue += r.amountCents;
    else if (r.kind === 'cost') cost += r.amountCents;
    else expense += r.amountCents;
  }
  return { revenueCents: revenue, costCents: cost, expenseCents: expense, resultCents: revenue + cost + expense };
}

const NAME_MAX = 200;
const CAT_MAX = 200;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export interface NewLineInput {
  readonly name?: unknown;
  readonly kind?: unknown;
  readonly matchCategory?: unknown;
  readonly position?: unknown;
  readonly currency?: unknown;
}

/** Valida uma linha nova — nome, natureza (física), categoria de casamento, moeda. */
export function validateNewLine(
  input: NewLineInput,
): Validation<{ name: string; kind: LineKind; matchCategory: string; position: number; currency: string }> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) problems.push({ field: 'name', message: 'Dê um nome à linha.' });
  else if (name.length > NAME_MAX) problems.push({ field: 'name', message: `Nome com no máximo ${NAME_MAX} caracteres.` });

  const kind = input.kind;
  if (kind !== 'revenue' && kind !== 'cost' && kind !== 'expense') {
    problems.push({ field: 'kind', message: 'A natureza é receita, custo ou despesa.' });
  }

  const matchCategory = texto(input.matchCategory);
  if (matchCategory === null) {
    problems.push({ field: 'matchCategory', message: 'A categoria é a chave que casa com os livros.' });
  } else if (matchCategory.length > CAT_MAX) {
    problems.push({ field: 'matchCategory', message: `Categoria com no máximo ${CAT_MAX} caracteres.` });
  }

  const position = input.position ?? 0;
  if (typeof position !== 'number' || !Number.isInteger(position) || position < 0) {
    problems.push({ field: 'position', message: 'A posição é um inteiro não-negativo.' });
  }

  const currency = texto(input.currency);
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'A moeda é um código ISO.' });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      name: name!, kind: kind as LineKind, matchCategory: matchCategory!,
      position: position as number, currency: currency!,
    },
  };
}
