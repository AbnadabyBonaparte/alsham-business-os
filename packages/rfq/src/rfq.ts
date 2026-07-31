/**
 * O motor puro do Módulo 44 — Cotações / RFQ.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma cotação pode ser enviada ou
 * premiada.
 *
 * ⭐ A física é a do `quote` (o documento que congela ao enviar), RE-PERGUNTADA
 * e com o DIVERGE assinado: o terminal da RFQ é a ESCOLHA DO COMPRADOR
 * (`awarded` — quem decide é a empresa que compra), não a resposta do cliente
 * (`accepted`/`declined`). O `ALLOWED_TRANSITIONS` abaixo é o espelho de
 * `rfq.allowed_transition()` no `0059_rfq.sql`, e um teste lê a migration e
 * confere que os dois dizem a mesma coisa.
 */
import type {
  NewRequestInput,
  Problem,
  Request,
  RequestLine,
  RequestStatus,
  RequestSummary,
  Validation,
} from './types.ts';

/**
 * ⭐ draft→open (enviar), draft→cancelled, open→awarded, open→cancelled.
 * `awarded` e `cancelled` são TERMINAIS: refazer é cotação nova.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [RequestStatus, RequestStatus])[] = [
  ['draft', 'open'],
  ['draft', 'cancelled'],
  ['open', 'awarded'],
  ['open', 'cancelled'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly RequestStatus[] = ['draft', 'open', 'awarded', 'cancelled'];

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: RequestStatus): readonly RequestStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Enviar (draft→open) só existe para o rascunho. */
export function canSend(status: RequestStatus): boolean {
  return status === 'draft';
}

/** ⭐ Premiar (open→awarded) só existe para a cotação NO MERCADO. */
export function canAward(status: RequestStatus): boolean {
  return status === 'open';
}

/** Cancelar existe do rascunho e do mercado (sem vencedor). */
export function canCancel(status: RequestStatus): boolean {
  return status === 'draft' || status === 'open';
}

/** O conteúdo (título/itens) só muda em rascunho — o enviado não se edita. */
export function canEditContent(status: RequestStatus): boolean {
  return status === 'draft';
}

const ORDEM: Record<RequestStatus, number> = {
  open: 0,
  draft: 1,
  awarded: 2,
  cancelled: 3,
};

/** No mercado primeiro, depois rascunhos, depois os fins; dentro, por título. */
export function orderRequests(requests: readonly Request[]): readonly Request[] {
  return [...requests].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    return a.title.localeCompare(b.title);
  });
}

export function summarizeRequests(requests: readonly Request[]): RequestSummary {
  return {
    total: requests.length,
    draft: requests.filter((r) => r.status === 'draft').length,
    open: requests.filter((r) => r.status === 'open').length,
    awarded: requests.filter((r) => r.status === 'awarded').length,
    cancelled: requests.filter((r) => r.status === 'cancelled').length,
  };
}

const TITULO_MAX = 200;
const DESC_MAX = 500;
const ITEM_MAX = 300;
const UNIDADE_MAX = 40;

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
 * Valida uma cotação nova (sempre nasce `draft`).
 * O título é obrigatório; a descrição é OPCIONAL (vira ''). Exige ao menos um
 * item válido — cotação vazia não vai ao mercado. Erros de item vêm com o
 * índice no campo (`lines.0.quantity`). Nasce sem vencedor, com `id` vazio — a
 * pura camada nunca inventa dado do servidor.
 */
export function validateNewRequest(input: NewRequestInput): Validation<Request> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Informe o título da cotação.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  // Descrição é opcional: ausente vira '' (vazio), não um erro.
  let description = texto(input.description) ?? '';
  if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
    description = description.slice(0, DESC_MAX);
  }

  const rawLines = Array.isArray(input.lines) ? input.lines : null;
  if (rawLines === null || rawLines.length === 0) {
    problems.push({ field: 'lines', message: 'Inclua ao menos um item na cotação.' });
  }

  const lines: RequestLine[] = [];
  if (rawLines) {
    rawLines.forEach((raw, idx) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const prefix = `lines.${idx}`;

      const item = texto(row.item);
      if (item === null) {
        problems.push({ field: `${prefix}.item`, message: 'Descreva o item a cotar.' });
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
      status: 'draft',
      awardedSupplierId: null,
      awardedSupplierName: '',
      cancelReason: '',
      lines,
    },
  };
}
