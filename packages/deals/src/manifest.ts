import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Funil Comercial.**
 *
 * ⚠️ **Por que o `id` é `deal`.** `crm` já é o Módulo 4 e `quote` é o 9 —
 * prefixo é chave de cinto e de revogação em bloco, um por módulo. "Funil"
 * e "oportunidade" NÃO existem na Taxonomia (conferido por grep — a
 * capacidade canônica é *Pipeline*); `pipeline` como id colidiria com o
 * vocabulário do `ops` (pipelines de produção) — Sol Único. `deal.` foi
 * conferido por grep com fronteira de palavra: zero colisões.
 *
 * @see docs/canon/MODULO-DEAL-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0025_deal.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'deal',
  name: 'Funil Comercial',
  version: '0.1.0',
  summary:
    'O funil que o tenant desenha: estágios livres, movimento livre com trilha imutável, e ganho e perda como atos com razão registrada.',

  /**
   * ⭐ **Domain `crm` — Taxonomia §5, "🤝 Comercial & CRM (12)"**, capacidade
   * *Pipeline*. ⚠️ *Pipeline de inovação* (P&D) é outro Domain e outro
   * assunto.
   */
  taxonomy: { layer: 'domain', domain: 'crm' },

  /**
   * **Uma capacidade. Uma só.** *Leads*, *Follow-up*, *Metas* e *Comissão*
   * são vizinhas do Domain e seguem NÃO CONSTRUÍDAS — listá-las seria vender
   * o que não existe.
   */
  capabilities: [{ key: 'pipeline', canonicalName: 'Pipeline' }],

  /**
   * Três permissões, no desenho do `ops` re-perguntado: quem desenha o mapa
   * não é quem move as negociações, e quem move não é necessariamente quem
   * DECIDE o desfecho — ganhar e perder são atos de `decide`.
   */
  permissions: [
    {
      key: 'deal.funnel.design',
      moduleId: 'deal',
      description: 'Desenhar funis: criar estágios, nomeá-los e ordená-los.',
    },
    {
      key: 'deal.opportunity.manage',
      moduleId: 'deal',
      description: 'Abrir negociações e movê-las livremente pelos estágios — toda mudança vira trilha.',
    },
    {
      key: 'deal.opportunity.decide',
      moduleId: 'deal',
      description: 'Decidir o desfecho: ganhar ou perder. Perder exige a razão.',
    },
  ],

  events: {
    /**
     * ⭐ O payload é AUTOSSUFICIENTE: funil e estágio pelo NOME, contraparte
     * pelo NOME CARIMBADO — quem escuta não resolve id de schema alheio.
     */
    emits: [
      {
        type: 'deal.opportunity.opened',
        version: 1,
        description: 'Uma negociação nasceu num funil do tenant, no estágio inicial — pelo nome.',
      },
      {
        type: 'deal.opportunity.moved',
        version: 1,
        description:
          'A negociação mudou de estágio — em qualquer direção, com de-onde e para-onde pelo nome.',
      },
      {
        type: 'deal.opportunity.updated',
        version: 1,
        description: 'Mudou fato da negociação: valor, moeda, probabilidade, expectativa ou vínculo.',
      },
      {
        type: 'deal.opportunity.won',
        version: 1,
        description: 'A negociação foi GANHA — ato de quem decide, com nota opcional.',
      },
      {
        type: 'deal.opportunity.lost',
        version: 1,
        description:
          'A negociação foi PERDIDA — ato de quem decide, com a razão OBRIGATÓRIA. Terminal.',
      },
    ],

    /**
     * **Vazio, e é Lei 7.**
     *
     * A integração óbvia — `quote.proposal.accepted` fechar a negociação
     * como ganha — daria hoje, tecnicamente. Não entra sem handler, e há uma
     * decisão de produto por baixo: proposta e negociação nem sempre são
     * 1-para-1 (uma negociação pode ter três propostas na mesa; aceitar uma
     * não diz qual negociação fechar). O vínculo proposta↔negociação é
     * capacidade futura declarada na spec (§5), e sem ele o handler
     * adivinharia.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  funnelDesign: 'deal.funnel.design',
  opportunityManage: 'deal.opportunity.manage',
  opportunityDecide: 'deal.opportunity.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  opportunityOpened: 'deal.opportunity.opened',
  opportunityMoved: 'deal.opportunity.moved',
  opportunityUpdated: 'deal.opportunity.updated',
  opportunityWon: 'deal.opportunity.won',
  opportunityLost: 'deal.opportunity.lost',
} as const;
