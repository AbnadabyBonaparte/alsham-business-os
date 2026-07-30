import type { ChecklistRun, ChkRunItem, ChkTemplate, ChkTemplateItem } from '@alsham/checklists';

export interface ChkRunRow extends ChecklistRun {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 19 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: inserir item de execução (a prancheta é do
 * gatilho da abertura), rasurar resposta (o ato é único) e apagar execução.
 * A porta não promete o que o schema nega.
 */
export interface ChkPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadTemplates(): Promise<ChkTemplate[]>;
  loadTemplateItems(): Promise<ChkTemplateItem[]>;
  loadRuns(): Promise<ChkRunRow[]>;
  loadRunItems(): Promise<ChkRunItem[]>;
  createTemplate(input: { name: string; items: readonly string[] }): Promise<void>;
  startRun(input: { templateId: string; subject: string }): Promise<{ runId: string }>;
  answerItem(input: {
    itemId: string;
    answer: 'ok' | 'not_ok' | 'not_applicable';
    note: string;
  }): Promise<void>;
  setRunStatus(input: {
    runId: string;
    status: 'completed' | 'abandoned';
    abandonReason?: string;
  }): Promise<void>;
}
