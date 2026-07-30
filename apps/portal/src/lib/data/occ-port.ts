import type { Occurrence, Severity, Treatment } from '@alsham/occurrences';

export interface OccurrenceRow extends Occurrence {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 16 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: editar registro (nasce imutável — corrigir é
 * tratativa), editar/apagar tratativa e apagar ocorrência. A porta não
 * promete o que o schema nega.
 */
export interface OccPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadOccurrences(): Promise<OccurrenceRow[]>;
  loadSeverities(): Promise<Severity[]>;
  loadTreatments(): Promise<Treatment[]>;
  registerOccurrence(input: {
    title: string;
    description: string;
    location: string | null;
    involved: string | null;
    severityId: string | null;
    occurredAt: string;
  }): Promise<{ occurrenceId: string }>;
  recordTreatment(input: { occurrenceId: string; actionTaken: string }): Promise<void>;
  closeOccurrence(input: { occurrenceId: string; outcome: string }): Promise<void>;
  createSeverity(input: { name: string; position: number }): Promise<void>;
}
