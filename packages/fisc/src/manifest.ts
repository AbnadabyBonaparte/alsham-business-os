import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Fiscalização.**
 *
 * ⭐⭐ **Este módulo é a física do `sec` (Segurança/Rondas) re-perguntada para
 * a fiscalização pública.** O `occ` (Ocorrências) pressupõe que o alvo já
 * existe em outro lugar; ele NÃO carrega um cadastro de alvos próprio. A
 * fiscalização municipal trabalha ao contrário: mantém um ROL de
 * estabelecimentos/imóveis sob jurisdição que são vistoriados periodicamente —
 * roster + livro de campo, a física do `sec`: **alvo/checkpoint + livro
 * imutável**.
 *
 * ⛔ **O auto de infração é FORA (Lei 3).** A vistoria CONSTATA; a penalidade
 * com força de lei (multa, prazo de defesa, contraditório) é ato de império do
 * Estado — integra-se, não se constrói.
 *
 * @see docs/canon/ONDA-GOVERNO-DECISOES.md — a capacidade #8 (Fiscalização)
 * @see docs/canon/MODULO-FISC-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0108_fisc.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'fisc',
  name: 'Fiscalização',
  version: '0.1.0',
  summary:
    'A fiscalização municipal: o rol de alvos fiscalizáveis (texto livre, desenho do tenant, volta do arquivo) e o livro de vistorias — o que o fiscal constatou em campo, ato pontual imutável carimbado pelo servidor. A vistoria CONSTATA; o auto de infração NÃO mora aqui (é integração, Lei 3).',

  /**
   * Vertical `government` — Taxonomia §6, "🏛 Governo (8)", capacidade
   * *Fiscalização*. A chave é a `VerticalKey` do `@alsham/core`.
   */
  taxonomy: { layer: 'vertical', vertical: 'government' },

  capabilities: [{ key: 'inspection', canonicalName: 'Fiscalização' }],

  /**
   * Duas permissões, física deliberadamente ASSIMÉTRICA: quem DESENHA o rol de
   * alvos (`target.manage`) não precisa ser quem VISTORIA em campo
   * (`inspection.record`) — numa operação real, o fiscal de plantão registra
   * vistorias; ele não está mantendo o cadastro de estabelecimentos sob
   * jurisdição.
   */
  permissions: [
    {
      key: 'fisc.target.manage',
      moduleId: 'fisc',
      description: 'Manter o rol de alvos fiscalizáveis do tenant (texto livre; voltam do arquivo).',
    },
    {
      key: 'fisc.inspection.record',
      moduleId: 'fisc',
      description: 'Registrar a vistoria de um alvo — ato imutável, carimbado pelo servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'fisc.target.registered',
        version: 1,
        description: 'Um alvo fiscalizável entrou no rol sob jurisdição.',
      },
      {
        type: 'fisc.inspection.recorded',
        version: 1,
        description: 'A vistoria constatou o alvo — o carimbo do servidor, ato pontual imutável.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler nesta onda. O auto de
     * infração (Lei 3) e integrações de campo são futuro DECLARADO na spec §5,
     * sem handler e sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'fisc.target.manage',
  record: 'fisc.inspection.record',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'fisc.target.registered',
  recorded: 'fisc.inspection.recorded',
} as const;
