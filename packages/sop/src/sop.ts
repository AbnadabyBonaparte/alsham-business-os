/**
 * O motor puro do Módulo 49 — S&OP / Rodadas de Consenso.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma rodada pode ser aprovada.
 *
 * ⭐ A rodada NÃO refaz o plano — é a GOVERNANÇA sobre ele. Nasce `draft`,
 * APROVAR CONGELA (`draft→approved`, terminal), cancelar exige razão
 * (`draft→cancelled`, terminal). O `ALLOWED_TRANSITIONS` abaixo é o espelho de
 * `sop.allowed_transition()` no `0064_sop.sql`, e um teste lê a migration e
 * confere que os dois dizem a mesma coisa. A diferença de fundo — aprovar é
 * gate de permissão PRÓPRIA (`sop.round.approve`), papel mais sênior do que
 * quem desenha — vive no gatilho da migration, não na régua de transições.
 */
import type {
  NewRoundInput,
  Problem,
  Round,
  RoundStatus,
  RoundSummary,
  Validation,
} from './types.ts';

/**
 * ⭐ draft→approved (aprovar o consenso), draft→cancelled (abandonar a rodada).
 * `approved` e `cancelled` são TERMINAIS: a próxima rodada é rodada nova.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [RoundStatus, RoundStatus])[] = [
  ['draft', 'approved'],
  ['draft', 'cancelled'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly RoundStatus[] = ['draft', 'approved', 'cancelled'];

export function canTransition(from: RoundStatus, to: RoundStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: RoundStatus): readonly RoundStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** ⭐ Aprovar (draft→approved) só existe para o rascunho. */
export function canApprove(status: RoundStatus): boolean {
  return status === 'draft';
}

/** Cancelar (abandonar) só existe para o rascunho. */
export function canCancel(status: RoundStatus): boolean {
  return status === 'draft';
}

/** O conteúdo (período/plano) só muda em rascunho — a decidida não se edita. */
export function canEditContent(status: RoundStatus): boolean {
  return status === 'draft';
}

const ORDEM: Record<RoundStatus, number> = {
  draft: 0,
  approved: 1,
  cancelled: 2,
};

/** Rascunhos primeiro, depois aprovadas, depois canceladas; dentro, por período. */
export function orderRounds(rounds: readonly Round[]): readonly Round[] {
  return [...rounds].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    return a.period.localeCompare(b.period);
  });
}

export function summarizeRounds(rounds: readonly Round[]): RoundSummary {
  return {
    total: rounds.length,
    draft: rounds.filter((r) => r.status === 'draft').length,
    approved: rounds.filter((r) => r.status === 'approved').length,
    cancelled: rounds.filter((r) => r.status === 'cancelled').length,
  };
}

const PERIODO_MAX = 120;
const TITULO_MAX = 200;
const PLANO_MAX = 200;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma rodada nova (sempre nasce `draft`).
 * O período é obrigatório; o título, o vínculo com o plano (`planId`) e o nome
 * do plano (`planName`) são OPCIONAIS (viram '' ou null). Nasce sem carimbo de
 * consenso, com `id` vazio — a pura camada nunca inventa dado do servidor.
 */
export function validateNewRound(input: NewRoundInput): Validation<Round> {
  const problems: Problem[] = [];

  const period = texto(input.period);
  if (period === null) {
    problems.push({ field: 'period', message: 'Informe o período da rodada de consenso.' });
  } else if (period.length > PERIODO_MAX) {
    problems.push({ field: 'period', message: `Período com no máximo ${PERIODO_MAX} caracteres.` });
  }

  // Título é opcional: ausente vira '' (vazio), não um erro.
  let title = texto(input.title) ?? '';
  if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
    title = title.slice(0, TITULO_MAX);
  }

  // Nome do plano é opcional (carimbado pela tela): ausente vira '' (vazio).
  let planName = texto(input.planName) ?? '';
  if (planName.length > PLANO_MAX) {
    problems.push({ field: 'planName', message: `Nome do plano com no máximo ${PLANO_MAX} caracteres.` });
    planName = planName.slice(0, PLANO_MAX);
  }

  // Vínculo com o plano é ID SOLTO e OPCIONAL: ausente vira null.
  const planId = texto(input.planId);

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      period: period!,
      title,
      planId,
      planName,
      status: 'draft',
      cancelReason: '',
    },
  };
}
