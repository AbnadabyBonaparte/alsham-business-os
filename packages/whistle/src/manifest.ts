import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 77 — Canal de Denúncias.
 *
 * `id` = `whistle` (o cinto de `emit_event` confere o prefixo `whistle.*`).
 * Domain `grc` (Governança, Riscos & Compliance). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ **O coração é o anonimato:** se a denúncia é anônima, o denunciante NUNCA
 * é gravado (gatilho + CHECK constraint no banco; guarda puro no pacote). A
 * confidencialidade mora na RLS — só quem tem `whistle.report.handle` (o comitê)
 * lê todas as denúncias. O relato nasce IMUTÁVEL; só o tratamento anda.
 *
 * @see docs/canon/MODULO-WHISTLE-SPEC.md
 * @see supabase/migrations/0092_whistle.sql
 */
export const MANIFEST = {
  id: 'whistle',
  name: 'Canal de Denúncias',
  version: '0.1.0',
  summary:
    'O canal de denúncias do tenant: o relato nasce IMUTÁVEL (fato consumado) e só o tratamento anda (open → under_review → resolved/dismissed, terminais, com desfecho escrito). ⭐⭐ O anonimato é físico: se a denúncia é anônima, o denunciante NUNCA é gravado — não é "não mostra", é NÃO GRAVA (a única forma de nunca vazar é nunca ter). A confidencialidade mora na RLS: só o comitê de ética (report.handle) lê todas as denúncias. consumes VAZIO.',

  /**
   * ⭐ **Domain `grc` — Taxonomia §5, "🏛 Governança, Riscos & Compliance (7)"**,
   * capacidade *Canal de denúncias*. Gestão de riscos, Controles internos,
   * Políticas, Auditorias, Compliance corporativo e Matriz de riscos são
   * capacidades PRÓPRIAS do mesmo Domain (ou homônimos de outro) — não aqui.
   */
  taxonomy: { layer: 'domain', domain: 'grc' },

  capabilities: [{ key: 'whistleblower', canonicalName: 'Canal de denúncias' }],

  /**
   * Duas permissões: quem DENUNCIA (submit) não é quem TRATA (handle). O comitê
   * de ética lê tudo e move o status; o denunciante só abre e acompanha a
   * própria denúncia NÃO-anônima.
   */
  permissions: [
    {
      key: 'whistle.report.submit',
      moduleId: 'whistle',
      description: 'Registrar uma denúncia (anônima ou identificada) e acompanhar a própria, quando não-anônima.',
    },
    {
      key: 'whistle.report.handle',
      moduleId: 'whistle',
      description: 'Tratar denúncias — o comitê de ética lê todas e move o status (analisar, resolver, arquivar) com o desfecho escrito.',
    },
  ],

  events: {
    emits: [
      {
        type: 'whistle.report.registered',
        version: 1,
        description: 'Uma denúncia nasceu (sempre aberta). O envelope leva SÓ metadado seguro — nunca o relato nem o denunciante.',
      },
      {
        type: 'whistle.report.reviewed',
        version: 1,
        description: 'A denúncia entrou em análise (open → under_review).',
      },
      {
        type: 'whistle.report.resolved',
        version: 1,
        description: 'A denúncia foi resolvida — terminal, com o desfecho escrito.',
      },
      {
        type: 'whistle.report.dismissed',
        version: 1,
        description: 'A denúncia foi arquivada — terminal, com o desfecho escrito.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): não há fato de outro módulo que o
     * canal precise projetar hoje. Sem handler, não se declara `consumes`.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  submit: 'whistle.report.submit',
  handle: 'whistle.report.handle',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'whistle.report.registered',
  reviewed: 'whistle.report.reviewed',
  resolved: 'whistle.report.resolved',
  dismissed: 'whistle.report.dismissed',
} as const;
