import type { Cycle, CycleStatus, NewReviewInput, Problem, Review, Validation } from './types.ts';

/**
 * O motor do Módulo 36 — Avaliação de Desempenho.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0051_perf.sql`; o pacote avisa antes, com a MESMA
 * régua, para a recusa chegar com nome em vez de erro de constraint.
 */

/**
 * ⭐ Espelho de `perf.allowed_transition()` no `0051_perf.sql` — há teste que
 * lê a migration e compara. UM par: `open → closed`. `closed` é TERMINAL —
 * reabrir misturaria avaliações de duas épocas sob o mesmo rótulo.
 */
export const CYCLE_TRANSITIONS: readonly (readonly [CycleStatus, CycleStatus])[] = [
  ['open', 'closed'],
];

export function canCloseCycle(status: CycleStatus): boolean {
  return CYCLE_TRANSITIONS.some(([f, t]) => f === status && t === 'closed');
}

/** Só `closed` não volta — o único fim que este ciclo conhece. */
export function isCycleTerminal(status: CycleStatus): boolean {
  return status === 'closed';
}

/** A recusa do registro, com nome — a mesma física do gatilho de `perf.reviews`. */
export function whyCannotReview(cycle: Pick<Cycle, 'status'>): string | null {
  if (cycle.status !== 'open') {
    return 'Ciclo fechado não recebe avaliação nova: a época encerrou.';
  }
  return null;
}

/** As avaliações do ciclo, mais recente primeiro. */
export function orderReviews(reviews: readonly Review[]): readonly Review[] {
  return [...reviews].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export interface PerfSummary {
  readonly total: number;
  readonly rated: number;
  readonly unrated: number;
  /** Média das notas informadas; `null` quando nenhuma avaliação tem nota. */
  readonly averageRating: number | null;
}

/** Conta e tira a média sem inventar número onde não há: sem nota, sem entrada na média. */
export function summarize(reviews: readonly Review[]): PerfSummary {
  let rated = 0;
  let sum = 0;
  for (const r of reviews) {
    if (r.rating !== null) {
      rated += 1;
      sum += r.rating;
    }
  }
  return {
    total: reviews.length,
    rated,
    unrated: reviews.length - rated,
    averageRating: rated === 0 ? null : sum / rated,
  };
}

const NOME_MAX = 200;
const SUMMARY_MAX = 4000;
const RATING_MIN = 0;
const RATING_MAX = 100;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma avaliação nova. `cycleId`, `revieweeId`, `revieweeName` e
 * `summary` são obrigatórios; `rating` é OPCIONAL, escala 0–100. `reviewerId`
 * não entra aqui — é carimbado pelo servidor, nunca pela tela.
 */
export function validateNewReview(input: NewReviewInput): Validation<Review> {
  const problems: Problem[] = [];

  const cycleId = texto(input.cycleId);
  if (cycleId === null) {
    problems.push({ field: 'cycleId', message: 'Informe o ciclo da avaliação.' });
  }

  const revieweeId = texto(input.revieweeId);
  if (revieweeId === null) {
    problems.push({ field: 'revieweeId', message: 'Informe quem está sendo avaliado.' });
  }

  const revieweeName = texto(input.revieweeName);
  if (revieweeName === null) {
    problems.push({ field: 'revieweeName', message: 'Informe o nome de quem está sendo avaliado.' });
  } else if (revieweeName.length > NOME_MAX) {
    problems.push({ field: 'revieweeName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  const summary = texto(input.summary);
  if (summary === null) {
    problems.push({ field: 'summary', message: 'Informe o parecer da avaliação.' });
  } else if (summary.length > SUMMARY_MAX) {
    problems.push({ field: 'summary', message: `Parecer com no máximo ${SUMMARY_MAX} caracteres.` });
  }

  let rating: number | null = null;
  if (input.rating !== undefined && input.rating !== null && input.rating !== '') {
    const n = typeof input.rating === 'number' ? input.rating : Number(input.rating);
    if (!Number.isFinite(n)) {
      problems.push({ field: 'rating', message: 'A nota precisa ser um número.' });
    } else if (n < RATING_MIN || n > RATING_MAX) {
      problems.push({ field: 'rating', message: `A nota vai de ${RATING_MIN} a ${RATING_MAX}.` });
    } else {
      rating = n;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      cycleId: cycleId!,
      revieweeId: revieweeId!,
      revieweeName: revieweeName!,
      reviewerId: null,
      rating,
      summary: summary!,
      recordedAt: '',
    },
  };
}
