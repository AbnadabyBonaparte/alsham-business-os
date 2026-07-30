import type { GoalCheckin } from '@alsham/goals';

import type { GoalPort, GoalRow } from './goal-port';

const agora = () => new Date().toISOString();
const diasAtras = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

let seq = 1;
let checkinSeq = 10;

const goals: GoalRow[] = [
  {
    id: 'mock-gl-1',
    title: 'Faturamento do trimestre',
    description: '',
    metric: 'faturamento',
    targetValue: 300000,
    currency: 'BRL',
    startsOn: '2026-07-01',
    endsOn: '2026-09-30',
    assigneeUserId: null,
    status: 'active',
    decidedAt: null,
    cancelReason: '',
    createdAt: diasAtras(30),
  },
  {
    id: 'mock-gl-2',
    title: 'Lojas ocupadas no prédio',
    description: 'Contagem no fim de cada mês.',
    metric: 'lojas ocupadas',
    targetValue: 42,
    currency: null,
    startsOn: '2026-01-01',
    endsOn: '2026-12-31',
    assigneeUserId: null,
    status: 'draft',
    decidedAt: null,
    cancelReason: '',
    createdAt: diasAtras(2),
  },
];

const checkins: GoalCheckin[] = [
  {
    id: 'mock-gc-1',
    seq: 1,
    goalId: 'mock-gl-1',
    reportedValue: 120000,
    note: 'fechamento de julho',
    reportedAt: diasAtras(5),
  },
];

export function createGoalMockPort(): GoalPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['goal.goal.manage', 'goal.goal.report', 'goal.goal.decide']);
    },

    async loadGoals() {
      return [...goals];
    },

    async loadCheckins() {
      return [...checkins];
    },

    async createGoal(input) {
      const id = `mock-gl-${(seq += 1)}`;
      goals.push({
        id,
        title: input.title,
        description: input.description,
        metric: input.metric,
        targetValue: input.targetValue,
        currency: input.currency,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        assigneeUserId: null,
        status: 'draft',
        decidedAt: null,
        cancelReason: '',
        createdAt: agora(),
      });
      return { goalId: id };
    },

    async setStatus(input) {
      const i = goals.findIndex((g) => g.id === input.goalId);
      if (i < 0) throw new Error('meta não encontrada');
      const terminal = input.status !== 'active';
      goals[i] = {
        ...goals[i]!,
        status: input.status,
        decidedAt: terminal ? agora() : null,
        cancelReason: input.cancelReason ?? '',
      };
    },

    async reportCheckin(input) {
      const g = goals.find((x) => x.id === input.goalId);
      if (!g) throw new Error('meta não encontrada');
      if (g.status !== 'active') throw new Error('check-in só em meta ativa');
      checkins.push({
        id: `mock-gc-${(checkinSeq += 1)}`,
        seq: checkinSeq,
        goalId: input.goalId,
        reportedValue: input.reportedValue,
        note: input.note,
        reportedAt: agora(),
      });
    },
  };
}
