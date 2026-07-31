/**
 * O motor puro do Módulo 58 — Scrum / Sprints.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se um sprint pode ser ativado.
 *
 * ⭐ `closed` é TERMINAL. O `ALLOWED_TRANSITIONS` abaixo é o espelho de
 * `scrum.allowed_transition()` no `0073_scrum.sql`, e um teste lê a migration e
 * confere que os dois dizem a mesma coisa. A regra "um sprint ativo por
 * projeto" mora numa CONSTRAINT do banco (índice único parcial) — aqui há só o
 * helper de LEITURA que a tela usa para não oferecer o botão em vão.
 */
import type {
  NewSprintInput,
  Problem,
  Sprint,
  SprintStatus,
  SprintSummary,
  Validation,
} from './types.ts';

/**
 * ⭐ planned→active, planned→closed, active→closed. `closed` é TERMINAL.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [SprintStatus, SprintStatus])[] = [
  ['planned', 'active'],
  ['planned', 'closed'],
  ['active', 'closed'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly SprintStatus[] = ['planned', 'active', 'closed'];

export function canTransition(from: SprintStatus, to: SprintStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: SprintStatus): readonly SprintStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Ativar (planned→active) só existe para o planejado. */
export function canActivate(status: SprintStatus): boolean {
  return status === 'planned';
}

/** Encerrar existe do planejado e do ativo. */
export function canClose(status: SprintStatus): boolean {
  return status === 'planned' || status === 'active';
}

/** O conteúdo só muda antes do encerramento. */
export function canEditContent(status: SprintStatus): boolean {
  return status !== 'closed';
}

/**
 * ⭐ O helper de LEITURA da regra "um ativo por projeto". A regra REAL mora na
 * constraint do banco (índice único parcial); esta função só alimenta a tela
 * com a lista de sprints (vinda de fora) para não oferecer "ativar" quando já
 * há um ativo naquele projeto. Nunca é a fonte da verdade — é cortesia de UI.
 */
export function hasActiveSprint(
  sprints: readonly Sprint[],
  projectId: string,
): boolean {
  return sprints.some((s) => s.projectId === projectId && s.status === 'active');
}

const ORDEM: Record<SprintStatus, number> = {
  active: 0,
  planned: 1,
  closed: 2,
};

/** Ativos primeiro, depois planejados, depois encerrados; dentro, por nome. */
export function orderSprints(sprints: readonly Sprint[]): readonly Sprint[] {
  return [...sprints].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    return a.name.localeCompare(b.name);
  });
}

export function summarizeSprints(sprints: readonly Sprint[]): SprintSummary {
  return {
    total: sprints.length,
    planned: sprints.filter((s) => s.status === 'planned').length,
    active: sprints.filter((s) => s.status === 'active').length,
    closed: sprints.filter((s) => s.status === 'closed').length,
  };
}

const NOME_MAX = 200;
const GOAL_MAX = 1000;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Uma data ISO real (não só o formato: 2027-13-40 é recusada). */
function dataIso(valor: unknown): string | null {
  const t = texto(valor);
  if (t === null || !DATA_RE.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Confere que o round-trip bate (recusa 2027-02-30 etc.).
  return d.toISOString().slice(0, 10) === t ? t : null;
}

/**
 * Valida um sprint novo (sempre nasce `planned`).
 * projeto e nome obrigatórios; objetivo e datas opcionais; janela coerente se
 * as duas datas existirem. Nasce com `id` vazio.
 */
export function validateNewSprint(input: NewSprintInput): Validation<Sprint> {
  const problems: Problem[] = [];

  const projectId = texto(input.projectId);
  if (projectId === null) {
    problems.push({ field: 'projectId', message: 'Informe o projeto do sprint.' });
  }
  const projectName = texto(input.projectName) ?? '';

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do sprint.' });
  } else if (name.length > NOME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  let goal = texto(input.goal) ?? '';
  if (goal.length > GOAL_MAX) {
    problems.push({ field: 'goal', message: `Objetivo com no máximo ${GOAL_MAX} caracteres.` });
    goal = goal.slice(0, GOAL_MAX);
  }

  let startsOn = '';
  if (input.startsOn !== undefined && input.startsOn !== null && input.startsOn !== '') {
    const d = dataIso(input.startsOn);
    if (d === null) problems.push({ field: 'startsOn', message: 'Data de início inválida.' });
    else startsOn = d;
  }
  let endsOn = '';
  if (input.endsOn !== undefined && input.endsOn !== null && input.endsOn !== '') {
    const d = dataIso(input.endsOn);
    if (d === null) problems.push({ field: 'endsOn', message: 'Data de fim inválida.' });
    else endsOn = d;
  }
  if (startsOn !== '' && endsOn !== '' && endsOn < startsOn) {
    problems.push({ field: 'endsOn', message: 'A data de fim não pode ser antes do início.' });
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      projectId: projectId!,
      projectName,
      name: name!,
      goal,
      status: 'planned',
      startsOn,
      endsOn,
    },
  };
}
