import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do Módulo 81 — Usinas (e Geração distribuída) (Plant).**
 *
 * `id` = `plant` (o cinto de `emit_event` confere o prefixo `plant.*`). ⭐ É
 * módulo VERTICAL do catálogo: `taxonomy.layer = 'vertical'`, `vertical`
 * `energy` (☀️ Energia). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ UM módulo, DUAS capacidades — *Usinas* e *Geração distribuída*. Na física
 * são o MESMO objeto: uma unidade geradora com nome, localização, capacidade
 * (kWp) e um TIPO/PORTE. A GD é uma usina de porte menor atrás do medidor; o
 * campo `plant_type` (TEXTO LIVRE, nunca enum) a distingue. É a disciplina de
 * consolidação do `esg`/`idea`/`ip`.
 *
 * ⭐ `active ↔ archived` — a física do `catalog`/`vendor`/`mall`: a usina
 * desativada que volta a operar é a MESMA (o DIVERGE do `hr`, terminal).
 *
 * @see docs/canon/MODULO-PLANT-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0096_plant.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'plant',
  name: 'Usinas',
  version: '0.1.0',
  summary:
    'O cadastro da unidade geradora de energia: nome, localização em TEXTO LIVRE, capacidade instalada em kWp (> 0) e o TIPO/PORTE em TEXTO LIVRE. ⭐⭐ UM módulo, DUAS capacidades: Usinas E Geração distribuída — na física são o MESMO objeto (a GD é uma usina de porte menor, atrás do medidor do consumidor), distinguidas pelo campo plant_type (nunca enum: cada operadora nomeia diferente — "usina centralizada", "telhado", "minigeração"). active ↔ archived (a usina desativada que volta a operar é a MESMA — a física do catalog/vendor, o DIVERGE do hr terminal). Manutenção é o mnt (asset_id solto), contrato é o ctr, geração é o genreading — todos por id solto, FORA. consumes VAZIO.',

  /**
   * ⭐ **Vertical `energy` — Taxonomia §6, "☀️ Energia (8)"**, capacidades
   * *Usinas* e *Geração distribuída*. A chave é a `VerticalKey` do `@alsham/core`
   * — a Store gradua a pill de Energia por ela (store-taxonomy `key: 'energy'`).
   */
  taxonomy: { layer: 'vertical', vertical: 'energy' },

  capabilities: [
    { key: 'power-plants', canonicalName: 'Usinas' },
    { key: 'distributed-generation', canonicalName: 'Geração distribuída' },
  ],

  permissions: [
    {
      key: 'plant.plant.manage',
      moduleId: 'plant',
      description: 'Cadastrar usinas e editar dados (nome, localização, capacidade kWp, tipo).',
    },
    {
      key: 'plant.plant.decide',
      moduleId: 'plant',
      description: 'Arquivar ou reativar uma usina — tira/põe em operação.',
    },
  ],

  events: {
    emits: [
      {
        type: 'plant.plant.registered',
        version: 1,
        description: 'Uma usina foi cadastrada (sempre ativa).',
      },
      {
        type: 'plant.plant.updated',
        version: 1,
        description: 'Os dados de uma usina mudaram.',
      },
      {
        type: 'plant.plant.archived',
        version: 1,
        description: 'A usina saiu de operação — reversível.',
      },
      {
        type: 'plant.plant.reopened',
        version: 1,
        description: 'A usina voltou a operar — a mesma usina.',
      },
    ],

    /** VAZIO por decisão de canon (Lei 7): nenhum handler de usina existe. */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'plant.plant.manage',
  decide: 'plant.plant.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'plant.plant.registered',
  updated: 'plant.plant.updated',
  archived: 'plant.plant.archived',
  reopened: 'plant.plant.reopened',
} as const;
