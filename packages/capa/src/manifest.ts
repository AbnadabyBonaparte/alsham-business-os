import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 65 — CAPA (Ações Corretivas e Preventivas).
 *
 * `id` = `capa` (o cinto de `emit_event` confere o prefixo `capa.*`).
 * Domain `quality` (🧪 Qualidade). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **O TIPO é CHECK** — `corrective` × `preventive` é a física do método,
 * não vocabulário de casa. ⭐ **O ciclo `open → verified → closed`** foi
 * escolhido de propósito: sem passar por `verified`, não fecha — a verificação
 * é o que separa a CAPA de um marco genérico. `closed` é TERMINAL. O vínculo ao
 * `nc` (Módulo 63) é por ID SOLTO.
 *
 * @see docs/canon/MODULO-CAPA-SPEC.md
 * @see supabase/migrations/0080_capa.sql
 */
export const MANIFEST = {
  id: 'capa',
  name: 'CAPA',
  version: '0.1.0',
  summary:
    'As ações corretivas e preventivas: o tipo corrective/preventive é CHECK (a física do método CAPA, não vocabulário do tenant). O ciclo é open → verified → closed — a VERIFICAÇÃO (a nota de quem confirmou que a ação funcionou) é o que a separa de um marco genérico: sem verified, não fecha. closed é terminal — uma ação que volta é ação nova. Descrição e responsável em texto livre, prazo em data, vínculo OPCIONAL à não conformidade (nc) por id solto. Eficácia por indicador (é o goal), anexo de evidência (Storage do Core) e workflow de aprovação multinível (config do tenant) ficam de fora. consumes VAZIO.',

  taxonomy: { layer: 'domain', domain: 'quality' },

  capabilities: [{ key: 'capa', canonicalName: 'CAPA' }],

  permissions: [
    {
      key: 'capa.action.manage',
      moduleId: 'capa',
      description: 'Criar e editar ações corretivas e preventivas.',
    },
    {
      key: 'capa.action.decide',
      moduleId: 'capa',
      description: 'Verificar e fechar ações — os atos que confirmam que a ação funcionou.',
    },
  ],

  events: {
    emits: [
      {
        type: 'capa.action.opened',
        version: 1,
        description: 'Uma ação corretiva/preventiva foi aberta.',
      },
      {
        type: 'capa.action.verified',
        version: 1,
        description: 'A ação foi verificada — a nota de quem confirmou que funcionou.',
      },
      {
        type: 'capa.action.closed',
        version: 1,
        description: 'A ação foi fechada. Terminal — uma ação que volta é ação nova.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'capa.action.manage',
  decide: 'capa.action.decide',
} as const;

export const EVENTS = {
  opened: 'capa.action.opened',
  verified: 'capa.action.verified',
  closed: 'capa.action.closed',
} as const;
