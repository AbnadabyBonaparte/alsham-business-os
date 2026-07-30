import type { VisitRow, VisPort } from './vis-port';

const agora = () => new Date().toISOString();
const horasAtras = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
const horas = (h: number) => new Date(Date.now() + h * 3600000).toISOString();

let seq = 1;

const visits: VisitRow[] = [
  {
    id: 'mock-vs-1',
    visitorName: 'Entregador da manhã',
    visitorDocument: '',
    visitorContact: '',
    host: 'almoxarifado',
    reason: 'entrega de amostras',
    status: 'checked_in',
    expectedAt: null,
    checkedInAt: horasAtras(1),
    checkedOutAt: null,
    cancelReason: '',
    correctsVisitId: null,
    createdAt: horasAtras(1),
  },
  {
    id: 'mock-vs-2',
    visitorName: 'Consultora da tarde',
    visitorDocument: 'RG 12.345',
    visitorContact: '',
    host: 'diretoria',
    reason: 'reunião trimestral',
    status: 'scheduled',
    expectedAt: horas(3),
    checkedInAt: null,
    checkedOutAt: null,
    cancelReason: '',
    correctsVisitId: null,
    createdAt: horasAtras(24),
  },
];

export function createVisMockPort(): VisPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['vis.visit.register', 'vis.visit.schedule']);
    },

    async loadVisits() {
      return [...visits];
    },

    async createVisit(input) {
      const id = `mock-vs-${(seq += 1)}`;
      visits.unshift({
        id,
        visitorName: input.visitorName,
        visitorDocument: input.visitorDocument,
        visitorContact: input.visitorContact,
        host: input.host,
        reason: input.reason,
        status: input.scheduled ? 'scheduled' : 'checked_in',
        expectedAt: input.expectedAt,
        // O mock imita o gatilho: o carimbo é de agora, nunca do formulário.
        checkedInAt: input.scheduled ? null : agora(),
        checkedOutAt: null,
        cancelReason: '',
        correctsVisitId: input.correctsVisitId,
        createdAt: agora(),
      });
      return { visitId: id };
    },

    async setStatus(input) {
      const i = visits.findIndex((v) => v.id === input.visitId);
      if (i < 0) throw new Error('visita não encontrada');
      const v = visits[i]!;
      visits[i] = {
        ...v,
        status: input.status,
        checkedInAt: input.status === 'checked_in' ? agora() : v.checkedInAt,
        checkedOutAt: input.status === 'checked_out' ? agora() : v.checkedOutAt,
        cancelReason: input.cancelReason ?? v.cancelReason,
      };
    },
  };
}
