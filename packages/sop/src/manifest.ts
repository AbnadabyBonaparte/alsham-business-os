import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 49 — S&OP / Rodadas de Consenso.
 *
 * `id` = `sop` (o cinto de `emit_event` confere o prefixo `sop.*`).
 * Domain `supply-chain` (Supply Chain) — território SEPARADO de Compras
 * (Taxonomia §5). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **Duas permissões, e é esse o ponto.** `sop.round.manage` desenha a rodada;
 * `sop.round.approve` fecha o consenso — papel mais sênior, tipicamente OUTRO
 * do que quem desenha o plano de demanda. Aprovar é o carimbo de governança, e
 * o consenso é REGISTRADO por gente, não calculado (a reconciliação automática
 * de áreas fica FORA — Lei 7).
 *
 * @see docs/canon/MODULO-SOP-SPEC.md
 * @see supabase/migrations/0064_sop.sql
 */
export const MANIFEST = {
  id: 'sop',
  name: 'S&OP / Rodadas de Consenso',
  version: '0.1.0',
  summary:
    'A rodada de consenso de S&OP por período (texto livre — "Q1 2027"), que referencia um plano de demanda por id SOLTO + nome carimbado. Nasce rascunho; APROVAR fecha o consenso e é terminal — a próxima rodada é rodada nova. Aprovar é permissão SEPARADA de quem desenha (papel mais sênior). O consenso é registrado por gente: reconciliação automática de vendas × produção × finanças fica de fora.',

  taxonomy: { layer: 'domain', domain: 'supply-chain' },

  capabilities: [{ key: 'sop', canonicalName: 'S&OP' }],

  permissions: [
    {
      key: 'sop.round.manage',
      moduleId: 'sop',
      description: 'Criar e editar a rodada em rascunho, vincular o plano de demanda e cancelar.',
    },
    {
      key: 'sop.round.approve',
      moduleId: 'sop',
      description: 'Aprovar o consenso da rodada — o carimbo de governança, papel mais sênior do que desenhar.',
    },
  ],

  events: {
    emits: [
      {
        type: 'sop.round.registered',
        version: 1,
        description: 'Uma rodada de consenso nasceu (sempre em rascunho).',
      },
      {
        type: 'sop.round.approved',
        version: 1,
        description: 'O consenso da rodada foi aprovado — carimbado pelo servidor. Terminal.',
      },
      {
        type: 'sop.round.cancelled',
        version: 1,
        description: 'A rodada foi abandonada, com razão. Terminal.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'sop.round.manage',
  approve: 'sop.round.approve',
} as const;

export const EVENTS = {
  registered: 'sop.round.registered',
  approved: 'sop.round.approved',
  cancelled: 'sop.round.cancelled',
} as const;
