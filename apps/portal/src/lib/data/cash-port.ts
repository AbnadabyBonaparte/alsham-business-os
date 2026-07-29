import type { Category, Entry } from '@alsham/cashflow';

export interface EntryRow extends Entry {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 14 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: editar ou apagar lançamento (o livro é
 * imutável — corrigir é ajuste; reclassificar é estornar e relançar) e
 * apagar categoria (arquivar é status). A porta não promete o que o schema
 * nega.
 */
export interface CashPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadEntries(): Promise<EntryRow[]>;
  loadCategories(): Promise<Category[]>;
  createEntry(input: {
    kind: Entry['kind'];
    amountCents: number;
    currency: string;
    description: string;
    reason: string;
    categoryId: string | null;
    account: string | null;
    occurredOn: string;
  }): Promise<{ entryId: string }>;
  createCategory(input: { name: string }): Promise<{ categoryId: string }>;
  setCategoryStatus(input: { categoryId: string; status: 'active' | 'archived' }): Promise<void>;
}
