import { computeAllocations } from '@alsham/cost-centers';

import type { ByCenterRow, CcPort, CenterRow, ExecutionRow, RuleRow } from './cc-port';

const agora = () => new Date().toISOString();
let seq = 10;
let execSeq = 0;

const centers: CenterRow[] = [
  { id: 'mock-cc-1', name: 'Administrativo', status: 'active', createdAt: agora() },
  { id: 'mock-cc-2', name: 'Comercial', status: 'active', createdAt: agora() },
  { id: 'mock-cc-3', name: 'Zeladoria', status: 'archived', createdAt: agora() },
];

const rules: RuleRow[] = [
  {
    id: 'mock-cr-1',
    name: 'Rateio da matriz',
    status: 'active',
    createdAt: agora(),
    lines: [
      { centerId: 'mock-cc-1', basisPoints: 6000 },
      { centerId: 'mock-cc-2', basisPoints: 4000 },
    ],
  },
  { id: 'mock-cr-2', name: 'Rateio da obra (rascunho)', status: 'draft', createdAt: agora(), lines: [] },
];

const executions: ExecutionRow[] = [];
const allocated: Record<string, number> = {};

function recomputeByCenter(): ByCenterRow[] {
  const out: Record<string, ByCenterRow> = {};
  for (const [key, cents] of Object.entries(allocated)) {
    const [centerId, currency] = key.split('|');
    const center = centers.find((c) => c.id === centerId);
    out[key] = {
      centerId: centerId!,
      centerName: center?.name ?? centerId!,
      currency: currency!,
      allocatedCents: cents,
      allocationCount: 1,
    };
  }
  return Object.values(out);
}

export function createCcMockPort(): CcPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['cc.center.manage', 'cc.rule.design', 'cc.rateio.execute']);
    },

    async loadCenters() {
      return [...centers];
    },
    async loadRules() {
      return rules.map((r) => ({ ...r, lines: [...r.lines] }));
    },
    async loadExecutions() {
      return [...executions];
    },
    async loadByCenter() {
      return recomputeByCenter();
    },

    async createCenter(input) {
      const id = `mock-cc-${(seq += 1)}`;
      centers.push({ id, name: input.name, status: 'active', createdAt: agora() });
      return { centerId: id };
    },
    async setCenterStatus(input) {
      const c = centers.find((x) => x.id === input.centerId);
      if (c) (c as { status: string }).status = input.status;
    },
    async createRule(input) {
      const id = `mock-cr-${(seq += 1)}`;
      rules.push({ id, name: input.name, status: 'draft', createdAt: agora(), lines: [] });
      return { ruleId: id };
    },
    async addRuleLine(input) {
      const i = rules.findIndex((x) => x.id === input.ruleId);
      if (i < 0) throw new Error('regra não encontrada');
      if (rules[i]!.status !== 'draft') throw new Error('a regra ativa está congelada');
      rules[i] = {
        ...rules[i]!,
        lines: [...rules[i]!.lines, { centerId: input.centerId, basisPoints: input.basisPoints }],
      };
    },
    async removeRuleLine(input) {
      const i = rules.findIndex((x) => x.id === input.ruleId);
      if (i < 0) return;
      if (rules[i]!.status !== 'draft') throw new Error('a regra ativa está congelada');
      rules[i] = { ...rules[i]!, lines: rules[i]!.lines.filter((l) => l.centerId !== input.centerId) };
    },
    async setRuleStatus(input) {
      const r = rules.find((x) => x.id === input.ruleId);
      if (!r) throw new Error('regra não encontrada');
      if (input.status === 'active') {
        const sum = r.lines.reduce((n, l) => n + l.basisPoints, 0);
        if (r.lines.length === 0 || sum !== 10000) throw new Error('a regra fecha 100% ou não ativa');
      }
      (r as { status: string }).status = input.status;
    },
    async executeRateio(input) {
      const r = rules.find((x) => x.id === input.ruleId);
      if (!r) throw new Error('regra não encontrada');
      if (r.status !== 'active') throw new Error('só a regra ativa rateia');
      execSeq += 1;
      executions.unshift({
        id: `mock-ce-${execSeq}`,
        seq: execSeq,
        ruleId: r.id,
        ruleName: r.name,
        sourceKind: input.sourceKind,
        sourceRef: null,
        sourceName: input.sourceName,
        totalCents: input.totalCents,
        currency: input.currency,
        competenceOn: input.competenceOn,
        note: input.note,
        reason: input.reason,
        executedAt: agora(),
      });
      for (const share of computeAllocations(input.totalCents, r.lines)) {
        const key = `${share.centerId}|${input.currency}`;
        allocated[key] = (allocated[key] ?? 0) + share.amountCents;
      }
    },
  };
}
