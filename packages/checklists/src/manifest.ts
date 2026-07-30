import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Checklists.**
 *
 * ⚠️ **Por que o `id` é `chk`.** `checklist` inteiro não é greppável no
 * padrão dos eventos e `check` é vocabulário de SQL (constraint) e de
 * dinheiro (cheque) — Sol Único proíbe uma palavra querer dizer duas
 * coisas. `chk` é a abreviação consagrada — conferida por grep com
 * fronteira de palavra: zero colisões.
 *
 * @see docs/canon/MODULO-CHK-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0034_chk.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'chk',
  name: 'Checklists',
  version: '0.1.0',
  summary:
    'Os checklists do tenant: o modelo é desenho livre (itens ordenados, texto livre); executar congela o modelo daquele momento; cada resposta é ato carimbado que não se rasura — e concluir exige tudo respondido.',

  /**
   * ⭐ **Domain `operations` — Taxonomia §5, "🏭 Operações (10)"**,
   * capacidade *Checklist*.
   */
  taxonomy: { layer: 'domain', domain: 'operations' },

  capabilities: [{ key: 'checklists', canonicalName: 'Checklist' }],

  /**
   * Duas permissões — o checklist tem duas mãos: quem DESENHA o modelo não
   * é quem EXECUTA a inspeção.
   */
  permissions: [
    {
      key: 'chk.run.execute',
      moduleId: 'chk',
      description: 'Abrir execuções, responder itens (ato carimbado), concluir e abandonar com razão.',
    },
    {
      key: 'chk.setup.manage',
      moduleId: 'chk',
      description: 'Desenhar os modelos de checklist do tenant — itens ordenados, texto livre.',
    },
  ],

  events: {
    emits: [
      {
        type: 'chk.run.started',
        version: 1,
        description: 'Uma execução abriu — com o modelo congelado daquele momento.',
      },
      {
        type: 'chk.run.completed',
        version: 1,
        description: 'A execução foi concluída — tudo respondido, com as contagens no envelope. Terminal.',
      },
      {
        type: 'chk.run.abandoned',
        version: 1,
        description: 'A execução foi abandonada — com a razão escrita. A inspeção refeita é outra inspeção.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nada aqui precisa escutar
     * ninguém. Sem handler, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  execute: 'chk.run.execute',
  setup: 'chk.setup.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  started: 'chk.run.started',
  completed: 'chk.run.completed',
  abandoned: 'chk.run.abandoned',
} as const;
