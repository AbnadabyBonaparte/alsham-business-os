import type {
  NewProposalInput,
  Problem,
  Proposal,
  ProposalItem,
  ProposalStatus,
  Validation,
} from './types.ts';

/**
 * O motor das propostas — **puro**.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma proposta pode ser aceita nem
 * soma linhas à mão.
 */

/**
 * ⭐ Ciclo de vida — espelho de `quote.allowed_transition()` em `0024_quote.sql`.
 * Teste em lifecycle.test.ts LÊ a migration e compara.
 *
 * ⭐ **Os quatro fins são TERMINAIS, e é a decisão de canon do módulo:** a
 * proposta tem identidade por DOCUMENTO. Reabrir uma recusada reescreveria o
 * que foi posto na mesa — renegociar é documento novo. (O `ops` reabre a OS
 * concluída; trabalho tem identidade por serviço. Os dois estão certos, cada
 * um para o que guarda.)
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [ProposalStatus, ProposalStatus])[] = [
  ['draft', 'sent'],
  ['draft', 'cancelled'],
  ['sent', 'accepted'],
  ['sent', 'declined'],
  ['sent', 'expired'],
  ['sent', 'cancelled'],
];

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: ProposalStatus): readonly ProposalStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

export function canSend(status: ProposalStatus): boolean {
  return status === 'draft';
}

/** Aceite e recusa só existem para proposta NA MESA. */
export function canDecide(status: ProposalStatus): boolean {
  return status === 'sent';
}

export function canCancel(status: ProposalStatus): boolean {
  return status === 'draft' || status === 'sent';
}

/** O conteúdo só muda em rascunho — o que foi posto na mesa não se edita. */
export function canEditContent(status: ProposalStatus): boolean {
  return status === 'draft';
}

/**
 * A validade venceu? Comparação de string `AAAA-MM-DD` — ISO ordena.
 * Proposta sem validade NUNCA expira; recusa-se ou retira-se.
 */
export function isExpirable(proposal: Proposal, today: string): boolean {
  if (proposal.status !== 'sent') return false;
  if (proposal.validUntil === null) return false;
  return proposal.validUntil < today;
}

export function lineTotalCents(quantity: number, unitAmountCents: number): number {
  return Math.round(quantity * unitAmountCents);
}

export function sumItems(items: readonly ProposalItem[]): number {
  return items.reduce((acc, i) => acc + i.lineTotalCents, 0);
}

const REF_MAX = 120;
const NOME_MAX = 200;
const DESC_MAX = 500;
const ITEM_DESC_MAX = 500;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

function numero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Valida uma proposta nova (sempre nasce `draft`).
 * Exige ao menos um item válido — proposta vazia não vai à mesa.
 */
export function validateNewProposal(input: NewProposalInput): Validation<Proposal> {
  const problems: Problem[] = [];

  const externalRef = texto(input.externalRef);
  if (externalRef === null) {
    problems.push({ field: 'externalRef', message: 'Informe a referência da proposta.' });
  } else if (externalRef.length > REF_MAX) {
    problems.push({ field: 'externalRef', message: `Referência com no máximo ${REF_MAX} caracteres.` });
  }

  const currency = texto(input.currency)?.toUpperCase() ?? null;
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'Informe a moeda ISO (três letras).' });
  }

  let prospectName = texto(input.prospectName);
  if (prospectName !== null && prospectName.length > NOME_MAX) {
    problems.push({ field: 'prospectName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
    prospectName = null;
  }

  let counterpartyTaxId = texto(input.counterpartyTaxId);
  if (counterpartyTaxId !== null && counterpartyTaxId.length > 64) {
    problems.push({ field: 'counterpartyTaxId', message: 'Identificador fiscal longo demais.' });
    counterpartyTaxId = null;
  }

  let description = texto(input.description) ?? '';
  if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
    description = description.slice(0, DESC_MAX);
  }

  const validUntil = texto(input.validUntil);
  if (validUntil !== null && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    problems.push({ field: 'validUntil', message: 'Validade no formato AAAA-MM-DD, ou vazia.' });
  }

  const rawItems = Array.isArray(input.items) ? input.items : null;
  if (rawItems === null || rawItems.length === 0) {
    problems.push({ field: 'items', message: 'Inclua ao menos um item na proposta.' });
  }

  const items: ProposalItem[] = [];
  if (rawItems) {
    rawItems.forEach((raw, idx) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const prefix = `items.${idx}`;
      const desc = texto(row.description);
      if (desc === null) {
        problems.push({ field: `${prefix}.description`, message: 'Descreva o item.' });
      } else if (desc.length > ITEM_DESC_MAX) {
        problems.push({
          field: `${prefix}.description`,
          message: `Descrição do item com no máximo ${ITEM_DESC_MAX} caracteres.`,
        });
      }

      const qty = numero(row.quantity);
      if (qty === null || qty <= 0) {
        problems.push({ field: `${prefix}.quantity`, message: 'Quantidade deve ser maior que zero.' });
      }

      const unit = numero(row.unitAmountCents);
      if (unit === null || !Number.isInteger(unit) || unit <= 0) {
        problems.push({
          field: `${prefix}.unitAmountCents`,
          message: 'Valor unitário em centavos, inteiro e positivo.',
        });
      }

      if (desc && qty !== null && qty > 0 && unit !== null && Number.isInteger(unit) && unit > 0) {
        items.push({
          lineNo: items.length + 1,
          description: desc,
          quantity: qty,
          unitAmountCents: unit,
          lineTotalCents: lineTotalCents(qty, unit),
        });
      }
    });
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      externalRef: externalRef!,
      currency: currency!,
      prospectName,
      counterpartyTaxId,
      description,
      validUntil,
      totalCents: sumItems(items),
      status: 'draft',
      decidedAt: null,
      decisionNote: '',
      items,
    },
  };
}

/** Um resumo para o cabeçalho da tela. Contagem, nunca estimativa. */
export function summarizeProposals(proposals: readonly Proposal[]): {
  readonly total: number;
  readonly onTheTable: number;
  readonly accepted: number;
  readonly declined: number;
  readonly acceptedCentsByCurrency: ReadonlyMap<string, number>;
} {
  const acceptedCents = new Map<string, number>();
  for (const p of proposals) {
    if (p.status === 'accepted') {
      acceptedCents.set(p.currency, (acceptedCents.get(p.currency) ?? 0) + p.totalCents);
    }
  }
  return {
    total: proposals.length,
    onTheTable: proposals.filter((p) => p.status === 'sent').length,
    accepted: proposals.filter((p) => p.status === 'accepted').length,
    declined: proposals.filter((p) => p.status === 'declined').length,
    acceptedCentsByCurrency: acceptedCents,
  };
}
