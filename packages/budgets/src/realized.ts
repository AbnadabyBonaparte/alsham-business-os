import type { EventEnvelope } from '@alsham/core';

/**
 * ⭐ **O CONSUMIDOR QUE DÁ SENTIDO AO REALIZADO.**
 *
 * O orçamento consome os lançamentos do Fluxo de Caixa SEM importar o módulo
 * que os emite, sem ler o schema dele e sem conhecer o correio — o padrão da
 * Etapa 10 (recon/marketing/dun), pela quinta vez. O acoplamento é com o
 * TIPO do evento, contrato público.
 *
 * ⭐ A origem vem SEMPRE de `envelope.producedBy` — nunca constante. Um
 * segundo produtor do mesmo formato grava a origem DELE, e o realizado não
 * mente sobre de onde veio o gasto.
 *
 * ⭐ Lançamento SEM categoria é IGNORADO — o orçamento casa por categoria, e
 * um gasto sem categoria não se atribui a nenhum. Ignorar não é erro: payload
 * que não casa não enche dead letter.
 */

export const CONSUMED_EVENT_TYPES = ['cash.entry.registered'] as const;

export const CONSUMED_EVENT_PATTERN = 'cash.*';

export const CONSUMER_ID = 'bud-realized-projection';

interface CashEntryPayload {
  readonly entryId?: unknown;
  readonly signedAmountCents?: unknown;
  readonly currency?: unknown;
  readonly categoryName?: unknown;
  readonly occurredOn?: unknown;
}

export interface BudMovement {
  readonly tenantId: string;
  /** Sempre de `envelope.producedBy` — nunca constante. */
  readonly sourceModuleId: string;
  readonly externalRef: string;
  readonly categoryName: string;
  readonly currency: string;
  readonly occurredOn: string;
  readonly signedAmountCents: number;
}

export type MovementTranslation =
  | { readonly kind: 'apply'; readonly movement: BudMovement }
  | { readonly kind: 'ignore'; readonly reason: string };

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export function toBudMovement(envelope: EventEnvelope): MovementTranslation {
  // O padrão é curinga (`cash.*`); só o lançamento registrado interessa.
  if (!/^[a-z0-9-]+\.entry\.registered$/.test(envelope.eventType)) {
    return { kind: 'ignore', reason: `tipo ${envelope.eventType} não é um lançamento de caixa` };
  }

  const payload = (envelope.payload ?? {}) as CashEntryPayload;

  const externalRef = textoOuNulo(payload.entryId);
  if (externalRef === null) {
    return { kind: 'ignore', reason: 'lançamento sem id — nada a que referir a projeção' };
  }

  // ⭐ Sem categoria, não casa orçamento nenhum — ignorado sem erro.
  const categoryName = textoOuNulo(payload.categoryName);
  if (categoryName === null) {
    return { kind: 'ignore', reason: 'lançamento sem categoria — não se atribui a orçamento' };
  }

  const currency = textoOuNulo(payload.currency);
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    return { kind: 'ignore', reason: `moeda "${String(payload.currency)}" não é um código ISO` };
  }

  const occurredOn = textoOuNulo(payload.occurredOn);
  if (occurredOn === null || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return { kind: 'ignore', reason: `competência "${String(payload.occurredOn)}" não é uma data ISO` };
  }

  const signed = payload.signedAmountCents;
  if (typeof signed !== 'number' || !Number.isInteger(signed)) {
    return { kind: 'ignore', reason: `valor "${String(signed)}" não é um lançamento` };
  }

  const produtor = textoOuNulo(envelope.producedBy);
  if (produtor === null) {
    return { kind: 'ignore', reason: 'envelope sem produtor — origem do gasto desconhecida' };
  }

  return {
    kind: 'apply',
    movement: {
      tenantId: envelope.tenantId,
      sourceModuleId: produtor,
      externalRef,
      categoryName,
      currency,
      occurredOn,
      signedAmountCents: signed,
    },
  };
}

export interface BudMovementPort {
  recordExternalMovement(movement: BudMovement): Promise<'projected' | 'unchanged'>;
}

export type MovementHandledOutcome =
  | { readonly kind: 'projected'; readonly effect: 'projected' | 'unchanged' }
  | { readonly kind: 'ignored'; readonly reason: string };

export function handleBudMovement(port: BudMovementPort) {
  return async (envelope: EventEnvelope): Promise<MovementHandledOutcome> => {
    const traduzido = toBudMovement(envelope);
    if (traduzido.kind === 'ignore') {
      return { kind: 'ignored', reason: traduzido.reason };
    }
    const efeito = await port.recordExternalMovement(traduzido.movement);
    return { kind: 'projected', effect: efeito };
  };
}
