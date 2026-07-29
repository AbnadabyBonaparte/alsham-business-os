import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Contas a Receber.**
 *
 * ⚠️ **Por que o `id` é `ar`.** Quinta vez que esta decisão aparece, e já é
 * padrão: o CORE-SPEC define o evento como `<moduleId>.<agregado>.<fato>`, e o
 * cinto de `ar.emit_event()` confere o prefixo. Com eventos em `ar.*`, qualquer
 * outro id faria a porta de saída recusar os próprios eventos do módulo. O
 * pacote se chama `@alsham/accounts-receivable`; só o identificador é curto.
 *
 * @see docs/canon/MODULO-AR-SPEC.md — o quadro espelho × divergência
 * @see supabase/migrations/0010_ar.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'ar',
  name: 'Contas a Receber',
  version: '0.1.0',
  summary:
    'Registra o que a empresa tem a receber, com vencimento e valor, e conta ao resto da plataforma cada título que nasce, muda ou é cancelado.',

  /** Domain `finance` da Taxonomia (§5, Financeiro — 19 capacidades). */
  taxonomy: { layer: 'domain', domain: 'finance' },

  /**
   * **Uma capacidade. Uma só** — *Contas a receber*, que a Taxonomia §5 lista
   * logo depois de *Contas a pagar*.
   *
   * Lei 7 dói aqui como doeu no Módulo 3, e por uma tentação a mais: com
   * "contas a receber" construído, seria fácil listar *Cobrança* junto — é o
   * que todo mundo espera que venha no pacote. Mas cobrar é régua, mensagem,
   * juros e negativação, e **nada disso existe**. O manifesto é o que a Store
   * exibe.
   */
  capabilities: [{ key: 'accounts-receivable', canonicalName: 'Contas a receber' }],

  /**
   * Duas permissões, e a separação é a mesma decisão dos quatro módulos
   * anteriores: **quem registra um título não é necessariamente quem o mata.**
   *
   * O produto PERMITE que sejam a mesma pessoa — basta pôr as duas no mesmo
   * papel —, mas não PRESUME.
   *
   * ⚠️ **Duas, e não três.** Considerou-se separar "baixar por perda" de
   * "cancelar", que é um controle real em financeiro. Ficou **NÃO CONSTRUÍDO**
   * e está registrado na spec: sem um estado `written_off` no schema, uma
   * terceira permissão guardaria uma porta que não existe.
   */
  permissions: [
    {
      key: 'ar.receivable.manage',
      moduleId: 'ar',
      description: 'Registrar e editar títulos a receber.',
    },
    {
      key: 'ar.receivable.cancel',
      moduleId: 'ar',
      description: 'Cancelar um título a receber — a ação destrutiva deste módulo.',
    },
  ],

  events: {
    /**
     * Os três fatos que este módulo conta ao mundo — o espelho exato dos três
     * do Módulo 3. Todos saem por `ar.emit_event()`.
     *
     * ⭐ **O payload é AUTOSSUFICIENTE.** Quem escuta não pode fazer join: o
     * schema deste módulo é invisível para ele, por policy e por lei.
     *
     * **Corrigir a descrição não emite nada.** Só emite o que muda o FATO:
     * valor, vencimento, recebimento, estado.
     */
    emits: [
      {
        type: 'ar.receivable.registered',
        version: 1,
        description:
          'Um título a receber foi registrado, com referência, vencimento, valor e moeda — tudo o que quem escuta precisa para existir sem nunca ter visto este módulo.',
      },
      {
        type: 'ar.receivable.updated',
        version: 1,
        description:
          'Mudou algo que interessa a quem escuta: valor, vencimento, quanto já entrou ou o estado.',
      },
      {
        type: 'ar.receivable.cancelled',
        version: 1,
        description:
          'Um título a receber foi cancelado — a ação destrutiva deste módulo. Some da operação, nunca da trilha, e nunca do banco.',
      },
    ],

    /**
     * ⭐ **DEIXOU DE SER VAZIO** — o fechamento do ciclo do crédito.
     *
     * Handler em `recon-settlement.ts` + porta SQL `ar.apply_recon_match`
     * (`0013_ar_apply_recon_match.sql`). Lei 7 na ordem certa: primeiro o
     * handler, depois a promessa.
     *
     * Consumir não é depender: este pacote **não** importa o recon.
     */
    consumes: [
      {
        type: 'recon.match.decided',
        version: 1,
        description:
          'Um casamento de crédito foi confirmado ou rejeitado na conciliação. Confirmar liquida o título a receber pelo externalRef do payload; rejeitar só registra o fato.',
      },
    ],
  },

  /**
   * A única dependência que existe. Repare que não há — nem pode haver — campo
   * `dependsOn`: este módulo funciona sozinho, com ou sem os outros instalados.
   */
  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  receivableManage: 'ar.receivable.manage',
  receivableCancel: 'ar.receivable.cancel',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  receivableRegistered: 'ar.receivable.registered',
  receivableUpdated: 'ar.receivable.updated',
  receivableCancelled: 'ar.receivable.cancelled',
} as const;
