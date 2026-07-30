import type { EventEnvelope } from '@alsham/core';

/**
 * ⭐⭐ **O CONSUMIDOR DE DOIS PRODUTORES — os valores da DRE nascem dos livros.**
 *
 * A DRE não tem lançamento próprio. Ela escuta DOIS fatos, de dois módulos que
 * não conhece:
 *   · `cash.entry.registered` — o lançamento de caixa, pela categoria;
 *   · `cc.rateio.executed` — o custo rateado, pela origem do rateio.
 * É o padrão E10 (recon/marketing/dun/bud), agora com dois produtores. O
 * acoplamento é com o TIPO do evento; a origem vem SEMPRE de
 * `envelope.producedBy`, nunca constante.
 *
 * ⭐ Lançamento SEM categoria é IGNORADO (a DRE casa por categoria).
 *
 * ⚠️ **A DRE não inventa exclusividade de fonte** (a lição do cash §5): ela
 * projeta os dois fatos; o que aparece no demonstrativo é o que o PLANO do
 * tenant casa. Se duas linhas casarem o mesmo dinheiro, o dobro aparece — e é
 * escolha visível no plano, não erro do sistema.
 */

export const CONSUMED_EVENT_TYPES = ['cash.entry.registered', 'cc.rateio.executed'] as const;

export const CASH_CONSUMED_EVENT_PATTERN = 'cash.*';
export const CC_CONSUMED_EVENT_PATTERN = 'cc.*';

export const CONSUMER_ID = 'dre-statement-projection';

export interface DreEntry {
  readonly tenantId: string;
  /** Sempre de `envelope.producedBy` — nunca constante. */
  readonly sourceModuleId: string;
  readonly sourceKind: string;
  readonly externalRef: string;
  readonly categoryName: string;
  readonly currency: string;
  readonly occurredOn: string;
  readonly signedAmountCents: number;
}

export type EntryTranslation =
  | { readonly kind: 'apply'; readonly entry: DreEntry }
  | { readonly kind: 'ignore'; readonly reason: string };

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

function isIso(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

function isCurrency(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Z]{3}$/.test(valor);
}

export function toDreEntry(envelope: EventEnvelope): EntryTranslation {
  const produtor = textoOuNulo(envelope.producedBy);
  if (produtor === null) {
    return { kind: 'ignore', reason: 'envelope sem produtor — origem desconhecida' };
  }

  const payload = (envelope.payload ?? {}) as Record<string, unknown>;

  // 1. cash.*.entry.registered — o lançamento de caixa pela categoria.
  if (/^[a-z0-9-]+\.entry\.registered$/.test(envelope.eventType)) {
    const externalRef = textoOuNulo(payload.entryId);
    if (externalRef === null) return { kind: 'ignore', reason: 'lançamento de caixa sem id' };
    const categoryName = textoOuNulo(payload.categoryName);
    if (categoryName === null) return { kind: 'ignore', reason: 'lançamento sem categoria — não casa linha' };
    if (!isCurrency(payload.currency)) return { kind: 'ignore', reason: `moeda "${String(payload.currency)}" não é ISO` };
    if (!isIso(payload.occurredOn)) return { kind: 'ignore', reason: `competência "${String(payload.occurredOn)}" não é ISO` };
    const signed = payload.signedAmountCents;
    if (typeof signed !== 'number' || !Number.isInteger(signed)) {
      return { kind: 'ignore', reason: `valor "${String(signed)}" não é inteiro` };
    }
    return {
      kind: 'apply',
      entry: {
        tenantId: envelope.tenantId, sourceModuleId: produtor, sourceKind: 'cash',
        externalRef, categoryName, currency: payload.currency, occurredOn: payload.occurredOn,
        signedAmountCents: signed,
      },
    };
  }

  // 2. cc.*.rateio.executed — o custo rateado, pela origem do rateio (SAI: sinal negativo).
  if (/^[a-z0-9-]+\.rateio\.executed$/.test(envelope.eventType)) {
    const externalRef = textoOuNulo(payload.executionId);
    if (externalRef === null) return { kind: 'ignore', reason: 'rateio sem id de execução' };
    const categoryName = textoOuNulo(payload.sourceName);
    if (categoryName === null) return { kind: 'ignore', reason: 'rateio sem origem nomeada — não casa linha' };
    if (!isCurrency(payload.currency)) return { kind: 'ignore', reason: `moeda "${String(payload.currency)}" não é ISO` };
    if (!isIso(payload.competenceOn)) return { kind: 'ignore', reason: `competência "${String(payload.competenceOn)}" não é ISO` };
    const total = payload.totalCents;
    if (typeof total !== 'number' || !Number.isInteger(total) || total <= 0) {
      return { kind: 'ignore', reason: `total "${String(total)}" não é um rateio` };
    }
    return {
      kind: 'apply',
      entry: {
        tenantId: envelope.tenantId, sourceModuleId: produtor, sourceKind: 'cc-rateio',
        externalRef, categoryName, currency: payload.currency, occurredOn: payload.competenceOn,
        // ⭐ O rateio DISTRIBUI um custo — entra na DRE com sinal negativo.
        signedAmountCents: -total,
      },
    };
  }

  return { kind: 'ignore', reason: `tipo ${envelope.eventType} não alimenta a DRE` };
}

export interface DreEntryPort {
  recordExternalEntry(entry: DreEntry): Promise<'projected' | 'unchanged'>;
}

export type EntryHandledOutcome =
  | { readonly kind: 'projected'; readonly effect: 'projected' | 'unchanged' }
  | { readonly kind: 'ignored'; readonly reason: string };

export function handleDreEntry(port: DreEntryPort) {
  return async (envelope: EventEnvelope): Promise<EntryHandledOutcome> => {
    const traduzido = toDreEntry(envelope);
    if (traduzido.kind === 'ignore') {
      return { kind: 'ignored', reason: traduzido.reason };
    }
    const efeito = await port.recordExternalEntry(traduzido.entry);
    return { kind: 'projected', effect: efeito };
  };
}
