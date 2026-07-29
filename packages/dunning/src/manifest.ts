import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Régua de Cobrança.**
 *
 * ⚠️ **Por que o `id` é `dun`.** "Cobrança" tem duas donas nesta plataforma:
 * a régua cobra O CLIENTE DO TENANT; `billing` cobra o tenant. `dun` (de
 * dunning, o termo internacional da régua) é curto, não disputa a palavra
 * e foi conferido por grep com fronteira de palavra: zero colisões.
 *
 * @see docs/canon/MODULO-DUN-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0027_dun.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'dun',
  name: 'Régua de Cobrança',
  version: '0.1.0',
  summary:
    'A régua que o tenant desenha para os títulos vencidos: diz o que fazer, registra que foi feito — quem, quando, por qual canal. Não envia nada; a baixa na origem tira o título sozinho.',

  /**
   * ⭐ **Domain `finance` — Taxonomia §5, "💰 Financeiro (19)"**, capacidade
   * *Cobrança*. "Régua", "dunning" e "inadimplência" não existem no mapa —
   * a tela fala régua, o manifesto fala *Cobrança*.
   */
  taxonomy: { layer: 'domain', domain: 'finance' },

  capabilities: [{ key: 'collections', canonicalName: 'Cobrança' }],

  /**
   * Duas permissões: quem DESENHA a régua não é quem executa o passo — e o
   * passo é ato com fé pública (fica carimbado e emite fato).
   */
  permissions: [
    {
      key: 'dun.ruler.design',
      moduleId: 'dun',
      description: 'Desenhar a régua: passos ordenados, dias após o vencimento, canal em texto livre.',
    },
    {
      key: 'dun.step.execute',
      moduleId: 'dun',
      description:
        'Executar um passo da régua sobre um título vencido — o ato fica registrado com quem, quando e por qual canal.',
    },
  ],

  events: {
    emits: [
      {
        type: 'dun.title.entered',
        version: 1,
        description:
          'Um título vencido e em aberto entrou na régua — decidido pelo mesmo fato que o trouxe, ou pelo primeiro passo executado.',
      },
      {
        type: 'dun.title.left',
        version: 1,
        description:
          'O título saiu da régua — baixa, cancelamento ou vencimento renegociado NA ORIGEM. A régua não segura ninguém.',
      },
      {
        type: 'dun.step.executed',
        version: 1,
        description:
          'Um passo foi executado: título, passo pelo nome, canal, dias de atraso e anotação. É o fato que uma integração de envio escutaria.',
      },
    ],

    /**
     * ⭐ **NÃO É VAZIO — e o handler EXISTE (Lei 7 do jeito certo).**
     *
     * A régua só faz sentido escutando: `dun-title.ts` traduz os fatos de
     * títulos a receber (padrão E10 — `envelope.producedBy`, payload
     * autossuficiente, idempotência por referência) e a composição os
     * entrega a `dun.record_external_receivable()`. Há teste triangular no
     * banco (`17_dun_triangle.sql`) provando o caminho inteiro — inclusive
     * que a baixa na origem tira o título da régua sozinha.
     */
    consumes: [
      {
        type: 'ar.receivable.registered',
        version: 1,
        description: 'Um título a receber nasceu — se vencido e em aberto, entra na régua.',
      },
      {
        type: 'ar.receivable.updated',
        version: 1,
        description:
          'O título mudou (recebimento, vencimento, valor) — a régua reprojetará e decide entrada/saída.',
      },
      {
        type: 'ar.receivable.cancelled',
        version: 1,
        description: 'O título foi cancelado na origem — sai da régua sozinho.',
      },
    ],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  rulerDesign: 'dun.ruler.design',
  stepExecute: 'dun.step.execute',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  titleEntered: 'dun.title.entered',
  titleLeft: 'dun.title.left',
  stepExecuted: 'dun.step.executed',
} as const;
