/**
 * Tipos do Módulo 94 — Credenciamento & Check-in.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐ Um schema, duas capacidades: a CREDENCIAL (cadastro revogável, com ciclo
 * `active ↔ revoked`) e o CHECK-IN (ato pontual imutável, sem status). O
 * evento é ID SOLTO (`eventId`) — sem FK cruzada, a Lei do Lego. Tipo de
 * credencial e nível de acesso são TEXTO LIVRE — o vocabulário é do evento.
 *
 * @see supabase/migrations/0109_accred.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-ACCRED-SPEC.md — o fluxo de negócio
 */

export type CredentialStatus = 'active' | 'revoked';

export interface Credential {
  readonly id: string;
  /** ID SOLTO — o evento do módulo evt, sem FK cruzada. */
  readonly eventId: string;
  readonly holderName: string;
  /** Texto livre: participante/imprensa/staff/palestrante — vocabulário do evento. */
  readonly credentialType: string;
  /** Texto livre OPCIONAL: pista/backstage/vip. */
  readonly accessLevel: string;
  readonly status: CredentialStatus;
}

export interface NewCredentialInput {
  readonly eventId?: unknown;
  readonly holderName?: unknown;
  readonly credentialType?: unknown;
  readonly accessLevel?: unknown;
}

/**
 * O check-in — ato pontual imutável. NÃO tem status: nasce pronto e não muda.
 * `checkedInAt`/`checkedInBy` são carimbados pelo servidor; a tela nunca os
 * escolhe.
 */
export interface Checkin {
  readonly id: string;
  readonly credentialId: string;
  readonly checkedInAt: string;
  readonly note: string;
}

export interface NewCheckinInput {
  readonly credentialId?: unknown;
  readonly note?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
