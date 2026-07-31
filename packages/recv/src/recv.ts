/**
 * O motor puro do Módulo 45 — Recebimento (Goods Receipt).
 *
 * ⭐⭐ A física é a do ATO PONTUAL (o `sec`, o `perf`): o recebimento é fato
 * consumado — nasce e nunca muda. Por isso este motor NÃO TEM transições de
 * ciclo de vida, NÃO TEM `ALLOWED_TRANSITIONS`, NÃO TEM `canTransition`. A
 * ausência é a lei: um teste lê o `0060_recv.sql` e confere que a migration
 * também não declara `allowed_transition`, e que não há coluna de "quantidade
 * pedida" contra a qual a sobra pudesse ser recusada.
 *
 * ⭐ O paralelo recv × ar: receber a maior é PERMITIDO. A quantidade só precisa
 * ser > 0 — não há teto. A sobra que o fornecedor entregou é fato do mundo, a
 * mesma decisão que o `ar` tomou para o dinheiro (`0010_ar.sql §2.1`).
 */
import type {
  NewReceiptInput,
  Problem,
  Receipt,
  ReceiptSummary,
  Validation,
} from './types.ts';

/** Do mais recente ao mais antigo — a leitura do livro. Tiebreak estável por id. */
export function orderReceipts(receipts: readonly Receipt[]): readonly Receipt[] {
  return [...receipts].sort((a, b) => {
    if (a.receivedOn !== b.receivedOn) return a.receivedOn < b.receivedOn ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

/** Conta as linhas e soma as quantidades — todo número é length/soma, nunca chute. */
export function summarizeReceipts(receipts: readonly Receipt[]): ReceiptSummary {
  return {
    total: receipts.length,
    totalQuantity: receipts.reduce((soma, r) => soma + r.quantity, 0),
  };
}

const ITEM_MAX = 300;
const ORDER_REF_MAX = 120;
const NOTE_MAX = 1000;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um recebimento novo. O item é obrigatório; a quantidade tem de ser um
 * número > 0 (SEM teto — a sobra é fato); o dia é obrigatório no formato ISO. O
 * pedido é OPCIONAL (id solto + ref) — um recebimento pode não ter pedido. Nasce
 * com `id` vazio: a pura camada nunca inventa dado do servidor.
 */
export function validateNewReceipt(input: NewReceiptInput): Validation<Receipt> {
  const problems: Problem[] = [];

  const item = texto(input.item);
  if (item === null) {
    problems.push({ field: 'item', message: 'Informe o que foi recebido.' });
  } else if (item.length > ITEM_MAX) {
    problems.push({ field: 'item', message: `Item com no máximo ${ITEM_MAX} caracteres.` });
  }

  // Quantidade: número finito e estritamente positivo. Sem teto — receber a
  // maior é permitido (o paralelo recv × ar).
  const quantidade = input.quantity;
  if (typeof quantidade !== 'number' || !Number.isFinite(quantidade)) {
    problems.push({ field: 'quantity', message: 'Informe a quantidade recebida.' });
  } else if (quantidade <= 0) {
    problems.push({ field: 'quantity', message: 'A quantidade recebida tem de ser maior que zero.' });
  }

  // O dia do recebimento é obrigatório, no formato ISO. Passado é permitido.
  const receivedOn = texto(input.receivedOn);
  if (receivedOn === null) {
    problems.push({ field: 'receivedOn', message: 'Informe o dia do recebimento.' });
  } else if (!DATA_ISO.test(receivedOn)) {
    problems.push({ field: 'receivedOn', message: 'A data deve estar no formato AAAA-MM-DD.' });
  }

  // Pedido OPCIONAL: id solto (texto/uuid) + ref carimbada pela tela.
  const orderId = texto(input.orderId);
  const orderRefBruto = texto(input.orderRef);
  let orderRef = '';
  if (orderRefBruto !== null) {
    if (orderRefBruto.length > ORDER_REF_MAX) {
      problems.push({ field: 'orderRef', message: `Referência com no máximo ${ORDER_REF_MAX} caracteres.` });
    } else {
      orderRef = orderRefBruto;
    }
  }

  // Nota opcional.
  const notaBruta = texto(input.note);
  let note = '';
  if (notaBruta !== null) {
    if (notaBruta.length > NOTE_MAX) {
      problems.push({ field: 'note', message: `Nota com no máximo ${NOTE_MAX} caracteres.` });
    } else {
      note = notaBruta;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      orderId,
      orderRef,
      item: item!,
      quantity: quantidade as number,
      receivedOn: receivedOn!,
      note,
    },
  };
}
