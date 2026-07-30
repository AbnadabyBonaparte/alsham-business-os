import type { Goal, GoalCheckin } from '@alsham/goals';

export interface GoalRow extends Goal {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 23 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: editar check-in (o livro é eterno), escrever o
 * progresso (ele é o último check-in, calculado) e apagar meta. A porta
 * não promete o que o schema nega.
 */
export interface GoalPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadGoals(): Promise<GoalRow[]>;
  loadCheckins(): Promise<GoalCheckin[]>;
  createGoal(input: {
    title: string;
    description: string;
    metric: string;
    targetValue: number | null;
    currency: string | null;
    startsOn: string;
    endsOn: string;
  }): Promise<{ goalId: string }>;
  setStatus(input: {
    goalId: string;
    status: 'active' | 'achieved' | 'missed' | 'cancelled';
    cancelReason?: string;
  }): Promise<void>;
  reportCheckin(input: { goalId: string; reportedValue: number; note: string }): Promise<void>;
}
