import type { ModuleManifest } from '@alsham/core';

import { CONSUMED_EVENT_TYPE } from './spend-approval.ts';

/**
 * **O manifesto do módulo Campanhas de Marketing.**
 *
 * É por este objeto — e só por ele — que o módulo existe para a plataforma.
 *
 * ⭐ **A diferença para o Módulo 1 cabe numa linha:** aqui `events.consumes`
 * NÃO está vazio. Este é o primeiro módulo da plataforma que escuta o fato de
 * outro — e, por isso, o primeiro teste real da tese do Lego.
 *
 * @see docs/canon/CORE-SPEC.md — o ciclo de vida que este objeto atravessa
 * @see docs/canon/MODULO-MARKETING-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0004_marketing.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'marketing',
  name: 'Campanhas de Marketing',
  version: '0.1.0',
  summary:
    'Planeja, agenda, publica e mede campanhas — e fica sabendo da verba aprovada sem ninguém precisar avisar.',

  /**
   * Domain `marketing` da Taxonomia (§5, Marketing — 13 capacidades).
   *
   * **Sol Único:** a chave vem de `DomainKey`, que é a transcrição da
   * Taxonomia canônica. O módulo não inventa classificação.
   */
  taxonomy: { layer: 'domain', domain: 'marketing' },

  /**
   * **Uma capacidade. Uma só.**
   *
   * Lei 7 vive aqui, e aqui ela dói: o Domain Marketing tem 13 capacidades, e
   * seria fácil listar *Social media*, *Calendário*, *Design*, *Briefings*,
   * *E-mail marketing*, *Landing pages* — todas plausíveis, todas
   * NÃO CONSTRUÍDAS. O manifesto é o que a Store exibe; listar capacidade não
   * construída é vender o que não existe.
   *
   * Guardar a referência da peça não é *Design*. Guardar a data não é
   * *Calendário*. Registrar o número medido não é *Analytics* — que, aliás,
   * é ENGINE, não capacidade deste Domain (Taxonomia §4).
   */
  capabilities: [{ key: 'campaigns', canonicalName: 'Campanhas' }],

  /**
   * Três permissões, e a separação entre as duas primeiras é a mesma decisão
   * que o Módulo 1 tomou entre conciliar e visar:
   *
   * **quem cria a campanha não é necessariamente quem a põe no ar.** O
   * produto PERMITE que sejam a mesma pessoa — basta pôr as duas no mesmo
   * papel —, mas não PRESUME. Presumir seria escolher o organograma do
   * cliente por ele.
   *
   * A separação é real, não decorativa: há trigger no banco que recusa a
   * passagem para `published` sem `marketing.campaign.publish`, porque policy
   * de UPDATE não enxerga o estado anterior.
   */
  permissions: [
    {
      key: 'marketing.campaign.manage',
      moduleId: 'marketing',
      description: 'Criar e editar campanhas, peças e agendamento.',
    },
    {
      key: 'marketing.campaign.publish',
      moduleId: 'marketing',
      description: 'Pôr campanha no ar, encerrar e cancelar.',
    },
    {
      key: 'marketing.result.record',
      moduleId: 'marketing',
      description: 'Registrar o resultado medido de uma campanha.',
    },
  ],

  events: {
    /**
     * Os três fatos que este módulo conta ao mundo. Todos saem por
     * `marketing.emit_event()`, a única porta para fora.
     *
     * **Rascunho salvo e campanha agendada não emitem nada**, e é decisão:
     * trabalho interno não é fato para o mundo. Emitir a cada salvamento
     * encheria a caixa de saída de ruído — e o tenant pagaria por ele, porque
     * a cobrança conta evento entregue.
     */
    emits: [
      {
        type: 'marketing.campaign.published',
        version: 1,
        description: 'Uma campanha entrou no ar, com a verba e o público que tinha no momento.',
      },
      {
        type: 'marketing.campaign.completed',
        version: 1,
        description: 'Uma campanha cumpriu seu ciclo e foi encerrada.',
      },
      {
        type: 'marketing.campaign.cancelled',
        version: 1,
        description:
          'Uma campanha foi cancelada — a ação destrutiva deste módulo. Some da operação, nunca da trilha.',
      },
    ],

    /**
     * ⭐ **O QUE ESTE MÓDULO ESCUTA — E O QUE ISSO NÃO SIGNIFICA.**
     *
     * Consumir o evento de outro módulo **não é depender dele**
     * (`ModuleManifest.events.consumes`, e o CORE-SPEC diz o mesmo). O
     * acoplamento é com o *tipo do evento*, que é contrato público, nunca com
     * o código de quem o emitiu. Repare que não há — nem pode haver — campo
     * `dependsOn` neste objeto.
     *
     * Três consequências que se pode conferir no disco:
     *
     *   1. `package.json` deste pacote **não lista** o `finance-reconciliation`;
     *   2. nenhum arquivo daqui o importa;
     *   3. `0004_marketing.sql` não faz um `select` sequer em `recon.*`.
     *
     * Se o `recon` for desinstalado, este módulo não é acordado e **nada
     * quebra**. Se um módulo de Contas a Pagar emitir o mesmo formato amanhã,
     * o handler o atende sem uma linha de código a mais — porque ele lê
     * `producedBy` do envelope em vez de presumir a origem.
     *
     * **Lei 7:** este consumo só está declarado porque o handler EXISTE e é
     * testado (`spend-approval.ts`, mais a prova de ponta em
     * `consumption.test.ts`, que roda o correio de verdade). Declarar consumo
     * sem consumidor faria o Core acordar um módulo que não sabe responder.
     */
    consumes: [
      {
        type: CONSUMED_EVENT_TYPE,
        version: 1,
        description:
          'Uma decisão financeira foi visada por um humano. Quando a referência bate com a verba de uma campanha, a campanha fica sabendo.',
      },
    ],
  },

  /**
   * A única dependência que existe — e a ausência de `dependsOn` é o que
   * torna a frase acima verificável em vez de opinativa.
   */
  requiresCore: '0.0.x',

  /**
   * Nenhum agente embarcado ainda.
   *
   * A doutrina da Casa pede agente sempre que possível, e o lugar dele aqui é
   * evidente — gerar peça, sugerir horário, explicar resultado; é literalmente
   * o que o kraken-v2 já faz e está registrado como PROVADO no Balanço. Mas
   * minerar aquele motor é etapa própria, e declarar o slot antes seria
   * vender o que não está ligado (Lei 7).
   */
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  campaignManage: 'marketing.campaign.manage',
  campaignPublish: 'marketing.campaign.publish',
  resultRecord: 'marketing.result.record',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  campaignPublished: 'marketing.campaign.published',
  campaignCompleted: 'marketing.campaign.completed',
  campaignCancelled: 'marketing.campaign.cancelled',
} as const;
