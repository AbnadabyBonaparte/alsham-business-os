import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Contratos.**
 *
 * ⚠️ **Por que o `id` é `ctr`.** "Contrato" já é vocabulário do CORAÇÃO do
 * canon: o CORE-SPEC é "o CONTRATO do Lego", `packages/core` é "contrato
 * puro", e o acoplamento entre módulos é "com o tipo do evento, que é
 * contrato público". Sol Único — o argumento que derrubou `event` no Módulo
 * 11 e `os` no Módulo 7. `ctr` é curto, greppável e foi conferido por grep
 * com fronteira de palavra: zero colisões.
 *
 * @see docs/canon/MODULO-CTR-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0028_ctr.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'ctr',
  name: 'Contratos',
  version: '0.1.0',
  summary:
    'A carteira de contratos do tenant: vigência, valor e partes com os termos originais congelados em vigor — o vigente é calculado dos atos registrados (reajuste, renovação). Rescindir exige razão; encerrar exige calendário.',

  /**
   * ⭐ **Domain `legal` — Taxonomia §5, "⚖ Jurídico (12)"**, capacidade
   * *Contratos*. Assinaturas é capacidade PRÓPRIA do mesmo Domain (e Engine
   * de Assinatura Digital na §4) — não entra aqui.
   */
  taxonomy: { layer: 'domain', domain: 'legal' },

  capabilities: [{ key: 'contracts', canonicalName: 'Contratos' }],

  /**
   * Três permissões: quem administra a carteira não é quem lança o reajuste
   * nem quem assina a rescisão.
   */
  permissions: [
    {
      key: 'ctr.contract.manage',
      moduleId: 'ctr',
      description: 'Registrar e editar contratos em rascunho, e pô-los em vigor.',
    },
    {
      key: 'ctr.contract.amend',
      moduleId: 'ctr',
      description:
        'Registrar reajuste (índice em texto livre, valor novo) e renovação (estender a vigência) — atos imutáveis no mesmo contrato.',
    },
    {
      key: 'ctr.contract.decide',
      moduleId: 'ctr',
      description:
        'Encerrar por prazo vencido ou rescindir com razão — o desfecho é terminal e carimbado pelo servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'ctr.contract.registered',
        version: 1,
        description: 'Um contrato nasceu (rascunho), com as partes pelo nome.',
      },
      {
        type: 'ctr.contract.updated',
        version: 1,
        description: 'O rascunho mudou no que é FATO: termos, partes, vigência.',
      },
      {
        type: 'ctr.contract.activated',
        version: 1,
        description: 'O contrato entrou em vigor — a partir daqui os termos mudam só por ato.',
      },
      {
        type: 'ctr.contract.adjusted',
        version: 1,
        description:
          'Reajuste registrado: índice em texto livre, valor anterior e novo. O sistema registra; quem calcula é gente.',
      },
      {
        type: 'ctr.contract.renewed',
        version: 1,
        description: 'A vigência foi estendida por renovação — o MESMO contrato, prazo novo.',
      },
      {
        type: 'ctr.contract.ended',
        version: 1,
        description: 'Fim natural: a vigência venceu e o encerramento foi registrado.',
      },
      {
        type: 'ctr.contract.terminated',
        version: 1,
        description: 'Rescisão: ato com razão obrigatória, carimbado pelo servidor.',
      },
      {
        type: 'ctr.contract.cancelled',
        version: 1,
        description: 'O rascunho foi cancelado antes de entrar em vigor.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): não há fato de outro módulo que
     * este precise projetar hoje. O aceite de proposta virar contrato é
     * caminho DECLARADO na spec §5 — exige decisão de contratação (vigência,
     * partes) que a proposta não carrega.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'ctr.contract.manage',
  amend: 'ctr.contract.amend',
  decide: 'ctr.contract.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'ctr.contract.registered',
  updated: 'ctr.contract.updated',
  activated: 'ctr.contract.activated',
  adjusted: 'ctr.contract.adjusted',
  renewed: 'ctr.contract.renewed',
  ended: 'ctr.contract.ended',
  terminated: 'ctr.contract.terminated',
  cancelled: 'ctr.contract.cancelled',
} as const;
