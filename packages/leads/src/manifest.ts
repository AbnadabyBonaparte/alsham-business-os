import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Leads.**
 *
 * ⚠️ **Por que o `id` é `lead`.** Curto, greppável, o nome consagrado do
 * ofício — conferido por grep com fronteira de palavra: zero colisões
 * (`deal` é o funil; `lead` é a fila de entrada — vizinhos, nunca o mesmo).
 *
 * @see docs/canon/MODULO-LEAD-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0037_lead.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'lead',
  name: 'Leads',
  version: '0.1.0',
  summary:
    'A fila de entrada do comercial: origem em TEXTO LIVRE (o dado que a fila existe para guardar), ciclo curto com a volta à fila permitida, desfechos terminais com carimbo — e o vínculo SOLTO com a contraparte e o negócio de quem qualificou.',

  /**
   * ⭐ **Domain `crm` — Taxonomia §5, "🤝 Comercial & CRM (12)"**,
   * capacidade *Leads*. O `deal` (funil) e o `crm` (contrapartes) são os
   * vizinhos — o lead é a triagem ANTES dos dois.
   */
  taxonomy: { layer: 'domain', domain: 'crm' },

  capabilities: [{ key: 'leads', canonicalName: 'Leads' }],

  /**
   * Duas permissões — a fila tem duas mãos: quem ATENDE (criar, mover,
   * atribuir) não é quem dá o DESFECHO (qualificar, descartar com razão).
   */
  permissions: [
    {
      key: 'lead.lead.manage',
      moduleId: 'lead',
      description: 'Registrar leads, atender, devolver à fila e atribuir responsável.',
    },
    {
      key: 'lead.lead.decide',
      moduleId: 'lead',
      description: 'Qualificar (carimbando os vínculos soltos) e descartar com razão — atos terminais.',
    },
  ],

  events: {
    emits: [
      {
        type: 'lead.lead.created',
        version: 1,
        description: 'Um interesse entrou na fila — nome, origem e interesse no envelope; o contato fica.',
      },
      {
        type: 'lead.lead.updated',
        version: 1,
        description: 'O lead mudou no que é FATO: atendimento, devolução à fila, responsável, origem.',
      },
      {
        type: 'lead.lead.qualified',
        version: 1,
        description: 'Qualificado — terminal, com os vínculos soltos carimbados (contraparte, negócio).',
      },
      {
        type: 'lead.lead.discarded',
        version: 1,
        description: 'Descartado — terminal, com a razão escrita. Quem volta é lead novo.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): os vínculos do qualificado são
     * carimbados pela TELA, nunca por consumo de evento — handler sem
     * ofício seria promessa. A captura de formulário é integração declarada.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'lead.lead.manage',
  decide: 'lead.lead.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  created: 'lead.lead.created',
  updated: 'lead.lead.updated',
  qualified: 'lead.lead.qualified',
  discarded: 'lead.lead.discarded',
} as const;
