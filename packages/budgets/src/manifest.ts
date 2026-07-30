import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do Módulo 29 — Orçamentos.**
 *
 * ⚠️ **Por que o `id` é `bud`.** "Orçamento" tem dois donos nesta plataforma:
 * a proposta comercial (o `quote`, capacidade *Orçamentos* do CRM) e o teto
 * de gasto por período (este). `bud` (de budget) é curto, não disputa a
 * palavra e foi conferido por grep com fronteira de palavra: zero colisões
 * com a frota da onda (cc·bud·bank·invest·dre) e com os módulos vivos.
 *
 * ⭐ **`consumes` NÃO é vazio — e o handler EXISTE (Lei 7 do jeito certo).**
 * O realizado só faz sentido escutando o caixa: `realized.ts` traduz
 * `cash.entry.registered` (padrão E10 — lê `envelope.producedBy`, ignora o
 * lançamento sem categoria, é idempotente por referência) e a composição o
 * entrega a `bud.record_external_movement()`. Esta onda EXIGE redeploy do
 * `apps/api` no apply — está em vermelho no runbook §20.
 *
 * @see docs/canon/MODULO-BUD-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0044_bud.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'bud',
  name: 'Orçamentos',
  version: '0.1.0',
  summary:
    'O teto de gasto por categoria e período. Ativar congela a trave (categoria, período, teto); o realizado é a soma do livro do Fluxo de Caixa que casa a categoria — calculado, nunca digitado. O período fechado é terminal.',

  /**
   * ⭐ **Domain `finance` — Taxonomia §5, "💰 Financeiro (19)"**, capacidade
   * *Orçamento*. A tela fala "orçamento"; o manifesto fala *Orçamento*.
   */
  taxonomy: { layer: 'domain', domain: 'finance' },

  capabilities: [{ key: 'budgeting', canonicalName: 'Orçamento' }],

  /**
   * Duas permissões: quem DESENHA e ativa a trave não é, necessariamente,
   * quem FECHA o período — fechar é decisão contábil (o período vira
   * história e o que vem é orçamento novo).
   */
  permissions: [
    {
      key: 'bud.budget.manage',
      moduleId: 'bud',
      description:
        'Criar, editar e ativar orçamentos. Ativar congela a trave — categoria, período e teto param de mudar.',
    },
    {
      key: 'bud.budget.close',
      moduleId: 'bud',
      description:
        'Fechar o período de um orçamento — ato terminal: o período vira história e o próximo é orçamento novo.',
    },
  ],

  events: {
    emits: [
      {
        type: 'bud.budget.opened',
        version: 1,
        description: 'Um orçamento nasceu no rascunho — categoria, período e teto ainda editáveis.',
      },
      {
        type: 'bud.budget.activated',
        version: 1,
        description: 'O orçamento foi ativado — a trave congelou; a partir daqui só o nome muda.',
      },
      {
        type: 'bud.budget.closed',
        version: 1,
        description: 'O período do orçamento foi fechado — terminal; o próximo período é orçamento novo.',
      },
    ],

    /**
     * ⭐ **NÃO É VAZIO — e o handler EXISTE (Lei 7 do jeito certo).**
     *
     * O realizado é a soma do livro do cash. O módulo escuta
     * `cash.entry.registered` sem importar o `cashflow`, sem ler o schema
     * dele e sem conhecer o correio — o acoplamento é com o TIPO do evento,
     * contrato público (guarda "módulo não conhece módulo" no CI). O
     * tradutor lê a origem de `envelope.producedBy`; lançamento sem
     * categoria é ignorado sem erro (não casa orçamento nenhum).
     */
    consumes: [
      {
        type: 'cash.entry.registered',
        version: 1,
        description:
          'Um lançamento entrou no livro do Fluxo de Caixa — se for desembolso na categoria e no período de um orçamento, entra no realizado.',
      },
    ],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'bud.budget.manage',
  close: 'bud.budget.close',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  opened: 'bud.budget.opened',
  activated: 'bud.budget.activated',
  closed: 'bud.budget.closed',
} as const;
