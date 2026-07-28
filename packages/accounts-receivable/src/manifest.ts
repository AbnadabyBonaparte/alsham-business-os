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
     * ⭐ **VAZIO — e esta é a decisão de canon mais pesada da etapa.**
     *
     * A integração óbvia é o espelho do triângulo da Etapa 10: assim como o
     * Módulo 1 projeta o título a PAGAR e casa contra os débitos do extrato,
     * ele deveria projetar o título a RECEBER e casar contra os créditos.
     * Simétrico, desejável, e é o que qualquer um esperaria aqui.
     *
     * **Não entra, porque o Módulo 1 não sustenta casamento de crédito hoje** —
     * e a prova não é opinião, está no código:
     *
     *   1. `packages/finance-reconciliation/src/matching.ts`, em `scorePair()`:
     *      `if (line.amountCents >= 0) return null;`, com o comentário
     *      *"Título a pagar quita-se com SAÍDA de dinheiro. Entrada não é
     *      candidata."* **O motor recusa a linha de crédito na primeira
     *      linha.**
     *   2. `recon.reconciliation_matches` tem a coluna `payable_id NOT NULL`,
     *      com chave estrangeira para `recon.payables`. Não há campo
     *      polimórfico nem `subject_type`.
     *   3. `recon.approval_queue.subject_type` aceita `'reconciliation-match'`
     *      e `'statement-closure'`, e nada mais.
     *   4. O próprio tipo `MatchSuggestion` tem `payableId`, não um alvo
     *      genérico.
     *
     * Para o consumo existir de verdade seria preciso: criar `recon.receivables`,
     * tornar `reconciliation_matches` polimórfica — **derrubando um `NOT NULL`
     * de tabela já aplicada em produção** —, e reescrever `scorePair()` para ser
     * direcional. Isso é **redesenhar o motor do Módulo 1 como efeito colateral
     * de construir o Módulo 5**, com duas migrations e dois módulos mudando na
     * mesma etapa.
     *
     * O caminho barato existia e foi recusado: projetar o título a receber
     * dentro de `recon.payables` com sinal invertido. Isso é gambiarra — um
     * título a receber não é um título a pagar negativo, e a primeira consulta
     * de "quanto devo" passaria a mentir.
     *
     * **Declarar `consumes` aqui sem nada disso faria a Store anunciar uma
     * conciliação de recebimentos que não acontece.** A integração está
     * registrada como NÃO CONSTRUÍDA em `MODULO-AR-SPEC §2.3` e em
     * `MODULO-RECON-SPEC §7`, com o que falta.
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
  receivableManage: 'ar.receivable.manage',
  receivableCancel: 'ar.receivable.cancel',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  receivableRegistered: 'ar.receivable.registered',
  receivableUpdated: 'ar.receivable.updated',
  receivableCancelled: 'ar.receivable.cancelled',
} as const;
