import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Segurança — Rondas.**
 *
 * ⭐⭐ **A ÚLTIMA PEÇA da campanha das 6 Ondas — 42/42.** `id` = `sec`:
 * curto, greppável, sem colisão com a frota da campanha.
 *
 * ⭐⭐ **Este módulo NÃO reescreve o `occ`.** Incidente de segurança JÁ É
 * uma Ocorrência (`occ`, Módulo 16, que já existe) — fato consumado com
 * gravidade, tratativa e desfecho. Este módulo é só a RONDA: o percurso
 * verificado, ato pontual imutável, sem ciclo de vida nenhum.
 *
 * @see docs/canon/MODULO-SEC-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0057_sec.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'sec',
  name: 'Segurança — Rondas',
  version: '0.1.0',
  summary:
    'A ronda de segurança do shopping: postos de verificação (texto livre, desenho do tenant) e o livro de rondas — quando se passou por qual posto, ato pontual imutável carimbado pelo servidor. O incidente NÃO mora aqui: incidente é Ocorrência (occ), que já existe.',

  /**
   * Vertical `shopping-centers` — Taxonomia §6, "🛍 Shopping Centers (9)",
   * capacidade *Segurança*. A chave é a `VerticalKey` do `@alsham/core`.
   */
  taxonomy: { layer: 'vertical', vertical: 'shopping-centers' },

  capabilities: [{ key: 'security-patrols', canonicalName: 'Segurança' }],

  /**
   * Duas permissões, física deliberadamente ASSIMÉTRICA: quem DESENHA os
   * postos (`checkpoint.manage`) não precisa ser quem RONDA (`patrol.record`)
   * — numa operação real, o vigia da madrugada registra passagens; ele não
   * está desenhando o mapa de postos do shopping.
   */
  permissions: [
    {
      key: 'sec.checkpoint.manage',
      moduleId: 'sec',
      description: 'Desenhar os postos de verificação do tenant (texto livre; voltam do arquivo).',
    },
    {
      key: 'sec.patrol.record',
      moduleId: 'sec',
      description: 'Registrar a passagem da ronda por um posto — ato imutável, carimbado pelo servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'sec.patrol.recorded',
        version: 1,
        description: 'A ronda passou por um posto — o carimbo do servidor, ato pontual imutável.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler nesta onda.
     * Integração com câmera/alarme e o incidente (que é o occ) são futuro
     * DECLARADO na spec §5, sem handler e sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'sec.checkpoint.manage',
  record: 'sec.patrol.record',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  recorded: 'sec.patrol.recorded',
} as const;
