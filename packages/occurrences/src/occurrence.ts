import type {
  NewOccurrenceInput,
  Occurrence,
  OccurrenceStatus,
  Problem,
  Severity,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 16 — Ocorrências.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). O relógio entra por
 * parâmetro — o pacote não olha o calendário sozinho.
 */

/**
 * ⭐ Espelho de `occ.allowed_transition()` no `0031_occ.sql` — UM par. O
 * fato aconteceu uma vez; encerrada é terminal.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [OccurrenceStatus, OccurrenceStatus])[] = [
  ['open', 'closed'],
];

export function canTransition(from: OccurrenceStatus, to: OccurrenceStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canTreat(status: OccurrenceStatus): boolean {
  return status === 'open';
}

export function canClose(status: OccurrenceStatus): boolean {
  return canTransition(status, 'closed');
}

/** ⭐ Encerrar exige o DESFECHO escrito — a recusa com nome, decidida aqui. */
export function whyCannotClose(occurrence: Occurrence, outcome: string): string | null {
  if (!canClose(occurrence.status)) {
    return 'A ocorrência já está encerrada — o que acontecer de novo é ocorrência nova.';
  }
  if (outcome.trim().length === 0) {
    return 'Encerrar exige o desfecho escrito: arquivar sem apurar é apagar com outro nome.';
  }
  return null;
}

/**
 * ⭐ A ordem do livro: gravidade DO TENANT primeiro (posição 0 = mais
 * grave; sem gravidade vai ao fim), depois o fato mais recente.
 */
export function orderOccurrences(
  occurrences: readonly Occurrence[],
  severities: readonly Severity[],
): readonly Occurrence[] {
  const posicao = new Map(severities.map((s) => [s.id, s.position]));
  return [...occurrences].sort((a, b) => {
    const pa = a.severityId !== null ? (posicao.get(a.severityId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    const pb = b.severityId !== null ? (posicao.get(b.severityId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return b.occurredAt.localeCompare(a.occurredAt);
  });
}

const TITULO_MAX = 200;
const DESC_MAX = 8000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um registro novo. ⭐ O relógio entra por parâmetro: o FUTURO é
 * recusado AQUI — fato consumado não mora no futuro.
 */
export function validateNewOccurrence(
  input: NewOccurrenceInput,
  nowIso: string,
): Validation<Occurrence> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Dê um título ao fato.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Relate o que aconteceu — o registro é o relato.' });
  } else if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Relato com no máximo ${DESC_MAX} caracteres.` });
  }

  const occurredAt = texto(input.occurredAt) ?? nowIso;
  if (Number.isNaN(Date.parse(occurredAt))) {
    problems.push({ field: 'occurredAt', message: 'Quando aconteceu — data/hora válidas.' });
  } else if (occurredAt > nowIso) {
    problems.push({
      field: 'occurredAt',
      message: 'Fato consumado não mora no futuro: registre quando tiver acontecido.',
    });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      title: title!,
      description: description!,
      location: texto(input.location),
      involved: texto(input.involved),
      severityId: texto(input.severityId),
      occurredAt,
      status: 'open',
      closedAt: null,
      outcome: '',
    },
  };
}

export function validateTreatment(actionTaken: unknown): Validation<{ actionTaken: string }> {
  const limpo = texto(actionTaken);
  if (limpo === null) {
    return {
      ok: false,
      problems: [{ field: 'actionTaken', message: 'A tratativa registra o que foi FEITO — escreva.' }],
    };
  }
  return { ok: true, value: { actionTaken: limpo } };
}

export interface OccSummary {
  readonly total: number;
  readonly open: number;
  readonly closed: number;
}

export function summarizeOccurrences(occurrences: readonly Occurrence[]): OccSummary {
  let open = 0;
  for (const o of occurrences) {
    if (o.status === 'open') open += 1;
  }
  return { total: occurrences.length, open, closed: occurrences.length - open };
}
