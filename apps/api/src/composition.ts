import type { Pool } from 'pg';

import { auditSubscription, deliverDue } from '@alsham/workflow';
import type { DeliveryReport, RetryPolicy, Subscription } from '@alsham/workflow';
import { eventUsageHook } from '@alsham/billing';
import { CONSUMED_EVENT_TYPE, CONSUMER_ID, handleSpendDecision } from '@alsham/marketing';

import { createPgOutboxStore } from './outbox-store.ts';
import { createAuditWriter, createSpendProjectionPort, createUsageRecorder } from './adapters.ts';

/**
 * # ⭐ A COMPOSIÇÃO — o único lugar do repositório onde os módulos se conhecem
 *
 * Este arquivo importa **todos**. Nenhum deles importa nenhum outro.
 *
 * É a diferença entre uma plataforma modular e um monólito com pastas: o
 * acoplamento existe, mas **num lugar só, declarado, revisável**. Se amanhã o
 * cliente desinstalar o Marketing, muda-se uma linha aqui — e nada mais no
 * repositório precisa saber.
 *
 * O mapa das dependências, que é o ponto inteiro da Etapa 7 ganhando vida:
 *
 * ```
 *   @alsham/workflow  ──┐  (o correio — não conhece módulo nenhum)
 *   @alsham/marketing ──┤
 *   @alsham/billing   ──┼──►  esta composição  ──►  Postgres
 *   @alsham/core      ──┘
 * ```
 *
 * As setas só apontam para cá. Não há nenhuma entre os pacotes — e há guarda
 * no CI ("módulo não conhece módulo") que reprova a primeira que aparecer.
 *
 * ⛔ **Isto roda com `service_role`, do servidor.** Nunca num app cliente.
 */

/**
 * O padrão de reentrega.
 *
 * ⚠️ **NÃO VERIFICADO** contra carga real (Lei 7). São um ponto de partida:
 * 5 tentativas ao longo de ~8 minutos antes de virar `dead`. Quem tiver
 * número medido, troca — e é por isso que a política entra por parâmetro em
 * vez de ficar dentro do correio.
 */
export const DEFAULT_POLICY: RetryPolicy = {
  baseDelayMs: 30_000,
  maxDelayMs: 15 * 60_000,
  maxAttempts: 5,
};

/**
 * Monta as inscrições.
 *
 * **Esta lista é o registro de módulos instalados, na prática.** Enquanto o
 * instalador em runtime não existir (CORE-SPEC §5, NÃO CONSTRUÍDO), é aqui
 * que se declara quem escuta o quê — e a honestidade de dizer isso é o que
 * impede alguém de achar que a Store já instala módulos sozinha.
 */
export function buildSubscriptions(pool: Pool): Subscription[] {
  return [
    // 1. A TRILHA — escuta `*` de propósito: todo fato que atravessa o Core
    //    deixa rastro. Um evento que não passa pela trilha é um evento que
    //    ninguém consegue auditar depois.
    auditSubscription(createAuditWriter(pool)),

    // 2. ⭐ O MÓDULO 2 ESCUTANDO O MÓDULO 1.
    //
    //    Repare no que está acontecendo nesta linha: `@alsham/marketing`
    //    fornece o handler e o nome do tipo; `@alsham/workflow` fornece o
    //    formato da inscrição. Os dois se encontram AQUI, e em nenhum outro
    //    lugar. O marketing não sabe que o correio existe; o correio não sabe
    //    que o marketing existe.
    //
    //    A ponte é literalmente a função de uma linha abaixo.
    {
      consumer: CONSUMER_ID,
      eventType: CONSUMED_EVENT_TYPE,
      handle: async (envelope) => {
        await handleSpendDecision(createSpendProjectionPort(pool))(envelope);
      },
    },
  ];
}

/**
 * Uma rodada do correio.
 *
 * Chama `deliverDue()` — **a mesma função que os testes provaram desde a
 * Etapa 6**, sem uma linha reescrita. Esta composição não decide nada sobre
 * entrega: ela só diz *com quê* entregar.
 */
export async function runCourierOnce(
  pool: Pool,
  options: { policy?: RetryPolicy; batchSize?: number; now?: () => Date } = {},
): Promise<DeliveryReport> {
  const recorder = createUsageRecorder(pool);
  const agora = options.now ?? (() => new Date());

  return deliverDue({
    store: createPgOutboxStore(pool),
    subscriptions: buildSubscriptions(pool),
    policy: options.policy ?? DEFAULT_POLICY,
    now: agora,
    ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
    // A cobrança se liga aqui — e só aqui. O correio chama um gancho; quem o
    // preenche é esta linha. Se billing sumir amanhã, apaga-se a linha e o
    // correio continua entregando.
    onDelivered: eventUsageHook(recorder, agora),
  });
}
