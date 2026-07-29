import type { EventEnvelope } from '@alsham/core';

/**
 * ⭐ **O LADO QUE FECHA O TRIÂNGULO DO CRÉDITO.**
 *
 * Espelho consciente de `external-payable.ts`: o Módulo 1 consome
 * `ar.receivable.*` sem importar `@alsham/accounts-receivable`, sem ler
 * `ar.receivables` e sem chamar o produtor.
 *
 * ⭐ A divergência que este tradutor NÃO herda do payable: receber a maior é
 * permitido. `receivedAmountCents > amountCents` passa; no payable, liquidar
 * a maior era `ignore`.
 */

export const RECEIVABLE_CONSUMED_EVENT_TYPES = [
  'ar.receivable.registered',
  'ar.receivable.updated',
  'ar.receivable.cancelled',
] as const;

export const RECEIVABLE_CONSUMED_EVENT_PATTERN = 'ar.*';

export const RECEIVABLE_CONSUMER_ID = 'recon-external-receivable-projection';

interface ReceivablePayload {
  readonly externalRef?: unknown;
  readonly dueDate?: unknown;
  readonly amountCents?: unknown;
  readonly receivedAmountCents?: unknown;
  readonly currency?: unknown;
  /** Nome no evento AR (`0010_ar.sql` emite `payerName`). */
  readonly payerName?: unknown;
  readonly counterpartyTaxId?: unknown;
  readonly description?: unknown;
  readonly status?: unknown;
}

export interface ExternalReceivable {
  readonly tenantId: string;
  /** Sempre de `envelope.producedBy` — nunca constante. */
  readonly sourceModuleId: string;
  readonly externalRef: string;
  readonly dueDate: string;
  readonly amountCents: number;
  readonly receivedAmountCents: number;
  readonly currency: string;
  readonly counterpartyName: string | null;
  readonly counterpartyTaxId: string | null;
  readonly description: string;
  readonly status: 'open' | 'partially_received' | 'received' | 'cancelled';
}

export type ReceivableTranslation =
  | { readonly kind: 'apply'; readonly receivable: ExternalReceivable }
  | { readonly kind: 'ignore'; readonly reason: string };

const ESTADOS = ['open', 'partially_received', 'received', 'cancelled'] as const;

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export function toExternalReceivable(envelope: EventEnvelope): ReceivableTranslation {
  if (!envelope.eventType.startsWith('ar.receivable.')) {
    return { kind: 'ignore', reason: `tipo ${envelope.eventType} não é escutado por este módulo` };
  }

  const payload = (envelope.payload ?? {}) as ReceivablePayload;

  const externalRef = textoOuNulo(payload.externalRef);
  if (externalRef === null) {
    return { kind: 'ignore', reason: 'evento sem referência do documento — nada a que se referir' };
  }

  const dueDate = textoOuNulo(payload.dueDate);
  if (dueDate === null || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { kind: 'ignore', reason: `vencimento "${String(payload.dueDate)}" não é uma data ISO` };
  }

  const amountCents = payload.amountCents;
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    return { kind: 'ignore', reason: `valor "${String(amountCents)}" não é um valor a receber` };
  }

  const currency = textoOuNulo(payload.currency);
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    return { kind: 'ignore', reason: `moeda "${String(payload.currency)}" não é um código ISO` };
  }

  const status = payload.status;
  if (typeof status !== 'string' || !(ESTADOS as readonly string[]).includes(status)) {
    return { kind: 'ignore', reason: `estado "${String(status)}" não existe neste módulo` };
  }

  const recebido = payload.receivedAmountCents;
  const receivedAmountCents =
    typeof recebido === 'number' && Number.isInteger(recebido) && recebido >= 0 ? recebido : 0;

  // ⭐ NÃO rejeitar received > amount — divergência consciente do AR.

  const produtor = textoOuNulo(envelope.producedBy);
  if (produtor === null) {
    return { kind: 'ignore', reason: 'envelope sem produtor — origem do título desconhecida' };
  }

  return {
    kind: 'apply',
    receivable: {
      tenantId: envelope.tenantId,
      sourceModuleId: produtor,
      externalRef,
      dueDate,
      amountCents,
      receivedAmountCents,
      currency,
      // Evento fala `payerName`; a projeção recon guarda `counterparty_name`.
      counterpartyName: textoOuNulo(payload.payerName),
      counterpartyTaxId: textoOuNulo(payload.counterpartyTaxId),
      description: textoOuNulo(payload.description) ?? '',
      status: status as ExternalReceivable['status'],
    },
  };
}

export interface ExternalReceivablePort {
  recordExternalReceivable(
    receivable: ExternalReceivable,
  ): Promise<'created' | 'updated' | 'unchanged' | 'skipped-imported'>;
}

export type ReceivableHandledOutcome =
  | { readonly kind: 'projected'; readonly effect: 'created' | 'updated' | 'unchanged' }
  | { readonly kind: 'kept-local'; readonly externalRef: string }
  | { readonly kind: 'ignored'; readonly reason: string };

export function handleExternalReceivable(port: ExternalReceivablePort) {
  return async (envelope: EventEnvelope): Promise<ReceivableHandledOutcome> => {
    const traduzido = toExternalReceivable(envelope);
    if (traduzido.kind === 'ignore') {
      return { kind: 'ignored', reason: traduzido.reason };
    }

    const efeito = await port.recordExternalReceivable(traduzido.receivable);
    if (efeito === 'skipped-imported') {
      return { kind: 'kept-local', externalRef: traduzido.receivable.externalRef };
    }
    return { kind: 'projected', effect: efeito };
  };
}
