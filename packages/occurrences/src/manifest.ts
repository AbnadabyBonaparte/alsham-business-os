import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Ocorrências.**
 *
 * ⚠️ **Por que o `id` é `occ`.** `occurrence` inteiro não caberia greppável
 * no padrão `<moduleId>.<agregado>.<fato>`; `incident` é o vocabulário de
 * UMA disciplina (TI/SRE) — a queda no corredor de uma escola não é um
 * "incident". `occ` é curto, neutro e foi conferido por grep com fronteira
 * de palavra: zero colisões.
 *
 * @see docs/canon/MODULO-OCC-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0031_occ.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'occ',
  name: 'Ocorrências',
  version: '0.1.0',
  summary:
    'O livro do que aconteceu: registro imutável do fato consumado, gravidade desenhada pelo tenant, tratativa em atos eternos e encerramento com desfecho escrito — terminal.',

  /**
   * ⭐ **Domain `operations` — Taxonomia §5, "🏭 Operações (10)"**,
   * capacidade *Ocorrências*. Segurança, Facilities e Checklist são
   * capacidades vizinhas do mesmo Domain — não entram aqui.
   */
  taxonomy: { layer: 'domain', domain: 'operations' },

  capabilities: [{ key: 'incident-log', canonicalName: 'Ocorrências' }],

  /**
   * Quatro permissões — o livro tem quatro mãos distintas: quem registra o
   * fato não desenha a régua de gravidade, não é quem trata, e não é quem
   * escreve o desfecho.
   */
  permissions: [
    {
      key: 'occ.occurrence.register',
      moduleId: 'occ',
      description: 'Registrar o fato consumado — o registro nasce imutável.',
    },
    {
      key: 'occ.occurrence.treat',
      moduleId: 'occ',
      description: 'Registrar tratativas — a cadeia de atos eternos sobre a ocorrência aberta.',
    },
    {
      key: 'occ.occurrence.close',
      moduleId: 'occ',
      description: 'Encerrar com o desfecho escrito — ato carimbado e terminal.',
    },
    {
      key: 'occ.setup.manage',
      moduleId: 'occ',
      description: 'Desenhar a régua de gravidade do tenant — nome livre e posição, nunca enum.',
    },
  ],

  events: {
    emits: [
      {
        type: 'occ.occurrence.registered',
        version: 1,
        description: 'Um fato foi registrado — relato, local, envolvidos e gravidade pelo nome.',
      },
      {
        type: 'occ.occurrence.treated',
        version: 1,
        description: 'Uma tratativa entrou na cadeia — o que foi feito, por quem, quando.',
      },
      {
        type: 'occ.occurrence.closed',
        version: 1,
        description: 'A ocorrência foi encerrada — ato carimbado, com o desfecho escrito. Terminal.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum fato alheio vira
     * ocorrência sozinho hoje. O caminho (ex.: caso do `care` escalar para
     * ocorrência) está declarado na spec §5 — exige handler completo.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  register: 'occ.occurrence.register',
  treat: 'occ.occurrence.treat',
  close: 'occ.occurrence.close',
  setup: 'occ.setup.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'occ.occurrence.registered',
  treated: 'occ.occurrence.treated',
  closed: 'occ.occurrence.closed',
} as const;
