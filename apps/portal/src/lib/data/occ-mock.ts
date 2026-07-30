import type { Severity, Treatment } from '@alsham/occurrences';

import type { OccPort, OccurrenceRow } from './occ-port';

const agora = () => new Date().toISOString();
const horasAtras = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

let seq = 1;

const severities: Severity[] = [
  { id: 'mock-sev-1', name: 'grave', position: 0, status: 'active' },
  { id: 'mock-sev-2', name: 'leve', position: 1, status: 'active' },
];

const occurrences: OccurrenceRow[] = [
  {
    id: 'mock-occ-1',
    title: 'Vazamento na doca 3',
    description: 'Água acumulada perto da entrada de carga.',
    location: 'doca 3',
    involved: null,
    severityId: 'mock-sev-1',
    occurredAt: horasAtras(5),
    status: 'open',
    closedAt: null,
    outcome: '',
    createdAt: agora(),
  },
  {
    id: 'mock-occ-2',
    title: 'Lâmpada queimada no corredor B',
    description: 'Trecho escuro entre as salas 4 e 6.',
    location: 'corredor B',
    involved: null,
    severityId: 'mock-sev-2',
    occurredAt: horasAtras(30),
    status: 'closed',
    closedAt: horasAtras(2),
    outcome: 'lâmpada trocada pela manutenção',
    createdAt: agora(),
  },
];

const treatments: Treatment[] = [
  {
    id: 'mock-tr-1',
    occurrenceId: 'mock-occ-1',
    actionTaken: 'área isolada; manutenção acionada',
    occurredAt: horasAtras(4),
  },
];

export function createOccMockPort(): OccPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set([
        'occ.occurrence.register',
        'occ.occurrence.treat',
        'occ.occurrence.close',
        'occ.setup.manage',
      ]);
    },

    async loadOccurrences() {
      return [...occurrences];
    },

    async loadSeverities() {
      return [...severities];
    },

    async loadTreatments() {
      return [...treatments];
    },

    async registerOccurrence(input) {
      const id = `mock-occ-${(seq += 1)}`;
      occurrences.unshift({
        id,
        title: input.title,
        description: input.description,
        location: input.location,
        involved: input.involved,
        severityId: input.severityId,
        occurredAt: input.occurredAt,
        status: 'open',
        closedAt: null,
        outcome: '',
        createdAt: agora(),
      });
      return { occurrenceId: id };
    },

    async recordTreatment(input) {
      treatments.push({
        id: `mock-tr-${(seq += 1)}`,
        occurrenceId: input.occurrenceId,
        actionTaken: input.actionTaken,
        occurredAt: agora(),
      });
    },

    async closeOccurrence(input) {
      const i = occurrences.findIndex((o) => o.id === input.occurrenceId);
      if (i < 0) throw new Error('ocorrência não encontrada');
      occurrences[i] = {
        ...occurrences[i]!,
        status: 'closed',
        closedAt: agora(),
        outcome: input.outcome,
      };
    },

    async createSeverity(input) {
      severities.push({
        id: `mock-sev-${(seq += 1)}`,
        name: input.name,
        position: input.position,
        status: 'active',
      });
    },
  };
}
