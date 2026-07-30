import type { DreLine, DreResult, StatementRow } from '@alsham/dre';

export interface DreLineRow extends DreLine {
  readonly createdAt: string;
}

export type DreStatementRow = StatementRow;
export type DreResultRow = DreResult;

/**
 * Porta de dados do Módulo 32 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: apagar linha (arquiva-se), lançar valor (os valores
 * nascem dos livros, projetados por evento), coluna de total (são views). A
 * DRE só desenha o plano e LÊ o demonstrativo.
 */
export interface DrePort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadLines(): Promise<DreLineRow[]>;
  loadStatement(): Promise<DreStatementRow[]>;
  loadResult(): Promise<DreResultRow[]>;
  createLine(input: { name: string; kind: 'revenue' | 'cost' | 'expense'; matchCategory: string; position: number; currency: string }): Promise<{ lineId: string }>;
  setLineStatus(input: { lineId: string; status: 'active' | 'archived' }): Promise<void>;
}
