import type { EventEnvelope } from '@alsham/core';

/**
 * ⭐ **O CONSUMIDOR QUE DÁ SENTIDO AO MÓDULO.**
 *
 * A régua consome os fatos de títulos a receber SEM importar o módulo que
 * os emite, sem ler o schema dele e sem conhecer o correio — o padrão da
 * Etapa 10, pela quarta vez. O acoplamento é com o TIPO do evento, que é
 * contrato público.
 *
 * ⭐ A origem vem SEMPRE de `envelope.producedBy` — nunca constante. Um
 * segundo produtor do mesmo formato (um ERP externo emitindo o mesmo tipo)
 * grava a origem DELE, e a trilha não mente.
 */

export const CONSUMED_EVENT_TYPES = [
  'ar.receivable.registered',
  'ar.receivable.updated',
  'ar.receivable.cancelled',
] as const;

export const CONSUMED_EVENT_PATTERN = 'ar.*';

export const CONSUMER_ID = 'dun-title-projection';

interface ReceivablePayload {
  readonly externalRef?: unknown;
  readonly dueDate?: unknown;
  readonly amountCents?: unknown;
  readonly receivedAmountCents?: unknown;
  readonly currency?: unknown;
  /** O produtor emite `payerName` — quem deve. */
  readonly payerName?: unknown;
  readonly counterpartyTaxId?: unknown;
  readonly description?: unknown;
  readonly status?: unknown;
}

export interface ExternalTitle {
  readonly tenantId: string;
  /** Sempre de `envelope.producedBy` — nunca constante. */
  readonly sourceModuleId: string;
  readonly externalRef: string;
  readonly dueDate: string;
  readonly amountCents: number;
  readonly receivedAmountCents: number;
  readonly currency: string;
  readonly payerName: string | null;
  readonly counterpartyTaxId: string | null;
  readonly description: string;
  readonly status: 'open' | 'partially_received' | 'received' | 'cancelled';
}

export type TitleTranslation =
  | { readonly kind: 'apply'; readonly title: ExternalTitle }
  | { readonly kind: 'ignore'; readonly reason: string };

const ESTADOS = ['open', 'partially_received', 'received', 'cancelled'] as const;

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export function toExternalTitle(envelope: EventEnvelope): TitleTranslation {
  // O padrão é curinga (`ar.*`); o que não for título é ignorado SEM erro —
  // payload alheio não enche dead letter.
  if (!/^[a-z0-9-]+\.receivable\./.test(envelope.eventType)) {
    return { kind: 'ignore', reason: `tipo ${envelope.eventType} não é um fato de título` };
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
    return { kind: 'ignore', reason: `estado "${String(status)}" não existe nesta régua` };
  }

  const recebido = payload.receivedAmountCents;
  const receivedAmountCents =
    typeof recebido === 'number' && Number.isInteger(recebido) && recebido >= 0 ? recebido : 0;

  const produtor = textoOuNulo(envelope.producedBy);
  if (produtor === null) {
    return { kind: 'ignore', reason: 'envelope sem produtor — origem do título desconhecida' };
  }

  return {
    kind: 'apply',
    title: {
      tenantId: envelope.tenantId,
      sourceModuleId: produtor,
      externalRef,
      dueDate,
      amountCents,
      receivedAmountCents,
      currency,
      payerName: textoOuNulo(payload.payerName),
      counterpartyTaxId: textoOuNulo(payload.counterpartyTaxId),
      description: textoOuNulo(payload.description) ?? '',
      status: status as ExternalTitle['status'],
    },
  };
}

export interface DunTitlePort {
  recordExternalReceivable(
    title: ExternalTitle,
  ): Promise<'created' | 'updated' | 'unchanged'>;
}

export type TitleHandledOutcome =
  | { readonly kind: 'projected'; readonly effect: 'created' | 'updated' | 'unchanged' }
  | { readonly kind: 'ignored'; readonly reason: string };

export function handleDunTitle(port: DunTitlePort) {
  return async (envelope: EventEnvelope): Promise<TitleHandledOutcome> => {
    const traduzido = toExternalTitle(envelope);
    if (traduzido.kind === 'ignore') {
      return { kind: 'ignored', reason: traduzido.reason };
    }

    const efeito = await port.recordExternalReceivable(traduzido.title);
    return { kind: 'projected', effect: efeito };
  };
}
