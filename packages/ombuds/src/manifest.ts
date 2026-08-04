import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 91 — Ouvidoria (Lei 13.460).
 *
 * `id` = `ombuds` (o cinto de `emit_event` confere o prefixo `ombuds.*`).
 * Vertical `government`. `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ **O coração é o anonimato, reaproveitado do `whistle`:** se a manifestação
 * é anônima, o cidadão NUNCA é gravado (gatilho + CHECK constraint no banco;
 * guarda puro no pacote). A confidencialidade mora na RLS — só quem tem
 * `ombuds.manifestation.handle` (a ouvidoria) lê todas as manifestações. O relato
 * nasce IMUTÁVEL; só o tratamento anda.
 *
 * ⭐ **O DIVERGE do `whistle`** (GRC, colaborador → má-conduta): aqui é cidadão →
 * órgão público. Ganha o `manifestation_type` (as 5 naturezas da Lei 13.460) e o
 * protocolo público, e os nomes do ciclo falam a Lei 13.460 (received/answered).
 *
 * @see docs/canon/MODULO-OMBUDS-SPEC.md
 * @see supabase/migrations/0106_ombuds.sql
 */
export const MANIFEST = {
  id: 'ombuds',
  name: 'Ouvidoria',
  version: '0.1.0',
  summary:
    'A Ouvidoria do cidadão (Lei 13.460): a manifestação nasce IMUTÁVEL (fato consumado) e só o tratamento anda (received → under_review → answered/dismissed, terminais, com resposta escrita). ⭐⭐ O anonimato é físico, reaproveitado do whistle: se a manifestação é anônima, o cidadão NUNCA é gravado — não é "não mostra", é NÃO GRAVA (a única forma de nunca vazar é nunca ter); ele acompanha pelo protocolo público carimbado pelo servidor. A natureza é uma das 5 da Lei 13.460 (reclamação/denúncia/sugestão/elogio/informação). A confidencialidade mora na RLS: só a ouvidoria (manifestation.handle) lê tudo. consumes VAZIO.',

  /**
   * ⭐ **Vertical `government` — Taxonomia §6, "🏛 Governo (8)"**, capacidade
   * *Ouvidoria*. Protocolo, Licitações e Fiscalização são módulos PRÓPRIOS do
   * mesmo Vertical; Convênios (→`ctr`), Patrimônio público (→`pat`), Tributos
   * (Lei 3) e Obras (→PMO) ficam DECLARADAS FORA. Ver ONDA-GOVERNO-DECISOES.
   */
  taxonomy: { layer: 'vertical', vertical: 'government' },

  capabilities: [{ key: 'ombudsman', canonicalName: 'Ouvidoria' }],

  /**
   * Duas permissões: quem SE MANIFESTA (submit) não é quem TRATA (handle). A
   * ouvidoria lê tudo e move o status; o cidadão só abre e acompanha a própria
   * manifestação NÃO-anônima. Espelha o split submit/handle do `whistle`.
   */
  permissions: [
    {
      key: 'ombuds.manifestation.submit',
      moduleId: 'ombuds',
      description: 'Registrar uma manifestação (anônima ou identificada) e acompanhar a própria, quando não-anônima.',
    },
    {
      key: 'ombuds.manifestation.handle',
      moduleId: 'ombuds',
      description: 'Tratar manifestações — a ouvidoria lê todas e move o status (analisar, responder, arquivar) com a resposta escrita.',
    },
  ],

  events: {
    emits: [
      {
        type: 'ombuds.manifestation.registered',
        version: 1,
        description: 'Uma manifestação nasceu (sempre recebida). O envelope leva SÓ metadado seguro (tipo/status/anônima/protocolo) — nunca o relato nem o cidadão.',
      },
      {
        type: 'ombuds.manifestation.reviewed',
        version: 1,
        description: 'A manifestação entrou em análise (received → under_review).',
      },
      {
        type: 'ombuds.manifestation.answered',
        version: 1,
        description: 'A manifestação foi respondida — terminal, com a resposta escrita.',
      },
      {
        type: 'ombuds.manifestation.dismissed',
        version: 1,
        description: 'A manifestação foi arquivada — terminal, com a resposta escrita.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): não há fato de outro módulo que a
     * ouvidoria precise projetar hoje. Sem handler, não se declara `consumes`.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  submit: 'ombuds.manifestation.submit',
  handle: 'ombuds.manifestation.handle',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'ombuds.manifestation.registered',
  reviewed: 'ombuds.manifestation.reviewed',
  answered: 'ombuds.manifestation.answered',
  dismissed: 'ombuds.manifestation.dismissed',
} as const;
