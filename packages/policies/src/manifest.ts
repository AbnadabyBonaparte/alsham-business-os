import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Políticas.**
 *
 * ⚠️ **Por que o `id` é `pol`.** `policy`/`policies` colide em prosa com a
 * *Políticas* de GRC (o homônimo declarado abaixo); `pol` é curto,
 * greppável (fronteira de palavra: `pol.` não colide com nenhum prefixo
 * existente) e nomeia o Domain sem se apropriar da palavra inteira.
 *
 * ⚠️ **Por que o Domain é `hr`.** A política interna de pessoal (código de
 * conduta, home office, uso de equipamento) fala com MEMBROS do tenant —
 * é ofício de gente, como o `comm` (Comunicados). A *Políticas* de GRC
 * (compliance corporativo) é o HOMÔNIMO declarado — matéria distinta, não
 * construída aqui.
 *
 * ⭐⭐ **O DIVERGE do `comm` — a razão de existir deste módulo.** No `comm`
 * publicar congela; a ciência é ÚNICA e ETERNA por DOCUMENTO. Aqui, a
 * política tem VERSÃO — a ciência é por (política, VERSÃO). Publicar uma
 * versão nova exige que quem deu ciência da anterior dê ciência DE NOVO.
 * É isto que o torna diferente do `comm`, não uma cópia.
 *
 * @see docs/canon/MODULO-POL-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0052_pol.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'pol',
  name: 'Políticas',
  version: '0.1.0',
  summary:
    'As políticas internas do tenant que os membros dão ciência — e o que a diferencia do mural: política tem VERSÃO. Publicar uma versão congela o corpo; a ciência é por (política, versão) — uma versão nova exige ciência de novo. Versão arquivada é terminal; a política volta com versão nova, nunca reabrindo a antiga.',

  /** ⭐ Domain `hr` — ver o argumento acima. */
  taxonomy: { layer: 'domain', domain: 'hr' },

  capabilities: [{ key: 'policies', canonicalName: 'Políticas' }],

  /**
   * Duas permissões — quem redige/publica/arquiva versões, e quem dá a
   * PRÓPRIA ciência de uma versão publicada.
   */
  permissions: [
    {
      key: 'pol.policy.manage',
      moduleId: 'pol',
      description: 'Redigir políticas, publicar versões (congela o corpo) e arquivar versões.',
    },
    {
      key: 'pol.policy.ack',
      moduleId: 'pol',
      description: 'Dar a PRÓPRIA ciência de uma VERSÃO publicada — ato único por versão, carimbado, que não se retira.',
    },
  ],

  events: {
    emits: [
      {
        type: 'pol.version.drafted',
        version: 1,
        description: 'Uma versão de política nasceu no rascunho.',
      },
      {
        type: 'pol.version.published',
        version: 1,
        description: 'Uma versão foi publicada — o corpo congela; quem deu ciência da anterior precisa dar de novo.',
      },
      {
        type: 'pol.version.archived',
        version: 1,
        description: 'Uma versão saiu de circulação. Terminal.',
      },
      {
        type: 'pol.version.acknowledged',
        version: 1,
        description: 'Um membro deu ciência de uma versão — ato próprio, único por versão, carimbado.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler de Políticas
     * existe nesta onda. Distribuição/e-mail e assinatura eletrônica com
     * validade jurídica são futuro DECLARADO na spec §5, sem handler e
     * sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'pol.policy.manage',
  ack: 'pol.policy.ack',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  drafted: 'pol.version.drafted',
  published: 'pol.version.published',
  archived: 'pol.version.archived',
  acknowledged: 'pol.version.acknowledged',
} as const;
