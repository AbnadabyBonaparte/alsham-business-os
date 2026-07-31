import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 83 — Monitoramento de Geração.
 *
 * `id` = `genreading` (o cinto de `emit_event` confere o prefixo `genreading.*`).
 * ⭐ É um módulo VERTICAL: `taxonomy.layer = 'vertical'`, `vertical = 'energy'`
 * (☀️ Energia). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ REAPROVEITA A IDENTIDADE DO `esg` (Módulo 67): na física é a mesma leitura
 * periódica IMUTÁVEL (o `pcost`/`timesheet`) — nasce e nunca muda; corrigir é
 * registrar outra leitura, com nota.
 *
 * ⭐ O DIVERGE assinado do `esg`: a USINA é OBRIGATÓRIA (`plant_id NOT NULL`),
 * porque não há geração no ar — toda geração é DE UMA usina, por id solto ao
 * `plant`. O que se MANTÉM: `generated_kwh >= 0` (zero é leitura real à noite;
 * negativo é infísico) e a unidade TEXTO LIVRE.
 *
 * @see docs/canon/MODULO-GENREADING-SPEC.md
 * @see supabase/migrations/0098_genreading.sql
 */
export const MANIFEST = {
  id: 'genreading',
  name: 'Monitoramento de Geração',
  version: '0.1.0',
  summary:
    'O livro de leituras de geração: quanta energia (kWh) uma usina gerou num período. ⭐ Reaproveita a identidade do esg — leitura periódica IMUTÁVEL (duas camadas: cliente sem porta, gatilho até para o dono), sem ciclo, sem status. generated_kwh >= 0 (zero é leitura real — a usina gera zero à noite; negativo é infísico — o MANTIDO do esg). Unidade TEXTO LIVRE (kWh/MWh). O DIVERGE do esg: a usina é OBRIGATÓRIA (não há geração sem usina), por id solto ao plant. Performance ratio e alerta de queda de geração ficam FORA (motor futuro). consumes VAZIO.',

  taxonomy: { layer: 'vertical', vertical: 'energy' },

  capabilities: [{ key: 'generation-monitoring', canonicalName: 'Monitoramento de geração' }],

  permissions: [
    {
      key: 'genreading.reading.record',
      moduleId: 'genreading',
      description: 'Registrar uma leitura de geração (usina, kWh gerados, unidade, período).',
    },
  ],

  events: {
    emits: [
      {
        type: 'genreading.reading.recorded',
        version: 1,
        description: 'Uma leitura de geração foi registrada. Lançamento imutável desde o instante 1.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  record: 'genreading.reading.record',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  recorded: 'genreading.reading.recorded',
} as const;
