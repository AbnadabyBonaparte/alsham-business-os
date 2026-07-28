import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Contas a Pagar.**
 *
 * ⭐ **A diferença para os dois primeiros cabe numa linha:** aqui `consumes` é
 * vazio e `emits` não. Este módulo é o PRODUTOR da terceira ponta do triângulo
 * — quem reage ao que ele conta é o Módulo 1, que nasceu esperando.
 *
 * ⚠️ **Por que o `id` é `ap` e não `accounts-payable`.** O CORE-SPEC define o
 * tipo de evento como `<moduleId>.<agregado>.<fato>`, e o cinto de
 * `emit_event()` confere exatamente esse prefixo. Com eventos e permissões em
 * `ap.*`, o `id` TEM de ser `ap`: qualquer outra escolha faria a porta de saída
 * do módulo recusar os próprios eventos dele. O nome legível vive em `name`; o
 * pacote se chama `@alsham/accounts-payable`. Só o identificador é curto, e é
 * ele que o contrato exige que seja o prefixo.
 *
 * @see docs/canon/CORE-SPEC.md — o ciclo de vida que este objeto atravessa
 * @see docs/canon/MODULO-AP-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0007_ap.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'ap',
  name: 'Contas a Pagar',
  version: '0.1.0',
  summary:
    'Registra o que a empresa deve, com vencimento e valor, e conta ao resto da plataforma cada título que nasce, muda ou é cancelado.',

  /** Domain `finance` da Taxonomia (§5, Financeiro — 19 capacidades). */
  taxonomy: { layer: 'domain', domain: 'finance' },

  /**
   * **Uma capacidade. Uma só.**
   *
   * Lei 7 dói aqui como doeu no Módulo 2: o Domain Financeiro tem 19
   * capacidades, e seria fácil listar *Fluxo de caixa*, *Bancos*, *Centro de
   * custo*, *Plano de contas* — todas plausíveis a partir de um título a pagar,
   * todas NÃO CONSTRUÍDAS. O manifesto é o que a Store exibe.
   *
   * Guardar a data de vencimento não é *Fluxo de caixa*. Guardar o valor
   * liquidado não é *Conciliação* — essa é do Módulo 1, e é justamente por isso
   * que este módulo conta o fato em vez de calcular por conta própria.
   */
  capabilities: [{ key: 'accounts-payable', canonicalName: 'Contas a pagar' }],

  /**
   * Duas permissões, e a separação é a mesma decisão dos dois módulos
   * anteriores: **quem registra um título não é necessariamente quem o mata.**
   *
   * O produto PERMITE que sejam a mesma pessoa — basta pôr as duas no mesmo
   * papel —, mas não PRESUME. Presumir seria escolher o organograma do cliente
   * por ele.
   *
   * A separação é real, não decorativa: há trigger no banco (`0007_ap.sql`
   * §2.2) que recusa a passagem para `cancelled` sem `ap.payable.cancel`,
   * porque policy de UPDATE não enxerga o estado anterior.
   */
  permissions: [
    {
      key: 'ap.payable.manage',
      moduleId: 'ap',
      description: 'Registrar e editar títulos a pagar.',
    },
    {
      key: 'ap.payable.cancel',
      moduleId: 'ap',
      description: 'Cancelar um título — a ação destrutiva deste módulo.',
    },
  ],

  events: {
    /**
     * Os três fatos que este módulo conta ao mundo. Todos saem por
     * `ap.emit_event()`, a única porta para fora.
     *
     * ⭐ **O payload é AUTOSSUFICIENTE, e isso não é zelo — é a regra.** Quem
     * escuta não pode fazer join: o schema deste módulo é invisível para ele,
     * por policy e por lei. Se o envelope trouxesse só um id, o consumidor
     * ficaria com um identificador que não sabe resolver — e a única saída
     * seria ler a tabela alheia, que é exatamente o que o Lego proíbe.
     *
     * **Corrigir a descrição não emite nada.** Só emite o que muda o FATO:
     * valor, vencimento, liquidação, estado. Emitir a cada salvamento encheria
     * a caixa de saída de ruído — e o tenant paga por evento entregue.
     */
    emits: [
      {
        type: 'ap.payable.registered',
        version: 1,
        description:
          'Um título a pagar foi registrado, com referência, vencimento, valor e moeda — tudo o que quem escuta precisa para existir sem nunca ter visto este módulo.',
      },
      {
        type: 'ap.payable.updated',
        version: 1,
        description:
          'Mudou algo que interessa a quem escuta: valor, vencimento, quanto já foi liquidado ou o estado.',
      },
      {
        type: 'ap.payable.cancelled',
        version: 1,
        description:
          'Um título foi cancelado — a ação destrutiva deste módulo. Some da operação, nunca da trilha, e nunca do banco.',
      },
    ],

    /**
     * **Vazio, e é Lei 7.**
     *
     * Seria fácil declarar que este módulo escuta a baixa do Módulo 1 e se
     * liquida sozinho — é a integração óbvia, e é a primeira que um cliente
     * pede. Mas o handler não existe, e consumo declarado sem consumidor faz o
     * Core acordar um módulo que não sabe responder.
     *
     * Quando o handler existir, esta lista muda. Até lá, ela é a verdade.
     */
    consumes: [],
  },

  /**
   * A única dependência que existe. Repare que não há — nem pode haver — campo
   * `dependsOn`: este módulo funciona sozinho, com ou sem o Módulo 1 instalado.
   * Quem reage ao que ele conta é problema de quem reage.
   */
  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  payableManage: 'ap.payable.manage',
  payableCancel: 'ap.payable.cancel',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  payableRegistered: 'ap.payable.registered',
  payableUpdated: 'ap.payable.updated',
  payableCancelled: 'ap.payable.cancelled',
} as const;
