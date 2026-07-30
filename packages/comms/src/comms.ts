import type {
  NewNoticeInput,
  Notice,
  NoticeAck,
  NoticeStatus,
  Problem,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 24 — Comunicados.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

/**
 * ⭐ Espelho de `comm.allowed_transition()` no `0039_comm.sql` — há teste
 * que lê a migration e compara. DOIS pares: publicar é dar a palavra
 * (congela); arquivar tira do mural, não da história — e é TERMINAL: o
 * aviso que volta é comunicado novo.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [NoticeStatus, NoticeStatus])[] = [
  ['draft', 'published'],
  ['published', 'archived'],
];

export function canTransition(from: NoticeStatus, to: NoticeStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canPublish(status: NoticeStatus): boolean {
  return canTransition(status, 'published');
}

export function canArchive(status: NoticeStatus): boolean {
  return canTransition(status, 'archived');
}

/** O rascunho edita-se (é plano); a palavra dada, nunca. */
export function canEditNotice(status: NoticeStatus): boolean {
  return status === 'draft';
}

/** ⭐ Publicar exige corpo — a recusa com nome, decidida aqui. */
export function whyCannotPublish(notice: Notice): string | null {
  if (!canPublish(notice.status)) {
    return 'Só o rascunho se publica — a palavra já foi dada, ou já saiu do mural.';
  }
  if (notice.body.trim().length === 0) {
    return 'Comunicado sem corpo não comunica: escreva antes de dar a palavra.';
  }
  return null;
}

/** ⭐ Ciência: própria, única, e só no que está NO MURAL. */
export function whyCannotAck(
  notice: Notice,
  userId: string,
  acks: readonly NoticeAck[],
): string | null {
  if (notice.status === 'draft') {
    return 'O rascunho ainda não comunicou: não há o que acusar de lido.';
  }
  if (notice.status === 'archived') {
    return 'Fora do mural não há ciência nova: a cobertura conta quem leu enquanto a palavra esteve de pé.';
  }
  if (acks.some((a) => a.noticeId === notice.id && a.userId === userId)) {
    return 'Ciência não se dá duas vezes: o que foi lido foi lido.';
  }
  return null;
}

export function hasAcked(notice: Notice, userId: string, acks: readonly NoticeAck[]): boolean {
  return acks.some((a) => a.noticeId === notice.id && a.userId === userId);
}

/** A cobertura de um comunicado — contada, nunca estimada. */
export function ackCount(notice: Notice, acks: readonly NoticeAck[]): number {
  return acks.filter((a) => a.noticeId === notice.id).length;
}

/** O mural na ordem de leitura: publicados mais novos primeiro, depois rascunhos, depois o arquivo. */
export function orderBoard(notices: readonly Notice[]): readonly Notice[] {
  const peso = (n: Notice) =>
    n.status === 'published' ? 0 : n.status === 'draft' ? 1 : 2;
  return [...notices].sort((a, b) => {
    const pa = peso(a);
    const pb = peso(b);
    if (pa !== pb) return pa - pb;
    return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
  });
}

export interface CommSummary {
  readonly total: number;
  readonly onBoard: number;
  readonly drafts: number;
  readonly archived: number;
}

export function summarizeNotices(notices: readonly Notice[]): CommSummary {
  let onBoard = 0;
  let drafts = 0;
  let archived = 0;
  for (const n of notices) {
    if (n.status === 'published') onBoard += 1;
    else if (n.status === 'draft') drafts += 1;
    else archived += 1;
  }
  return { total: notices.length, onBoard, drafts, archived };
}

const TITULO_MAX = 200;
const AUDIENCIA_MAX = 200;
const CORPO_MAX = 20000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Valida um comunicado novo — nasce no rascunho; o corpo pode vir depois. */
export function validateNewNotice(input: NewNoticeInput): Validation<Notice> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Dê um título ao comunicado.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  const audience = texto(input.audience);
  if (audience === null) {
    problems.push({
      field: 'audience',
      message: 'Para quem se fala? Quem não sabe a audiência ainda não tem comunicado.',
    });
  } else if (audience.length > AUDIENCIA_MAX) {
    problems.push({ field: 'audience', message: `Audiência com no máximo ${AUDIENCIA_MAX} caracteres.` });
  }

  let body = texto(input.body) ?? '';
  if (body.length > CORPO_MAX) {
    problems.push({ field: 'body', message: `Corpo com no máximo ${CORPO_MAX} caracteres.` });
    body = body.slice(0, CORPO_MAX);
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      title: title!,
      body,
      audience: audience!,
      status: 'draft',
      publishedAt: null,
      correctsNoticeId: null,
      correctsTitle: '',
    },
  };
}
