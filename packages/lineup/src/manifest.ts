import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 95 — Programação/line-up.
 *
 * `id` = `lineup` (o cinto de `emit_event` confere o prefixo `lineup.*`).
 * Vertical `events` (🎪 Eventos). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ **A agenda é PLANO MUTÁVEL, não livro imutável:** o item de line-up se
 * edita e se APAGA (a física do `gantt`/`edcal`), sem coluna `status` e sem
 * ciclo de vida — o DIVERGE assinado do `sched`, cujo marco tem máquina de
 * estados. Por isso os fatos são só dois: `registered` (nasceu) e `updated`
 * (mudou). Não há fato de "conclusão" — o item não conclui, se edita.
 *
 * ⚠️ **Os verbos são `registered`/`updated`:** o outbox exige verbo no passado
 * terminando em `ed`, e sem underscore.
 *
 * @see docs/canon/MODULO-LINEUP-SPEC.md
 * @see supabase/migrations/0110_lineup.sql
 */
export const MANIFEST = {
  id: 'lineup',
  name: 'Programação/line-up',
  version: '0.1.0',
  summary:
    'A grade de programação de um evento: atrações/sessões/palestras com palco e horário (texto livre; horário opcional — o programa pode nascer TBD), atração/palestrante opcional e posição para a ordenação manual. Vínculo ao evento por id solto + nome carimbado. ⭐⭐ A agenda é PLANO MUTÁVEL: o item se edita e se APAGA (a física do gantt/edcal), sem status e sem ciclo de vida — o DIVERGE do sched. Ingressos, credenciamento e patrocínio ficam em outras capacidades do vertical.',

  taxonomy: { layer: 'vertical', vertical: 'events' },

  capabilities: [{ key: 'lineup', canonicalName: 'Programação/line-up' }],

  permissions: [
    {
      key: 'lineup.slot.manage',
      moduleId: 'lineup',
      description: 'Criar, editar, reordenar e remover itens da grade de programação.',
    },
  ],

  events: {
    emits: [
      {
        type: 'lineup.slot.registered',
        version: 1,
        description: 'Um item entrou na grade de programação.',
      },
      {
        type: 'lineup.slot.updated',
        version: 1,
        description: 'Um item da grade mudou (a agenda é plano — a edição é o fato).',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'lineup.slot.manage',
} as const;

export const EVENTS = {
  registered: 'lineup.slot.registered',
  updated: 'lineup.slot.updated',
} as const;
