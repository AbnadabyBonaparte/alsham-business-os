import type {
  Goal,
  GoalCheckin,
  GoalStatus,
  NewGoalInput,
  Problem,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 23 — Metas.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). E o pacote também não
 * decide o DESFECHO: o alvo informa, o dono decide — por isso não existe
 * `isAchieved()` aqui, e não existe percentual mágico.
 */

/**
 * ⭐ Espelho de `goal.allowed_transition()` no `0038_goal.sql` — há teste
 * que lê a migration e compara. CINCO pares; os três fins TERMINAIS: a
 * identidade da meta é o período + o alvo declarado — a meta do próximo
 * trimestre é meta nova.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [GoalStatus, GoalStatus])[] = [
  ['draft', 'active'],
  ['draft', 'cancelled'],
  ['active', 'achieved'],
  ['active', 'missed'],
  ['active', 'cancelled'],
];

export function canTransition(from: GoalStatus, to: GoalStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canActivate(status: GoalStatus): boolean {
  return canTransition(status, 'active');
}

export function canClose(status: GoalStatus): boolean {
  return canTransition(status, 'achieved') || canTransition(status, 'missed');
}

export function canCancel(status: GoalStatus): boolean {
  return canTransition(status, 'cancelled');
}

/** Em DRAFT edita-se tudo; ATIVA congela a trave (alvo, métrica, período). */
export function canEditTarget(status: GoalStatus): boolean {
  return status === 'draft';
}

export function canReport(status: GoalStatus): boolean {
  return status === 'active';
}

/**
 * ⭐ O progresso vigente é o ÚLTIMO check-in do livro — espelho da view
 * `goal.goal_progress`, ordenado por seq (a lição do pat).
 */
export function currentValue(goal: Goal, checkins: readonly GoalCheckin[]): number | null {
  let ultimo: GoalCheckin | null = null;
  for (const c of checkins) {
    if (c.goalId !== goal.id) continue;
    if (ultimo === null || c.seq > ultimo.seq) ultimo = c;
  }
  return ultimo?.reportedValue ?? null;
}

export function whyCannotReport(goal: Goal): string | null {
  if (goal.status === 'draft') {
    return 'O rascunho ainda não corre: ative a meta primeiro.';
  }
  if (goal.status !== 'active') {
    return 'A época fechou — o número novo pertence à meta nova.';
  }
  return null;
}

/** ⭐ Fechar exige o número na mesa — a recusa com nome, decidida aqui. */
export function whyCannotClose(
  goal: Goal,
  checkinCount: number,
  outcome: 'achieved' | 'missed',
): string | null {
  if (!canTransition(goal.status, outcome)) {
    return 'A meta não está em condição de ser fechada — o desfecho é terminal.';
  }
  if (checkinCount === 0) {
    return 'Fechar a meta sem check-in é achismo: registre o número na mesa primeiro.';
  }
  return null;
}

export function whyCannotCancel(goal: Goal, reason: string): string | null {
  if (!canCancel(goal.status)) {
    return 'A meta já tem desfecho — a do próximo período é meta nova.';
  }
  if (reason.trim().length === 0) {
    return 'Cancelar exige a razão escrita: a ambição desistida também é história.';
  }
  return null;
}

/** O quadro na ordem da urgência: ativas que vencem primeiro, depois rascunhos, depois a história. */
export function orderGoals(goals: readonly Goal[]): readonly Goal[] {
  const peso = (g: Goal) =>
    g.status === 'active' ? 0 : g.status === 'draft' ? 1 : 2;
  return [...goals].sort((a, b) => {
    const pa = peso(a);
    const pb = peso(b);
    if (pa !== pb) return pa - pb;
    if (pa < 2) return a.endsOn.localeCompare(b.endsOn);
    return (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '');
  });
}

export interface GoalSummary {
  readonly total: number;
  readonly active: number;
  readonly draft: number;
  readonly achieved: number;
  readonly missed: number;
}

export function summarizeGoals(goals: readonly Goal[]): GoalSummary {
  let active = 0;
  let draft = 0;
  let achieved = 0;
  let missed = 0;
  for (const g of goals) {
    if (g.status === 'active') active += 1;
    else if (g.status === 'draft') draft += 1;
    else if (g.status === 'achieved') achieved += 1;
    else if (g.status === 'missed') missed += 1;
  }
  return { total: goals.length, active, draft, achieved, missed };
}

const TITULO_MAX = 200;
const METRICA_MAX = 200;
const DESC_MAX = 4000;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Valida uma meta nova — nasce no rascunho, sempre. */
export function validateNewGoal(input: NewGoalInput): Validation<Goal> {
  const problems: Problem[] = [];

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Dê um título à meta.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  const metric = texto(input.metric);
  if (metric === null) {
    problems.push({ field: 'metric', message: 'Qual é a métrica? Meta sem métrica não é alvo, é desejo.' });
  } else if (metric.length > METRICA_MAX) {
    problems.push({ field: 'metric', message: `Métrica com no máximo ${METRICA_MAX} caracteres.` });
  }

  let description = texto(input.description) ?? '';
  if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
    description = description.slice(0, DESC_MAX);
  }

  const startsOn = texto(input.startsOn);
  if (startsOn === null || !DATA_RE.test(startsOn)) {
    problems.push({ field: 'startsOn', message: 'Informe o início do período (AAAA-MM-DD).' });
  }
  const endsOn = texto(input.endsOn);
  if (endsOn === null || !DATA_RE.test(endsOn)) {
    problems.push({ field: 'endsOn', message: 'Informe o fim do período (AAAA-MM-DD).' });
  }
  if (startsOn !== null && endsOn !== null && endsOn < startsOn) {
    problems.push({ field: 'endsOn', message: 'O fim do período vem depois do início.' });
  }

  const rawTarget = input.targetValue;
  let targetValue: number | null = null;
  if (rawTarget !== undefined && rawTarget !== null && rawTarget !== '') {
    if (typeof rawTarget === 'number' && Number.isFinite(rawTarget)) {
      targetValue = rawTarget;
    } else {
      problems.push({ field: 'targetValue', message: 'Alvo numérico — a unidade mora na métrica.' });
    }
  }
  let currency = texto(input.currency)?.toUpperCase() ?? null;
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'Moeda ISO de três letras, ou vazia.' });
    currency = null;
  }
  if (currency !== null && targetValue === null) {
    problems.push({ field: 'targetValue', message: 'Moeda declarada exige o valor — dinheiro sem número é promessa.' });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      title: title!,
      description,
      metric: metric!,
      targetValue,
      currency,
      startsOn: startsOn!,
      endsOn: endsOn!,
      assigneeUserId: null,
      status: 'draft',
      decidedAt: null,
      cancelReason: '',
    },
  };
}
