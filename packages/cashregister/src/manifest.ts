import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 73 — Sessão de Caixa.
 *
 * `id` = `cashregister` (o cinto de `emit_event` confere o prefixo
 * `cashregister.*`). Vertical `retail` (Varejo & Supermercados). `consumes`
 * VAZIO (Lei 7).
 *
 * ⭐ **O DIVERGE do `cash` (Módulo 14):** o `cash` é o LIVRO-CAIXA CORPORATIVO —
 * lançamentos imutáveis, saldo é view, SEM ciclo de vida (livro perpétuo). Este
 * módulo é a SESSÃO FÍSICA de uma gaveta: um turno com COMEÇO e FIM. Abre-se
 * contando o fundo de troco, fecha-se contando a gaveta. `open → closed`,
 * `closed` TERMINAL (a física do `scrum`). UMA sessão aberta por caixa (índice
 * único parcial no banco).
 *
 * @see docs/canon/MODULO-CASHREGISTER-SPEC.md
 * @see supabase/migrations/0088_cashregister.sql
 */
export const MANIFEST = {
  id: 'cashregister',
  name: 'Sessão de Caixa',
  version: '0.1.0',
  summary:
    'O turno físico de uma gaveta: abre contando o fundo de troco, fecha contando a gaveta. open → closed, closed TERMINAL (a física do scrum — o DIVERGE do cash, que é livro-caixa corporativo perpétuo, imutável e sem ciclo de vida). UMA sessão aberta por caixa (regra na constraint do banco). Operador por id solto. A quebra de caixa (esperado × contado) é de tela — este módulo guarda só as contagens físicas. consumes VAZIO.',

  /**
   * ⭐ **Vertical `retail` — Taxonomia §6, "🛒 Varejo & Supermercados (7)"**,
   * capacidade *Caixa*. A chave é a VerticalKey do `@alsham/core` — a Store
   * gradua a pill de Varejo por ela (store-taxonomy).
   */
  taxonomy: { layer: 'vertical', vertical: 'retail' },

  capabilities: [{ key: 'cash-register', canonicalName: 'Caixa' }],

  /**
   * UMA permissão só: abrir a sessão, editá-la e fechá-la são a mesma mão do
   * operador de caixa (bate o `cashregister.session.manage` da migration).
   */
  permissions: [
    {
      key: 'cashregister.session.manage',
      moduleId: 'cashregister',
      description: 'Abrir sessões de caixa, editar e fechar contando a gaveta.',
    },
  ],

  events: {
    emits: [
      {
        type: 'cashregister.session.opened',
        version: 1,
        description: 'Uma sessão de caixa abriu — o fundo de troco foi contado.',
      },
      {
        type: 'cashregister.session.closed',
        version: 1,
        description: 'A sessão foi fechada contando a gaveta. Terminal — o próximo turno é sessão nova.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler existe. A quebra de
     * caixa exigiria somar as vendas do `pdv` — leitura de schema alheio,
     * proibida. A reconciliação é de tela; sangria/suprimento é futuro DECLARADO.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'cashregister.session.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  opened: 'cashregister.session.opened',
  closed: 'cashregister.session.closed',
} as const;
