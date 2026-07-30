import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Estacionamento.**
 *
 * ⭐ **A identidade do `vis` (portaria) aplicada ao veículo:** entrada e
 * saída carimbadas PELO SERVIDOR (nunca pela tela), correção é registro
 * novo (não se rasura o carimbo). Dentro/fora é IMPLÍCITO — sem
 * status/enum: `exitedAt === null` é o "dentro".
 *
 * @see docs/canon/MODULO-PARK-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0056_park.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'park',
  name: 'Estacionamento',
  version: '0.1.0',
  summary:
    'O livro do estacionamento do shopping: veículo NEUTRO (placa/identificador texto livre), entrada e saída carimbadas pelo servidor (nunca pela tela — a prudência do vis); correção é registro novo. Tarifa opcional em texto (o tenant decide se cobra). Sem cálculo de tarifa progressiva.',

  /**
   * Vertical `shopping-centers` — Taxonomia §6, "🛍 Shopping Centers (9)",
   * capacidade *Estacionamento*.
   */
  taxonomy: { layer: 'vertical', vertical: 'shopping-centers' },

  capabilities: [{ key: 'parking', canonicalName: 'Estacionamento' }],

  /**
   * Duas mãos na cancela — registrar a entrada é uma mão (manage); fechar
   * a saída é a outra (close), como a agenda × a cancela do `vis`.
   */
  permissions: [
    {
      key: 'park.entry.manage',
      moduleId: 'park',
      description: 'Registrar a ENTRADA de um veículo — o carimbo de entrada é do servidor.',
    },
    {
      key: 'park.entry.close',
      moduleId: 'park',
      description: 'Registrar a SAÍDA de um veículo — o carimbo de saída é do servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'park.entry.registered',
        version: 1,
        description: 'Um veículo entrou — placa/identificador e o carimbo de entrada do servidor.',
      },
      {
        type: 'park.entry.closed',
        version: 1,
        description: 'Um veículo saiu — o carimbo de saída do servidor, sobre a mesma entrada.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler existe nesta onda.
     * Integração com cancela/LPR e cálculo de tarifa progressiva são futuro
     * DECLARADO na spec §5, sem handler e sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'park.entry.manage',
  close: 'park.entry.close',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'park.entry.registered',
  closed: 'park.entry.closed',
} as const;
