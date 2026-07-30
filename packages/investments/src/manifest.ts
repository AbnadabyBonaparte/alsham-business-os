import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do Módulo 31 — Investimentos.**
 *
 * ⚠️ **Por que o `id` é `invest`.** Curto, greppável com fronteira; zero
 * colisões na frota da onda (cc·bud·bank·invest·dre) e com os módulos vivos.
 *
 * ⭐ **SEM COTAÇÃO AUTOMÁTICA:** a posição é a soma dos atos registrados, nunca
 * marcação a mercado (Lei 3/7). `consumes` VAZIO — rendimento é ato de gente.
 *
 * @see docs/canon/MODULO-INVEST-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0046_invest.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'invest',
  name: 'Investimentos',
  version: '0.1.0',
  summary:
    'Os investimentos do tenant (que voltam do arquivo) e o livro de atos imutáveis: aplicação, rendimento e resgate. A posição é a soma dos atos — sem cotação de mercado. Resgatar mais que a posição é recusado.',

  /**
   * ⭐ **Domain `finance` — Taxonomia §5, "💰 Financeiro (19)"**, capacidade
   * *Investimentos*.
   */
  taxonomy: { layer: 'domain', domain: 'finance' },

  capabilities: [{ key: 'investments', canonicalName: 'Investimentos' }],

  /**
   * Duas permissões: cadastrar o investimento e registrar os atos (aplicar,
   * render, resgatar).
   */
  permissions: [
    {
      key: 'invest.holding.manage',
      moduleId: 'invest',
      description: 'Cadastrar investimentos, arquivar e devolver ao ativo.',
    },
    {
      key: 'invest.movement.register',
      moduleId: 'invest',
      description: 'Registrar atos: aplicação, rendimento e resgate (resgate não passa da posição).',
    },
  ],

  events: {
    emits: [
      {
        type: 'invest.holding.registered',
        version: 1,
        description: 'Um investimento entrou no cadastro.',
      },
      {
        type: 'invest.holding.archived',
        version: 1,
        description: 'Um investimento saiu de uso — o livro dele continua inteiro.',
      },
      {
        type: 'invest.movement.registered',
        version: 1,
        description: 'Um ato entrou no livro — aplicação, rendimento ou resgate, com o sinal e a competência.',
      },
    ],

    /**
     * ⭐ VAZIO por decisão de canon. O rendimento é ATO DE GENTE (registrado do
     * extrato), nunca calculado de uma taxa nem consumido de um provedor de
     * mercado. Marcação a mercado e comparação com índice são integração
     * (Lei 3), declaradas FORA na spec §5. Lei 7: sem handler, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manageHolding: 'invest.holding.manage',
  registerMovement: 'invest.movement.register',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  holdingRegistered: 'invest.holding.registered',
  holdingArchived: 'invest.holding.archived',
  movementRegistered: 'invest.movement.registered',
} as const;
