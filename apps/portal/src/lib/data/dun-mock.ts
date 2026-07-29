import { PERMISSIONS, isInQueue, validateRulerSteps } from '@alsham/dunning';
import type { StepExecution } from '@alsham/dunning';

import { DataPortError } from './port';
import type { DunPort, DunTitleRow, RulerWithSteps } from './dun-port';

const agora = () => new Date().toISOString();
const hoje = () => new Date().toISOString().slice(0, 10);

let seq = 1;

const rulers: RulerWithSteps[] = [
  {
    ruler: { id: 'mock-ruler-1', tenantId: 'mock-tenant', name: 'Régua padrão', status: 'active' },
    steps: [
      { id: 'mock-step-1', rulerId: 'mock-ruler-1', position: 0, name: '1º aviso', daysAfterDue: 1, channel: 'e-mail' },
      { id: 'mock-step-2', rulerId: 'mock-ruler-1', position: 1, name: 'ligação', daysAfterDue: 7, channel: 'telefone' },
    ],
  },
];

const titles: DunTitleRow[] = [
  {
    id: 'mock-title-1',
    tenantId: 'mock-tenant',
    sourceModuleId: 'demo',
    externalRef: 'DOC-DEMO-0001',
    dueDate: new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10),
    amountCents: 150000,
    receivedAmountCents: 0,
    currency: 'BRL',
    payerName: 'Devedor Demo',
    counterpartyTaxId: null,
    description: 'mensalidade',
    status: 'open',
    enteredAt: agora(),
    leftAt: null,
    createdAt: agora(),
  },
];

const executions: StepExecution[] = [];

export function createDunMockPort(): DunPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(Object.values(PERMISSIONS));
    },

    async loadRulers() {
      return rulers.map((r) => ({ ruler: { ...r.ruler }, steps: r.steps.map((s) => ({ ...s })) }));
    },

    async loadTitles() {
      return titles.map((t) => ({ ...t }));
    },

    async loadExecutions() {
      return executions.map((e) => ({ ...e }));
    },

    async createRuler(input) {
      const erro = validateRulerSteps(input.steps);
      if (erro !== null) throw new DataPortError(erro);
      if (rulers.some((r) => r.ruler.status === 'active')) {
        throw new DataPortError('Já existe uma régua ativa: arquive-a antes de criar outra.');
      }
      const id = `mock-ruler-${++seq}`;
      rulers.unshift({
        ruler: { id, tenantId: 'mock-tenant', name: input.name, status: 'active' },
        steps: input.steps.map((s, i) => ({
          id: `mock-step-${id}-${i}`,
          rulerId: id,
          position: s.position,
          name: s.name,
          daysAfterDue: s.daysAfterDue,
          channel: s.channel,
        })),
      });
      return { rulerId: id };
    },

    async archiveRuler(input) {
      const r = rulers.find((x) => x.ruler.id === input.rulerId);
      if (!r) throw new DataPortError('Régua não encontrada.');
      (r as { ruler: RulerWithSteps['ruler'] }).ruler = { ...r.ruler, status: 'archived' };
    },

    async executeStep(input) {
      const title = titles.find((t) => t.id === input.titleId);
      if (!title) throw new DataPortError('Título não encontrado.');
      if (!isInQueue(title, hoje())) {
        throw new DataPortError('O título não está na régua: só se cobra o que está vencido e em aberto.');
      }
      const ativa = rulers.find((r) => r.ruler.status === 'active');
      const step = ativa?.steps.find((s) => s.id === input.stepId);
      if (!step) throw new DataPortError('O passo não pertence à régua ativa.');
      if (executions.some((e) => e.titleId === input.titleId && e.stepId === input.stepId)) {
        throw new DataPortError('O passo já foi executado para este título.');
      }
      executions.push({
        id: `mock-exec-${++seq}`,
        titleId: input.titleId,
        stepId: step.id,
        stepName: step.name,
        channel: step.channel,
        daysAfterDue: step.daysAfterDue,
        note: input.note,
        executedAt: agora(),
      });
    },
  };
}
