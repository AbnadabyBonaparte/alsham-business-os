import type { EventEnvelope } from '@alsham/core';

/**
 * ⭐ **O FECHAMENTO DO CICLO DO CRÉDITO.**
 *
 * Espelho do padrão `spend-approval.ts` (Módulo 2): este módulo REAGE ao fato
 * do recon **sem importar** `@alsham/finance-reconciliation`, **sem ler**
 * `recon.*` e **sem conhecer** o correio.
 *
 * O acoplamento é só com a string `recon.match.decided` — contrato público.
 */

export const CONSUMED_EVENT_TYPE = 'recon.match.decided';

export const CONSUMER_ID = 'ar-recon-match-settlement';

interface MatchDecidedPayload {
  readonly matchId?: unknown;
  readonly decision?: unknown;
  readonly targetKind?: unknown;
  readonly externalRef?: unknown;
  readonly matchedAmountCents?: unknown;
  readonly currency?: unknown;
}

export interface ReconMatchSettlement {
  readonly tenantId: string;
  /** Sempre de `envelope.producedBy` — nunca constante. */
  readonly sourceModuleId: string;
  readonly matchId: string;
  readonly externalRef: string;
  readonly matchedAmountCents: number;
  readonly currency: string;
  readonly decision: 'confirmed' | 'rejected';
  readonly targetKind: 'receivable' | 'payable';
}

export type SettlementTranslation =
  | { readonly kind: 'apply'; readonly settlement: ReconMatchSettlement }
  | { readonly kind: 'ignore'; readonly reason: string };

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export function toReconMatchSettlement(envelope: EventEnvelope): SettlementTranslation {
  if (envelope.eventType !== CONSUMED_EVENT_TYPE) {
    return { kind: 'ignore', reason: `tipo ${envelope.eventType} não é escutado por este módulo` };
  }

  const payload = (envelope.payload ?? {}) as MatchDecidedPayload;

  const decision = payload.decision;
  if (decision !== 'confirmed' && decision !== 'rejected') {
    return { kind: 'ignore', reason: `decisão "${String(decision)}" não liquida título` };
  }

  const targetKind = payload.targetKind;
  if (targetKind !== 'receivable' && targetKind !== 'payable') {
    return { kind: 'ignore', reason: `alvo "${String(targetKind)}" não reconhecido` };
  }

  // Payable não é deste módulo — ignora sem erro (não enche dead letter).
  if (targetKind !== 'receivable') {
    return { kind: 'ignore', reason: 'alvo payable — Contas a Receber não liquida a pagar' };
  }

  const matchId = textoOuNulo(payload.matchId);
  if (matchId === null) {
    return { kind: 'ignore', reason: 'evento sem matchId — nada a que se referir' };
  }

  const externalRef = textoOuNulo(payload.externalRef);
  if (externalRef === null) {
    return { kind: 'ignore', reason: 'evento sem externalRef — nada a liquidar' };
  }

  const amount = payload.matchedAmountCents;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    return { kind: 'ignore', reason: `valor "${String(amount)}" não é uma baixa` };
  }

  const currency = textoOuNulo(payload.currency);
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    return { kind: 'ignore', reason: `moeda "${String(payload.currency)}" não é ISO` };
  }

  const produtor = textoOuNulo(envelope.producedBy);
  if (produtor === null) {
    return { kind: 'ignore', reason: 'envelope sem produtor — origem desconhecida' };
  }

  return {
    kind: 'apply',
    settlement: {
      tenantId: envelope.tenantId,
      sourceModuleId: produtor,
      matchId,
      externalRef,
      matchedAmountCents: amount,
      currency,
      decision,
      targetKind,
    },
  };
}

export type ApplyReconMatchEffect =
  | 'applied'
  | 'unchanged'
  | 'recorded-rejected'
  | 'ignored-missing'
  | 'ignored-target'
  | 'ignored-currency'
  | 'skipped-cancelled';

export interface ReconMatchSettlementPort {
  applyReconMatch(settlement: ReconMatchSettlement): Promise<ApplyReconMatchEffect>;
}

export type SettlementHandledOutcome =
  | { readonly kind: 'settled'; readonly effect: ApplyReconMatchEffect }
  | { readonly kind: 'ignored'; readonly reason: string };

export function handleReconMatchSettlement(port: ReconMatchSettlementPort) {
  return async (envelope: EventEnvelope): Promise<SettlementHandledOutcome> => {
    const traduzido = toReconMatchSettlement(envelope);
    if (traduzido.kind === 'ignore') {
      return { kind: 'ignored', reason: traduzido.reason };
    }

    const effect = await port.applyReconMatch(traduzido.settlement);
    return { kind: 'settled', effect };
  };
}
