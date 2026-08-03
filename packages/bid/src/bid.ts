/**
 * O motor puro do Módulo 92 — Licitações (Bid).
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma licitação pode ser publicada ou
 * homologada.
 *
 * ⭐ A física é a do `rfq` (o documento que congela ao publicar), RE-PERGUNTADA
 * e com o DIVERGE assinado: o terminal da licitação é a HOMOLOGAÇÃO do órgão
 * (`homologated` — o ato solene da Lei 14.133), não o prêmio neutro do `rfq`
 * (`awarded`). O `ALLOWED_TRANSITIONS` abaixo é o espelho de
 * `bid.allowed_transition()` no `0107_bid.sql`, e um teste lê a migration e
 * confere que os dois dizem a mesma coisa.
 */
import type {
  NewProposalInput,
  NewTenderInput,
  Problem,
  Proposal,
  Tender,
  TenderLine,
  TenderStatus,
  TenderSummary,
  Validation,
} from './types.ts';

/**
 * ⭐ draft→open (publicar), draft→cancelled, open→homologated, open→cancelled.
 * `homologated` e `cancelled` são TERMINAIS: refazer é licitação nova.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [TenderStatus, TenderStatus])[] = [
  ['draft', 'open'],
  ['draft', 'cancelled'],
  ['open', 'homologated'],
  ['open', 'cancelled'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly TenderStatus[] = ['draft', 'open', 'homologated', 'cancelled'];

export function canTransition(from: TenderStatus, to: TenderStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: TenderStatus): readonly TenderStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Publicar o edital (draft→open) só existe para o rascunho. */
export function canPublish(status: TenderStatus): boolean {
  return status === 'draft';
}

/** ⭐ Homologar (open→homologated) só existe para a licitação ABERTA. */
export function canHomologate(status: TenderStatus): boolean {
  return status === 'open';
}

/** Cancelar existe do rascunho e da licitação aberta (sem vencedor). */
export function canCancel(status: TenderStatus): boolean {
  return status === 'draft' || status === 'open';
}

/** O conteúdo (título/edital/itens) só muda em rascunho — o publicado não se edita. */
export function canEditContent(status: TenderStatus): boolean {
  return status === 'draft';
}

/** Propostas só se recebem enquanto o edital está ABERTO (a janela de propostas). */
export function canReceiveProposals(status: TenderStatus): boolean {
  return status === 'open';
}

const ORDEM: Record<TenderStatus, number> = {
  open: 0,
  draft: 1,
  homologated: 2,
  cancelled: 3,
};

/** Abertas primeiro, depois rascunhos, depois os fins; dentro, por título. */
export function orderTenders(tenders: readonly Tender[]): readonly Tender[] {
  return [...tenders].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    return a.title.localeCompare(b.title);
  });
}

export function summarizeTenders(tenders: readonly Tender[]): TenderSummary {
  return {
    total: tenders.length,
    draft: tenders.filter((t) => t.status === 'draft').length,
    open: tenders.filter((t) => t.status === 'open').length,
    homologated: tenders.filter((t) => t.status === 'homologated').length,
    cancelled: tenders.filter((t) => t.status === 'cancelled').length,
  };
}

const TITULO_MAX = 200;
const DESC_MAX = 2000;
const MODALIDADE_MAX = 100;
const ITEM_MAX = 300;
const UNIDADE_MAX = 40;
const NOME_MAX = 200;
const NOTA_MAX = 500;
const MOEDA_MAX = 10;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
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
 * Valida uma licitação nova (sempre nasce `draft`).
 * O título é obrigatório; a descrição do edital e a modalidade são OPCIONAIS
 * (viram ''). Exige ao menos um item válido — licitação vazia não vai a
 * mercado. Erros de item vêm com o índice no campo (`lines.0.quantity`). Nasce
 * sem vencedor, com `id` vazio — a pura camada nunca inventa dado do servidor.
 */
export function validateNewTender(input: NewTenderInput): Validation<Tender> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Informe o título da licitação.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  // Descrição do edital é opcional: ausente vira '' (vazio), não um erro.
  let description = texto(input.description) ?? '';
  if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Edital com no máximo ${DESC_MAX} caracteres.` });
    description = description.slice(0, DESC_MAX);
  }

  // ⭐ Modalidade é TEXTO LIVRE e opcional (pregão, concorrência…). Nunca enum.
  let modality = texto(input.modality) ?? '';
  if (modality.length > MODALIDADE_MAX) {
    problems.push({ field: 'modality', message: `Modalidade com no máximo ${MODALIDADE_MAX} caracteres.` });
    modality = '';
  }

  const rawLines = Array.isArray(input.lines) ? input.lines : null;
  if (rawLines === null || rawLines.length === 0) {
    problems.push({ field: 'lines', message: 'Inclua ao menos um item na licitação.' });
  }

  const lines: TenderLine[] = [];
  if (rawLines) {
    rawLines.forEach((raw, idx) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const prefix = `lines.${idx}`;

      const item = texto(row.item);
      if (item === null) {
        problems.push({ field: `${prefix}.item`, message: 'Descreva o item a licitar.' });
      } else if (item.length > ITEM_MAX) {
        problems.push({ field: `${prefix}.item`, message: `Item com no máximo ${ITEM_MAX} caracteres.` });
      }

      const qty = numero(row.quantity);
      if (qty === null || qty <= 0) {
        problems.push({ field: `${prefix}.quantity`, message: 'Quantidade deve ser maior que zero.' });
      }

      // Unidade é opcional: ausente vira '' (texto livre).
      let unit = texto(row.unit) ?? '';
      if (unit.length > UNIDADE_MAX) {
        problems.push({ field: `${prefix}.unit`, message: `Unidade com no máximo ${UNIDADE_MAX} caracteres.` });
        unit = '';
      }

      if (item !== null && qty !== null && qty > 0) {
        lines.push({ lineNo: lines.length + 1, item, quantity: qty, unit });
      }
    });
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      title: title!,
      description,
      modality,
      status: 'draft',
      homologatedBidderId: null,
      homologatedBidderName: '',
      cancelReason: '',
      lines,
    },
  };
}

/**
 * Valida uma proposta nova de um licitante.
 * O nome do licitante é obrigatório (o `bidderId` é id solto opcional). O valor
 * é em centavos (>= 0). A moeda cai em "BRL" quando ausente. A nota é opcional.
 */
export function validateNewProposal(input: NewProposalInput): Validation<Proposal> {
  const problems: Problem[] = [];

  const bidderId = texto(input.bidderId);

  const bidderName = texto(input.bidderName);
  if (bidderName === null) {
    problems.push({ field: 'bidderName', message: 'Informe o nome do licitante.' });
  } else if (bidderName.length > NOME_MAX) {
    problems.push({ field: 'bidderName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  const amountCents = numero(input.amountCents);
  if (amountCents === null || !Number.isInteger(amountCents) || amountCents < 0) {
    problems.push({ field: 'amountCents', message: 'Valor deve ser um inteiro em centavos, maior ou igual a zero.' });
  }

  let currency = texto(input.currency) ?? 'BRL';
  if (currency.length > MOEDA_MAX) {
    problems.push({ field: 'currency', message: `Moeda com no máximo ${MOEDA_MAX} caracteres.` });
    currency = 'BRL';
  }

  let note = texto(input.note) ?? '';
  if (note.length > NOTA_MAX) {
    problems.push({ field: 'note', message: `Observação com no máximo ${NOTA_MAX} caracteres.` });
    note = note.slice(0, NOTA_MAX);
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      bidderId,
      bidderName: bidderName!,
      amountCents: amountCents!,
      currency,
      note,
    },
  };
}
