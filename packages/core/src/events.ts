import type { IsoDateTime, ModuleId, TenantId, Uuid } from './primitives.ts';

/**
 * Tipo de evento, sempre em três partes: `<moduleId>.<agregado>.<fatoOcorrido>`.
 *
 * O verbo vai **no passado**, sempre. Evento é fato consumado, não pedido:
 * `invoice.paid`, não `invoice.pay`. Quem quer pedir chama a API do Core;
 * quem quer contar o que aconteceu emite evento.
 *
 * @example 'billing.subscription.activated'
 * @example 'finance.reconciliation.divergence-detected'
 */
export type EventType = `${string}.${string}.${string}`;

/**
 * O envelope — **a língua única entre módulos.**
 *
 * Nenhum módulo importa outro; nenhum módulo lê a tabela de outro. O que
 * atravessa a fronteira é este envelope, e só ele. É o que torna um módulo
 * removível sem recompilar a plataforma.
 *
 * **Minerado de:** o padrão de webhook idempotente por `event.id` do
 * `casa-bonaparte-saas` — motor multi-secret, reentregador com backoff,
 * cofre em cascata (Balanço de Tecnologia §1: **PROVADO ponta a ponta**,
 * com HMAC real, entrega, idempotência e rede de segurança sobre falha
 * real em 24/07) — reforçado pela tabela `stripe_events` do
 * alsham-forensic-ai (**PROVADO**, RLS em todas as tabelas).
 *
 * @typeParam TPayload - o corpo do fato, definido pelo módulo que emite.
 */
export interface EventEnvelope<TPayload = unknown> {
  /**
   * Identidade única do evento — **a chave de idempotência**.
   *
   * O consumidor registra este id em `processed_events` antes de agir. Se
   * o mesmo id voltar (reentrega, retry, replay), ele é descartado. Foi
   * exatamente isso que segurou a falha real de 24/07 na Casa.
   */
  readonly eventId: Uuid;
  readonly eventType: EventType;
  /**
   * Versão do formato do `payload`, começando em 1.
   *
   * Evento publicado é contrato público: campo não se remove nem se
   * renomeia. Mudança que quebra sobe a versão e convive com a anterior
   * até todo consumidor migrar.
   */
  readonly eventVersion: number;
  /** O tenant a que o fato pertence. Nunca opcional — nem em evento. */
  readonly tenantId: TenantId;
  readonly occurredAt: IsoDateTime;
  /** Quem emitiu. Prefixo de `eventType`. */
  readonly producedBy: ModuleId;
  /** Amarra todos os eventos de uma mesma intenção de negócio. */
  readonly correlationId?: Uuid;
  /** O `eventId` do evento que causou este. Reconstrói a cadeia causal. */
  readonly causationId?: Uuid;
  readonly payload: TPayload;
}

/**
 * Um evento de domínio. Alias de `EventEnvelope` — existe para que a
 * assinatura leia como o conceito, e não como o transporte.
 */
export type DomainEvent<TPayload = unknown> = EventEnvelope<TPayload>;

/**
 * A declaração de um tipo de evento no manifesto de um módulo.
 *
 * É o que permite ao Core, no momento da instalação, responder duas
 * perguntas antes de ligar o módulo: *alguém produz o que este consome?*
 * e *quem quebra se este módulo sair?*
 */
export interface EventTypeDeclaration {
  readonly type: EventType;
  readonly version: number;
  /** O fato que este evento comunica, em uma frase. */
  readonly description: string;
}

/**
 * Estado de uma linha da caixa de saída.
 *
 * `dead` não é descarte: a linha fica, com o erro, para conferência humana.
 * Perder evento em silêncio é a falha que a rede de segurança da Casa
 * existe para impedir.
 */
export type OutboxStatus = 'pending' | 'delivered' | 'failed' | 'dead';

/**
 * Uma linha da caixa de saída — o evento gravado **na mesma transação** que
 * o dado que ele descreve, e entregue depois.
 *
 * É o que impede o modo de falha clássico: o pedido gravou mas o evento não
 * saiu, ou o evento saiu e o pedido não gravou.
 *
 * **Minerado de:** `pg_cron` + `pg_net` com job de reentrega por minuto do
 * `casa-bonaparte-saas`, e o pipeline de jobs com estados do kraken-v2
 * (Balanço de Tecnologia §1: **PROVADO nos dois**).
 */
export interface OutboxEntry<TPayload = unknown> {
  readonly envelope: EventEnvelope<TPayload>;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly nextAttemptAt: IsoDateTime | null;
  readonly lastError: string | null;
}
