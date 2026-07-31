import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 79 — Resposta a Incidentes de Segurança.
 *
 * `id` = `secincident` (o cinto de `emit_event` confere o prefixo
 * `secincident.*`). Domain `infosec` (Segurança da Informação). `consumes`
 * VAZIO (Lei 7).
 *
 * ⭐⭐ **O DIVERGE assinado do `occ` (Módulo 16, Operações):** um incidente de
 * segurança NÃO é uma Ocorrência com categoria "segurança". A ocorrência é FATO
 * CONSUMADO — UM par de transição (`open → closed`) e IMUTÁVEL desde o
 * nascimento. O incidente é uma OPERAÇÃO de resposta que se conduz: a TIMELINE
 * NIST de CINCO estados (`detected → contained → eradicated → recovered →
 * closed`, + o atalho de falso-positivo `detected → closed`), e EDITÁVEL
 * enquanto aberto, congelando no fechamento (a física do `risk`). ⭐ Os campos
 * PRÓPRIOS que o `occ` não tem: `attack_vector` e `affected_data` (texto
 * livre), `severity` 1–5. A resposta é livro IMUTÁVEL de atos (a tratativa do
 * `occ` — o MANTIDO, de propósito).
 *
 * @see docs/canon/MODULO-SECINCIDENT-SPEC.md
 * @see supabase/migrations/0094_secincident.sql
 */
export const MANIFEST = {
  id: 'secincident',
  name: 'Resposta a Incidentes',
  version: '0.1.0',
  summary:
    'O registro e a condução de incidentes de segurança dos sistemas do tenant: título e descrição em texto livre, os campos PRÓPRIOS attack_vector (como entraram) e affected_data (o que foi comprometido), e a severity na régua 1–5 (física do método). A timeline é o ciclo NIST — detected → contained → eradicated → recovered → closed, com o atalho de falso-positivo detected → closed; closed é TERMINAL. O DIVERGE assinado do occ (Módulo 16): a ocorrência é FATO CONSUMADO (1 par, imutável desde o nascimento); o incidente é uma OPERAÇÃO de resposta (5 estados) editável enquanto aberto e congelada no fechamento (a física do risk). A resposta é livro IMUTÁVEL de atos (a tratativa do occ — o MANTIDO). consumes VAZIO.',

  taxonomy: { layer: 'domain', domain: 'infosec' },

  capabilities: [{ key: 'incident-response', canonicalName: 'Resposta a incidentes' }],

  permissions: [
    {
      key: 'secincident.incident.manage',
      moduleId: 'secincident',
      description: 'Registrar e editar incidentes, conduzir a timeline (conter, erradicar, recuperar, fechar) e registrar ações de resposta.',
    },
  ],

  events: {
    emits: [
      {
        type: 'secincident.incident.registered',
        version: 1,
        description: 'Um incidente de segurança nasceu (sempre detectado).',
      },
      {
        type: 'secincident.incident.contained',
        version: 1,
        description: 'O incidente foi contido — a ameaça deixou de se espalhar.',
      },
      {
        type: 'secincident.incident.eradicated',
        version: 1,
        description: 'A causa do incidente foi erradicada dos sistemas.',
      },
      {
        type: 'secincident.incident.recovered',
        version: 1,
        description: 'Os sistemas afetados foram recuperados à operação normal.',
      },
      {
        type: 'secincident.incident.closed',
        version: 1,
        description: 'O incidente foi encerrado com a nota de encerramento. Terminal — o que recorre é incidente novo.',
      },
      {
        type: 'secincident.action.recorded',
        version: 1,
        description: 'Um passo da timeline de resposta foi registrado — ato imutável.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'secincident.incident.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'secincident.incident.registered',
  contained: 'secincident.incident.contained',
  eradicated: 'secincident.incident.eradicated',
  recovered: 'secincident.incident.recovered',
  closed: 'secincident.incident.closed',
  recorded: 'secincident.action.recorded',
} as const;
