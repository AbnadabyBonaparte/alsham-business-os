import type {
  NewSurveyInput,
  Problem,
  Survey,
  SurveyResponse,
  SurveyScore,
  SurveyStatus,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 27 — Pesquisas.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

/**
 * ⭐ Espelho de `nps.allowed_transition()` no `0042_nps.sql` — há teste que
 * lê a migration e compara. DOIS pares e `closed` TERMINAL: o care
 * re-perguntado com a OUTRA resposta — o caso reaberto é o mesmo pedido;
 * a pesquisa reaberta seria OUTRA medição, e misturar rodadas no mesmo
 * placar mentiria as duas.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [SurveyStatus, SurveyStatus])[] = [
  ['draft', 'open'],
  ['open', 'closed'],
];

export function canTransition(from: SurveyStatus, to: SurveyStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canOpen(status: SurveyStatus): boolean {
  return canTransition(status, 'open');
}

export function canClose(status: SurveyStatus): boolean {
  return canTransition(status, 'closed');
}

/** Só o rascunho é plano — abrir congela a pergunta. */
export function canEditSurvey(status: SurveyStatus): boolean {
  return status === 'draft';
}

/** ⭐ A régua do MÉTODO — a mesma do CHECK do banco. */
export function isValidScore(score: number): boolean {
  return Number.isInteger(score) && score >= 0 && score <= 10;
}

/** ⭐ Só a aberta colhe — a recusa com nome. */
export function whyCannotRespond(survey: Survey, score: number): string | null {
  if (survey.status === 'draft') {
    return 'O rascunho ainda não abriu a coleta: não há o que responder.';
  }
  if (survey.status === 'closed') {
    return 'A medição encerrou: resposta tardia entraria num placar já lido — a rodada nova é outra pesquisa.';
  }
  if (!isValidScore(score)) {
    return 'A nota é a régua do método: um inteiro de 0 a 10.';
  }
  return null;
}

/**
 * ⭐ O placar — %promotores − %detratores, calculado do LIVRO. Pesquisa
 * sem resposta devolve `null`: sem número inventado (Lei 7).
 * Espelho da view `nps.survey_score`.
 */
export function computeScore(
  survey: Survey,
  responses: readonly SurveyResponse[],
): SurveyScore | null {
  const doLivro = responses.filter((r) => r.surveyId === survey.id);
  if (doLivro.length === 0) return null;

  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const r of doLivro) {
    if (r.score >= 9) promoters += 1;
    else if (r.score >= 7) passives += 1;
    else detractors += 1;
  }
  const total = doLivro.length;
  return {
    responses: total,
    promoters,
    passives,
    detractors,
    score: Math.round((promoters * 100) / total - (detractors * 100) / total),
  };
}

/** O quadro na ordem de leitura: abertas primeiro, depois rascunhos, depois as fechadas. */
export function orderSurveys(surveys: readonly Survey[]): readonly Survey[] {
  const peso = (s: Survey) => (s.status === 'open' ? 0 : s.status === 'draft' ? 1 : 2);
  return [...surveys].sort((a, b) => {
    const pa = peso(a);
    const pb = peso(b);
    if (pa !== pb) return pa - pb;
    return (b.openedAt ?? '').localeCompare(a.openedAt ?? '');
  });
}

export interface NpsSummary {
  readonly total: number;
  readonly open: number;
  readonly drafts: number;
  readonly closed: number;
  readonly responses: number;
}

export function summarizeSurveys(
  surveys: readonly Survey[],
  responses: readonly SurveyResponse[],
): NpsSummary {
  let open = 0;
  let drafts = 0;
  let closed = 0;
  for (const s of surveys) {
    if (s.status === 'open') open += 1;
    else if (s.status === 'draft') drafts += 1;
    else closed += 1;
  }
  return { total: surveys.length, open, drafts, closed, responses: responses.length };
}

const TITULO_MAX = 200;
const PERGUNTA_MAX = 1000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Valida uma pesquisa nova — nasce no rascunho, com título e a pergunta do tenant. */
export function validateNewSurvey(
  input: NewSurveyInput,
): Validation<{ title: string; question: string }> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Dê um título à rodada.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  const question = texto(input.question);
  if (question === null) {
    problems.push({
      field: 'question',
      message: 'Qual é a pergunta? A régua é do método; as palavras são suas.',
    });
  } else if (question.length > PERGUNTA_MAX) {
    problems.push({ field: 'question', message: `Pergunta com no máximo ${PERGUNTA_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, value: { title: title!, question: question! } };
}
