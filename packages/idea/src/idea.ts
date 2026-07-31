/**
 * O motor puro do Módulo 68 — Ideias & Pipeline de Inovação.
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; nunca decide se uma ideia pode ser promovida ou movida.
 *
 * ⭐⭐ O DIVERGE do `kanban`: nada aqui exige `projectId`. A ideia existe por
 * si; o `promotedProjectId` é o DESTINO, não o pré-requisito.
 *
 * O `ALLOWED_TRANSITIONS` é o espelho de `idea.allowed_transition()` no
 * `0083_idea.sql`, e um teste lê a migration e confere que os dois dizem a
 * mesma coisa. `promoted` é TERMINAL; `archived ↔ active` é reversível.
 */
import type {
  Idea,
  IdeaStage,
  IdeaStatus,
  IdeaSummary,
  NewIdeaInput,
  NewStageInput,
  Problem,
  StageLoad,
  Validation,
} from './types.ts';

/**
 * ⭐ active→promoted (virou projeto), active→archived (descartar),
 * archived→active (restaurar). `promoted` é TERMINAL (não sai de lá).
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [IdeaStatus, IdeaStatus])[] = [
  ['active', 'promoted'],
  ['active', 'archived'],
  ['archived', 'active'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly IdeaStatus[] = ['active', 'promoted', 'archived'];

export function canTransition(from: IdeaStatus, to: IdeaStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: IdeaStatus): readonly IdeaStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Promover só existe para a ideia VIVA. */
export function canPromote(status: IdeaStatus): boolean {
  return status === 'active';
}

/** Arquivar só existe para a ideia VIVA. */
export function canArchive(status: IdeaStatus): boolean {
  return status === 'active';
}

/** Restaurar só existe para a ideia arquivada. */
export function canRestore(status: IdeaStatus): boolean {
  return status === 'archived';
}

/** ⭐ Mover de etapa só vale enquanto ATIVA — promovida/arquivada não anda. */
export function canMove(status: IdeaStatus): boolean {
  return status === 'active';
}

/** Ordena as etapas do funil por posição; tiebreak por id. */
export function orderStages(stages: readonly IdeaStage[]): readonly IdeaStage[] {
  return [...stages].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.id.localeCompare(b.id);
  });
}

/** Conta as ideias ATIVAS por etapa — a carga do funil. Nunca chute. */
export function loadByStage(ideas: readonly Idea[]): readonly StageLoad[] {
  const mapa = new Map<string, number>();
  for (const i of ideas) {
    if (i.status !== 'active') continue;
    mapa.set(i.currentStageId, (mapa.get(i.currentStageId) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([stageId, count]) => ({ stageId, count }))
    .sort((a, b) => a.stageId.localeCompare(b.stageId));
}

/** Um resumo contável do funil — total e por estado. */
export function summarizeIdeas(ideas: readonly Idea[]): IdeaSummary {
  return {
    total: ideas.length,
    active: ideas.filter((i) => i.status === 'active').length,
    promoted: ideas.filter((i) => i.status === 'promoted').length,
    archived: ideas.filter((i) => i.status === 'archived').length,
  };
}

const NAME_MAX = 120;
const TITLE_MAX = 200;
const DESC_MAX = 2000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Valida uma etapa nova. Nome obrigatório; posição inteiro >= 0. */
export function validateNewStage(input: NewStageInput): Validation<IdeaStage> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome da etapa.' });
  } else if (name.length > NAME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NAME_MAX} caracteres.` });
  }

  const pos = input.position;
  if (typeof pos !== 'number' || !Number.isInteger(pos) || pos < 0) {
    problems.push({ field: 'position', message: 'A posição deve ser um inteiro maior ou igual a zero.' });
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value: { id: '', name: name!, position: pos as number } };
}

/**
 * Valida uma ideia nova. Título e etapa (id solto intra-schema) obrigatórios; a
 * descrição é OPCIONAL. Nasce `active`, sem projeto de destino — a pura camada
 * nunca inventa dado do servidor.
 */
export function validateNewIdea(input: NewIdeaInput): Validation<Idea> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Informe o título da ideia.' });
  } else if (title.length > TITLE_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITLE_MAX} caracteres.` });
  }

  const currentStageId = texto(input.currentStageId);
  if (currentStageId === null) {
    problems.push({ field: 'currentStageId', message: 'Informe a etapa inicial da ideia.' });
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
      title: title!,
      description,
      currentStageId: currentStageId!,
      status: 'active',
      promotedProjectId: null,
      promotedProjectName: '',
    },
  };
}
