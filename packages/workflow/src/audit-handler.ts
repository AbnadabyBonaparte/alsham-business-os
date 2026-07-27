import type { EventEnvelope } from '@alsham/core';

import type { Subscription } from './types.ts';

/**
 * O consumidor de trilha — o destino desta etapa.
 *
 * **Por que ele existe:** o `recon` declara `events.consumes: []`, e isso é
 * honesto — não há módulo consumidor ainda. Mas um correio sem nenhum
 * destinatário não prova nada. Este handler fecha o caminho de ponta a ponta:
 * módulo emite → caixa de saída → correio → trilha.
 *
 * **O que ele faz:** transforma o envelope numa entrada de auditoria e
 * entrega a quem sabe gravar. Não interpreta o `payload` de ninguém — o
 * correio entrega envelope, não lê carta.
 *
 * ⚠️ Ele **não escreve** em `core.audit_log` daqui: recebe o gravador por
 * parâmetro. O pacote continua sem I/O, e quem tem `service_role` é a
 * composição, não a lógica.
 */

/** O que vai para a trilha. Espelha `core.audit_log`, sem inventar campo. */
export interface AuditRecord {
  readonly tenantId: string;
  readonly actorKind: 'system';
  readonly actorProcess: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly moduleId: string;
  readonly occurredAt: string;
  readonly after: Readonly<Record<string, unknown>>;
}

export type AuditWriter = (record: AuditRecord) => Promise<void>;

/**
 * Monta a entrada de trilha a partir do envelope. Pura — dá para conferir a
 * tradução sem banco nenhum.
 *
 * ⚠️ O `payload` entra em `after` **como veio**. Redigir segredo é dever de
 * quem emite: `core.audit_log` é o último lugar onde um segredo deveria
 * vazar, e o correio não tem como saber o que é segredo no payload alheio.
 */
export function toAuditRecord(envelope: EventEnvelope): AuditRecord {
  return {
    tenantId: envelope.tenantId,
    actorKind: 'system',
    actorProcess: 'core-courier',
    action: envelope.eventType,
    resourceType: 'event',
    resourceId: envelope.eventId,
    moduleId: envelope.producedBy,
    occurredAt: envelope.occurredAt,
    after: {
      eventVersion: envelope.eventVersion,
      correlationId: envelope.correlationId ?? null,
      causationId: envelope.causationId ?? null,
      payload: envelope.payload,
    },
  };
}

/**
 * A inscrição do consumidor de trilha.
 *
 * Escuta `*` de propósito: **todo** fato que atravessa o Core deixa rastro.
 * Um evento que não passa pela trilha é um evento que ninguém consegue
 * auditar depois.
 */
export function auditSubscription(write: AuditWriter): Subscription {
  return {
    consumer: 'core-audit',
    eventType: '*',
    handle: async (envelope) => {
      await write(toAuditRecord(envelope));
    },
  };
}
