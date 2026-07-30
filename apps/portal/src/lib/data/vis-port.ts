import type { Visit } from '@alsham/visits';

export interface VisitRow extends Visit {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 21 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: mandar a hora do check-in (o carimbo é do
 * servidor), editar registro depois da entrada (correção é registro novo) e
 * apagar o livro. A porta não promete o que o schema nega.
 */
export interface VisPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadVisits(): Promise<VisitRow[]>;
  createVisit(input: {
    visitorName: string;
    visitorDocument: string;
    visitorContact: string;
    host: string;
    reason: string;
    scheduled: boolean;
    expectedAt: string | null;
    correctsVisitId: string | null;
  }): Promise<{ visitId: string }>;
  setStatus(input: {
    visitId: string;
    status: 'checked_in' | 'checked_out' | 'no_show' | 'cancelled';
    cancelReason?: string;
  }): Promise<void>;
}
