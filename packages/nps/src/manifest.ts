import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Pesquisas.**
 *
 * ⚠️ **Por que o `id` é `nps`.** É o nome mundial do método — greppável
 * com fronteira (`nps.`), três letras, zero colisões na frota. "pesquisa"
 * é prosa constante do canon (pesquisa de mercado, pesquisar) e não
 * serviria de prefixo.
 *
 * ⚠️ **Por que o Domain é `cx`.** A Taxonomia §5 põe *Pesquisas NPS/CSAT*
 * na linha do 💬 Atendimento ao Cliente — a mesma linha do care: o care
 * escuta o cliente que reclama; o nps pergunta ao que não reclamou.
 *
 * ⛔ **ANON = NADA, sem exceção:** o link público de resposta é integração
 * FUTURA declarada (coletor externo → API com chave, o padrão da Forja).
 * Hoje quem registra a resposta é operador logado.
 *
 * @see docs/canon/MODULO-NPS-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0042_nps.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'nps',
  name: 'Pesquisas',
  version: '0.1.0',
  summary:
    'A voz do cliente em rodadas de medição: a pergunta é do tenant e a régua 0–10 é do método; cada resposta é ato imutável no livro; o placar (%promotores − %detratores) é sempre calculado, nunca guardado; e a rodada fechada não reabre — a que volta é pesquisa nova.',

  /** ⭐ Domain `cx` — ver o argumento acima. */
  taxonomy: { layer: 'domain', domain: 'cx' },

  capabilities: [{ key: 'surveys', canonicalName: 'Pesquisas NPS/CSAT' }],

  /**
   * Duas permissões — duas mãos: quem conduz a MEDIÇÃO (redigir, abrir,
   * encerrar) e quem REGISTRA a voz do cliente no livro.
   */
  permissions: [
    {
      key: 'nps.survey.manage',
      moduleId: 'nps',
      description: 'Redigir rodadas, abrir a coleta (congela a pergunta) e encerrar a medição. Terminal.',
    },
    {
      key: 'nps.response.record',
      moduleId: 'nps',
      description: 'Registrar uma resposta na rodada ABERTA — ato imutável, nota 0–10, carimbado pelo servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'nps.survey.drafted',
        version: 1,
        description: 'Uma rodada nasceu no rascunho — a pergunta ainda é plano.',
      },
      {
        type: 'nps.survey.opened',
        version: 1,
        description: 'A coleta abriu — a pergunta congelou.',
      },
      {
        type: 'nps.survey.closed',
        version: 1,
        description: 'A medição encerrou — o placar está lido. Terminal.',
      },
      {
        type: 'nps.response.recorded',
        version: 1,
        description: 'Uma voz entrou no livro — a NOTA no envelope; comentário e respondente ficam em casa.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): o coletor externo (link
     * público) é integração futura via API com chave — e meta de NPS é o
     * módulo goal, com ponte de id solto pela tela, nunca handler.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'nps.survey.manage',
  record: 'nps.response.record',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  drafted: 'nps.survey.drafted',
  opened: 'nps.survey.opened',
  closed: 'nps.survey.closed',
  recorded: 'nps.response.recorded',
} as const;
