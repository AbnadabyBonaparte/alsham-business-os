import type {
  CarePriority,
  NewTicketInput,
  Problem,
  Ticket,
  TicketStatus,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 15 — Atendimento.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). O relógio entra por
 * parâmetro — o pacote não olha o calendário sozinho.
 */

/**
 * ⭐ Espelho de `care.allowed_transition()` no `0030_care.sql` — há teste
 * que lê a migration e compara. `resolved → open` EXISTE (o mesmo caso);
 * `closed` é TERMINAL (quem volta depois é caso novo).
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [TicketStatus, TicketStatus])[] = [
  ['open', 'in_progress'],
  ['in_progress', 'open'],
  ['open', 'resolved'],
  ['in_progress', 'resolved'],
  ['open', 'closed'],
  ['in_progress', 'closed'],
  ['resolved', 'closed'],
  ['resolved', 'open'],
];

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function nextStatuses(from: TicketStatus): readonly TicketStatus[] {
  return ALLOWED_TRANSITIONS.filter(([f]) => f === from).map(([, t]) => t);
}

export function canResolve(status: TicketStatus): boolean {
  return canTransition(status, 'resolved');
}

export function canClose(status: TicketStatus): boolean {
  return canTransition(status, 'closed');
}

/** ⭐ Reabrir só de `resolved` — fechado é terminal. */
export function canReopen(status: TicketStatus): boolean {
  return canTransition(status, 'open') && status === 'resolved';
}

export function canStart(status: TicketStatus): boolean {
  return canTransition(status, 'in_progress');
}

/** Só caso vivo edita conteúdo e conversa novo — resolvido/fechado congela. */
export function canEditTicket(status: TicketStatus): boolean {
  return status === 'open' || status === 'in_progress';
}

export function canInteract(status: TicketStatus): boolean {
  return status !== 'closed';
}

/** O atraso é DECISÃO do pacote — a tela não compara data nenhuma. */
export function isOverdue(ticket: Ticket, nowIso: string): boolean {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return false;
  if (ticket.dueAt === null) return false;
  return ticket.dueAt < nowIso;
}

/**
 * ⭐ A ordem da fila: prioridade do TENANT primeiro (posição 0 = mais
 * urgente; sem prioridade vai ao fim), depois o prazo mais apertado, depois
 * a chegada. A tela desenha o que o pacote ordenou.
 */
export function orderTickets(
  tickets: readonly Ticket[],
  priorities: readonly CarePriority[],
): readonly Ticket[] {
  const posicao = new Map(priorities.map((p) => [p.id, p.position]));
  const chave = (t: Ticket) => {
    const p = t.priorityId !== null ? (posicao.get(t.priorityId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    return { p, due: t.dueAt ?? '9999-12-31T23:59:59Z' };
  };
  return [...tickets].sort((a, b) => {
    const ka = chave(a);
    const kb = chave(b);
    if (ka.p !== kb.p) return ka.p - kb.p;
    return ka.due.localeCompare(kb.due);
  });
}

const ASSUNTO_MAX = 200;
const NOME_MAX = 200;
const DESC_MAX = 4000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export function validateNewTicket(input: NewTicketInput): Validation<Ticket> {
  const problems: Problem[] = [];

  const subject = texto(input.subject);
  if (subject === null) {
    problems.push({ field: 'subject', message: 'Informe o assunto do caso.' });
  } else if (subject.length > ASSUNTO_MAX) {
    problems.push({ field: 'subject', message: `Assunto com no máximo ${ASSUNTO_MAX} caracteres.` });
  }

  const requesterName = texto(input.requesterName);
  if (requesterName === null) {
    problems.push({ field: 'requesterName', message: 'Informe quem solicitou — um caso responde a alguém.' });
  } else if (requesterName.length > NOME_MAX) {
    problems.push({ field: 'requesterName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  let description = texto(input.description) ?? '';
  if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
    description = description.slice(0, DESC_MAX);
  }

  const dueAt = texto(input.dueAt);
  if (dueAt !== null && Number.isNaN(Date.parse(dueAt))) {
    problems.push({ field: 'dueAt', message: 'Prazo em data/hora válidas, ou vazio.' });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      subject: subject!,
      description,
      requesterName: requesterName!,
      requesterContact: texto(input.requesterContact),
      partyId: null,
      categoryId: texto(input.categoryId),
      priorityId: texto(input.priorityId),
      assigneeUserId: null,
      dueAt,
      status: 'open',
      resolvedAt: null,
      resolutionNote: '',
    },
  };
}

export function validateInteraction(body: unknown): Validation<{ body: string }> {
  const limpo = texto(body);
  if (limpo === null) {
    return { ok: false, problems: [{ field: 'body', message: 'A interação precisa de conteúdo.' }] };
  }
  return { ok: true, value: { body: limpo } };
}

export interface CareSummary {
  readonly total: number;
  readonly openish: number;
  readonly overdue: number;
  readonly resolved: number;
}

export function summarizeTickets(tickets: readonly Ticket[], nowIso: string): CareSummary {
  let openish = 0;
  let overdue = 0;
  let resolved = 0;
  for (const t of tickets) {
    if (t.status === 'open' || t.status === 'in_progress') openish += 1;
    if (isOverdue(t, nowIso)) overdue += 1;
    if (t.status === 'resolved') resolved += 1;
  }
  return { total: tickets.length, openish, overdue, resolved };
}
