import type {
  Inspection,
  NewInspection,
  NewInspectionInput,
  NewTargetInput,
  Problem,
  Target,
  TargetStatus,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 93 — Fiscalização.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0108_fisc.sql`; o pacote avisa antes, com a MESMA
 * régua.
 */

/**
 * ⭐ Espelho de `fisc.allowed_transition()` no `0108_fisc.sql` — há teste que
 * lê a migration e compara. `active ↔ archived`: o ALVO é o ESTABELECIMENTO,
 * e ele volta do arquivo (física do `sec`/`mall`).
 *
 * ⭐⭐ Note a ausência: NÃO existe `INSPECTION_TRANSITIONS`. A vistoria não tem
 * ciclo de vida — é ato pontual, imutável desde o instante em que nasce.
 */
export const TARGET_TRANSITIONS: readonly (readonly [TargetStatus, TargetStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export function canTransitionTarget(from: TargetStatus, to: TargetStatus): boolean {
  return TARGET_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canArchiveTarget(status: TargetStatus): boolean {
  return canTransitionTarget(status, 'archived');
}

export function canReopenTarget(status: TargetStatus): boolean {
  return canTransitionTarget(status, 'active');
}

/** O rol de alvos: ativos primeiro, arquivados por último. */
export function orderTargets(targets: readonly Target[]): readonly Target[] {
  const peso = (s: TargetStatus): number => (s === 'active' ? 0 : 1);
  return [...targets].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.name.localeCompare(b.name);
  });
}

/** O livro de vistorias: a mais recente primeiro. */
export function orderInspections(inspections: readonly Inspection[]): readonly Inspection[] {
  return [...inspections].sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt));
}

export interface FiscSummary {
  readonly totalTargets: number;
  readonly activeTargets: number;
  readonly archivedTargets: number;
  readonly totalInspections: number;
}

/** O placar do módulo: nenhum número inventado — cada um é `.length`. */
export function summarize(
  targets: readonly Target[],
  inspections: readonly Inspection[],
): FiscSummary {
  let active = 0;
  let archived = 0;
  for (const t of targets) {
    if (t.status === 'active') active += 1;
    else archived += 1;
  }
  return {
    totalTargets: targets.length,
    activeTargets: active,
    archivedTargets: archived,
    totalInspections: inspections.length,
  };
}

const NOME_MAX = 200;
const FINDING_MAX = 2000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um alvo fiscalizável novo. O nome é o único dado — texto livre,
 * desenho do tenant.
 */
export function validateNewTarget(input: NewTargetInput): Validation<Target> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do alvo fiscalizável.' });
  } else if (name.length > NOME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: { id: '', name: name!, status: 'active' },
  };
}

/**
 * Valida uma vistoria nova. O alvo é obrigatório; o achado é texto livre
 * opcional (a vistoria pode não constatar nada). `inspectedAt` e `inspectedBy`
 * NÃO entram aqui — são carimbados pelo servidor (§3.1 da migration), nunca
 * pelo formulário.
 */
export function validateNewInspection(input: NewInspectionInput): Validation<NewInspection> {
  const problems: Problem[] = [];

  const targetId = texto(input.targetId);
  if (targetId === null) {
    problems.push({ field: 'targetId', message: 'Informe o alvo fiscalizável da vistoria.' });
  }

  const finding = texto(input.finding) ?? '';
  if (finding.length > FINDING_MAX) {
    problems.push({ field: 'finding', message: `Achado com no máximo ${FINDING_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: { targetId: targetId!, finding },
  };
}
