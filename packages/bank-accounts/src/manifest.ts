import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do Módulo 30 — Contas Bancárias.**
 *
 * ⚠️ **Por que o `id` é `bank`.** Curto, internacional, greppável com fronteira
 * de palavra; zero colisões na frota da onda (cc·bud·bank·invest·dre) e com os
 * módulos vivos.
 *
 * ⭐ **SOL ÚNICO:** a conciliação (mesa, OFX/CSV, casamento extrato×título) é do
 * `recon` (Módulo 1). Este módulo NÃO a refaz — é o cadastro das contas e o
 * livro de movimentos por conta. `consumes` VAZIO e honesto (a decisão contra
 * a dupla contagem do `cash`).
 *
 * @see docs/canon/MODULO-BANK-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0045_bank.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'bank',
  name: 'Contas Bancárias',
  version: '0.1.0',
  summary:
    'As contas do tenant (que voltam do arquivo) e o livro de movimentos por conta, imutável. O saldo é a soma do livro — pode ser negativo (cheque especial). A transferência é atômica: duas pernas, uma transação. Não refaz a conciliação (é do recon).',

  /**
   * ⭐ **Domain `finance` — Taxonomia §5, "💰 Financeiro (19)"**, capacidade
   * *Bancos*. A tela fala "contas"; o manifesto fala *Bancos*.
   */
  taxonomy: { layer: 'domain', domain: 'finance' },

  capabilities: [{ key: 'bank-accounts', canonicalName: 'Bancos' }],

  /**
   * Três permissões: cadastrar a conta, lançar entrada/saída e transferir, e
   * AJUSTAR — que reescreve a conta e é de quem confere, não de quem lança
   * (o desenho do inv/cash).
   */
  permissions: [
    {
      key: 'bank.account.manage',
      moduleId: 'bank',
      description: 'Cadastrar contas bancárias, arquivar e devolver ao ativo.',
    },
    {
      key: 'bank.movement.register',
      moduleId: 'bank',
      description: 'Lançar entrada/saída no livro de uma conta e transferir entre contas.',
    },
    {
      key: 'bank.movement.adjust',
      moduleId: 'bank',
      description: 'Ajustar o saldo de uma conta — ato com razão obrigatória, de quem confere.',
    },
  ],

  events: {
    emits: [
      {
        type: 'bank.account.registered',
        version: 1,
        description: 'Uma conta bancária entrou no cadastro.',
      },
      {
        type: 'bank.account.archived',
        version: 1,
        description: 'Uma conta saiu de uso — o livro dela continua inteiro.',
      },
      {
        type: 'bank.movement.registered',
        version: 1,
        description: 'Um movimento entrou no livro de uma conta — com o sinal do tipo e a competência.',
      },
      {
        type: 'bank.transfer.executed',
        version: 1,
        description: 'Uma transferência entre duas contas foi executada — as duas pernas ligadas pelo transfer_id.',
      },
    ],

    /**
     * ⭐ VAZIO por decisão de canon — SOL ÚNICO e a decisão contra a DUPLA
     * CONTAGEM. A conciliação já é do `recon`; lançar por consumo de
     * `cash`/`ap`/`ar` faria o mesmo dinheiro chegar por várias portas sem
     * regra de exclusividade de fonte. Caminho declarado na spec §5; Lei 7.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manageAccount: 'bank.account.manage',
  registerMovement: 'bank.movement.register',
  adjustMovement: 'bank.movement.adjust',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  accountRegistered: 'bank.account.registered',
  accountArchived: 'bank.account.archived',
  movementRegistered: 'bank.movement.registered',
  transferExecuted: 'bank.transfer.executed',
} as const;
