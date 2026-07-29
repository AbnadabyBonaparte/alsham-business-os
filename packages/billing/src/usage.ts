import type { IsoDateTime, TenantId, Uuid } from '@alsham/core';

/**
 * **Contabilidade de uso** — quanto o tenant consumiu, e se ainda pode.
 *
 * Minerado de `usage_ledger` + `plan_limits` do kraken-v2 (Balanço §1:
 * **PROVADO** em produção, com economia unitária calculada).
 *
 * ⚠️ **LEI 7 — NÃO HÁ PREÇO AQUI, E É DE PROPÓSITO.**
 *
 * Este pacote conta **uso**, não dinheiro. Nenhum valor em reais, nenhuma
 * tabela de preço, nenhuma conversão. Preço é decisão do dono, com números
 * que ele mede — e enquanto não existirem, escrever qualquer um seria
 * inventar promessa.
 *
 * Separar o que o plano **permite** do que o plano **custa** é o que deixa
 * mudar preço sem tocar em limite, e vender o mesmo limite por preços
 * diferentes por região ou contrato.
 */

/** A grandeza medida. Texto livre: métrica nova não exige migration. */
export type Metric = string;

/** Métricas que a plataforma já conta hoje. Não é lista fechada. */
export const METRICS = {
  seats: 'seats',
  modules: 'modules',
  storageMb: 'storage-mb',
  eventsPerMonth: 'events-per-month',
} as const;

/** O teto contratado, espelhando `core.plan_limits`. */
export interface PlanLimit {
  readonly planCode: string;
  readonly metric: Metric;
  /** `null` = ilimitado no plano. */
  readonly limit: number | null;
  readonly onExceed: 'block' | 'meter';
}

/** Um lançamento de consumo, espelhando `core.usage_ledger`. */
export interface UsageEntry {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly metric: Metric;
  /** Quantidade consumida. Inteiro — meio evento não existe. */
  readonly quantity: number;
  /** O período de apuração, `YYYY-MM`. */
  readonly period: string;
  /** Quem gerou. `null` = a própria plataforma. */
  readonly sourceModuleId: string | null;
  /** Referência ao fato — `event_id`, por exemplo. Chave de idempotência. */
  readonly sourceRef: string | null;
  readonly recordedAt: IsoDateTime;
}

/** O veredito de uma checagem de limite. */
export type LimitVerdict =
  /** Dentro do teto — ou sem teto. */
  | { readonly allowed: true; readonly reason: 'within-limit' | 'unlimited' }
  /** Estourou, mas o plano deixa passar e conta para cobrar depois. */
  | {
      readonly allowed: true;
      readonly reason: 'metered';
      readonly limit: number;
      readonly used: number;
      readonly overage: number;
    }
  /** Estourou e o plano corta. */
  | {
      readonly allowed: false;
      readonly reason: 'blocked';
      readonly limit: number;
      readonly used: number;
    }
  /**
   * Não existe teto declarado para este par plano/métrica.
   *
   * ⚠️ **Nega por omissão, de propósito.** Liberar o que não foi configurado
   * é como um plano gratuito vira ilimitado por esquecimento — e ninguém
   * descobre até a fatura de infraestrutura chegar. Falta de regra é falta
   * de regra, não permissão.
   */
  | { readonly allowed: false; readonly reason: 'no-limit-configured' };

/**
 * O tenant pode consumir mais `quantity` desta métrica?
 *
 * Pura e determinística: recebe o teto e o consumo já apurados, e responde.
 * Não lê banco, não conta linha — quem soma é quem chama.
 */
export function checkLimit(input: {
  readonly limit: PlanLimit | null;
  readonly used: number;
  readonly quantity: number;
}): LimitVerdict {
  const { limit, used, quantity } = input;

  if (!limit) return { allowed: false, reason: 'no-limit-configured' };
  if (limit.limit === null) return { allowed: true, reason: 'unlimited' };

  const depois = used + quantity;
  if (depois <= limit.limit) return { allowed: true, reason: 'within-limit' };

  if (limit.onExceed === 'meter') {
    return {
      allowed: true,
      reason: 'metered',
      limit: limit.limit,
      used,
      overage: depois - limit.limit,
    };
  }

  return { allowed: false, reason: 'blocked', limit: limit.limit, used };
}

/**
 * A faixa de consumo de uma métrica — o que o Painel PINTA.
 *
 * ⭐ **Minerado do kraken-v2** (`lib/quota.ts`, PROVADO com assinante pagante):
 * o aviso a **80%** existe porque descobrir que a cota acabou no momento em que
 * ela acaba é sempre tarde — quem opera precisa do tempo de pedir mais.
 *
 * ⚠️ **Isto vive aqui, e não na tela, porque é DECISÃO** (Regra de Ouro,
 * CLAUDE.md §5.3). O limiar de 80% é regra de produto: se amanhã virar 90%,
 * muda-se um número neste arquivo e toda tela que pinta cota obedece. Escrito
 * dentro do componente, ele viraria cinco cópias que divergem em silêncio.
 *
 * ⚠️ E repare no que ela **não** faz: não estima, não projeta "você vai
 * estourar em 3 dias". Isso seria número sem fonte (Lei 7). Ela classifica o
 * que já foi contado, e só.
 */
export type UsageBand = 'unlimited' | 'ok' | 'warning' | 'exceeded';

/** O limiar do aviso. Um lugar só. */
export const USAGE_WARNING_RATIO = 0.8;

export function usageBand(used: number, limit: number | null): UsageBand {
  if (limit === null) return 'unlimited';
  // ⚠️ Teto zero é teto: qualquer consumo já estourou, e dividir por ele daria
  // `Infinity` (ou `NaN` com uso zero) e pintaria a faixa errada.
  if (limit <= 0) return used > 0 ? 'exceeded' : 'ok';
  if (used >= limit) return 'exceeded';
  return used / limit >= USAGE_WARNING_RATIO ? 'warning' : 'ok';
}

/**
 * O período de apuração de uma data — `YYYY-MM`, em UTC.
 *
 * UTC de propósito: o mês do consumo não pode mudar conforme o fuso do
 * servidor que apurou. Um lançamento na virada cairia em meses diferentes em
 * máquinas diferentes.
 */
export function periodOf(when: Date): string {
  return `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Acha o teto de um par plano/métrica numa lista. `null` se não houver. */
export function findLimit(
  limits: readonly PlanLimit[],
  planCode: string,
  metric: Metric,
): PlanLimit | null {
  return limits.find((l) => l.planCode === planCode && l.metric === metric) ?? null;
}

/** Soma o consumo de uma métrica num período. */
export function usedInPeriod(
  entries: readonly UsageEntry[],
  metric: Metric,
  period: string,
): number {
  return entries
    .filter((e) => e.metric === metric && e.period === period)
    .reduce((sum, e) => sum + e.quantity, 0);
}

/** A porta de gravação do ledger. Quem implementa roda com `service_role`. */
export interface UsageRecorder {
  record(input: {
    readonly tenantId: TenantId;
    readonly metric: Metric;
    readonly quantity: number;
    readonly period: string;
    readonly sourceModuleId: string | null;
    /** Chave de idempotência: o mesmo fato não conta duas vezes. */
    readonly sourceRef: string | null;
  }): Promise<void>;
}

/**
 * O contador de eventos entregues — **onde o correio encontra a cobrança**.
 *
 * Devolve o gancho `onDelivered` que o correio aceita. Repare na direção da
 * dependência: **billing conhece o formato do gancho; o correio não conhece
 * billing.** Quem liga um no outro é a composição. Se billing sumir amanhã,
 * o correio continua entregando.
 *
 * `sourceRef` é o `event_id`: reentrega do mesmo evento não conta duas vezes,
 * porque o ledger tem `unique` nessa chave.
 */
export function eventUsageHook(recorder: UsageRecorder, now: () => Date) {
  return async (input: {
    tenantId: TenantId;
    eventId: Uuid;
    eventType: string;
    producedBy: string;
  }): Promise<void> => {
    await recorder.record({
      tenantId: input.tenantId,
      metric: METRICS.eventsPerMonth,
      quantity: 1,
      // O relógio é injetado, como no correio: função que lê a hora sozinha
      // não é testável, e apuração por período só se prova com o tempo sob
      // controle.
      period: periodOf(now()),
      sourceModuleId: input.producedBy,
      sourceRef: input.eventId,
    });
  };
}
