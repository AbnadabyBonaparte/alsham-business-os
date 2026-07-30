import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Fluxo de Caixa.**
 *
 * ⚠️ **Por que o `id` é `cash`.** `finance` é o Domain inteiro (e
 * `packages/finance` é pasta reservada); `caixa` não caberia no padrão
 * `<moduleId>.<agregado>.<fato>` em inglês do CORE-SPEC; `flow` é genérico
 * demais para se grepar. `cash` é curto, diz o regime (CAIXA, não
 * competência) e foi conferido por grep com fronteira de palavra: zero
 * colisões.
 *
 * @see docs/canon/MODULO-CASH-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0029_cash.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'cash',
  name: 'Fluxo de Caixa',
  version: '0.1.0',
  summary:
    'O livro-caixa do tenant: lançamentos imutáveis (entrada, saída, ajuste com razão), categoria desenhada pelo tenant e saldo sempre calculado. Registra o realizado — previsão é Orçamento.',

  /**
   * ⭐ **Domain `finance` — Taxonomia §5, "💰 Financeiro (19)"**, capacidade
   * *Fluxo de caixa*. DRE, Balancete, Orçamento, Centro de custo, Bancos e
   * Conciliação são capacidades PRÓPRIAS do mesmo Domain — não entram aqui.
   */
  taxonomy: { layer: 'domain', domain: 'finance' },

  capabilities: [{ key: 'cash-flow', canonicalName: 'Fluxo de caixa' }],

  /**
   * Três permissões: registrar é operação; AJUSTAR reescreve a conta (quem
   * conta não é quem confere — o desenho do inv); a classificação tem dona.
   */
  permissions: [
    {
      key: 'cash.entry.register',
      moduleId: 'cash',
      description: 'Lançar entradas e saídas no livro-caixa — o sinal vem do tipo, nunca do operador.',
    },
    {
      key: 'cash.entry.adjust',
      moduleId: 'cash',
      description: 'Lançar AJUSTE com razão obrigatória — o movimento que reescreve a conta.',
    },
    {
      key: 'cash.category.manage',
      moduleId: 'cash',
      description: 'Desenhar as categorias do tenant: criar, renomear, arquivar e reativar.',
    },
  ],

  events: {
    emits: [
      {
        type: 'cash.entry.registered',
        version: 1,
        description:
          'Um lançamento entrou no livro — com o sinal do tipo, a categoria pelo nome e o dia em que o dinheiro moveu.',
      },
      {
        type: 'cash.category.registered',
        version: 1,
        description: 'Uma categoria nasceu no desenho do tenant.',
      },
      {
        type: 'cash.category.updated',
        version: 1,
        description: 'A categoria mudou (nome, ou reativação — que não é fato novo, é a mesma).',
      },
      {
        type: 'cash.category.archived',
        version: 1,
        description: 'A categoria saiu de uso — o livro dela continua inteiro.',
      },
    ],

    /**
     * ⭐ VAZIO por decisão de canon — a decisão contra a DUPLA CONTAGEM.
     *
     * Consumir `ap.*`/`ar.*` para lançar sozinho faria o MESMO dinheiro
     * chegar por três portas (fato, lançamento manual, extrato conciliado)
     * sem regra de exclusividade de fonte — e o caixa contaria duas vezes
     * sem erro nenhum. Essa regra ninguém desenhou. Caminho declarado na
     * spec §5; Lei 7: sem handler completo, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  register: 'cash.entry.register',
  adjust: 'cash.entry.adjust',
  categoryManage: 'cash.category.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  entryRegistered: 'cash.entry.registered',
  categoryRegistered: 'cash.category.registered',
  categoryUpdated: 'cash.category.updated',
  categoryArchived: 'cash.category.archived',
} as const;
