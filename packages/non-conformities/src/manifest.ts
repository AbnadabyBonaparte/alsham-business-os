import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 63 — Não Conformidades.
 *
 * `id` = `nc` (o cinto de `emit_event` confere o prefixo `nc.*`).
 * Domain `quality` (Qualidade — território NOVO do mapa). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **Abre o Domain 🧪 Qualidade** — o primeiro módulo do território.
 *
 * ⭐ **A identidade é a do `occ`** (registro imutável do desvio constatado). ⭐⭐
 * **O DIVERGE:** fechar exige a NOTA DE VERIFICAÇÃO — quem conferiu que a causa
 * foi corrigida. `open → closed` terminal; recorrência é NC nova por id solto.
 * Vínculo ao `capa` por id solto.
 *
 * @see docs/canon/MODULO-NC-SPEC.md
 * @see supabase/migrations/0078_nc.sql
 */
export const MANIFEST = {
  id: 'nc',
  name: 'Não Conformidades',
  version: '0.1.0',
  summary:
    'O registro imutável do desvio constatado — a identidade do occ: origem em texto livre (auditoria, reclamação, inspeção), descrição obrigatória, causa raiz opcional. Fechar exige a NOTA DE VERIFICAÇÃO — quem conferiu que a causa foi corrigida (o DIVERGE do occ, que encerra com um desfecho livre). open → closed é terminal; recorrência é NC nova, referenciando a antiga por id solto. O vínculo à ação corretiva do capa é por id solto. consumes VAZIO.',

  taxonomy: { layer: 'domain', domain: 'quality' },

  capabilities: [{ key: 'nc', canonicalName: 'Não conformidades' }],

  permissions: [
    {
      key: 'nc.entry.register',
      moduleId: 'nc',
      description: 'Registrar uma não conformidade — o desvio constatado, sua origem e (opcional) a causa raiz.',
    },
    {
      key: 'nc.entry.close',
      moduleId: 'nc',
      description: 'Fechar uma não conformidade com a nota de verificação — quem conferiu que a causa foi corrigida.',
    },
  ],

  events: {
    emits: [
      {
        type: 'nc.entry.registered',
        version: 1,
        description: 'Uma não conformidade foi registrada — o desvio constatado, imutável desde o instante 1.',
      },
      {
        type: 'nc.entry.closed',
        version: 1,
        description: 'A não conformidade foi fechada com a nota de verificação. Terminal — recorrência é NC nova.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  register: 'nc.entry.register',
  close: 'nc.entry.close',
} as const;

export const EVENTS = {
  registered: 'nc.entry.registered',
  closed: 'nc.entry.closed',
} as const;
