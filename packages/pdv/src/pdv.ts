/**
 * O motor puro do Módulo 71 — Ponto de Venda (PDV).
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma venda pode ser finalizada ou
 * cancelada, nem soma o total do cupom.
 *
 * ⭐ A física é a do `rfq`/`quote` (cabeçalho + itens que congelam ao
 * finalizar), RE-PERGUNTADA e com o DIVERGE assinado: a venda NÃO tem o
 * meio-termo `open` da RFQ. `ALLOWED_TRANSITIONS` abaixo é o espelho EXATO de
 * `pdv.allowed_transition()` no `0086_pdv.sql`, e um teste lê a migration e
 * confere que os dois dizem a mesma coisa — inclusive que aqui NÃO há `open`.
 */
import type {
  NewSaleInput,
  NewSaleItemInput,
  Problem,
  Sale,
  SaleItem,
  SaleStatus,
  SaleTotals,
  Validation,
} from './types.ts';

/**
 * ⭐ draft→completed (finalizar), draft→cancelled. Só isso.
 * `completed` e `cancelled` são TERMINAIS: venda cancelada não reabre, refazer
 * é venda nova. Sem estado intermediário (o DIVERGE do `rfq`, que tem `open`).
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [SaleStatus, SaleStatus])[] = [
  ['draft', 'completed'],
  ['draft', 'cancelled'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly SaleStatus[] = ['draft', 'completed', 'cancelled'];

export function canTransition(from: SaleStatus, to: SaleStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: SaleStatus): readonly SaleStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Finalizar (draft→completed) só existe para o rascunho. */
export function canComplete(status: SaleStatus): boolean {
  return status === 'draft';
}

/** Cancelar (draft→cancelled) só existe para o rascunho. */
export function canCancel(status: SaleStatus): boolean {
  return status === 'draft';
}

/** O conteúdo (cabeçalho/itens) só muda em rascunho — o finalizado congela. */
export function canEditContent(status: SaleStatus): boolean {
  return status === 'draft';
}

/**
 * O total da venda — calculado das linhas, nunca herdado de coluna.
 *
 * ⭐ Espelho da view `pdv.sale_totals`: bruto = Σ quantidade × preço; líquido =
 * bruto − desconto, travado em zero (o `greatest(..., 0)` do SQL). Um desconto
 * maior que o bruto não faz o cupom ficar negativo.
 */
export function computeTotals(
  items: readonly SaleItem[],
  discountCents: number,
): SaleTotals {
  const grossCents = items.reduce((soma, i) => soma + i.quantity * i.unitPriceCents, 0);
  const desconto = Number.isFinite(discountCents) && discountCents > 0 ? discountCents : 0;
  const netCents = Math.max(grossCents - desconto, 0);
  return {
    grossCents,
    discountCents: desconto,
    netCents,
    itemCount: items.length,
  };
}

const OPERATOR_MAX = 120;
const PAYMENT_MAX = 60;
const CUSTOMER_MAX = 200;
const CURRENCY_MAX = 12;
const PRODUCT_MAX = 300;

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
 * Valida uma venda nova (sempre nasce `draft`).
 *
 * A moeda é obrigatória e não-vazia; o desconto é inteiro >= 0 (o CHECK do
 * SQL); o cliente é OPCIONAL (id solto ao crm — venda de balcão é anônima).
 * Operador e método de pagamento são texto livre (viram '' se ausentes). Nasce
 * com `id` vazio — a pura camada nunca inventa dado do servidor.
 */
export function validateNewSale(input: NewSaleInput): Validation<Sale> {
  const problems: Problem[] = [];

  // Operador é opcional (texto livre): ausente vira ''.
  let operator = texto(input.operator) ?? '';
  if (operator.length > OPERATOR_MAX) {
    problems.push({ field: 'operator', message: `Operador com no máximo ${OPERATOR_MAX} caracteres.` });
    operator = operator.slice(0, OPERATOR_MAX);
  }

  // Método de pagamento é opcional (texto livre): ausente vira ''.
  let paymentMethod = texto(input.paymentMethod) ?? '';
  if (paymentMethod.length > PAYMENT_MAX) {
    problems.push({ field: 'paymentMethod', message: `Forma de pagamento com no máximo ${PAYMENT_MAX} caracteres.` });
    paymentMethod = paymentMethod.slice(0, PAYMENT_MAX);
  }

  // Cliente é OPCIONAL: id solto ao crm; ausente é `null` (venda anônima).
  const customerId = texto(input.customerId);
  let customerName = texto(input.customerName) ?? '';
  if (customerName.length > CUSTOMER_MAX) {
    problems.push({ field: 'customerName', message: `Nome do cliente com no máximo ${CUSTOMER_MAX} caracteres.` });
    customerName = customerName.slice(0, CUSTOMER_MAX);
  }

  const currency = texto(input.currency);
  if (currency === null) {
    problems.push({ field: 'currency', message: 'Informe a moeda da venda.' });
  } else if (currency.length > CURRENCY_MAX) {
    problems.push({ field: 'currency', message: `Moeda com no máximo ${CURRENCY_MAX} caracteres.` });
  }

  // Desconto: inteiro >= 0 (o CHECK discount_cents >= 0 do SQL). Ausente vira 0.
  const discountRaw = input.discountCents;
  let discountCents = 0;
  if (discountRaw !== undefined && discountRaw !== null && discountRaw !== '') {
    const d = numero(discountRaw);
    if (d === null || !Number.isInteger(d) || d < 0) {
      problems.push({ field: 'discountCents', message: 'Desconto deve ser um inteiro maior ou igual a zero (em centavos).' });
    } else {
      discountCents = d;
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      operator,
      paymentMethod,
      customerId,
      customerName,
      discountCents,
      currency: currency!,
      status: 'draft',
    },
  };
}

/**
 * Valida um item novo da venda.
 *
 * O nome do produto é obrigatório (a linha precisa dizer o que vendeu, tenha ou
 * não vindo do catálogo); a quantidade é > 0; o preço unitário é inteiro >= 0
 * (o CHECK do SQL). O produto é OPCIONAL (id solto ao catalog — o supermercado
 * bate um preço avulso). O `lineNo` nasce em 0 — o servidor carimba a posição.
 */
export function validateNewItem(input: NewSaleItemInput): Validation<SaleItem> {
  const problems: Problem[] = [];

  // Produto é OPCIONAL: id solto ao catalog; ausente é `null` (preço avulso).
  const productId = texto(input.productId);

  const productName = texto(input.productName);
  if (productName === null) {
    problems.push({ field: 'productName', message: 'Informe o nome do produto.' });
  } else if (productName.length > PRODUCT_MAX) {
    problems.push({ field: 'productName', message: `Produto com no máximo ${PRODUCT_MAX} caracteres.` });
  }

  const quantity = numero(input.quantity);
  if (quantity === null || quantity <= 0) {
    problems.push({ field: 'quantity', message: 'Quantidade deve ser maior que zero.' });
  }

  const unitPriceCents = numero(input.unitPriceCents);
  if (unitPriceCents === null || !Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
    problems.push({ field: 'unitPriceCents', message: 'Preço unitário deve ser um inteiro maior ou igual a zero (em centavos).' });
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      lineNo: 0,
      productId,
      productName: productName!,
      quantity: quantity!,
      unitPriceCents: unitPriceCents!,
    },
  };
}
