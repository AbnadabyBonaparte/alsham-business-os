import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Pacotes.**
 *
 * ⚠️ **Por que o `id` é `pack`.** Curto, greppável, e neutro — e NÃO é palavra
 * reservada do PostgreSQL (seguro como nome de schema). ⭐⭐ É o Módulo 100 do
 * catálogo — a peça que fecha a campanha "rumo aos 100 módulos". Módulo
 * VERTICAL da Beleza: `taxonomy.layer = 'vertical'`, `vertical = 'beauty'`.
 *
 * @see docs/canon/MODULO-PACK-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0115_pack.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'pack',
  name: 'Pacotes',
  version: '0.1.0',
  summary:
    'O pacote fechado de sessões: o cliente compra N sessões de um serviço (texto livre), cada visita consome uma do livro imutável de usos, o saldo é VIEW (total − usos, nunca coluna) e consumir mais que o saldo é RECUSADO (a física do loyalty/invest). O DIVERGE do loyalty: o pacote é amarrado a UM serviço e UM cliente com identidade de compra própria (o total congela), não uma carteira fungível. Cliente por id solto ao crm. consumes VAZIO.',

  /**
   * ⭐ Vertical `beauty` — Taxonomia §6, "💇 Beleza & Estética", capacidade
   * *Pacotes*.
   */
  taxonomy: { layer: 'vertical', vertical: 'beauty' },

  capabilities: [{ key: 'packages', canonicalName: 'Pacotes' }],

  /**
   * ⭐ Duas permissões, divididas por TABELA (como no sponsor/lease):
   * `package.manage` registra a COMPRA do pacote (a trave); `session.record`
   * registra o USO de uma sessão. Vender o pacote e dar baixa numa visita são
   * ofícios diferentes (o balcão × a cadeira).
   */
  permissions: [
    {
      key: 'pack.package.manage',
      moduleId: 'pack',
      description: 'Registrar a compra de um pacote (cliente por id solto, serviço em texto livre e o total de sessões).',
    },
    {
      key: 'pack.session.record',
      moduleId: 'pack',
      description: 'Dar baixa numa sessão do pacote — um uso, ato imutável carimbado pelo servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'pack.package.registered',
        version: 1,
        description: 'Um pacote foi comprado — cliente por id solto, serviço e total de sessões no envelope.',
      },
      {
        type: 'pack.session.used',
        version: 1,
        description: 'Uma sessão do pacote foi consumida — ato pontual imutável.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): gerar título a receber (`ar`) por
     * sessão, ou puxar o nome do cliente do `crm`, é integração futura,
     * declarada FORA na spec §5 — sem handler, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  packageManage: 'pack.package.manage',
  sessionRecord: 'pack.session.record',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  packageRegistered: 'pack.package.registered',
  sessionUsed: 'pack.session.used',
} as const;
