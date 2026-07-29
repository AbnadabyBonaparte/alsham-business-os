import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Eventos.**
 *
 * ⚠️ **Por que o `id` é `evt`, e não `event` nem `events`.** "Evento" já
 * significa OUTRA COISA no coração desta plataforma: `core.event_outbox`,
 * `emit_event()`, `EventEnvelope`, a capacidade "APIs & Eventos" do Core.
 * Um módulo chamado `event` faria a palavra querer dizer duas coisas no
 * mesmo repositório — o argumento exato que derrubou `os` no Módulo 7.
 * Sol Único. `evt.` conferido por grep com fronteira de palavra: zero
 * colisões.
 *
 * ⚠️ **E o Domain é `marketing`, NÃO o vertical `events`.** Este módulo é o
 * evento UNIVERSAL — a feira, o workshop, a inauguração, o culto — que
 * qualquer empresa organiza; a Taxonomia §5 lista *Eventos* como capacidade
 * do Domain Marketing. O vertical 🎪 Eventos (Events OS™) é o OFÍCIO de quem
 * vive de evento: ingresso, credenciamento, line-up, patrocínio. "A peça
 * universal desce para o Domain; a vertical fica só com o ofício"
 * (Taxonomia §1). A cor `--bos-v-events` é DO VERTICAL — este módulo usa a
 * pele obsidian+ouro como todo Domain.
 *
 * @see docs/canon/MODULO-EVT-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0026_evt.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'evt',
  name: 'Eventos',
  version: '0.1.0',
  summary:
    'O evento universal do tenant: nome, quando, onde em texto livre, inscrições com contato neutro, presença como ato registrado e lotação honesta.',

  taxonomy: { layer: 'domain', domain: 'marketing' },

  /**
   * **Uma capacidade. Uma só.** As outras doze do Domain Marketing —
   * Campanhas já é o Módulo 2; Social media, Calendário, E-mail marketing…
   * — seguem onde estão. E ⛔ NADA do ofício do vertical entra aqui:
   * ingresso, credenciamento, check-in por QR, line-up, patrocínio são o
   * perigo da pedreira (events-os) — cada engine de lá é tentação de
   * declarar capacidade não construída.
   */
  capabilities: [{ key: 'events', canonicalName: 'Eventos' }],

  /**
   * Três permissões: quem monta o evento não é quem DECIDE publicá-lo (o
   * compromisso público), e a lista de quem vem tem mão própria.
   */
  permissions: [
    {
      key: 'evt.event.manage',
      moduleId: 'evt',
      description: 'Criar e editar eventos — nome, quando, onde, capacidade.',
    },
    {
      key: 'evt.event.decide',
      moduleId: 'evt',
      description:
        'Decidir sobre o evento: publicar (abrir a lista), registrar como realizado e cancelar.',
    },
    {
      key: 'evt.registration.manage',
      moduleId: 'evt',
      description:
        'Inscrever, confirmar, cancelar inscrições e registrar presença — a presença carimba quem e quando.',
    },
  ],

  events: {
    /**
     * ⭐ O payload é AUTOSSUFICIENTE: a inscrição leva o evento pelo NOME e
     * pela data — quem escuta não faz join. É este módulo que o marketing
     * de shopping vive: a esteira do `ops` produz as peças DO evento sem os
     * dois módulos se conhecerem — o vínculo, quando existir, será por
     * consumo de fato, nunca por import.
     */
    emits: [
      {
        type: 'evt.event.registered',
        version: 1,
        description: 'Um evento nasceu (rascunho), com nome, quando e onde em texto livre.',
      },
      {
        type: 'evt.event.updated',
        version: 1,
        description: 'Mudou fato do evento: nome, datas, local ou capacidade.',
      },
      {
        type: 'evt.event.published',
        version: 1,
        description: 'O evento foi publicado — a lista de inscrições abriu. Não volta a rascunho.',
      },
      {
        type: 'evt.event.held',
        version: 1,
        description: 'O evento foi registrado como REALIZADO — só depois de ter começado.',
      },
      {
        type: 'evt.event.cancelled',
        version: 1,
        description: 'O evento foi cancelado — o fato que todo inscrito pode escutar. Nunca DELETE.',
      },
      {
        type: 'evt.registration.registered',
        version: 1,
        description: 'Alguém se inscreveu — só em evento publicado, e a lotação recusa além do teto.',
      },
      {
        type: 'evt.registration.confirmed',
        version: 1,
        description: 'A inscrição foi confirmada.',
      },
      {
        type: 'evt.registration.cancelled',
        version: 1,
        description: 'A inscrição foi cancelada — a linha fica: a desistência é história do evento.',
      },
      {
        type: 'evt.registration.attended',
        version: 1,
        description: 'A presença foi registrada — ATO carimbado com quem e quando, pelo servidor.',
      },
    ],

    /**
     * **Vazio, e é Lei 7.** A integração com a esteira (`ops` produz as
     * peças do evento) e com o funil (o evento gera negociações) são
     * consumos possíveis de AMANHÃ — sem handler, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  eventManage: 'evt.event.manage',
  eventDecide: 'evt.event.decide',
  registrationManage: 'evt.registration.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  eventRegistered: 'evt.event.registered',
  eventUpdated: 'evt.event.updated',
  eventPublished: 'evt.event.published',
  eventHeld: 'evt.event.held',
  eventCancelled: 'evt.event.cancelled',
  registrationRegistered: 'evt.registration.registered',
  registrationConfirmed: 'evt.registration.confirmed',
  registrationCancelled: 'evt.registration.cancelled',
  registrationAttended: 'evt.registration.attended',
} as const;
