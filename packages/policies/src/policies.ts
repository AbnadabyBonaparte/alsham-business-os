import type {
  Acknowledgement,
  NewPolicyInput,
  NewVersionInput,
  Policy,
  PolicyVersion,
  Problem,
  Validation,
  VersionStatus,
} from './types.ts';

/**
 * O motor do Módulo 37 — Políticas.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0052_pol.sql`; o pacote avisa antes, com a MESMA
 * régua, para a recusa chegar com nome em vez de erro de constraint.
 *
 * ⭐⭐ O DIVERGE do `@alsham/comms`: lá a ciência é única e eterna por
 * (comunicado, membro) — o documento é a identidade. Aqui a ciência é por
 * (VERSÃO, membro): uma versão nova nasce sem ciência nenhuma, mesmo que a
 * anterior da MESMA política já tivesse 100% de cobertura.
 */

/**
 * ⭐ Espelho de `pol.allowed_transition()` no `0052_pol.sql` — há teste que
 * lê a migration e compara. DOIS pares: publicar congela o corpo; arquivar
 * é TERMINAL — a política volta com versão NOVA, nunca reabrindo a antiga.
 */
export const VERSION_TRANSITIONS: readonly (readonly [VersionStatus, VersionStatus])[] = [
  ['draft', 'published'],
  ['published', 'archived'],
];

export function canTransitionVersion(from: VersionStatus, to: VersionStatus): boolean {
  return VERSION_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canPublish(status: VersionStatus): boolean {
  return canTransitionVersion(status, 'published');
}

export function canArchiveVersion(status: VersionStatus): boolean {
  return canTransitionVersion(status, 'archived');
}

/** Só `archived` não volta — a política segue com versão nova. */
export function isVersionTerminal(status: VersionStatus): boolean {
  return status === 'archived';
}

/** O rascunho edita-se (é plano); a palavra dada, nunca. */
export function canEditVersion(status: VersionStatus): boolean {
  return status === 'draft';
}

/**
 * ⭐ O NÚMERO de versão é CALCULADO — nunca escolhido pelo tenant. Espelho
 * de `pol.guard_version_insert()`: `max(version_no) + 1`, ou `1` se a
 * política ainda não tem nenhuma versão.
 */
export function nextVersionNo(existingVersionNos: readonly number[]): number {
  if (existingVersionNos.length === 0) return 1;
  return Math.max(...existingVersionNos) + 1;
}

/** ⭐ Publicar exige corpo — a recusa com nome, decidida aqui. */
export function whyCannotPublish(version: PolicyVersion): string | null {
  if (!canPublish(version.status)) {
    return 'Só o rascunho se publica — o corpo já foi congelado, ou a versão já saiu de circulação.';
  }
  if (version.body.trim().length === 0) {
    return 'Política sem corpo não vale: escreva antes de publicar.';
  }
  return null;
}

/**
 * ⭐⭐ A ciência: própria, única POR VERSÃO — e só na versão PUBLICADA. É
 * esta função, comparada com `whyCannotAck` do `@alsham/comms`, que prova o
 * DIVERGE: lá a chave é (comunicado, membro); aqui é (versão, membro).
 */
export function whyCannotAck(
  version: PolicyVersion,
  userId: string,
  acks: readonly Acknowledgement[],
): string | null {
  if (version.status === 'draft') {
    return 'A versão ainda não foi publicada: não há o que dar ciência.';
  }
  if (version.status === 'archived') {
    return 'Versão fora de circulação não recebe ciência nova: dê ciência da versão vigente.';
  }
  if (acks.some((a) => a.versionId === version.id && a.userId === userId)) {
    return 'Ciência não se dá duas vezes nesta versão: o que foi dado foi.';
  }
  return null;
}

export function hasAcked(
  version: PolicyVersion,
  userId: string,
  acks: readonly Acknowledgement[],
): boolean {
  return acks.some((a) => a.versionId === version.id && a.userId === userId);
}

/** A cobertura de UMA versão — contada, nunca estimada. */
export function ackCount(version: PolicyVersion, acks: readonly Acknowledgement[]): number {
  return acks.filter((a) => a.versionId === version.id).length;
}

/** As versões de uma política, mais nova primeiro — a vigente é a de maior número. */
export function orderVersions(versions: readonly PolicyVersion[]): readonly PolicyVersion[] {
  return [...versions].sort((a, b) => b.versionNo - a.versionNo);
}

/** A versão vigente de uma política: a publicada mais recente; senão o rascunho mais recente. */
export function currentVersion(versions: readonly PolicyVersion[]): PolicyVersion | null {
  const published = versions.filter((v) => v.status === 'published');
  if (published.length > 0) {
    return orderVersions(published)[0] ?? null;
  }
  const drafts = versions.filter((v) => v.status === 'draft');
  return drafts.length > 0 ? (orderVersions(drafts)[0] ?? null) : null;
}

export interface PolicySummary {
  readonly totalPolicies: number;
  readonly activePolicies: number;
  readonly archivedPolicies: number;
}

export function summarizePolicies(policies: readonly Policy[]): PolicySummary {
  let active = 0;
  let archived = 0;
  for (const p of policies) {
    if (p.status === 'active') active += 1;
    else archived += 1;
  }
  return { totalPolicies: policies.length, activePolicies: active, archivedPolicies: archived };
}

const NOME_MAX = 200;
const CORPO_MAX = 20000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Valida uma política nova — nasce ativa, sem versão nenhuma ainda. */
export function validateNewPolicy(input: NewPolicyInput): Validation<Policy> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Dê um nome à política.' });
  } else if (name.length > NOME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, value: { id: '', name: name!, status: 'active' } };
}

/**
 * Valida uma versão nova — o `versionNo` NÃO é aceito do formulário: o
 * servidor calcula (espelho de `pol.guard_version_insert()`). O corpo é
 * opcional no rascunho ("body optional at draft" — publicar é que exige).
 */
export function validateNewVersion(input: NewVersionInput): Validation<PolicyVersion> {
  const problems: Problem[] = [];

  const policyId = texto(input.policyId);
  if (policyId === null) {
    problems.push({ field: 'policyId', message: 'Informe a política.' });
  }

  let body = texto(input.body) ?? '';
  if (body.length > CORPO_MAX) {
    problems.push({ field: 'body', message: `Corpo com no máximo ${CORPO_MAX} caracteres.` });
    body = body.slice(0, CORPO_MAX);
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      policyId: policyId!,
      versionNo: 0, // ⭐ placeholder — o servidor calcula; a tela nunca decide o número.
      body,
      status: 'draft',
      publishedAt: null,
    },
  };
}
