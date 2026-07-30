import type {
  Checkpoint,
  CheckpointStatus,
  NewCheckpointInput,
  NewPatrol,
  NewPatrolInput,
  Patrol,
  Problem,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 42 — Segurança / Rondas.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0057_sec.sql`; o pacote avisa antes, com a MESMA
 * régua.
 */

/**
 * ⭐ Espelho de `sec.allowed_transition()` no `0057_sec.sql` — há teste que
 * lê a migration e compara. `active ↔ archived`: o POSTO é o LUGAR, e o
 * lugar volta do arquivo (física do mall/spc).
 *
 * ⭐⭐ Note a ausência: NÃO existe `PATROL_TRANSITIONS`. A ronda não tem
 * ciclo de vida — é ato pontual, imutável desde o instante em que nasce.
 */
export const CHECKPOINT_TRANSITIONS: readonly (readonly [CheckpointStatus, CheckpointStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export function canTransitionCheckpoint(from: CheckpointStatus, to: CheckpointStatus): boolean {
  return CHECKPOINT_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canArchiveCheckpoint(status: CheckpointStatus): boolean {
  return canTransitionCheckpoint(status, 'archived');
}

export function canReopenCheckpoint(status: CheckpointStatus): boolean {
  return canTransitionCheckpoint(status, 'active');
}

/** O mapa de postos: ativos primeiro, arquivados por último. */
export function orderCheckpoints(checkpoints: readonly Checkpoint[]): readonly Checkpoint[] {
  const peso = (s: CheckpointStatus): number => (s === 'active' ? 0 : 1);
  return [...checkpoints].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.name.localeCompare(b.name);
  });
}

/** O livro de rondas: a passagem mais recente primeiro. */
export function orderPatrols(patrols: readonly Patrol[]): readonly Patrol[] {
  return [...patrols].sort((a, b) => b.passedAt.localeCompare(a.passedAt));
}

export interface SecSummary {
  readonly totalCheckpoints: number;
  readonly activeCheckpoints: number;
  readonly archivedCheckpoints: number;
  readonly totalPatrols: number;
}

/** O placar do módulo: nenhum número inventado — cada um é `.length`. */
export function summarize(
  checkpoints: readonly Checkpoint[],
  patrols: readonly Patrol[],
): SecSummary {
  let active = 0;
  let archived = 0;
  for (const c of checkpoints) {
    if (c.status === 'active') active += 1;
    else archived += 1;
  }
  return {
    totalCheckpoints: checkpoints.length,
    activeCheckpoints: active,
    archivedCheckpoints: archived,
    totalPatrols: patrols.length,
  };
}

const NOME_MAX = 200;
const NOTE_MAX = 500;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um posto de verificação novo. O nome é o único dado — texto
 * livre, desenho do tenant.
 */
export function validateNewCheckpoint(input: NewCheckpointInput): Validation<Checkpoint> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do posto de verificação.' });
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
 * Valida uma ronda nova. O posto é obrigatório; a nota é texto livre
 * opcional. `passedAt` e `passedBy` NÃO entram aqui — são carimbados pelo
 * servidor (§3.1 da migration), nunca pelo formulário.
 */
export function validateNewPatrol(input: NewPatrolInput): Validation<NewPatrol> {
  const problems: Problem[] = [];

  const checkpointId = texto(input.checkpointId);
  if (checkpointId === null) {
    problems.push({ field: 'checkpointId', message: 'Informe o posto de verificação da ronda.' });
  }

  const note = texto(input.note) ?? '';
  if (note.length > NOTE_MAX) {
    problems.push({ field: 'note', message: `Nota com no máximo ${NOTE_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: { checkpointId: checkpointId!, note },
  };
}
