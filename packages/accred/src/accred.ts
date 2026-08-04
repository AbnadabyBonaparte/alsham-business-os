import type {
  Checkin,
  Credential,
  CredentialStatus,
  NewCheckinInput,
  NewCredentialInput,
  Problem,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 94 — Credenciamento & Check-in.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0109_accred.sql`; o pacote avisa antes, com a MESMA
 * régua, para a recusa chegar com nome em vez de erro de constraint.
 */

// -----------------------------------------------------------------------------
// A CREDENCIAL — espelho de accred.allowed_transition() no 0109_accred.sql
// -----------------------------------------------------------------------------

/**
 * ⭐ Espelho de `accred.allowed_transition()` — há teste que lê a migration e
 * compara. `active ↔ revoked`: a credencial volta do bloqueio (a física do
 * catalog/vendor, com os nomes do domínio). O CHECK-IN não tem transição
 * nenhuma — é ato pontual imutável.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [CredentialStatus, CredentialStatus])[] = [
  ['active', 'revoked'],
  ['revoked', 'active'],
];

export function canTransitionCredential(from: CredentialStatus, to: CredentialStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/**
 * A recusa do check-in, com nome — a mesma física do gatilho
 * `accred.guard_checkin_insert()`: só credencial ATIVA passa no portão.
 */
export function whyCannotCheckIn(credential: Credential): string | null {
  if (credential.status !== 'active') {
    return `Check-in só com credencial ativa (esta está ${credential.status}): validar a credencial no portão é o próprio ato.`;
  }
  return null;
}

// -----------------------------------------------------------------------------
// RESUMOS — sem inventar número (Lei 7)
// -----------------------------------------------------------------------------

export interface CredentialSummary {
  readonly total: number;
  readonly active: number;
  readonly revoked: number;
}

export function summarizeCredentials(credentials: readonly Credential[]): CredentialSummary {
  let active = 0;
  let revoked = 0;
  for (const c of credentials) {
    if (c.status === 'active') active += 1;
    else revoked += 1;
  }
  return { total: credentials.length, active, revoked };
}

// -----------------------------------------------------------------------------
// VALIDAÇÃO — o mínimo honesto (Regra de Ouro: a régua vive aqui, não na tela)
// -----------------------------------------------------------------------------

const NOME_MAX = 200;
const TIPO_MAX = 200;
const NIVEL_MAX = 200;
const NOTA_MAX = 2000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma credencial nova. Evento (id solto), portador e tipo são
 * obrigatórios; nível de acesso é opcional.
 */
export function validateNewCredential(input: NewCredentialInput): Validation<Credential> {
  const problems: Problem[] = [];

  const eventId = texto(input.eventId);
  if (eventId === null) {
    problems.push({ field: 'eventId', message: 'Informe o evento (id).' });
  }

  const holderName = texto(input.holderName);
  if (holderName === null) {
    problems.push({ field: 'holderName', message: 'Informe o nome do portador.' });
  } else if (holderName.length > NOME_MAX) {
    problems.push({ field: 'holderName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  const credentialType = texto(input.credentialType);
  if (credentialType === null) {
    problems.push({ field: 'credentialType', message: 'Informe o tipo de credencial.' });
  } else if (credentialType.length > TIPO_MAX) {
    problems.push({ field: 'credentialType', message: `Tipo com no máximo ${TIPO_MAX} caracteres.` });
  }

  let accessLevel = texto(input.accessLevel) ?? '';
  if (accessLevel.length > NIVEL_MAX) {
    problems.push({ field: 'accessLevel', message: `Nível de acesso com no máximo ${NIVEL_MAX} caracteres.` });
    accessLevel = accessLevel.slice(0, NIVEL_MAX);
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      eventId: eventId!,
      holderName: holderName!,
      credentialType: credentialType!,
      accessLevel,
      status: 'active',
    },
  };
}

/** Valida um check-in novo. Só a credencial é obrigatória; a nota é opcional. */
export function validateNewCheckin(input: NewCheckinInput): Validation<Checkin> {
  const problems: Problem[] = [];

  const credentialId = texto(input.credentialId);
  if (credentialId === null) {
    problems.push({ field: 'credentialId', message: 'Informe a credencial.' });
  }

  let note = texto(input.note) ?? '';
  if (note.length > NOTA_MAX) {
    problems.push({ field: 'note', message: `Nota com no máximo ${NOTA_MAX} caracteres.` });
    note = note.slice(0, NOTA_MAX);
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    // ⭐ `checkedInAt` fica vazio: o carimbo é do servidor, nunca da tela.
    value: { id: '', credentialId: credentialId!, checkedInAt: '', note },
  };
}
