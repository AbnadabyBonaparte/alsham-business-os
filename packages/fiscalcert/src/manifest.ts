import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 70 — Certificado Digital (metadados).
 *
 * `id` = `fiscalcert` (o cinto de `emit_event` confere o prefixo `fiscalcert.*`).
 * Domain `accounting` (Contábil & Fiscal — território novo, o mais restrito do
 * mapa por LEI). `consumes` VAZIO (Lei 7).
 *
 * ⚠️⚠️ A Lei 3 manda: das 8 capacidades do domínio, 7 são INTEGRAÇÃO, não
 * módulo (NF-e/NFS-e/NFC-e/SPED/eSocial exigem homologação do Fisco; Apuração é
 * motor de cálculo certificado; Integração com contador é o ponto de integração
 * — o contato é o `crm`). Sobra *Certificado digital*, e só o REGISTRO DE
 * METADADOS: nunca o arquivo .pfx, nunca a chave privada, nunca a assinatura.
 *
 * ⭐ `active ↔ archived` (a física do `vendor`/`dc`): o certificado trocado é
 * arquivado, não apagado, e o registro histórico permanece consultável.
 *
 * @see docs/canon/MODULO-FISCALCERT-SPEC.md
 * @see supabase/migrations/0085_fiscalcert.sql
 */
export const MANIFEST = {
  id: 'fiscalcert',
  name: 'Certificado Digital',
  version: '0.1.0',
  summary:
    'O registro de metadados dos certificados digitais da empresa: o tipo (e-CNPJ, e-CPF, e-NF-e — texto livre), o titular e — o dado que justifica o módulo — a validade (quando vence). É um lembrete de vencimento, nunca um cofre: o arquivo .pfx, a chave privada e qualquer operação de assinatura ficam de fora (Storage do Core não construído, e uma credencial privada não passa pela Store genérica). active ↔ archived (o certificado trocado é arquivado, não apagado — a física do vendor). As outras 7 capacidades do domínio (NF-e, NFS-e, NFC-e, SPED, eSocial, Apuração, Integração com contador) são integração, não módulo (Lei 3). Alerta automático de vencimento é engine futura.',

  taxonomy: { layer: 'domain', domain: 'accounting' },

  capabilities: [{ key: 'digital-certificate', canonicalName: 'Certificado digital' }],

  permissions: [
    {
      key: 'fiscalcert.certificate.manage',
      moduleId: 'fiscalcert',
      description: 'Registrar e editar os metadados de certificados digitais.',
    },
    {
      key: 'fiscalcert.certificate.decide',
      moduleId: 'fiscalcert',
      description: 'Arquivar e reativar um registro de certificado.',
    },
  ],

  events: {
    emits: [
      { type: 'fiscalcert.certificate.registered', version: 1, description: 'Um certificado foi registrado (metadados).' },
      { type: 'fiscalcert.certificate.updated', version: 1, description: 'Os metadados de um certificado mudaram.' },
      { type: 'fiscalcert.certificate.archived', version: 1, description: 'O registro de certificado foi arquivado.' },
      { type: 'fiscalcert.certificate.restored', version: 1, description: 'O registro arquivado voltou a ativo.' },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'fiscalcert.certificate.manage',
  decide: 'fiscalcert.certificate.decide',
} as const;

export const EVENTS = {
  registered: 'fiscalcert.certificate.registered',
  updated: 'fiscalcert.certificate.updated',
  archived: 'fiscalcert.certificate.archived',
  restored: 'fiscalcert.certificate.restored',
} as const;
