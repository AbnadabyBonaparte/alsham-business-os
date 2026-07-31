import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 57 — Custos do Projeto (Project Costs).
 *
 * `id` = `pcost` (o cinto de `emit_event` confere o prefixo `pcost.*`).
 * Domain `pmo` (PMO & Projetos) — o MAIOR do mapa. `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `cash`/`recv`): o custo é fato
 * consumado — nasce e nunca muda; corrigir é lançar o ato inverso.
 * ⭐⭐ O DIVERGE do `fund`: NÃO há saldo nem trave — o custo entra sempre. A
 * trave, quando existir, é do `bud` genérico por id solto.
 *
 * @see docs/canon/MODULO-PCOST-SPEC.md
 * @see supabase/migrations/0072_pcost.sql
 */
export const MANIFEST = {
  id: 'pcost',
  name: 'Custos do Projeto',
  version: '0.1.0',
  summary:
    'O livro de custos de projeto da empresa: cada custo é um lançamento imutável — o projeto (id solto + nome), o valor e a moeda juntos, a categoria (texto livre, opcional) e a competência. Registrar é fato consumado; corrigir é lançar o ato inverso, nunca reescrever. NÃO há trave de saldo (o DIVERGE do fund): o módulo só narra o gasto; a trave/orçamento é do bud genérico por id solto. Rateio, plano de contas fixo e timesheet ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'pmo' },

  capabilities: [{ key: 'project-costs', canonicalName: 'Custos' }],

  permissions: [
    {
      key: 'pcost.entry.record',
      moduleId: 'pcost',
      description: 'Registrar um custo de projeto — o valor, a moeda e o projeto.',
    },
  ],

  events: {
    emits: [
      {
        type: 'pcost.entry.recorded',
        version: 1,
        description: 'Um custo de projeto foi registrado. Lançamento imutável desde o instante 1.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  record: 'pcost.entry.record',
} as const;

export const EVENTS = {
  recorded: 'pcost.entry.recorded',
} as const;
