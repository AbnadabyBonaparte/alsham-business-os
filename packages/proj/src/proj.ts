/**
 * O motor puro do Módulo 53 — Projetos.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se um projeto pode ser ativado ou
 * encerrado.
 *
 * ⭐ A física do encerramento é a do `bud`/`dem` (o terminal não reabre),
 * RE-PERGUNTADA. O `ALLOWED_TRANSITIONS` abaixo é o espelho de
 * `proj.allowed_transition()` no `0068_proj.sql`, e um teste lê a migration e
 * confere que os dois dizem a mesma coisa. A assimetria concluir × cancelar
 * (nota opcional × razão obrigatória) também mora aqui.
 */
import type {
  NewProjectInput,
  Problem,
  Project,
  ProjectStatus,
  ProjectSummary,
  Validation,
} from './types.ts';

/**
 * ⭐ planning→active, planning→cancelled, active→completed, active→cancelled.
 * `completed` e `cancelled` são TERMINAIS: o projeto encerrado não reabre.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [ProjectStatus, ProjectStatus])[] = [
  ['planning', 'active'],
  ['planning', 'cancelled'],
  ['active', 'completed'],
  ['active', 'cancelled'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly ProjectStatus[] = [
  'planning',
  'active',
  'completed',
  'cancelled',
];

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: ProjectStatus): readonly ProjectStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Iniciar (planning→active) só existe para o planejamento. */
export function canActivate(status: ProjectStatus): boolean {
  return status === 'planning';
}

/** ⭐ Concluir (active→completed) só existe para o projeto EM ANDAMENTO. */
export function canComplete(status: ProjectStatus): boolean {
  return status === 'active';
}

/** Cancelar existe do planejamento e do andamento. */
export function canCancel(status: ProjectStatus): boolean {
  return status === 'planning' || status === 'active';
}

/** O conteúdo (nome/descrição) só muda antes do encerramento. */
export function canEditContent(status: ProjectStatus): boolean {
  return status === 'planning' || status === 'active';
}

const ORDEM: Record<ProjectStatus, number> = {
  active: 0,
  planning: 1,
  completed: 2,
  cancelled: 3,
};

/** Ativos primeiro, depois planejamento, depois os fins; dentro, por nome. */
export function orderProjects(projects: readonly Project[]): readonly Project[] {
  return [...projects].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    return a.name.localeCompare(b.name);
  });
}

export function summarizeProjects(projects: readonly Project[]): ProjectSummary {
  return {
    total: projects.length,
    planning: projects.filter((p) => p.status === 'planning').length,
    active: projects.filter((p) => p.status === 'active').length,
    completed: projects.filter((p) => p.status === 'completed').length,
    cancelled: projects.filter((p) => p.status === 'cancelled').length,
  };
}

const NOME_MAX = 200;
const DESC_MAX = 1000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um projeto novo (sempre nasce `planning`).
 * O nome é obrigatório; a descrição é OPCIONAL (vira ''). Nasce sem carimbos,
 * com `id` vazio — a pura camada nunca inventa dado do servidor.
 */
export function validateNewProject(input: NewProjectInput): Validation<Project> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do projeto.' });
  } else if (name.length > NOME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  let description = texto(input.description) ?? '';
  if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
    description = description.slice(0, DESC_MAX);
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      name: name!,
      description,
      status: 'planning',
      completionNote: '',
      cancelReason: '',
    },
  };
}
