/**
 * Tipos puros do Módulo 70 — Certificado Digital (metadados).
 *
 * Nem banco, nem rede, nem relógio, nem UI — e, aqui, ⛔ NEM CRIPTOGRAFIA: só os
 * METADADOS de um certificado (tipo, titular, validade). Não existe, e não pode
 * existir, um campo para o arquivo .pfx, a chave privada ou uma assinatura.
 *
 * @see supabase/migrations/0085_fiscalcert.sql
 * @see docs/canon/MODULO-FISCALCERT-SPEC.md
 */

/** O ciclo do registro: `active` ↔ `archived` (a física do vendor — reversível). */
export type CertificateStatus = 'active' | 'archived';

/** Os METADADOS de um certificado. Nunca o certificado em si. */
export interface Certificate {
  readonly id: string;
  /** Tipo em texto livre (e-CNPJ, e-CPF, e-NF-e...). Obrigatório. */
  readonly certType: string;
  /** Titular em texto livre. Obrigatório. */
  readonly holder: string;
  /** Início da validade — `YYYY-MM-DD`, opcional (`null` quando ausente). */
  readonly validFrom: string | null;
  /** ⭐ Vencimento — `YYYY-MM-DD`, OBRIGATÓRIO (o dado que justifica o módulo). */
  readonly validUntil: string;
  readonly status: CertificateStatus;
  readonly note: string;
}

/** A entrada crua de um certificado novo — nasce sempre `active`. */
export interface NewCertificateInput {
  readonly certType?: unknown;
  readonly holder?: unknown;
  readonly validFrom?: unknown;
  readonly validUntil?: unknown;
  readonly note?: unknown;
}

/** Um resumo contável do acervo de certificados. */
export interface CertificateSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
