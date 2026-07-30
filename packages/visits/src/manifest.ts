import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Visitas.**
 *
 * ⚠️ **Por que o `id` é `vis`.** `visits`/`visit` inteiros não são o padrão
 * da casa (ids curtos, greppáveis); `vis` é a abreviação natural —
 * conferida por grep com fronteira de palavra: zero colisões.
 *
 * ⚠️ **Por que o Domain é `operations` e não `crm`.** A Taxonomia lista
 * *Visitas* também no Domain CRM — mas AQUELA é a visita comercial do
 * vendedor (vocabulário do 360° PRIMA: follow-up, ligação, visita). O livro
 * da PORTARIA é operação — vizinho de *Segurança* e *Facilities*. Sol
 * Único: uma palavra, dois ofícios — este módulo é o da cancela.
 *
 * @see docs/canon/MODULO-VIS-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0036_vis.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'vis',
  name: 'Visitas',
  version: '0.1.0',
  summary:
    'O livro da portaria: visitante neutro, destino em texto livre, entrada e saída carimbadas pelo servidor, agendamento opcional antes — e o registro que não se rasura: corrigir é registrar de novo, apontando o errado.',

  /**
   * ⭐ **Domain `operations`** — a portaria é operação (vizinha de
   * *Segurança*); a *Visitas* do CRM é a visita do vendedor. Ver acima.
   */
  taxonomy: { layer: 'domain', domain: 'operations' },

  capabilities: [{ key: 'visitor-log', canonicalName: 'Visitas' }],

  /**
   * Duas permissões — a portaria tem duas mãos: quem AGENDA (a recepção, o
   * anfitrião) não é quem opera a CANCELA (entrada, saída, não veio).
   */
  permissions: [
    {
      key: 'vis.visit.register',
      moduleId: 'vis',
      description: 'Operar a cancela: registrar entrada (walk-in), saída e o não-comparecimento.',
    },
    {
      key: 'vis.visit.schedule',
      moduleId: 'vis',
      description: 'Agendar visitas e desmarcá-las com razão escrita.',
    },
  ],

  events: {
    emits: [
      {
        type: 'vis.visit.scheduled',
        version: 1,
        description: 'Uma visita foi agendada — nome e destino no envelope; o documento fica na portaria.',
      },
      {
        type: 'vis.visit.arrived',
        version: 1,
        description: 'O visitante entrou — carimbo do servidor no ato.',
      },
      {
        type: 'vis.visit.departed',
        version: 1,
        description: 'O visitante saiu — o segundo carimbo fecha a passagem. Terminal.',
      },
      {
        type: 'vis.visit.missed',
        version: 1,
        description: 'O agendado não veio — observação da cancela. Terminal.',
      },
      {
        type: 'vis.visit.cancelled',
        version: 1,
        description: 'O agendamento foi desmarcado — com a razão escrita. Terminal.',
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
  register: 'vis.visit.register',
  schedule: 'vis.visit.schedule',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  scheduled: 'vis.visit.scheduled',
  arrived: 'vis.visit.arrived',
  departed: 'vis.visit.departed',
  missed: 'vis.visit.missed',
  cancelled: 'vis.visit.cancelled',
} as const;
