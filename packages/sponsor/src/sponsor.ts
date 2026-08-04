import type {
  Deliverable,
  NewDeliverableInput,
  NewSponsorshipInput,
  Problem,
  Sponsorship,
  SponsorshipStatus,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 96 — Patrocínios.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0111_sponsor.sql`; o pacote avisa antes, com a MESMA
 * régua.
 *
 * ⭐⭐ Este módulo NÃO reescreve o ctr (contrato), o deal (negociação) nem o
 * evt (evento): os três por id solto. Aqui mora só a cota, o valor opcional e
 * o checklist de entregáveis de ativação.
 */

/**
 * ⭐ Espelho de `sponsor.allowed_transition()` no `0111_sponsor.sql` — há teste
 * que lê a migration e compara. `active ↔ archived`: o patrocinador é relação
 * comercial que volta — o DIVERGE do lease (`active → ended` terminal).
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [SponsorshipStatus, SponsorshipStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export function canTransition(from: SponsorshipStatus, to: SponsorshipStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canArchive(status: SponsorshipStatus): boolean {
  return canTransition(status, 'archived');
}

export function canReopen(status: SponsorshipStatus): boolean {
  return canTransition(status, 'active');
}

export function isArchived(status: SponsorshipStatus): boolean {
  return status === 'archived';
}

/** O mapa de patrocínios: ativos primeiro, depois por nome do patrocinador. */
export function orderSponsorships(sponsorships: readonly Sponsorship[]): readonly Sponsorship[] {
  const peso = (s: SponsorshipStatus): number => (s === 'active' ? 0 : 1);
  return [...sponsorships].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.sponsorName.localeCompare(b.sponsorName);
  });
}

export interface SponsorSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

export function summarize(sponsorships: readonly Sponsorship[]): SponsorSummary {
  let active = 0;
  let archived = 0;
  for (const s of sponsorships) {
    if (s.status === 'active') active += 1;
    else archived += 1;
  }
  return { total: sponsorships.length, active, archived };
}

/** Quantos entregáveis de um patrocínio já foram cumpridos. */
export interface DeliverableProgress {
  readonly total: number;
  readonly delivered: number;
  readonly pending: number;
}

export function deliverableProgress(deliverables: readonly Deliverable[]): DeliverableProgress {
  let delivered = 0;
  for (const d of deliverables) if (d.delivered) delivered += 1;
  return { total: deliverables.length, delivered, pending: deliverables.length - delivered };
}

const TEXTO_MAX = 200;
const TIER_MAX = 120;
const DESCRIPTION_MAX = 500;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um patrocínio novo. `eventId` e `sponsorName` são OBRIGATÓRIOS — um
 * patrocínio sem evento não é patrocínio (é o que este módulo existe para
 * amarrar), e um patrocínio sem patrocinador é uma linha muda. Ainda assim
 * `eventId` é ID SOLTO: a validação confere que a tela informou um valor,
 * nunca que a linha existe no evt (isso é integridade de outro schema).
 * `partyId`/`contractId` são IDs SOLTOS OPCIONAIS. `tier` e `amountCents` são
 * opcionais — a cota pode ser registrada antes de negociada, e pode ser permuta.
 */
export function validateNewSponsorship(input: NewSponsorshipInput): Validation<Sponsorship> {
  const problems: Problem[] = [];

  const eventId = texto(input.eventId);
  if (eventId === null) {
    problems.push({ field: 'eventId', message: 'Informe o evento patrocinado (id solto ao evt).' });
  }

  const sponsorName = texto(input.sponsorName);
  if (sponsorName === null) {
    problems.push({ field: 'sponsorName', message: 'Informe o patrocinador.' });
  } else if (sponsorName.length > TEXTO_MAX) {
    problems.push({ field: 'sponsorName', message: `Nome do patrocinador com no máximo ${TEXTO_MAX} caracteres.` });
  }

  const eventRef = texto(input.eventRef) ?? '';
  if (eventRef.length > TEXTO_MAX) {
    problems.push({ field: 'eventRef', message: `Referência do evento com no máximo ${TEXTO_MAX} caracteres.` });
  }

  const contractRef = texto(input.contractRef) ?? '';
  if (contractRef.length > TEXTO_MAX) {
    problems.push({ field: 'contractRef', message: `Referência do contrato com no máximo ${TEXTO_MAX} caracteres.` });
  }

  const tier = texto(input.tier) ?? '';
  if (tier.length > TIER_MAX) {
    problems.push({ field: 'tier', message: `Cota com no máximo ${TIER_MAX} caracteres.` });
  }

  const partyId = texto(input.partyId);
  const contractId = texto(input.contractId);

  let amountCents: number | null = null;
  if (input.amountCents !== undefined && input.amountCents !== null) {
    const a = input.amountCents;
    if (typeof a !== 'number' || !Number.isInteger(a) || a < 0) {
      problems.push({ field: 'amountCents', message: 'Valor da cota em centavos (inteiro, ≥ 0), ou vazio (permuta).' });
    } else {
      amountCents = a;
    }
  }

  let currency: string | null = null;
  if (input.currency !== undefined && input.currency !== null) {
    const c = texto(input.currency);
    if (c === null || !/^[A-Z]{3}$/.test(c)) {
      problems.push({ field: 'currency', message: 'Moeda deve ter três letras maiúsculas (ex.: BRL).' });
    } else {
      currency = c;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      eventId: eventId!,
      eventRef,
      sponsorName: sponsorName!,
      partyId,
      tier,
      amountCents,
      currency,
      contractId,
      contractRef,
      status: 'active',
    },
  };
}

/**
 * Valida um entregável de ativação novo. `sponsorshipId` e `description` são
 * obrigatórios. `delivered` é opcional (nasce pendente por padrão).
 */
export function validateNewDeliverable(input: NewDeliverableInput): Validation<Deliverable> {
  const problems: Problem[] = [];

  const sponsorshipId = texto(input.sponsorshipId);
  if (sponsorshipId === null) {
    problems.push({ field: 'sponsorshipId', message: 'Informe o patrocínio vinculado.' });
  }

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Informe o entregável de ativação.' });
  } else if (description.length > DESCRIPTION_MAX) {
    problems.push({ field: 'description', message: `Entregável com no máximo ${DESCRIPTION_MAX} caracteres.` });
  }

  let delivered = false;
  if (input.delivered !== undefined && input.delivered !== null) {
    if (typeof input.delivered !== 'boolean') {
      problems.push({ field: 'delivered', message: 'O estado de entrega é verdadeiro ou falso.' });
    } else {
      delivered = input.delivered;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      sponsorshipId: sponsorshipId!,
      description: description!,
      delivered,
      deliveredAt: null,
    },
  };
}
