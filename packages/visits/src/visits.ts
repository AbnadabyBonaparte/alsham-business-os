import type { NewVisitInput, Problem, Validation, Visit, VisitStatus } from './types.ts';

/**
 * O motor do Módulo 21 — Visitas.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

/**
 * ⭐ Espelho de `vis.allowed_transition()` no `0036_vis.sql` — há teste que
 * lê a migration e compara. QUATRO pares; todos os fins TERMINAIS: a visita
 * é o EVENTO DE PRESENÇA — quem volta amanhã é visita nova. Check-out sem
 * check-in não existe: saída sem entrada é livro que mente.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [VisitStatus, VisitStatus])[] = [
  ['scheduled', 'checked_in'],
  ['scheduled', 'no_show'],
  ['scheduled', 'cancelled'],
  ['checked_in', 'checked_out'],
];

export function canTransition(from: VisitStatus, to: VisitStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canCheckIn(status: VisitStatus): boolean {
  return canTransition(status, 'checked_in');
}

export function canCheckOut(status: VisitStatus): boolean {
  return canTransition(status, 'checked_out');
}

export function canMarkNoShow(status: VisitStatus): boolean {
  return canTransition(status, 'no_show');
}

export function canCancel(status: VisitStatus): boolean {
  return canTransition(status, 'cancelled');
}

/** Enquanto agendada, edita-se: agendamento é plano. Depois, é fato. */
export function canEditVisit(status: VisitStatus): boolean {
  return status === 'scheduled';
}

/** O visitante está no pátio? */
export function isInside(visit: Visit): boolean {
  return visit.status === 'checked_in';
}

/** ⭐ Check-out sem check-in não existe — a recusa com nome. */
export function whyCannotCheckOut(visit: Visit): string | null {
  if (visit.status === 'scheduled') {
    return 'Check-out sem check-in é saída sem entrada — registre a chegada primeiro.';
  }
  if (!canCheckOut(visit.status)) {
    return 'A visita já terminou — quem volta amanhã é visita nova.';
  }
  return null;
}

export function whyCannotCancel(visit: Visit, reason: string): string | null {
  if (!canCancel(visit.status)) {
    return 'Só o agendamento se desmarca — quem já entrou sai pelo check-out.';
  }
  if (reason.trim().length === 0) {
    return 'Desmarcar exige a razão escrita: agenda que se apaga em silêncio é agenda que mente.';
  }
  return null;
}

/**
 * O livro na ordem da portaria: quem está DENTRO primeiro (entrada mais
 * antiga primeiro — está há mais tempo), depois os agendados por horário,
 * depois a história.
 */
export function orderGate(visits: readonly Visit[]): readonly Visit[] {
  const peso = (v: Visit) =>
    v.status === 'checked_in' ? 0 : v.status === 'scheduled' ? 1 : 2;
  return [...visits].sort((a, b) => {
    const pa = peso(a);
    const pb = peso(b);
    if (pa !== pb) return pa - pb;
    if (pa === 0) return (a.checkedInAt ?? '').localeCompare(b.checkedInAt ?? '');
    if (pa === 1) return (a.expectedAt ?? '').localeCompare(b.expectedAt ?? '');
    return (b.checkedOutAt ?? b.expectedAt ?? '').localeCompare(a.checkedOutAt ?? a.expectedAt ?? '');
  });
}

export interface VisSummary {
  readonly total: number;
  /** Quem está no pátio agora. */
  readonly inside: number;
  readonly scheduled: number;
}

export function summarizeVisits(visits: readonly Visit[]): VisSummary {
  let inside = 0;
  let scheduled = 0;
  for (const v of visits) {
    if (v.status === 'checked_in') inside += 1;
    else if (v.status === 'scheduled') scheduled += 1;
  }
  return { total: visits.length, inside, scheduled };
}

const NOME_MAX = 200;
const TEXTO_MAX = 500;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Valida uma visita nova: walk-in entra AGORA; agendada exige o quando. */
export function validateNewVisit(input: NewVisitInput): Validation<Visit> {
  const problems: Problem[] = [];

  const visitorName = texto(input.visitorName);
  if (visitorName === null) {
    problems.push({ field: 'visitorName', message: 'Quem é o visitante? O nome é obrigatório.' });
  } else if (visitorName.length > NOME_MAX) {
    problems.push({ field: 'visitorName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  const host = texto(input.host);
  if (host === null) {
    problems.push({
      field: 'host',
      message: 'Para quem ou para onde? Visita sem destino é alguém vagando.',
    });
  } else if (host.length > TEXTO_MAX) {
    problems.push({ field: 'host', message: `Destino com no máximo ${TEXTO_MAX} caracteres.` });
  }

  const scheduled = input.scheduled === true;
  let expectedAt: string | null = null;
  if (scheduled) {
    const raw = texto(input.expectedAt);
    if (raw === null || !ISO_RE.test(raw)) {
      problems.push({ field: 'expectedAt', message: 'Agendar exige o quando.' });
    } else {
      expectedAt = raw;
    }
  }

  const visitorDocument = texto(input.visitorDocument) ?? '';
  const visitorContact = texto(input.visitorContact) ?? '';
  const reason = texto(input.reason) ?? '';
  if (reason.length > TEXTO_MAX) {
    problems.push({ field: 'reason', message: `Motivo com no máximo ${TEXTO_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      visitorName: visitorName!,
      visitorDocument,
      visitorContact,
      host: host!,
      reason,
      status: scheduled ? 'scheduled' : 'checked_in',
      expectedAt,
      checkedInAt: null,   // o carimbo é do servidor, nunca daqui.
      checkedOutAt: null,
      cancelReason: '',
      correctsVisitId: null,
    },
  };
}
