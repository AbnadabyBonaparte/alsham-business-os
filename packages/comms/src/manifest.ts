import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Comunicados.**
 *
 * ⚠️ **Por que o `id` é `comm`.** `comunicado` inteiro não é greppável no
 * padrão dos eventos; `com` é reservado demais (TLD, COM/serial). `comm` é
 * a abreviação consagrada de comunicação — conferida por grep com
 * fronteira de palavra: zero colisões (o `comment on` do SQL não tem o
 * ponto do prefixo; a matriz confere `comm.` com fronteira).
 *
 * ⚠️ **Por que o Domain é `hr`.** O mural fala com MEMBROS do tenant —
 * comunicação interna é ofício de gente, e gente é o 👥 RH. O vertical
 * Condomínios nomeia o recorte ("Comunicados" na linha dele), e a leitura
 * universal vem para o Domain — o mesmo movimento do spc com a "Reserva
 * de áreas comuns".
 *
 * @see docs/canon/MODULO-COMM-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0039_comm.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'comm',
  name: 'Comunicados',
  version: '0.1.0',
  summary:
    'O mural oficial do tenant: publicar congela a palavra dada; corrigir é comunicado novo referenciando o antigo; a ciência é ato próprio, único e eterno — e a cobertura conta quem leu enquanto a palavra esteve de pé.',

  /** ⭐ Domain `hr` — ver o argumento acima. */
  taxonomy: { layer: 'domain', domain: 'hr' },

  capabilities: [{ key: 'notices', canonicalName: 'Comunicados' }],

  /**
   * Duas permissões — o mural tem duas mãos: quem dá a palavra e quem a
   * acusa de lida (todo leitor).
   */
  permissions: [
    {
      key: 'comm.notice.manage',
      moduleId: 'comm',
      description: 'Redigir rascunhos, publicar (dar a palavra) e arquivar comunicados.',
    },
    {
      key: 'comm.notice.ack',
      moduleId: 'comm',
      description: 'Dar a PRÓPRIA ciência em comunicado publicado — ato único, carimbado, que não se retira.',
    },
  ],

  events: {
    emits: [
      {
        type: 'comm.notice.drafted',
        version: 1,
        description: 'Um comunicado nasceu no rascunho — ainda sem dar a palavra.',
      },
      {
        type: 'comm.notice.published',
        version: 1,
        description: 'A palavra foi dada — título e audiência no envelope; o corpo mora no mural.',
      },
      {
        type: 'comm.notice.archived',
        version: 1,
        description: 'Saiu do mural — a história e as ciências ficam. Terminal.',
      },
      {
        type: 'comm.notice.acked',
        version: 1,
        description: 'Um membro deu ciência — ato próprio, único, carimbado.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): a entrega ao destinatário
     * (e-mail, WhatsApp, push) é integração declarada — o módulo registra
     * o ATO de comunicar, não o transporte.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'comm.notice.manage',
  ack: 'comm.notice.ack',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  drafted: 'comm.notice.drafted',
  published: 'comm.notice.published',
  archived: 'comm.notice.archived',
  acked: 'comm.notice.acked',
} as const;
