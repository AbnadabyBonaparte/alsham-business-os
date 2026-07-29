import type { DunTitle, Ruler, RulerStep, StepExecution } from '@alsham/dunning';

export interface RulerWithSteps {
  readonly ruler: Ruler;
  readonly steps: readonly RulerStep[];
}

export interface DunTitleRow extends DunTitle {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 12 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: criar título (a projeção é alimentada por
 * FATO, só pela composição), editar execução (imutável) e enviar qualquer
 * coisa (o módulo não envia — ele registra). A porta não promete o que o
 * schema nega.
 */
export interface DunPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadRulers(): Promise<RulerWithSteps[]>;
  loadTitles(): Promise<DunTitleRow[]>;
  loadExecutions(): Promise<StepExecution[]>;
  createRuler(input: {
    name: string;
    steps: readonly { name: string; position: number; daysAfterDue: number; channel: string | null }[];
  }): Promise<{ rulerId: string }>;
  archiveRuler(input: { rulerId: string }): Promise<void>;
  executeStep(input: { titleId: string; stepId: string; note: string }): Promise<void>;
}
