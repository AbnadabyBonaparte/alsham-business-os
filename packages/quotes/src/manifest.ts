import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Propostas / Orçamentos.**
 *
 * ⚠️ **Por que o `id` é `quote`.** `crm` já é o Módulo 4 — dois módulos no
 * mesmo prefixo fariam `crm.emit_event()` aceitar o fato do vizinho, e a
 * revogação em bloco por prefixo derrubaria dois módulos ao desinstalar um.
 * `quote.` foi conferido por grep com fronteira de palavra contra o código
 * de todas as migrations: zero colisões.
 *
 * @see docs/canon/MODULO-QUOTE-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0024_quote.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'quote',
  name: 'Propostas',
  version: '0.1.0',
  summary:
    'Propostas e orçamentos com itens em texto livre e validade opcional. Aceite e recusa são atos registrados — quem e quando — e renegociar é documento novo.',

  /**
   * ⭐ **Domain `crm` — Taxonomia §5, "🤝 Comercial & CRM (12)"**, onde
   * *Propostas* e *Orçamentos* estão listadas lado a lado.
   *
   * ⚠️ Os homônimos que NÃO são este módulo: *Orçamento* (singular) no
   * Domain Financeiro é budget, não quote; *Cotações* em Compras é o preço
   * que o FORNECEDOR nos dá — o sentido oposto; *Orçamento de obra* é do
   * vertical de Construção.
   */
  taxonomy: { layer: 'domain', domain: 'crm' },

  /**
   * **Duas capacidades, UM artefato — e a dupla é deliberada.**
   *
   * No mercado brasileiro "proposta" e "orçamento" são o MESMO documento
   * com o nome de ofícios diferentes: a agência manda proposta, a oficina
   * manda orçamento. O artefato deste módulo (referência + contraparte
   * neutra + itens + validade + aceite/recusa) atende os dois por inteiro —
   * declarar só um seria esconder da Store metade dos clientes que o
   * procuram pelo outro nome.
   */
  capabilities: [
    { key: 'proposals', canonicalName: 'Propostas' },
    { key: 'quotes', canonicalName: 'Orçamentos' },
  ],

  /**
   * Três permissões, no desenho do `po` re-perguntado e mantido: quem monta
   * a proposta não é necessariamente quem registra o veredito da contraparte
   * (`decide` — fé pública do ato), nem quem pode retirá-la da mesa
   * (`cancel` — a ação destrutiva).
   */
  permissions: [
    {
      key: 'quote.proposal.manage',
      moduleId: 'quote',
      description: 'Montar rascunhos, editar itens, enviar a proposta e registrar expiração.',
    },
    {
      key: 'quote.proposal.decide',
      moduleId: 'quote',
      description:
        'Registrar o aceite ou a recusa da contraparte — o ato fica carimbado com quem e quando.',
    },
    {
      key: 'quote.proposal.cancel',
      moduleId: 'quote',
      description: 'Retirar a proposta da mesa — a ação destrutiva deste módulo.',
    },
  ],

  events: {
    /**
     * ⭐ O payload é AUTOSSUFICIENTE — itens e carimbo da decisão inclusos.
     * Quem escutar (um dia, o faturamento) não faz join.
     */
    emits: [
      {
        type: 'quote.proposal.registered',
        version: 1,
        description: 'Uma proposta nasceu (rascunho), com itens em texto livre e contraparte neutra.',
      },
      {
        type: 'quote.proposal.updated',
        version: 1,
        description: 'Mudou fato do rascunho: itens, total, moeda, validade ou contraparte.',
      },
      {
        type: 'quote.proposal.sent',
        version: 1,
        description: 'A proposta foi posta na mesa. Daqui em diante o conteúdo não muda mais.',
      },
      {
        type: 'quote.proposal.accepted',
        version: 1,
        description: 'A contraparte aceitou — registrado por quem tem fé pública do ato, com quem e quando.',
      },
      {
        type: 'quote.proposal.declined',
        version: 1,
        description: 'A contraparte recusou. Terminal: renegociar é documento novo.',
      },
      {
        type: 'quote.proposal.expired',
        version: 1,
        description: 'A validade venceu e alguém registrou o calendário. Só existe com validade vencida.',
      },
      {
        type: 'quote.proposal.cancelled',
        version: 1,
        description: 'A proposta foi retirada da mesa — a ação destrutiva deste módulo. Nunca DELETE.',
      },
    ],

    /**
     * **Vazio, e é Lei 7.**
     *
     * A integração óbvia é o ACEITE virar título no Contas a Receber. **Não
     * entra, e a razão é de produto, não de preguiça:** aceite não é fato
     * financeiro. O título exige decisão de FATURAMENTO — vencimento,
     * parcelas, valor final após o combinado — que a proposta não carrega
     * (validade não é vencimento). Transformar aceite em título inventaria
     * uma data de vencimento que ninguém decidiu. O caminho está declarado
     * na spec (§5): o ato de faturar, o handler no `ar` e o teste
     * triangular. Sem os três, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  proposalManage: 'quote.proposal.manage',
  proposalDecide: 'quote.proposal.decide',
  proposalCancel: 'quote.proposal.cancel',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  proposalRegistered: 'quote.proposal.registered',
  proposalUpdated: 'quote.proposal.updated',
  proposalSent: 'quote.proposal.sent',
  proposalAccepted: 'quote.proposal.accepted',
  proposalDeclined: 'quote.proposal.declined',
  proposalExpired: 'quote.proposal.expired',
  proposalCancelled: 'quote.proposal.cancelled',
} as const;
