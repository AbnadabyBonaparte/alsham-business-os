import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 69 — Propriedade Intelectual.
 *
 * `id` = `ip` (o cinto de `emit_event` confere o prefixo `ip.*`).
 * Domain `rnd` (Pesquisa & Desenvolvimento). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ DUAS capacidades, um módulo: *Propriedade intelectual* e *Patentes* —
 * patente é UM TIPO de PI, ao lado de marca, direito autoral e segredo
 * industrial. O tipo é um CHECK das quatro categorias (física do direito).
 *
 * ⭐ O ciclo é TERMINAL e NÃO REABRE: filed → granted/rejected, granted →
 * expired (a física do proj/nc; o indeferido/expirado que volta é depósito novo).
 *
 * @see docs/canon/MODULO-IP-SPEC.md
 * @see supabase/migrations/0084_ip.sql
 */
export const MANIFEST = {
  id: 'ip',
  name: 'Propriedade Intelectual',
  version: '0.1.0',
  summary:
    'O registro de ativos de propriedade intelectual da empresa: título em texto livre e o tipo num CHECK das quatro categorias clássicas (patente, marca, direito autoral, segredo industrial) — física do direito, não vocabulário do tenant. Número de registro e data de depósito opcionais; a origem (de qual ideia ou projeto nasceu) por id solto. O ciclo é filed → granted/rejected e granted → expired, terminal e sem reabertura (o indeferido/expirado que volta é depósito novo — a física do proj/nc). Cálculo de prazo/anuidade, jurisdição e classificação ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'rnd' },

  capabilities: [
    { key: 'intellectual-property', canonicalName: 'Propriedade intelectual' },
    { key: 'patents', canonicalName: 'Patentes' },
  ],

  permissions: [
    {
      key: 'ip.asset.manage',
      moduleId: 'ip',
      description: 'Registrar ativos de PI, conceder, indeferir e expirar.',
    },
  ],

  events: {
    emits: [
      { type: 'ip.asset.registered', version: 1, description: 'Um ativo de PI foi depositado/registrado.' },
      { type: 'ip.asset.granted', version: 1, description: 'O ativo de PI foi concedido.' },
      { type: 'ip.asset.rejected', version: 1, description: 'O pedido de PI foi indeferido (terminal).' },
      { type: 'ip.asset.expired', version: 1, description: 'O direito de PI expirou (terminal).' },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'ip.asset.manage',
} as const;

export const EVENTS = {
  registered: 'ip.asset.registered',
  granted: 'ip.asset.granted',
  rejected: 'ip.asset.rejected',
  expired: 'ip.asset.expired',
} as const;
