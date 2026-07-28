import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Relacionamentos (CRM base).**
 *
 * ⚠️ **Por que o `id` é `crm`.** O CORE-SPEC define o tipo de evento como
 * `<moduleId>.<agregado>.<fato>`, e o cinto de `crm.emit_event()` confere esse
 * prefixo. Com eventos e permissões em `crm.*`, o `id` **tem** de ser `crm` —
 * qualquer outro faria a porta de saída recusar os próprios eventos do módulo.
 * Aqui, ao contrário do Módulo 3, o id curto e o nome do pacote coincidem.
 *
 * @see docs/canon/CORE-SPEC.md — o ciclo de vida que este objeto atravessa
 * @see docs/canon/MODULO-CRM-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0009_crm.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'crm',
  name: 'Relacionamentos',
  version: '0.1.0',
  summary:
    'O cadastro de quem a empresa se relaciona — pessoas e organizações — e o histórico de contato com cada um, inteiro num lugar só.',

  /**
   * Domain `crm` da Taxonomia — §5, **"🤝 Comercial & CRM (12)"**, com a nota
   * *"reaproveita 360° PRIMA"*.
   *
   * **Sol Único:** a chave vem de `DomainKey`, que é a transcrição da
   * Taxonomia canônica. O módulo não inventa classificação.
   */
  taxonomy: { layer: 'domain', domain: 'crm' },

  /**
   * **Uma capacidade. Uma só, e é a base.**
   *
   * O Domain lista doze: *CRM · Pipeline · Propostas · Orçamentos · Follow-up ·
   * Visitas · Clientes · Leads · WhatsApp · Ligações · Comissão · Metas*. Onze
   * delas estão **NÃO CONSTRUÍDAS**, e listá-las seria vender o que não existe.
   *
   * Duas escolhas desta lista merecem estar escritas:
   *
   * 1. **Declara-se `crm`, não `Clientes`.** "Clientes" seria mais modesto e
   *    seria ERRADO: este módulo cadastra *contrapartes* — cliente, fornecedor,
   *    parceiro, prospecto —, e chamar isso de "Clientes" descreveria menos do
   *    que ele faz e presumiria que toda contraparte compra alguma coisa.
   *
   * 2. ⚠️ **`WhatsApp` é capacidade da Taxonomia e NÃO vira schema.** A
   *    Taxonomia nomeia as capacidades como o mercado as nomeia — é um mapa do
   *    que empresas fazem, não um projeto de tabela. O canal da interação é
   *    **texto livre**, e é assim que a capacidade continua atendida quando o
   *    instrumento mudar de nome ou de país.
   */
  capabilities: [{ key: 'crm', canonicalName: 'CRM' }],

  /**
   * Três permissões, e a separação entre as duas primeiras e a terceira é a
   * mesma decisão dos três módulos anteriores: **quem cadastra não é
   * necessariamente quem tira da carteira.**
   *
   * O produto PERMITE que sejam a mesma pessoa — basta pôr as três no mesmo
   * papel —, mas não PRESUME. Presumir seria escolher o organograma do cliente
   * por ele.
   *
   * A separação é real, não decorativa: há trigger no banco (`0009_crm.sql`
   * §2.2) que recusa a mudança de estado sem `crm.party.archive`, porque policy
   * de UPDATE não enxerga o estado anterior.
   */
  permissions: [
    {
      key: 'crm.party.manage',
      moduleId: 'crm',
      description: 'Cadastrar e editar contrapartes.',
    },
    {
      key: 'crm.interaction.record',
      moduleId: 'crm',
      description: 'Registrar um contato no histórico de uma contraparte.',
    },
    {
      key: 'crm.party.archive',
      moduleId: 'crm',
      description:
        'Arquivar uma contraparte e trazê-la de volta — a ação destrutiva deste módulo.',
    },
  ],

  events: {
    /**
     * Os quatro fatos que este módulo conta ao mundo. Todos saem por
     * `crm.emit_event()`, a única porta para fora.
     *
     * ⭐ **O payload é AUTOSSUFICIENTE.** O envelope da interação carrega os
     * dados da contraparte junto: quem receber `crm.interaction.registered`
     * não tem como resolver um `partyId` sozinho — o schema deste módulo é
     * invisível para ele, por policy e por lei.
     *
     * **Corrigir a observação interna não emite nada.** Só emite o que muda o
     * FATO para quem escuta: nome, identificador, contato, etiquetas, estado.
     */
    emits: [
      {
        type: 'crm.party.registered',
        version: 1,
        description:
          'Uma contraparte entrou na carteira: pessoa ou organização, com identificador, contato e etiquetas.',
      },
      {
        type: 'crm.party.updated',
        version: 1,
        description:
          'Mudou algo que interessa a quem escuta: nome, identificador fiscal, contato ou etiquetas.',
      },
      {
        type: 'crm.party.archived',
        version: 1,
        description:
          'Uma contraparte saiu da carteira — a ação destrutiva deste módulo. Some da operação, nunca da trilha, e nunca do banco.',
      },
      {
        type: 'crm.interaction.registered',
        version: 1,
        description:
          'Um contato foi registrado no histórico de uma contraparte, com quando, por onde e o que ficou anotado.',
      },
    ],

    /**
     * **Vazio, e é Lei 7.**
     *
     * A integração óbvia existe e é tentadora: o fornecedor de um título a
     * pagar virar contraparte aqui, sozinho, pelo evento `ap.payable.registered`
     * — que já carrega `supplierName` e `counterpartyTaxId` no envelope,
     * justamente porque o payload é autossuficiente. Tecnicamente daria hoje.
     *
     * **Não entra, porque o handler não existe.** Consumo declarado sem
     * consumidor faz o Core acordar um módulo que não sabe responder, e a Store
     * passaria a anunciar uma integração que não acontece.
     *
     * E há uma decisão de produto por baixo, que precisa ser do dono e não
     * minha: nem todo fornecedor pago é contraparte que se quer na carteira
     * comercial, e criar contraparte sozinho encheria o cadastro de linhas que
     * ninguém pediu. Quando isso for construído, é com regra de quando criar —
     * e a regra é `settings` do tenant, nunca constante no módulo.
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
  partyManage: 'crm.party.manage',
  interactionRecord: 'crm.interaction.record',
  partyArchive: 'crm.party.archive',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  partyRegistered: 'crm.party.registered',
  partyUpdated: 'crm.party.updated',
  partyArchived: 'crm.party.archived',
  interactionRegistered: 'crm.interaction.registered',
} as const;
