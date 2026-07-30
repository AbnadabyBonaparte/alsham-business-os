import type { Adjustment, Renewal } from '@alsham/contracts';

import type { ContractRow, CtrPort, NewContractDraft } from './ctr-port';

const agora = () => new Date().toISOString();
const dia = (delta: number) => new Date(Date.now() + delta * 86400000).toISOString().slice(0, 10);

let seq = 1;

const contracts: ContractRow[] = [
  {
    id: 'mock-ctr-1',
    externalRef: 'CTR-2026-001',
    title: 'Prestação de serviços de limpeza',
    description: '',
    contractType: 'prestação',
    counterpartyName: 'Fornecedora Demo Ltda',
    counterpartyTaxId: null,
    partyId: null,
    startsOn: dia(-300),
    endsOn: dia(20),
    valueCents: 480000,
    currency: 'BRL',
    status: 'active',
    outcomeReason: '',
    decidedAt: null,
    createdAt: agora(),
  },
  {
    id: 'mock-ctr-2',
    externalRef: 'CTR-2026-002',
    title: 'Locação de sala comercial',
    description: '',
    contractType: 'locação',
    counterpartyName: 'Imobiliária Demo',
    counterpartyTaxId: null,
    partyId: null,
    startsOn: dia(-30),
    endsOn: null,
    valueCents: 350000,
    currency: 'BRL',
    status: 'active',
    outcomeReason: '',
    decidedAt: null,
    createdAt: agora(),
  },
];

const adjustments: Adjustment[] = [
  {
    id: 'mock-adj-1',
    contractId: 'mock-ctr-1',
    adjustedOn: dia(-60),
    indexName: 'IGP-M',
    previousValueCents: 450000,
    newValueCents: 480000,
    note: 'reajuste anual',
    registeredAt: agora(),
  },
];

const renewals: Renewal[] = [];

export function createCtrMockPort(): CtrPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['ctr.contract.manage', 'ctr.contract.amend', 'ctr.contract.decide']);
    },

    async loadContracts() {
      return [...contracts];
    },

    async loadAdjustments() {
      return [...adjustments];
    },

    async loadRenewals() {
      return [...renewals];
    },

    async createContract(input: NewContractDraft) {
      const id = `mock-ctr-${(seq += 1)}`;
      contracts.unshift({
        id,
        ...input,
        partyId: null,
        status: 'draft',
        outcomeReason: '',
        decidedAt: null,
        createdAt: agora(),
      });
      return { contractId: id };
    },

    async setStatus(input) {
      const c = contracts.find((x) => x.id === input.contractId);
      if (!c) throw new Error('contrato não encontrado');
      const i = contracts.indexOf(c);
      contracts[i] = {
        ...c,
        status: input.status,
        outcomeReason: input.reason ?? c.outcomeReason,
        decidedAt: input.status === 'ended' || input.status === 'terminated' ? agora() : c.decidedAt,
      };
    },

    async registerAdjustment(input) {
      const anterior =
        [...adjustments]
          .filter((a) => a.contractId === input.contractId)
          .sort((a, b) => a.adjustedOn.localeCompare(b.adjustedOn))
          .at(-1)?.newValueCents ??
        contracts.find((c) => c.id === input.contractId)?.valueCents ??
        0;
      adjustments.push({
        id: `mock-adj-${(seq += 1)}`,
        contractId: input.contractId,
        adjustedOn: input.adjustedOn,
        indexName: input.indexName,
        previousValueCents: anterior,
        newValueCents: input.newValueCents,
        note: input.note,
        registeredAt: agora(),
      });
    },

    async renewContract(input) {
      const c = contracts.find((x) => x.id === input.contractId);
      if (!c) throw new Error('contrato não encontrado');
      const anterior =
        [...renewals]
          .filter((r) => r.contractId === input.contractId)
          .sort((a, b) => a.renewedAt.localeCompare(b.renewedAt))
          .at(-1)?.newEndsOn ?? c.endsOn;
      renewals.push({
        id: `mock-ren-${(seq += 1)}`,
        contractId: input.contractId,
        previousEndsOn: anterior ?? '',
        newEndsOn: input.newEndsOn,
        note: input.note,
        renewedAt: agora(),
      });
    },
  };
}
