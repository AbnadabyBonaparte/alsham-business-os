/**
 * O motor puro do Módulo 82 — Assinatura de Energia.
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): tudo o que DECIDE mora aqui. A tela pergunta
 * e desenha; nunca decide se uma assinatura pode ser cancelada.
 *
 * O `ALLOWED_TRANSITIONS` é o espelho EXATO de `subscription.allowed_transition()`
 * no `0097_subscription.sql` (teste lê e compara). ⭐ `active → cancelled` é
 * TERMINAL: quem re-assina negocia OUTRA fatia — o retorno é assinatura NOVA (a
 * física do proj — o DIVERGE consciente do catalog, onde `archived → active`
 * existe). Cancelar exige razão E a permissão `.decide`.
 */
import type {
  NewSubscriptionInput,
  Problem,
  Subscription,
  SubscriptionStatus,
  SubscriptionSummary,
  Validation,
} from './types.ts';

/** ⭐ active → cancelled TERMINAL (a física do proj). UM só par — sem volta. */
export const ALLOWED_TRANSITIONS: readonly (readonly [SubscriptionStatus, SubscriptionStatus])[] = [
  ['active', 'cancelled'],
];

export const ALL_STATUSES: readonly SubscriptionStatus[] = ['active', 'cancelled'];

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

/** Só a assinatura ativa pode ser cancelada — a cancelada é terminal. */
export function canCancel(status: SubscriptionStatus): boolean {
  return status === 'active';
}

export function summarizeSubscriptions(subs: readonly Subscription[]): SubscriptionSummary {
  return {
    total: subs.length,
    active: subs.filter((s) => s.status === 'active').length,
    cancelled: subs.filter((s) => s.status === 'cancelled').length,
  };
}

const NAME_MAX = 200;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma assinatura nova. O cliente (id solto ao crm) e a usina (id solto ao
 * plant) são OBRIGATÓRIOS — não há assinatura sem assinante nem fatia sem usina.
 * O percentual de alocação tem de ser um número finito no intervalo `0 < x <= 100`
 * (o CHECK do banco confere `allocation_percent > 0 and allocation_percent <= 100`).
 * Os nomes são carimbo de tela, TEXTO LIVRE OPCIONAIS (viram `''`). Nasce com `id`
 * vazio — a camada pura nunca inventa dado do servidor —, sempre `active` (o
 * nascimento é do gatilho) e sem razão de cancelamento.
 */
export function validateNewSubscription(input: NewSubscriptionInput): Validation<Subscription> {
  const problems: Problem[] = [];

  // O cliente por ID SOLTO ao crm — OBRIGATÓRIO.
  const customerId = texto(input.customerId);
  if (customerId === null) {
    problems.push({ field: 'customerId', message: 'Informe o cliente da assinatura.' });
  }

  // A usina por ID SOLTO ao plant — OBRIGATÓRIA.
  const plantId = texto(input.plantId);
  if (plantId === null) {
    problems.push({ field: 'plantId', message: 'Informe a usina da assinatura.' });
  }

  // Nome do cliente — carimbo de tela, TEXTO LIVRE opcional (vira '').
  const clienteBruto = texto(input.customerName);
  let customerName = '';
  if (clienteBruto !== null) {
    if (clienteBruto.length > NAME_MAX) {
      problems.push({ field: 'customerName', message: `Nome do cliente com no máximo ${NAME_MAX} caracteres.` });
    } else {
      customerName = clienteBruto;
    }
  }

  // Nome da usina — carimbo de tela, TEXTO LIVRE opcional (vira '').
  const usinaBruto = texto(input.plantName);
  let plantName = '';
  if (usinaBruto !== null) {
    if (usinaBruto.length > NAME_MAX) {
      problems.push({ field: 'plantName', message: `Nome da usina com no máximo ${NAME_MAX} caracteres.` });
    } else {
      plantName = usinaBruto;
    }
  }

  // A fatia da geração: número finito, no intervalo 0 < x <= 100.
  const aloc = input.allocationPercent;
  if (typeof aloc !== 'number' || !Number.isFinite(aloc)) {
    problems.push({ field: 'allocationPercent', message: 'Informe o percentual de alocação (número).' });
  } else if (aloc <= 0) {
    problems.push({ field: 'allocationPercent', message: 'O percentual de alocação deve ser maior que zero.' });
  } else if (aloc > 100) {
    problems.push({ field: 'allocationPercent', message: 'O percentual de alocação deve ser no máximo 100.' });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      customerId: customerId!,
      customerName,
      plantId: plantId!,
      plantName,
      allocationPercent: aloc as number,
      status: 'active',
      cancelReason: '',
    },
  };
}

/**
 * Valida o cancelamento de uma assinatura: exige uma razão não-vazia (o que
 * aconteceu) — o espelho do gatilho da migration, que recusa cancelar sem razão
 * (a física do proj). Quem/quando cancelou é carimbo do servidor, não da tela.
 */
export function validateCancellation(reason: unknown): Validation<string> {
  const razao = texto(reason);
  if (razao === null) {
    return { ok: false, problems: [{ field: 'cancelReason', message: 'Cancelar uma assinatura exige uma razão.' }] };
  }
  return { ok: true, value: razao };
}
