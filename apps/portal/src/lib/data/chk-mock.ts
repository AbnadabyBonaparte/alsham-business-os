import type { ChkRunItem, ChkTemplate, ChkTemplateItem } from '@alsham/checklists';

import type { ChkPort, ChkRunRow } from './chk-port';

const agora = () => new Date().toISOString();
const diasAtras = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

let seq = 1;

const templates: ChkTemplate[] = [
  { id: 'mock-ct-1', name: 'Abertura da loja', status: 'active' },
];

const templateItems: ChkTemplateItem[] = [
  { id: 'mock-cti-1', templateId: 'mock-ct-1', position: 0, itemText: 'Portas destravadas', status: 'active' },
  { id: 'mock-cti-2', templateId: 'mock-ct-1', position: 1, itemText: 'Caixa conferido', status: 'active' },
  { id: 'mock-cti-3', templateId: 'mock-ct-1', position: 2, itemText: 'Luzes da vitrine acesas', status: 'active' },
];

const runs: ChkRunRow[] = [
  {
    id: 'mock-cr-1',
    templateId: 'mock-ct-1',
    templateName: 'Abertura da loja',
    subject: 'loja 3',
    status: 'in_progress',
    startedAt: diasAtras(0),
    completedAt: null,
    abandonReason: '',
    createdAt: agora(),
  },
];

const runItems: ChkRunItem[] = [
  { id: 'mock-cri-1', runId: 'mock-cr-1', position: 0, itemText: 'Portas destravadas', answer: 'ok', note: '', answeredAt: agora() },
  { id: 'mock-cri-2', runId: 'mock-cr-1', position: 1, itemText: 'Caixa conferido', answer: null, note: '', answeredAt: null },
  { id: 'mock-cri-3', runId: 'mock-cr-1', position: 2, itemText: 'Luzes da vitrine acesas', answer: null, note: '', answeredAt: null },
];

export function createChkMockPort(): ChkPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['chk.run.execute', 'chk.setup.manage']);
    },

    async loadTemplates() {
      return [...templates];
    },

    async loadTemplateItems() {
      return [...templateItems];
    },

    async loadRuns() {
      return [...runs];
    },

    async loadRunItems() {
      return [...runItems];
    },

    async createTemplate(input) {
      const id = `mock-ct-${(seq += 1)}`;
      templates.push({ id, name: input.name, status: 'active' });
      input.items.forEach((itemText, position) => {
        templateItems.push({
          id: `mock-cti-${(seq += 1)}`,
          templateId: id,
          position,
          itemText,
          status: 'active',
        });
      });
    },

    async startRun(input) {
      const t = templates.find((x) => x.id === input.templateId);
      if (!t || t.status !== 'active') throw new Error('modelo não encontrado');
      const id = `mock-cr-${(seq += 1)}`;
      // O mock imita o gatilho: a prancheta nasce copiada, por valor.
      runs.unshift({
        id,
        templateId: t.id,
        templateName: t.name,
        subject: input.subject,
        status: 'in_progress',
        startedAt: agora(),
        completedAt: null,
        abandonReason: '',
        createdAt: agora(),
      });
      templateItems
        .filter((i) => i.templateId === t.id && i.status === 'active')
        .forEach((i) => {
          runItems.push({
            id: `mock-cri-${(seq += 1)}`,
            runId: id,
            position: i.position,
            itemText: i.itemText,
            answer: null,
            note: '',
            answeredAt: null,
          });
        });
      return { runId: id };
    },

    async answerItem(input) {
      const i = runItems.findIndex((x) => x.id === input.itemId);
      if (i < 0) throw new Error('item não encontrado');
      if (runItems[i]!.answer !== null) throw new Error('resposta dada não se rasura');
      runItems[i] = { ...runItems[i]!, answer: input.answer, note: input.note, answeredAt: agora() };
    },

    async setRunStatus(input) {
      const i = runs.findIndex((x) => x.id === input.runId);
      if (i < 0) throw new Error('execução não encontrada');
      runs[i] = {
        ...runs[i]!,
        status: input.status,
        completedAt: input.status === 'completed' ? agora() : null,
        abandonReason: input.abandonReason ?? '',
      };
    },
  };
}
