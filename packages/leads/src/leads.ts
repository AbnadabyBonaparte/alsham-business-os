import type { Lead, LeadStatus, NewLeadInput, Problem, Validation } from './types.ts';

/**
 * O motor do Módulo 22 — Leads.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

/**
 * ⭐ Espelho de `lead.allowed_transition()` no `0037_lead.sql` — há teste
 * que lê a migration e compara. SEIS pares, ciclo curto: a volta à fila
 * existe (atender e devolver não é desfecho); `qualified` e `discarded`
 * são TERMINAIS — o lead é a MANIFESTAÇÃO DE INTERESSE: quem volta é lead
 * novo, com origem nova.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [LeadStatus, LeadStatus])[] = [
  ['new', 'in_contact'],
  ['in_contact', 'new'],
  ['new', 'qualified'],
  ['in_contact', 'qualified'],
  ['new', 'discarded'],
  ['in_contact', 'discarded'],
];

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canTake(status: LeadStatus): boolean {
  return canTransition(status, 'in_contact');
}

/** ⭐ Atender e devolver não é desfecho — a volta à fila existe. */
export function canReturnToQueue(status: LeadStatus): boolean {
  return canTransition(status, 'new');
}

export function canQualify(status: LeadStatus): boolean {
  return canTransition(status, 'qualified');
}

export function canDiscard(status: LeadStatus): boolean {
  return canTransition(status, 'discarded');
}

export function canEditLead(status: LeadStatus): boolean {
  return status === 'new' || status === 'in_contact';
}

export function whyCannotQualify(lead: Lead): string | null {
  if (!canQualify(lead.status)) {
    return 'O lead já tem desfecho — quem volta é lead novo, com origem nova.';
  }
  return null;
}

export function whyCannotDiscard(lead: Lead, reason: string): string | null {
  if (!canDiscard(lead.status)) {
    return 'O lead já tem desfecho — quem volta é lead novo, com origem nova.';
  }
  if (reason.trim().length === 0) {
    return 'Descartar exige a razão escrita: fila que apaga em silêncio esconde o próprio funil.';
  }
  return null;
}

/**
 * A fila na ordem de espera: quem chegou primeiro, primeiro — `new` na
 * frente, depois `in_contact`, depois a história (desfecho mais recente
 * primeiro).
 */
export function orderQueue(leads: readonly Lead[]): readonly Lead[] {
  const peso = (l: Lead) =>
    l.status === 'new' ? 0 : l.status === 'in_contact' ? 1 : 2;
  return [...leads].sort((a, b) => {
    const pa = peso(a);
    const pb = peso(b);
    if (pa !== pb) return pa - pb;
    if (pa < 2) return a.createdAt.localeCompare(b.createdAt);
    return (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '');
  });
}

export interface LeadSummary {
  readonly total: number;
  readonly waiting: number;
  readonly inContact: number;
  readonly qualified: number;
  readonly discarded: number;
}

export function summarizeLeads(leads: readonly Lead[]): LeadSummary {
  let waiting = 0;
  let inContact = 0;
  let qualified = 0;
  let discarded = 0;
  for (const l of leads) {
    if (l.status === 'new') waiting += 1;
    else if (l.status === 'in_contact') inContact += 1;
    else if (l.status === 'qualified') qualified += 1;
    else discarded += 1;
  }
  return { total: leads.length, waiting, inContact, qualified, discarded };
}

/** As origens que a fila já viu — contadas, para a leitura de funil. */
export function countBySource(leads: readonly Lead[]): ReadonlyMap<string, number> {
  const mapa = new Map<string, number>();
  for (const l of leads) {
    const chave = l.source.trim() === '' ? '(sem origem)' : l.source.trim();
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }
  return mapa;
}

const NOME_MAX = 200;
const TEXTO_MAX = 500;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Valida um lead novo: o nome basta — a fila não faz interrogatório. */
export function validateNewLead(input: NewLeadInput): Validation<Lead> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Quem manifestou o interesse? O nome é obrigatório.' });
  } else if (name.length > NOME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  const contact = texto(input.contact) ?? '';
  const source = texto(input.source) ?? '';
  const interest = texto(input.interest) ?? '';
  for (const [campo, valor] of [
    ['contact', contact],
    ['source', source],
    ['interest', interest],
  ] as const) {
    if (valor.length > TEXTO_MAX) {
      problems.push({ field: campo, message: `Campo com no máximo ${TEXTO_MAX} caracteres.` });
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      name: name!,
      contact,
      source,
      interest,
      assigneeUserId: null,
      status: 'new',
      decidedAt: null,
      discardReason: '',
      partyId: null,
      partyName: '',
      opportunityId: null,
      opportunityTitle: '',
      createdAt: '',
    },
  };
}
