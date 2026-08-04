import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 99 — Comissões (Vertical Beleza).
 *
 * `id` = `commission` (o cinto de `emit_event` confere o prefixo
 * `commission.*`). ⭐ Módulo VERTICAL da Beleza: `taxonomy.layer = 'vertical'`,
 * `vertical = 'beauty'`. `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `timesheet`/`pcost`/`loyalty`): a
 * comissão é fato consumado — nasce e nunca muda; corrigir é lançar o ato
 * inverso.
 * ⚠️ **NÃO é motor de cálculo (Lei 7):** o valor da comissão
 * (`commission_amount_cents`) é REGISTRADO por quem lança, nunca derivado de
 * uma regra de percentual. O `base_amount_cents` (o preço do serviço sobre o
 * qual a comissão foi combinada) é apenas INFORMATIVO — o sistema não
 * multiplica.
 *
 * @see docs/canon/MODULO-COMMISSION-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0114_commission.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'commission',
  name: 'Comissões',
  version: '0.1.0',
  summary:
    'O livro de comissões do salão: cada lançamento é imutável — o profissional (id solto + nome carimbado), o serviço (texto livre), o valor da comissão (registrado, nunca calculado por regra de %), o valor-base informativo do serviço e o dia. Registrar é fato consumado; corrigir é lançar o ato inverso, nunca reescrever. NÃO é motor de cálculo (Lei 7): quem lança declara o valor. Cadastro de profissional, regra de % por serviço, apuração/fechamento de comissão e pagamento ficam de fora (é o professional, o cash/ap genérico e capacidades futuras).',

  /**
   * ⭐ Vertical `beauty` — Taxonomia §6, "💇 Beleza & Estética", capacidade
   * *Comissões*.
   */
  taxonomy: { layer: 'vertical', vertical: 'beauty' },

  capabilities: [{ key: 'commissions', canonicalName: 'Comissões' }],

  permissions: [
    {
      key: 'commission.commission.record',
      moduleId: 'commission',
      description:
        'Registrar uma comissão — o profissional, o serviço, o valor da comissão e o dia. Lançamento imutável.',
    },
  ],

  events: {
    emits: [
      {
        type: 'commission.commission.registered',
        version: 1,
        description:
          'Uma comissão foi registrada. Lançamento imutável desde o instante 1 — profissional, serviço e valores.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): projetar a comissão a partir de uma
     * venda/serviço de outro módulo, ou gerar título a pagar, é integração
     * futura, declarada FORA na spec §5 — sem handler, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  record: 'commission.commission.record',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'commission.commission.registered',
} as const;
