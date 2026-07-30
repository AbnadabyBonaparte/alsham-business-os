import type { MntPriority } from '@alsham/maintenance';

import type { MntOrderRow, MntPort } from './mnt-port';

const agora = () => new Date().toISOString();
const diasAtras = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

let seq = 1;

const priorities: MntPriority[] = [
  { id: 'mock-mp-1', name: 'parada de produção', position: 0, status: 'active' },
  { id: 'mock-mp-2', name: 'rotina', position: 1, status: 'active' },
];

const orders: MntOrderRow[] = [
  {
    id: 'mock-mnt-1',
    title: 'Reparo no portão da doca',
    description: 'Dobradiça soltando; portão não fecha.',
    kind: 'corrective',
    target: 'portão da doca',
    assetId: null,
    priorityId: 'mock-mp-1',
    assigneeUserId: null,
    recurrenceDays: null,
    costCents: null,
    currency: null,
    status: 'in_progress',
    completedAt: null,
    completionNote: '',
    createdAt: agora(),
  },
  {
    id: 'mock-mnt-2',
    title: 'Troca de filtro do ar-condicionado',
    description: '',
    kind: 'preventive',
    target: 'ar da sala 5',
    assetId: null,
    priorityId: 'mock-mp-2',
    assigneeUserId: null,
    recurrenceDays: 90,
    costCents: 12000,
    currency: 'BRL',
    status: 'done',
    completedAt: diasAtras(100),
    completionNote: 'filtro trocado e testado',
    createdAt: diasAtras(100),
  },
];

export function createMntMockPort(): MntPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['mnt.order.manage', 'mnt.order.complete', 'mnt.setup.manage']);
    },

    async loadOrders() {
      return [...orders];
    },

    async loadPriorities() {
      return [...priorities];
    },

    async createOrder(input) {
      const id = `mock-mnt-${(seq += 1)}`;
      orders.unshift({
        id,
        title: input.title,
        description: input.description,
        kind: input.kind,
        target: input.target,
        assetId: null,
        priorityId: input.priorityId,
        assigneeUserId: null,
        recurrenceDays: input.recurrenceDays,
        costCents: null,
        currency: null,
        status: 'open',
        completedAt: null,
        completionNote: '',
        createdAt: agora(),
      });
      return { orderId: id };
    },

    async setStatus(input) {
      const i = orders.findIndex((o) => o.id === input.orderId);
      if (i < 0) throw new Error('ordem não encontrada');
      const o = orders[i]!;
      const concluida = input.status === 'done';
      orders[i] = {
        ...o,
        status: input.status,
        completedAt: concluida ? agora() : input.status === 'in_progress' ? null : o.completedAt,
        completionNote: concluida
          ? (input.completionNote ?? o.completionNote)
          : input.status === 'in_progress'
            ? ''
            : o.completionNote,
        costCents: input.costCents !== undefined ? input.costCents : o.costCents,
        currency: input.currency !== undefined ? input.currency : o.currency,
      };
    },

    async createPriority(input) {
      priorities.push({
        id: `mock-mp-${(seq += 1)}`,
        name: input.name,
        position: input.position,
        status: 'active',
      });
    },
  };
}
