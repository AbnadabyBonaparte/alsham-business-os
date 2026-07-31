/**
 * O motor puro do Módulo 55 — Kanban / Quadro de Tarefas do Projeto.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide.
 *
 * ⭐ **A física é a do `ops`, mas o ESCOPO é o que muda:** o cartão pertence a
 * um projeto (`projectId` OBRIGATÓRIO em `validateNewCard`). Não há máquina de
 * transição — o cartão anda LIVRE entre as colunas (a liberdade do `ops`), e
 * "concluído" é uma coluna que o tenant desenha, não um estado do produto.
 * Por isso NÃO existe aqui um `ALLOWED_TRANSITIONS`: seria contra o desenho.
 */
import type {
  Card,
  NewCardInput,
  NewStageInput,
  Problem,
  Stage,
  StageColumn,
  Validation,
} from './types.ts';

const NAME_MAX = 200;
const TITLE_MAX = 200;
const DESC_MAX = 2000;
const PROJECT_NAME_MAX = 200;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

function inteiro(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isInteger(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor);
    if (Number.isInteger(n)) return n;
  }
  return null;
}

/**
 * ⭐ Ordena as colunas do quadro por `position` (a ordem que o tenant desenhou);
 * empate desempatado pelo nome, para uma leitura estável.
 */
export function orderStages(stages: readonly Stage[]): readonly Stage[] {
  return [...stages].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.name.localeCompare(b.name);
  });
}

/** Ordena os cartões por título — a leitura dentro de uma coluna é estável. */
export function orderCards(cards: readonly Card[]): readonly Card[] {
  return [...cards].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * ⭐ A leitura do quadro: cada coluna (na ordem do tenant) com os seus cartões.
 * Puro mapeamento de apresentação — nenhuma decisão, só a montagem da tela.
 * Cartões cuja coluna não está na lista são ignorados (a coluna pode ter sido
 * apagada num redesenho).
 */
export function groupCardsByStage(
  stages: readonly Stage[],
  cards: readonly Card[],
): readonly StageColumn[] {
  return orderStages(stages).map((stage) => ({
    stage,
    cards: orderCards(cards.filter((c) => c.stageId === stage.id)),
  }));
}

/**
 * Valida uma coluna nova. Nome obrigatório; `position >= 0`; o quadro precisa
 * de um projeto (`projectId`). Nasce com `id` vazio — a pura camada nunca
 * inventa dado do servidor.
 */
export function validateNewStage(input: NewStageInput): Validation<Stage> {
  const problems: Problem[] = [];

  const projectId = texto(input.projectId);
  if (projectId === null) {
    problems.push({ field: 'projectId', message: 'A coluna pertence a um projeto.' });
  }

  // Nome do projeto é carimbo da tela: opcional aqui, vira '' se ausente.
  let projectName = texto(input.projectName) ?? '';
  if (projectName.length > PROJECT_NAME_MAX) {
    projectName = projectName.slice(0, PROJECT_NAME_MAX);
  }

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome da coluna.' });
  } else if (name.length > NAME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NAME_MAX} caracteres.` });
  }

  const position = inteiro(input.position);
  if (position === null || position < 0) {
    problems.push({ field: 'position', message: 'A posição deve ser um inteiro maior ou igual a zero.' });
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      projectId: projectId!,
      projectName,
      name: name!,
      position: position!,
    },
  };
}

/**
 * Valida um cartão novo. Título obrigatório; ⭐ `projectId` OBRIGATÓRIO (é o
 * escopo que distingue este módulo do `ops`); `stageId` obrigatório (o cartão
 * nasce numa coluna). Descrição OPCIONAL (vira ''). Nasce com `id` vazio.
 */
export function validateNewCard(input: NewCardInput): Validation<Card> {
  const problems: Problem[] = [];

  const projectId = texto(input.projectId);
  if (projectId === null) {
    problems.push({ field: 'projectId', message: 'O cartão pertence a um projeto.' });
  }

  let projectName = texto(input.projectName) ?? '';
  if (projectName.length > PROJECT_NAME_MAX) {
    projectName = projectName.slice(0, PROJECT_NAME_MAX);
  }

  const stageId = texto(input.stageId);
  if (stageId === null) {
    problems.push({ field: 'stageId', message: 'O cartão nasce numa coluna.' });
  }

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Informe o título do cartão.' });
  } else if (title.length > TITLE_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITLE_MAX} caracteres.` });
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
      projectId: projectId!,
      projectName,
      stageId: stageId!,
      title: title!,
      description,
    },
  };
}
