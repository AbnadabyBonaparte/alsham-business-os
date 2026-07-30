import type { Pool } from 'pg';

import { auditSubscription, deliverDue } from '@alsham/workflow';
import type { DeliveryReport, RetryPolicy, Subscription } from '@alsham/workflow';
import { eventUsageHook } from '@alsham/billing';
import { CONSUMED_EVENT_TYPE, CONSUMER_ID, handleSpendDecision } from '@alsham/marketing';
import {
  CONSUMED_EVENT_PATTERN as AP_EVENT_PATTERN,
  CONSUMER_ID as RECON_CONSUMER_ID,
  handleExternalPayable,
  RECEIVABLE_CONSUMED_EVENT_PATTERN as AR_EVENT_PATTERN,
  RECEIVABLE_CONSUMER_ID as RECON_AR_CONSUMER_ID,
  handleExternalReceivable,
} from '@alsham/finance-reconciliation';
import {
  RECON_MATCH_EVENT_TYPE,
  RECON_MATCH_CONSUMER_ID,
  handleReconMatchSettlement,
} from '@alsham/accounts-receivable';
import {
  RECON_MATCH_EVENT_TYPE as AP_RECON_MATCH_EVENT_TYPE,
  RECON_MATCH_CONSUMER_ID as AP_RECON_MATCH_CONSUMER_ID,
  handleReconMatchSettlement as handleApReconMatchSettlement,
} from '@alsham/accounts-payable';
import {
  CONSUMED_EVENT_PATTERN as DUN_EVENT_PATTERN,
  CONSUMER_ID as DUN_CONSUMER_ID,
  handleDunTitle,
} from '@alsham/dunning';
import {
  CONSUMED_EVENT_PATTERN as BUD_EVENT_PATTERN,
  CONSUMER_ID as BUD_CONSUMER_ID,
  handleBudMovement,
} from '@alsham/budgets';

import { createPgOutboxStore } from './outbox-store.ts';
import {
  createAuditWriter,
  createApReconMatchSettlementPort,
  createBudMovementPort,
  createDunTitleProjectionPort,
  createExternalPayablePort,
  createExternalReceivablePort,
  createReconMatchSettlementPort,
  createSpendProjectionPort,
  createUsageRecorder,
} from './adapters.ts';

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
 *   @alsham/workflow               ──┐  (o correio — não conhece módulo nenhum)
 *   @alsham/marketing              ──┤
 *   @alsham/finance-reconciliation ──┼──►  esta composição  ──►  Postgres
 *   @alsham/billing                ──┤
 *   @alsham/core                   ──┘
 * ```
 *
 * As setas só apontam para cá. Não há nenhuma entre os pacotes — e há guarda
 * no CI ("módulo não conhece módulo") que reprova a primeira que aparecer.
 *
 * ⭐ **A partir da Etapa 10 este arquivo tem TRÊS módulos, e o desenho fecha um
 * triângulo:** o Módulo 1 emite e o Módulo 2 escuta; o Módulo 3 emite e o
 * Módulo 1 escuta. O mesmo pacote é produtor numa ponta e consumidor na outra,
 * e continua sem importar ninguém. É a prova de que o Lego não tinha uma
 * direção privilegiada escondida no desenho.
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

    // 3. ⭐ O MÓDULO 1 ESCUTANDO O MÓDULO 3 — a terceira ponta do triângulo.
    //
    //    A linha acima e esta são simétricas, e a simetria é a prova: o mesmo
    //    pacote (`finance-reconciliation`) é o PRODUTOR na inscrição 2 e o
    //    CONSUMIDOR nesta. Ele não sabe de nenhum dos dois papéis — os dois
    //    existem só aqui.
    //
    //    ⚠️ **O curinga `ap.*` é deliberado.** Registrado, alterado e
    //    cancelado projetam a mesma coisa: *"o título hoje é assim"*. Uma
    //    inscrição por tipo daria três chances de a mesma projeção rodar em
    //    ordens diferentes — e o correio garante *ao menos uma vez*, nunca
    //    *na ordem*.
    //
    //    ⛔ Repare no que NÃO está escrito aqui: o nome do módulo produtor. A
    //    inscrição casa por PADRÃO DE EVENTO; a origem gravada vem de
    //    `envelope.producedBy`, lá dentro do handler.
    {
      consumer: RECON_CONSUMER_ID,
      eventType: AP_EVENT_PATTERN,
      handle: async (envelope) => {
        await handleExternalPayable(createExternalPayablePort(pool))(envelope);
      },
    },

    // 4. ⭐ O MÓDULO 1 ESCUTANDO O MÓDULO 5 — o triângulo do crédito.
    //
    //    Mesmo pacote, outro consumidor, outro padrão (`ar.*`). Sem importar
    //    o accounts-receivable. A origem gravada continua vindo do envelope.
    {
      consumer: RECON_AR_CONSUMER_ID,
      eventType: AR_EVENT_PATTERN,
      handle: async (envelope) => {
        await handleExternalReceivable(createExternalReceivablePort(pool))(envelope);
      },
    },

    // 5. ⭐ O MÓDULO 5 ESCUTANDO O MÓDULO 1 — fecha o ciclo do crédito.
    //
    //    Confirmar casamento emite `recon.match.decided`; o AR liquida o
    //    título. Sem importar o finance-reconciliation no pacote AR.
    {
      consumer: RECON_MATCH_CONSUMER_ID,
      eventType: RECON_MATCH_EVENT_TYPE,
      handle: async (envelope) => {
        await handleReconMatchSettlement(createReconMatchSettlementPort(pool))(envelope);
      },
    },

    // 6. ⭐ O MÓDULO 3 ESCUTANDO O MÓDULO 1 — fecha o ciclo do débito.
    //
    //    Mesmo evento `recon.match.decided`; outro consumidor; alvo payable.
    //    O AP não importa o recon — só a string do contrato.
    {
      consumer: AP_RECON_MATCH_CONSUMER_ID,
      eventType: AP_RECON_MATCH_EVENT_TYPE,
      handle: async (envelope) => {
        await handleApReconMatchSettlement(createApReconMatchSettlementPort(pool))(envelope);
      },
    },

    // 7. ⭐ O MÓDULO 12 ESCUTANDO O MÓDULO 5 — a régua acorda com o título.
    //
    //    Segundo consumidor do MESMO padrão `ar.*` (o recon é o outro, na
    //    inscrição 4): o correio entrega o mesmo fato aos dois, cada um com
    //    a sua idempotência por consumidor. A régua projeta o título e
    //    decide entrada/saída — baixa na origem tira da régua sozinha.
    //
    //    ⛔ E aqui também NÃO está escrito o nome do módulo produtor: a
    //    origem gravada vem de `envelope.producedBy`, dentro do handler.
    {
      consumer: DUN_CONSUMER_ID,
      eventType: DUN_EVENT_PATTERN,
      handle: async (envelope) => {
        await handleDunTitle(createDunTitleProjectionPort(pool))(envelope);
      },
    },

    // 8. ⭐ O MÓDULO 29 ESCUTANDO O MÓDULO 14 — o orçamento acorda com o gasto.
    //
    //    O curinga `cash.*` é deliberado: só o lançamento registrado
    //    interessa, mas categoria criada/arquivada chega pelo mesmo padrão e
    //    é IGNORADA no handler (não enche dead letter). O realizado é VIEW
    //    calculada; esta inscrição só ALIMENTA a projeção local.
    //
    //    ⛔ E aqui também NÃO está escrito o nome do módulo produtor: a
    //    origem gravada vem de `envelope.producedBy`, dentro do handler.
    //    Lançamento sem categoria não casa orçamento nenhum — ignorado.
    {
      consumer: BUD_CONSUMER_ID,
      eventType: BUD_EVENT_PATTERN,
      handle: async (envelope) => {
        await handleBudMovement(createBudMovementPort(pool))(envelope);
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
