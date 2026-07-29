import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Esteira de Produção.**
 *
 * ⚠️ **Por que o `id` é `ops`, e não `os`.** A etapa foi encomendada com os
 * fatos chamados `os.opened`, `os.stage.advanced`. "OS" de ordem de serviço lê
 * bem em português — e não pode ser o identificador, por dois motivos que não
 * são de gosto:
 *
 * 1. **`os` já significa outra coisa na Taxonomia.** A hierarquia canônica é
 *    `CORE → ENGINES → DOMAINS → CAPACIDADES → OS (VERTICAIS) → TENANT`: "OS" é
 *    uma CAMADA do mapa, os 29 pacotes por setor. Sol Único é a lei contra uma
 *    palavra querer dizer duas coisas.
 * 2. ⛔ **`os.` é impossível de conferir por grep, e este repositório se
 *    defende por grep.** O literal casa dentro de `tenants.`, `docs.`,
 *    `payloads.` e de centenas de palavras — as guardas de CI que procuram
 *    `<modulo>.` passariam a acusar tudo, e guarda que acusa tudo é guarda
 *    desligada.
 *
 * Com `ops`, o CORE-SPEC continua ao pé da letra —
 * `<moduleId>.<agregado>.<fato>` — e os sete fatos encomendados existem todos.
 *
 * @see docs/canon/CORE-SPEC.md — o ciclo de vida que este objeto atravessa
 * @see docs/canon/MODULO-OPS-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0018_ops.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'ops',
  name: 'Esteira de Produção',
  version: '0.1.0',
  summary:
    'A empresa desenha a própria esteira de trabalho e move cada ordem de serviço por ela, com trilha do que foi feito, do que foi pulado e por quê.',

  /**
   * ⭐ **Domain `operations` — Taxonomia §5, "🏭 Operações (10)", cuja PRIMEIRA
   * capacidade é literalmente *Ordens de serviço*.**
   *
   * A etapa que encomendou este módulo se chama "Marketing Ops", e é
   * exatamente por isso que ele **não** nasce no Domain Marketing.
   *
   * O teste anti-viés: *"outra empresa do mesmo setor usaria isso exatamente
   * como está?"* — e, mais forte, outra de outro setor? Uma construtora abre
   * ordem de serviço. Um escritório de advocacia move um processo por fases.
   * Uma oficina recebe, orça, executa e entrega. Nenhum faz marketing, e os
   * três são este módulo sem uma linha diferente. O teste SQL do módulo
   * escreve as duas esteiras lado a lado — a de uma agência e a de uma
   * manutenção — na mesma tabela, para que isso não fique só escrito.
   *
   * As capacidades *Briefings* e *Produção*, do Domain Marketing, são o que a
   * esteira de uma agência ATENDE quando o tenant desenha as etapas dela.
   * Configuração, nunca schema.
   *
   * ⚠️ Há também um motivo mecânico: o Módulo 2 já é `marketing`. Dois módulos
   * no mesmo prefixo fariam `marketing.emit_event()` aceitar o fato do
   * vizinho, e a revogação em bloco por prefixo (CORE-SPEC §3, passo 4)
   * derrubaria permissão de dois módulos ao desinstalar um.
   */
  taxonomy: { layer: 'domain', domain: 'operations' },

  /**
   * **Uma capacidade. Uma só.**
   *
   * O Domain lista dez — *Ordens de serviço · Checklist · Manutenção ·
   * Facilities · Ocorrências · Segurança · Patrimônio · Almoxarifado · Estoque
   * · Inventário*. Nove estão **NÃO CONSTRUÍDAS**, e listá-las seria vender o
   * que não existe.
   *
   * ⚠️ *Checklist* é a que mais tenta entrar, porque uma etapa com lista de
   * conferência parece de graça. Não entra: checklist é conteúdo de etapa, e
   * modelá-lo aqui obrigaria a decidir se ele é do desenho (igual para toda
   * OS) ou da OS (diferente em cada uma) — decisão de produto que ninguém
   * tomou. Enquanto isso, o campo `note` de cada movimento e o `briefing` da
   * OS atendem o caso sem prometer a capacidade.
   */
  capabilities: [{ key: 'work-orders', canonicalName: 'Ordens de serviço' }],

  /**
   * Três permissões, e a separação entre a segunda e a terceira é a decisão de
   * produto deste módulo: **quem toca o trabalho não é necessariamente quem
   * decide sobre ele.**
   *
   * ⭐ A separação é REAL e depende do DESENHO DO TENANT, não de um nome mágico
   * no código: `ops.advance_order()` exige `decide` quando a etapa atual foi
   * marcada `requires_approval`, e aceita `manage` nas demais. Uma esteira em
   * espanhol, ou com a etapa chamada "ok do cliente", funciona igual — porque
   * quem diz o que é decisão é a coluna, nunca a palavra.
   */
  permissions: [
    {
      key: 'ops.pipeline.design',
      moduleId: 'ops',
      description:
        'Desenhar a esteira: criar etapas, ordená-las e dizer quais exigem aprovação ou podem ser puladas.',
    },
    {
      key: 'ops.order.manage',
      moduleId: 'ops',
      description:
        'Abrir ordens de serviço, movê-las pelas etapas comuns e registrar entregáveis.',
    },
    {
      key: 'ops.order.decide',
      moduleId: 'ops',
      description:
        'Decidir: passar de uma etapa que exige aprovação, pular uma etapa, devolver para refazer, concluir e cancelar.',
    },
  ],

  events: {
    /**
     * Os sete fatos que este módulo conta ao mundo. Todos saem por
     * `ops.emit_event()`, a única porta para fora.
     *
     * ⭐ **O payload é AUTOSSUFICIENTE, e aqui isso tem uma exigência a mais
     * que nos módulos anteriores:** ele carrega o NOME da esteira e o NOME da
     * etapa, não só os ids. Quem escuta não pode ler `ops.pipeline_stages` —
     * por policy e por lei —, então um `stageId` sozinho seria um campo que só
     * serve para depurar.
     *
     * ⚠️ **A reabertura não tem fato próprio.** `done → in_progress` só
     * acontece por devolução, e a devolução já tem o seu
     * (`ops.order.sent-back`). Dois fatos para um ato fariam todo consumidor
     * contar a mesma coisa duas vezes — e o tenant paga por evento entregue.
     */
    emits: [
      {
        type: 'ops.order.opened',
        version: 1,
        description:
          'Uma ordem de serviço nasceu numa esteira do tenant, com título, prazo e a etapa em que começou — pelo NOME, não só pelo id.',
      },
      {
        type: 'ops.stage.advanced',
        version: 1,
        description:
          'A OS passou para a próxima etapa da esteira, com de onde para onde e o que ficou anotado.',
      },
      {
        type: 'ops.stage.skipped',
        version: 1,
        description:
          'Uma etapa foi PULADA, com quem pulou, quando e a razão. Pular nunca apaga a etapa da história da OS.',
      },
      {
        type: 'ops.order.sent-back',
        version: 1,
        description:
          'A OS foi devolvida para uma etapa anterior com a instrução do que refazer. Devolver uma OS concluída a reabre.',
      },
      {
        type: 'ops.order.completed',
        version: 1,
        description: 'A OS saiu da esteira concluída.',
      },
      {
        type: 'ops.order.cancelled',
        version: 1,
        description:
          'A OS foi cancelada — a ação destrutiva deste módulo. Some da esteira, nunca da trilha, e nunca do banco.',
      },
      {
        type: 'ops.deliverable.registered',
        version: 1,
        description:
          'Um entregável foi registrado numa versão nova, com a instrução que a gerou. Refazer cria versão; nunca edita.',
      },
    ],

    /**
     * **Vazio, e é Lei 7.**
     *
     * A integração óbvia existe e é boa: `crm.party.registered` traria o
     * cliente para dentro da OS, e `ap.payable.registered` amarraria o custo de
     * um serviço à ordem que o gerou. As duas dariam hoje, tecnicamente — os
     * envelopes dos dois módulos já são autossuficientes.
     *
     * **Não entram, porque o handler não existe.** Consumo declarado sem
     * consumidor faz o Core acordar um módulo que não sabe responder, e a
     * Store passaria a anunciar uma integração que não acontece.
     *
     * E há uma decisão de produto por baixo, que é do dono: amarrar OS a
     * contraparte presume que toda ordem de serviço é para alguém de fora — e
     * a maior parte das ordens de manutenção de uma empresa é para ela mesma.
     * Quando for construído, o "para quem" nasce OPCIONAL, e a regra de quando
     * criar é `settings` do tenant, nunca constante no módulo.
     */
    consumes: [],
  },

  /**
   * A única dependência que existe. Repare que não há — nem pode haver — campo
   * `dependsOn`: este módulo funciona sozinho, com ou sem os outros instalados.
   */
  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  pipelineDesign: 'ops.pipeline.design',
  orderManage: 'ops.order.manage',
  orderDecide: 'ops.order.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  orderOpened: 'ops.order.opened',
  stageAdvanced: 'ops.stage.advanced',
  stageSkipped: 'ops.stage.skipped',
  orderSentBack: 'ops.order.sent-back',
  orderCompleted: 'ops.order.completed',
  orderCancelled: 'ops.order.cancelled',
  deliverableRegistered: 'ops.deliverable.registered',
} as const;
