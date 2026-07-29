import type {
  NewOrderInput,
  OrderItem,
  OrderStatus,
  Problem,
  PurchaseOrder,
  Validation,
} from './types.ts';

/**
 * Ciclo de vida — espelho de `po.allowed_transition()` em `0017_po.sql`.
 * Teste em lifecycle.test.ts LÊ a migration e compara.
 *
 * ⛔ received → cancelled NÃO existe.
 * ⛔ cancelled é terminal.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [OrderStatus, OrderStatus])[] = [
  ['draft', 'submitted'],
  ['draft', 'cancelled'],
  ['submitted', 'partially_received'],
  ['submitted', 'received'],
  ['submitted', 'cancelled'],
  ['partially_received', 'received'],
  ['partially_received', 'cancelled'],
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/**
 * Status implicado pelas quantidades recebidas (espírito AR: >= completa).
 * Não decide sobre cancelled/draft.
 */
export function statusForReceipt(
  items: readonly { quantity: number; qtyReceived: number }[],
  current: OrderStatus = 'submitted',
): OrderStatus {
  if (current === 'cancelled' || current === 'draft') return current;
  if (items.length === 0) return 'submitted';

  const any = items.some((i) => i.qtyReceived > 0);
  const allDone = items.every((i) => i.qtyReceived >= i.quantity);

  if (allDone) return 'received';
  if (any) return 'partially_received';
  return 'submitted';
}

export function canCancel(status: OrderStatus): boolean {
  return canTransition(status, 'cancelled') && status !== 'cancelled';
}

export function canSubmit(status: OrderStatus): boolean {
  return status === 'draft';
}

export function canReceive(status: OrderStatus): boolean {
  return status === 'submitted' || status === 'partially_received';
}

export function lineTotalCents(quantity: number, unitAmountCents: number): number {
  return Math.round(quantity * unitAmountCents);
}

export function sumItems(items: readonly OrderItem[]): number {
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
 * Valida um pedido novo (sempre nasce `draft`).
 * Exige ao menos um item válido — a tela registra COM itens.
 */
export function validateNewOrder(input: NewOrderInput): Validation<PurchaseOrder> {
  const problems: Problem[] = [];

  const externalRef = texto(input.externalRef);
  if (externalRef === null) {
    problems.push({ field: 'externalRef', message: 'Informe a referência do pedido.' });
  } else if (externalRef.length > REF_MAX) {
    problems.push({ field: 'externalRef', message: `Referência com no máximo ${REF_MAX} caracteres.` });
  }

  const currency = texto(input.currency)?.toUpperCase() ?? null;
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'Informe a moeda ISO (três letras).' });
  }

  let supplierName = texto(input.supplierName);
  if (supplierName !== null && supplierName.length > NOME_MAX) {
    problems.push({ field: 'supplierName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
    supplierName = null;
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

  const rawItems = Array.isArray(input.items) ? input.items : null;
  if (rawItems === null || rawItems.length === 0) {
    problems.push({ field: 'items', message: 'Inclua ao menos um item no pedido.' });
  }

  const items: OrderItem[] = [];
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
          qtyReceived: 0,
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
      supplierName,
      counterpartyTaxId,
      description,
      totalCents: sumItems(items),
      status: 'draft',
      items,
    },
  };
}
