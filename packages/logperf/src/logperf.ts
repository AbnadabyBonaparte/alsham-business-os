/**
 * O motor puro do Módulo 52 — Performance Logística.
 *
 * ⭐ NÃO HÁ transições aqui — e a ausência é a lei (o REUSO do `vperf`). O `perf`
 * tem um ciclo (`open → closed`) porque a avaliação de RH acontece numa época; a
 * avaliação de performance logística é PONTUAL (a física do `sec.patrols`, não a
 * do `perf.cycles`). Sem ciclo, não há `ALLOWED_TRANSITIONS`, `canTransition`
 * nem `status`. O que este motor faz é validar o ato, ordená-lo e resumi-lo.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a RLS
 * e os gatilhos do `0067_logperf.sql`; o pacote avisa antes, com a MESMA régua,
 * para a recusa chegar com nome em vez de erro de constraint.
 */
import type {
  Appraisal,
  AppraisalSummary,
  NewAppraisalInput,
  Problem,
  Validation,
} from './types.ts';

/** As avaliações, mais recente primeiro — a leitura do livro. */
export function orderAppraisals(appraisals: readonly Appraisal[]): readonly Appraisal[] {
  return [...appraisals].sort((a, b) => b.appraisedAt.localeCompare(a.appraisedAt));
}

/**
 * Conta e tira a média sem inventar número onde não há: lista vazia dá média
 * `null`, nunca zero. A nota é obrigatória, então toda avaliação entra na conta.
 */
export function summarizeAppraisals(appraisals: readonly Appraisal[]): AppraisalSummary {
  if (appraisals.length === 0) {
    return { total: 0, averageRating: null };
  }
  const sum = appraisals.reduce((acc, a) => acc + a.rating, 0);
  return {
    total: appraisals.length,
    averageRating: sum / appraisals.length,
  };
}

const SUBJECT_MAX = 200;
const SUMMARY_MAX = 1000;
const RATING_MIN = 0;
const RATING_MAX = 100;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma avaliação nova. `subject` (o avaliado, texto livre), `rating`
 * (0–100) e `summary` são OBRIGATÓRIOS; `dcCenterId` e `assessedOn` são
 * OPCIONAIS. `appraiserId` e `appraisedAt` não entram aqui — são carimbados
 * pelo servidor, nunca pela tela.
 *
 * ⭐ O DIVERGE do `vperf`: lá o avaliado é `supplierId` (id solto obrigatório);
 * aqui é `subject` (texto livre obrigatório), com `dcCenterId` opcional.
 */
export function validateNewAppraisal(input: NewAppraisalInput): Validation<Appraisal> {
  const problems: Problem[] = [];

  const subject = texto(input.subject);
  if (subject === null) {
    problems.push({ field: 'subject', message: 'Informe a rota, transportadora ou centro avaliado.' });
  } else if (subject.length > SUBJECT_MAX) {
    problems.push({ field: 'subject', message: `Avaliado com no máximo ${SUBJECT_MAX} caracteres.` });
  }

  // ⭐ A nota é OBRIGATÓRIA, escala 0–100 — a régua do método (o REUSO do vperf).
  // Uma avaliação sem número não é avaliação.
  let rating = 0;
  if (input.rating === undefined || input.rating === null || input.rating === '') {
    problems.push({ field: 'rating', message: 'Informe a nota da avaliação.' });
  } else {
    const n = typeof input.rating === 'number' ? input.rating : Number(input.rating);
    if (!Number.isFinite(n)) {
      problems.push({ field: 'rating', message: 'A nota precisa ser um número.' });
    } else if (n < RATING_MIN || n > RATING_MAX) {
      problems.push({ field: 'rating', message: `A nota vai de ${RATING_MIN} a ${RATING_MAX}.` });
    } else {
      rating = n;
    }
  }

  const summary = texto(input.summary);
  if (summary === null) {
    problems.push({ field: 'summary', message: 'Informe o parecer da avaliação.' });
  } else if (summary.length > SUMMARY_MAX) {
    problems.push({ field: 'summary', message: `Parecer com no máximo ${SUMMARY_MAX} caracteres.` });
  }

  // O vínculo com um centro é OPCIONAL: ausente vira null, não um erro.
  const dcCenterId = texto(input.dcCenterId);

  // A data medida é OPCIONAL.
  const assessedOn = texto(input.assessedOn);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      subject: subject!,
      dcCenterId,
      rating,
      summary: summary!,
      assessedOn,
      appraiserId: null,
      appraisedAt: '',
    },
  };
}
