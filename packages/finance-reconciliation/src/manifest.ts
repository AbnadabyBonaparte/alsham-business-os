import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Conciliação & Aprovações.**
 *
 * É por este objeto — e só por ele — que o módulo existe para a plataforma.
 * O Core lê isto para registrar o módulo no catálogo, publicá-lo na Store,
 * instalá-lo num tenant e conceder as permissões. Nada que não esteja aqui
 * é visível, instalável ou permitido.
 *
 * @see docs/canon/CORE-SPEC.md — o ciclo de vida que este objeto atravessa
 * @see docs/canon/MODULO-RECON-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0002_recon.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'recon',
  name: 'Conciliação & Aprovações',
  version: '0.1.0',
  summary:
    'Importa o extrato, sugere as baixas, e põe cada divergência numa fila com visto e trilha.',

  /**
   * Domain `finance` da Taxonomia (§5, Financeiro — 19 capacidades).
   *
   * **Sol Único:** a chave vem de `DomainKey`, que é a transcrição da
   * Taxonomia canônica. O módulo não inventa classificação.
   */
  taxonomy: { layer: 'domain', domain: 'finance' },

  /**
   * As duas capacidades da Taxonomia que este módulo implementa.
   *
   * **Lei 7 vive aqui.** Capacidade só entra nesta lista quando está
   * construída — o manifesto é o que a Store exibe, e listar capacidade não
   * construída é promessa no ar. As outras 17 capacidades do Domain
   * Financeiro (DRE, tesouraria, PIX, boletos…) **não** estão aqui porque
   * não existem.
   */
  capabilities: [
    { key: 'bank-reconciliation', canonicalName: 'Conciliação bancária' },
    { key: 'financial-approvals', canonicalName: 'Aprovações financeiras' },
  ],

  /**
   * As três permissões que o módulo registra ao ser instalado — e que são
   * revogadas em bloco quando ele sai, porque todas carregam o prefixo `recon.`.
   *
   * A separação entre `match.manage` e `approval.decide` é deliberada:
   * **quem concilia não precisa ser quem visa.** Se uma empresa quiser que
   * seja a mesma pessoa, basta pôr as duas no mesmo papel — o produto
   * permite, mas não presume.
   */
  permissions: [
    {
      key: 'recon.statement.import',
      moduleId: 'recon',
      description: 'Importar extratos bancários e títulos a pagar.',
    },
    {
      key: 'recon.match.manage',
      moduleId: 'recon',
      description: 'Criar, ajustar e desfazer casamentos entre lançamentos e títulos.',
    },
    {
      key: 'recon.approval.decide',
      moduleId: 'recon',
      description: 'Aprovar ou rejeitar itens da fila de aprovação.',
    },
  ],

  events: {
    /**
     * Os três fatos que este módulo conta ao mundo. Todos saem por
     * `recon.emit_event()`, a única porta do módulo para fora, que escreve
     * na caixa de saída do Core na mesma transação do dado.
     *
     * Verbo no passado, sempre: evento é fato consumado, não pedido.
     */
    emits: [
      {
        type: 'recon.reconciliation.completed',
        version: 1,
        description:
          'Um extrato foi fechado. Traz o total de linhas, quantas casaram e — o que interessa — quantas sobraram.',
      },
      {
        type: 'recon.approval.decided',
        version: 1,
        description:
          'Um humano visou um item da fila: aprovado ou rejeitado, com quem, quando e por quê.',
      },
      {
        type: 'recon.statement.discarded',
        version: 1,
        description:
          'Um extrato foi descartado — a ação destrutiva deste módulo. Some da operação, nunca da trilha.',
      },
    ],

    /**
     * **Vazio hoje, e isso é honestidade, não esquecimento (Lei 7).**
     *
     * O schema já prevê `recon.payables.source = 'event'`: quando existir um
     * módulo de Contas a Pagar, este módulo passa a alimentar sua projeção
     * local ouvindo `finance.payable.registered` em vez de importação manual.
     *
     * A declaração só entra aqui quando **o consumidor estiver construído**.
     * Declarar consumo sem handler faria o Core acordar um módulo que não
     * sabe responder — e seria exatamente a promessa no ar que a Lei 7 proíbe.
     *
     * Enquanto isso, os títulos entram por importação, e o módulo funciona
     * inteiro sozinho. É o Lego: nada quebra por ninguém estar do outro lado.
     */
    consumes: [],
  },

  /**
   * A única dependência que existe. Note que não há — nem pode haver — campo
   * apontando para outro módulo: *"nunca depender diretamente de outro
   * módulo — toda comunicação ocorre através do Core"*.
   */
  requiresCore: '0.0.x',

  /**
   * Nenhum agente embarcado ainda.
   *
   * A doutrina da Casa pede agente sempre que possível, e o lugar dele aqui é
   * óbvio: explicar a divergência que sobrou. Mas o motor de IA é da Fase 8 e
   * está **NÃO CONSTRUÍDO** — declarar o slot agora seria vender o que não
   * existe. O campo `strategy`, gravado a cada casamento, é o dado que esse
   * agente vai precisar quando chegar.
   */
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  statementImport: 'recon.statement.import',
  matchManage: 'recon.match.manage',
  approvalDecide: 'recon.approval.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  reconciliationCompleted: 'recon.reconciliation.completed',
  approvalDecided: 'recon.approval.decided',
  statementDiscarded: 'recon.statement.discarded',
} as const;
