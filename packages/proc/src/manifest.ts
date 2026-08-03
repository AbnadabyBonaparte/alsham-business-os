import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do Módulo 90 — Protocolo (Proc).**
 *
 * `id` = `proc` (o cinto de `emit_event` confere o prefixo `proc.*`). ⭐ É
 * módulo VERTICAL do catálogo: `taxonomy.layer = 'vertical'`, `vertical`
 * `government` (🏛 Governo). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **De onde vem:** a Lei das Etapas do `ops` (Módulo 7), re-perguntada para
 * o processo PÚBLICO — como o `kanban` reusou o `ops` num escopo próprio. NÃO é
 * "instalar o `ops` de novo": cada decisão foi re-perguntada e escrita.
 *
 * ⭐ **O DIVERGE assinado:** número de protocolo (a identidade pública que o
 * cidadão cita), interessado (id solto + nome carimbado, o padrão do `deal`) e
 * a decisão formal TERMINAL (`deferido`/`indeferido`/`arquivado` — o ato de
 * império, não o `done`/`cancelled` neutro e reabrível do `ops`).
 *
 * @see docs/canon/MODULO-PROC-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0105_proc.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'proc',
  name: 'Protocolo',
  version: '0.1.0',
  summary:
    'O processo administrativo do órgão: o cidadão protocola um pedido, recebe um NÚMERO DE PROTOCOLO público para acompanhar, e o processo anda por um RITO que o próprio órgão desenha (as etapas são DADO DO TENANT, jamais enum — a Lei das Etapas do ops, re-perguntada). O interessado é id solto + nome carimbado (o padrão do deal). ⭐⭐ A decisão formal é TERMINAL — deferido/indeferido/arquivado, o ATO DE IMPÉRIO — e exige o despacho (a razão, obrigatória); um processo decidido que volta é recurso ou novo protocolo (o DIVERGE do ops, cujo done reabre). A trilha é imutável e carimba o NOME da etapa (sobrevive ao redesenho do rito). consumes VAZIO.',

  /**
   * ⭐ **Vertical `government` — Taxonomia §6, "🏛 Governo (8)"**, capacidade
   * *Protocolo* (a primeira da linha, a porta da frente do Estado). A chave é a
   * `VerticalKey` do `@alsham/core` — a Store gradua a pill de Governo por ela.
   */
  taxonomy: { layer: 'vertical', vertical: 'government' },

  /**
   * **Uma capacidade. Uma só.** O Domain lista oito — *Protocolo · Ouvidoria ·
   * Licitações · Convênios · Patrimônio público · Tributos · Obras ·
   * Fiscalização*. Listar as outras seria vender o que este módulo não entrega
   * (Lei 7): Ouvidoria é o `ombuds`, Licitações o `bid`, Fiscalização o `fisc`;
   * Convênios→`ctr`, Patrimônio→`pat`, Obras→`proj`, Tributos FORA por Lei 3.
   */
  capabilities: [{ key: 'protocol', canonicalName: 'Protocolo' }],

  /**
   * Três permissões, e a separação entre a segunda e a terceira é a decisão de
   * produto: **quem toca o processo não é necessariamente quem o decide.**
   *
   * ⭐ A separação depende do DESENHO DO TENANT, não de um nome mágico:
   * `proc.advance_process()` exige `decide` quando a etapa atual foi marcada
   * `requires_approval`, e aceita `manage` nas demais. E a DECISÃO FORMAL (o
   * ato de império) exige `decide` — a autoridade mais alta.
   */
  permissions: [
    {
      key: 'proc.workflow.manage',
      moduleId: 'proc',
      description:
        'Desenhar o rito: criar etapas, ordená-las e dizer quais exigem aprovação ou podem ser puladas.',
    },
    {
      key: 'proc.process.manage',
      moduleId: 'proc',
      description:
        'Protocolar processos, movê-los pelas etapas comuns do rito e editar seus dados.',
    },
    {
      key: 'proc.process.decide',
      moduleId: 'proc',
      description:
        'Decidir: passar de uma etapa que exige aprovação, pular uma etapa, devolver para refazer, e proferir a decisão formal (deferir, indeferir, arquivar) com o despacho.',
    },
  ],

  events: {
    /**
     * Os cinco fatos que este módulo conta ao mundo. Todos saem por
     * `proc.emit_event()`, a única porta para fora.
     *
     * ⭐ O payload é AUTOSSUFICIENTE: carrega o NÚMERO DE PROTOCOLO, o NOME do
     * interessado, o NOME da etapa e o NOME do rito — quem escuta não pode ler
     * o schema deste módulo.
     *
     * ⚠️ A reabertura não existe (a decisão é terminal), então não há fato de
     * reabertura. `proc.process.decided` cobre os três desfechos num fato só,
     * com o desfecho no payload — dois fatos para um ato fariam todo consumidor
     * contar a mesma coisa duas vezes.
     */
    emits: [
      {
        type: 'proc.process.registered',
        version: 1,
        description:
          'Um processo foi protocolado num rito do órgão, com número de protocolo, interessado e a etapa em que começou — pelo NOME, não só pelo id.',
      },
      {
        type: 'proc.stage.advanced',
        version: 1,
        description:
          'O processo passou para a próxima etapa do rito, com de onde para onde e o que ficou anotado.',
      },
      {
        type: 'proc.stage.skipped',
        version: 1,
        description:
          'Uma etapa foi PULADA, com quem pulou, quando e a razão. Pular nunca apaga a etapa da história do processo.',
      },
      {
        type: 'proc.process.sent-back',
        version: 1,
        description:
          'O processo foi devolvido para uma etapa anterior com a instrução do que refazer. Processo já decidido NÃO se devolve.',
      },
      {
        type: 'proc.process.decided',
        version: 1,
        description:
          'A decisão formal foi proferida — deferido, indeferido ou arquivado, com o despacho. É o ato de império, e é TERMINAL.',
      },
    ],

    /**
     * **Vazio, e é Lei 7.** A integração óbvia existe (`crm.party.registered`
     * traria o interessado para dentro do processo), mas o handler não existe —
     * consumo declarado sem consumidor faz o Core acordar um módulo que não
     * sabe responder. O interessado é id solto + nome carimbado, e basta.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  workflowManage: 'proc.workflow.manage',
  processManage: 'proc.process.manage',
  processDecide: 'proc.process.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  processRegistered: 'proc.process.registered',
  stageAdvanced: 'proc.stage.advanced',
  stageSkipped: 'proc.stage.skipped',
  processSentBack: 'proc.process.sent-back',
  processDecided: 'proc.process.decided',
} as const;
