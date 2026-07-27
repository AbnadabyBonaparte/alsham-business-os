import type { EventEnvelope, IsoDateTime, ModuleId, TenantId, Uuid } from '@alsham/core';

/**
 * Os tipos do **correio do Core**.
 *
 * ⭐ **O correio é ENGINE, não módulo** (Taxonomia §4). É encanamento da
 * plataforma: não aparece na Store, não se vende, não tem tenant dono. Serve
 * todos os módulos e não conhece nenhum — ele entrega envelope, não lê carta.
 *
 * Por isso vive em `packages/workflow`, cujo propósito já estava escrito
 * desde a Etapa 0: *"o motor de fluxo e de fila — jobs, estados, agendamento,
 * reentrega"*, minerado do `pg_cron` + `pg_net` do `casa-bonaparte-saas`
 * (Balanço: **PROVADO**) e do pipeline de jobs com estados do kraken-v2.
 */

/** Uma linha da caixa de saída, como o correio a enxerga. */
export interface OutboxRecord<TPayload = unknown> {
  readonly envelope: EventEnvelope<TPayload>;
  readonly status: 'pending' | 'delivered' | 'failed' | 'dead';
  readonly attempts: number;
  readonly nextAttemptAt: IsoDateTime | null;
  readonly lastError: string | null;
}

/**
 * A política de reentrega.
 *
 * ⚠️ Vem de fora, nunca embutida. Quanto insistir antes de desistir é decisão
 * de operação — e uma plataforma que fixa isso no código obriga um deploy para
 * mudar de ideia.
 */
export interface RetryPolicy {
  /** Espera da primeira reentrega, em milissegundos. */
  readonly baseDelayMs: number;
  /** Teto da espera. Sem ele, o backoff exponencial vira "nunca mais". */
  readonly maxDelayMs: number;
  /** Depois de tantas tentativas, o evento vira `dead`. Nunca some. */
  readonly maxAttempts: number;
}

/**
 * Quem recebe o evento.
 *
 * Devolver normalmente = entregue. Lançar = falhou, e o correio reagenda.
 * O handler **não** decide se já processou: quem garante isso é o correio,
 * com `processed_events`.
 */
export type EventHandler<TPayload = unknown> = (
  envelope: EventEnvelope<TPayload>,
) => Promise<void>;

/** Um consumidor inscrito: quem é, e o que escuta. */
export interface Subscription {
  /** Identidade do consumidor. Metade da chave de idempotência. */
  readonly consumer: string;
  /** Tipo de evento exato, ou prefixo com `*` (`recon.*`). */
  readonly eventType: string;
  readonly handle: EventHandler;
}

/**
 * A porta de persistência do correio.
 *
 * ⚠️ **Quem implementa isto roda com `service_role`.** `core.event_outbox` e
 * `core.processed_events` não têm GRANT nem policy para `authenticated` — o
 * correio é o único que os toca, e é infraestrutura de servidor. Esta
 * interface nunca deve ser instanciada dentro de um app cliente.
 */
export interface OutboxStore {
  /**
   * Pega os eventos vencidos: `pending` ou `failed` cujo `next_attempt_at`
   * já passou. `limit` existe para o correio não puxar a caixa inteira de uma
   * vez e travar num pico.
   */
  claimDue(now: IsoDateTime, limit: number): Promise<OutboxRecord[]>;

  markDelivered(eventId: Uuid): Promise<void>;

  markFailed(input: {
    eventId: Uuid;
    attempts: number;
    nextAttemptAt: IsoDateTime;
    lastError: string;
  }): Promise<void>;

  /** Desiste da entrega — mas **não apaga**: fica com o erro, para conferência humana. */
  markDead(input: { eventId: Uuid; attempts: number; lastError: string }): Promise<void>;

  /**
   * Registra que este consumidor tratou este evento.
   *
   * Devolve `false` quando já havia registro — é o `unique` de
   * `processed_events (event_id, consumer)` falando. **É esta chamada, e não
   * o handler, que garante a idempotência.**
   */
  markProcessed(input: {
    eventId: Uuid;
    consumer: string;
    tenantId: TenantId;
  }): Promise<boolean>;

  /**
   * Desfaz o registro de `markProcessed` — **e existe por um motivo que só
   * apareceu contra banco real.**
   *
   * O correio grava em `processed_events` ANTES de chamar o handler, para que
   * uma reentrega não repita o efeito. Mas, se o handler **lança**, esse
   * registro fica: na reentrega o correio vê "já processado", não chama o
   * handler de novo e marca o evento como `delivered`.
   *
   * O resultado é o pior possível: **um evento cujo handler nunca teve
   * sucesso é gravado como entregue.** O backoff e o `dead` viram decoração,
   * e o fato some em silêncio — exatamente a falha que a caixa de saída
   * existe para impedir.
   *
   * Por isso, ao falhar, o correio desfaz o registro **só do consumidor que
   * lançou**. Quem já tinha entregue continua marcado e não é chamado duas
   * vezes.
   *
   * ⚠️ Fica um resíduo conhecido e aceito: se o processo morrer entre o
   * `markProcessed` e o handler, o registro permanece e aquele consumidor não
   * é chamado de novo. É entrega **no máximo uma vez** para queda de
   * processo, e **pelo menos uma vez** para erro de handler. Fechar essa
   * última janela exigiria gravar o registro na mesma transação do efeito do
   * handler — o que o correio não pode fazer sem conhecer o banco de cada
   * consumidor.
   */
  unmarkProcessed(input: { eventId: Uuid; consumer: string }): Promise<void>;
}

/** O que aconteceu com um evento nesta rodada. */
export type DeliveryOutcome =
  | { readonly eventId: Uuid; readonly result: 'delivered'; readonly consumers: number }
  /** Ninguém escuta este tipo. Não é erro: é o Lego sem o outro lado. */
  | { readonly eventId: Uuid; readonly result: 'no-subscriber' }
  /** Todos os consumidores já haviam tratado. Reentrega que não repete efeito. */
  | { readonly eventId: Uuid; readonly result: 'already-processed' }
  | {
      readonly eventId: Uuid;
      readonly result: 'retry';
      readonly attempts: number;
      readonly nextAttemptAt: IsoDateTime;
      readonly error: string;
    }
  | { readonly eventId: Uuid; readonly result: 'dead'; readonly attempts: number; readonly error: string };

/** O resumo de uma rodada do correio. */
export interface DeliveryReport {
  readonly picked: number;
  readonly delivered: number;
  readonly retried: number;
  readonly dead: number;
  readonly skipped: number;
  readonly outcomes: readonly DeliveryOutcome[];
}

/**
 * O que o correio precisa para rodar.
 *
 * `now` é injetado de propósito: função que lê o relógio sozinha não é
 * testável, e backoff só se prova com o tempo sob controle.
 */
export interface CourierDeps {
  readonly store: OutboxStore;
  readonly subscriptions: readonly Subscription[];
  readonly policy: RetryPolicy;
  readonly now: () => Date;
  /** Quantos eventos por rodada. */
  readonly batchSize?: number;
  /**
   * Chamado a cada evento **entregue**.
   *
   * É por aqui que o correio encontra a cobrança sem depender dela: quem liga
   * um no outro é a composição, não o correio. Se um dia billing sumir, o
   * correio continua entregando.
   */
  readonly onDelivered?: (input: {
    tenantId: TenantId;
    eventId: Uuid;
    eventType: string;
    producedBy: ModuleId;
  }) => Promise<void>;
}
