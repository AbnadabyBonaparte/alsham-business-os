import type {
  Channel,
  EditorialStage,
  NewPieceInput,
  Piece,
  PieceStatus,
  Problem,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 25 — Calendário Editorial.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

/**
 * ⭐ Espelho de `edcal.allowed_transition()` no `0040_edcal.sql` — há teste
 * que lê a migration e compara. DOIS pares e DOIS fins TERMINAIS: toda
 * pauta ou vai ao ar ou morre — e a pauta que revive é pauta nova. As
 * ETAPAS do meio são desenho do tenant e vivem FORA deste ciclo.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [PieceStatus, PieceStatus])[] = [
  ['planned', 'published'],
  ['planned', 'dropped'],
];

export function canTransition(from: PieceStatus, to: PieceStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** Enquanto planejada, TUDO é plano: edita, reagenda, move. */
export function canEditPiece(status: PieceStatus): boolean {
  return status === 'planned';
}

export function canMove(status: PieceStatus): boolean {
  return status === 'planned';
}

/** ⭐ Reagendar é UPDATE honesto, sem trilha — o calendário é plano. */
export function canReschedule(status: PieceStatus): boolean {
  return status === 'planned';
}

/** ⭐ O fim — publicou ou morreu — com a recusa nomeada. */
export function whyCannotClose(
  piece: Piece,
  outcome: 'published' | 'dropped',
  reason: string,
): string | null {
  if (!canTransition(piece.status, outcome)) {
    return 'O fim da pauta é terminal: a pauta que revive é pauta nova.';
  }
  if (outcome === 'dropped' && reason.trim().length === 0) {
    return 'Descartar exige a razão: a pauta que morre ensina a que nasce.';
  }
  return null;
}

export function whyCannotMove(piece: Piece, toStageId: string): string | null {
  if (!canMove(piece.status)) {
    return 'Pauta com fim registrado não se move: o fluxo acabou.';
  }
  if (piece.currentStageId === toStageId) {
    return 'A pauta já está nesta etapa.';
  }
  return null;
}

/** ⭐ Canal arquivado não recebe pauta nova — mas VOLTA do arquivo. */
export function whyCannotPlanOn(channel: Channel): string | null {
  if (channel.status === 'archived') {
    return 'Canal arquivado não recebe pauta nova: devolva-o ao ativo ou escolha outro.';
  }
  return null;
}

/** O fluxo na ordem do desenho do tenant. */
export function orderStages(stages: readonly EditorialStage[]): readonly EditorialStage[] {
  return [...stages].sort((a, b) => a.position - b.position);
}

/**
 * O calendário na ordem de leitura: planejadas por data (a mais próxima
 * primeiro), depois publicadas (a mais recente primeiro), depois as mortas.
 */
export function orderCalendar(pieces: readonly Piece[]): readonly Piece[] {
  const peso = (p: Piece) =>
    p.status === 'planned' ? 0 : p.status === 'published' ? 1 : 2;
  return [...pieces].sort((a, b) => {
    const pa = peso(a);
    const pb = peso(b);
    if (pa !== pb) return pa - pb;
    if (a.status === 'planned') return a.plannedOn.localeCompare(b.plannedOn);
    return (b.publishedAt ?? b.plannedOn).localeCompare(a.publishedAt ?? a.plannedOn);
  });
}

/**
 * As planejadas com a data vencida — `today` vem de FORA (domínio puro não
 * olha relógio), em ISO `yyyy-mm-dd`.
 */
export function latePieces(pieces: readonly Piece[], todayIso: string): readonly Piece[] {
  return pieces.filter((p) => p.status === 'planned' && p.plannedOn < todayIso);
}

export interface EditorialSummary {
  readonly total: number;
  readonly planned: number;
  readonly published: number;
  readonly dropped: number;
}

export function summarizePieces(pieces: readonly Piece[]): EditorialSummary {
  let planned = 0;
  let published = 0;
  let dropped = 0;
  for (const p of pieces) {
    if (p.status === 'planned') planned += 1;
    else if (p.status === 'published') published += 1;
    else dropped += 1;
  }
  return { total: pieces.length, planned, published, dropped };
}

const TITULO_MAX = 200;
const BRIEF_MAX = 20000;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Valida uma pauta nova — nasce planejada, num canal, numa etapa, com data. */
export function validateNewPiece(
  input: NewPieceInput,
): Validation<{ title: string; brief: string; channelId: string; stageId: string; plannedOn: string }> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Dê um título à pauta.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  const channelId = texto(input.channelId);
  if (channelId === null) {
    problems.push({ field: 'channelId', message: 'Em que canal? Pauta sem canal não tem onde ir ao ar.' });
  }

  const stageId = texto(input.stageId);
  if (stageId === null) {
    problems.push({ field: 'stageId', message: 'Em que etapa do fluxo a pauta nasce?' });
  }

  const plannedOn = texto(input.plannedOn);
  if (plannedOn === null || !DATA_RE.test(plannedOn)) {
    problems.push({ field: 'plannedOn', message: 'Quando se planeja publicar? O calendário vive de datas.' });
  }

  let brief = texto(input.brief) ?? '';
  if (brief.length > BRIEF_MAX) {
    problems.push({ field: 'brief', message: `Texto de trabalho com no máximo ${BRIEF_MAX} caracteres.` });
    brief = brief.slice(0, BRIEF_MAX);
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: { title: title!, brief, channelId: channelId!, stageId: stageId!, plannedOn: plannedOn! },
  };
}
