import { PERMISSIONS } from '@alsham/finance-reconciliation';
import type {
  ApprovalItem,
  MatchingSettings,
  Payable,
  StatementLine,
} from '@alsham/finance-reconciliation';

import type { DataPort } from './port';

/**
 * Adapter MOCKADO — a tela se prova sem banco no ar.
 *
 * Serve o mesmo `DataPort` que o adapter real. Os componentes não sabem qual
 * dos dois está em uso: troca-se o adapter, não a tela.
 *
 * ⚠️ **Lei anti-viés aplicada aos dados de exemplo.** Fornecedores são
 * "Fornecedor Alfa", "Beta", "Gama". Nenhum nome, CNPJ, banco ou valor de
 * empresa real — nem aqui, nem em fixture, nem em comentário.
 *
 * ⚠️ Este arquivo **não** contém regra de negócio. Ele devolve linhas. Quem
 * casa, pontua e ordena é `suggestMatches()`, no pacote.
 */

const TENANT = '00000000-0000-4000-8000-0000000000a1';
const STMT = '00000000-0000-4000-8000-0000000000s1';

/** Data-base fixa: dado de demonstração não pode mudar conforme o dia. */
const HOJE = '2026-07-27';

function line(over: Partial<StatementLine> & { id: string }): StatementLine {
  return {
    tenantId: TENANT,
    statementId: STMT,
    lineNo: 1,
    postedAt: '2026-07-10',
    amountCents: 0,
    currency: 'BRL',
    description: '',
    status: 'unmatched',
    ...over,
  };
}

function payable(over: Partial<Payable> & { id: string }): Payable {
  return {
    tenantId: TENANT,
    source: 'imported',
    externalRef: '',
    dueDate: '2026-07-10',
    amountCents: 0,
    settledAmountCents: 0,
    currency: 'BRL',
    description: '',
    status: 'open',
    ...over,
  };
}

const LINES: StatementLine[] = [
  line({
    id: 'l-001',
    lineNo: 1,
    postedAt: '2026-07-08',
    amountCents: -1_250_00,
    description: 'PAGTO FORNECEDOR NF-2041',
    counterpartyName: 'Fornecedor Alfa Ltda',
    counterpartyTaxId: '11.111.111/0001-11',
    externalId: 'FITID-8801',
  }),
  line({
    id: 'l-002',
    lineNo: 2,
    postedAt: '2026-07-11',
    amountCents: -3_480_50,
    description: 'TED FORNECEDOR BETA',
    counterpartyName: 'Fornecedor Beta SA',
    counterpartyTaxId: '22.222.222/0001-22',
    externalId: 'FITID-8802',
  }),
  line({
    id: 'l-003',
    lineNo: 3,
    postedAt: '2026-07-14',
    amountCents: -890_00,
    description: 'PIX PAGAMENTO SERVICOS',
    counterpartyName: 'Fornecedor Gama ME',
    externalId: 'FITID-8803',
  }),
  line({
    id: 'l-004',
    lineNo: 4,
    postedAt: '2026-07-16',
    amountCents: -12_770_00,
    description: 'DEBITO NAO IDENTIFICADO',
    externalId: 'FITID-8804',
  }),
  line({
    id: 'l-005',
    lineNo: 5,
    postedAt: '2026-07-18',
    amountCents: 4_500_00,
    description: 'CREDITO RECEBIMENTO',
    externalId: 'FITID-8805',
  }),
];

const PAYABLES: Payable[] = [
  payable({
    id: 'p-001',
    externalRef: 'NF-2041',
    dueDate: '2026-07-08',
    amountCents: 1_250_00,
    supplierName: 'Fornecedor Alfa Ltda',
    supplierTaxId: '11111111000111',
    description: 'Insumos — julho',
  }),
  payable({
    id: 'p-002',
    externalRef: 'NF-2042',
    dueDate: '2026-07-12',
    amountCents: 3_480_00,
    supplierName: 'Fornecedor Beta SA',
    supplierTaxId: '22222222000122',
    description: 'Serviço contratado — julho',
  }),
  payable({
    id: 'p-003',
    externalRef: 'NF-2043',
    dueDate: '2026-07-15',
    amountCents: 890_00,
    supplierName: 'Fornecedor Gama ME',
    description: 'Manutenção preventiva',
  }),
  payable({
    id: 'p-004',
    externalRef: 'NF-2044',
    dueDate: '2026-07-20',
    amountCents: 6_100_00,
    supplierName: 'Fornecedor Delta Ltda',
    supplierTaxId: '44444444000144',
    description: 'Contrato mensal',
  }),
];

const APPROVALS: ApprovalItem[] = [
  {
    id: 'a-001',
    tenantId: TENANT,
    subjectType: 'reconciliation-match',
    subjectId: 'l-002',
    title: 'Casamento com diferença de R$ 0,50 — NF-2042',
    amountCents: 3_480_00,
    currency: 'BRL',
    status: 'pending',
    requestedAt: '2026-07-25T14:12:00.000Z',
    requestedBy: '00000000-0000-4000-8000-0000000000u1',
  },
  {
    id: 'a-002',
    tenantId: TENANT,
    subjectType: 'reconciliation-match',
    subjectId: 'l-003',
    title: 'Casamento sem documento fiscal da contraparte — NF-2043',
    amountCents: 890_00,
    currency: 'BRL',
    status: 'pending',
    requestedAt: '2026-07-26T09:40:00.000Z',
    requestedBy: '00000000-0000-4000-8000-0000000000u1',
  },
  {
    id: 'a-003',
    tenantId: TENANT,
    subjectType: 'statement-closure',
    subjectId: STMT,
    title: 'Fechamento do extrato de julho com 1 divergência em aberto',
    amountCents: 12_770_00,
    currency: 'BRL',
    status: 'pending',
    requestedAt: `${HOJE}T08:05:00.000Z`,
    requestedBy: '00000000-0000-4000-8000-0000000000u1',
  },
];

/**
 * A política do tenant fictício.
 *
 * No adapter real isto vem de `core.tenant_modules.settings`. Está aqui
 * porque o mock precisa devolver *alguma* política — não porque o app tenha
 * uma. Repare que a tela nunca lê estes números: ela os repassa ao motor.
 */
const SETTINGS: MatchingSettings = {
  amountToleranceCents: 100,
  dateToleranceDays: 5,
  minScore: 0.6,
};

/** Permissões do operador de demonstração: concilia E visa. */
const GRANTED: ReadonlySet<string> = new Set([
  PERMISSIONS.statementImport,
  PERMISSIONS.matchManage,
  PERMISSIONS.approvalDecide,
]);

export function createMockPort(): DataPort {
  return {
    kind: 'mock',
    async listPermissions() {
      return GRANTED;
    },
    async loadMatchingSettings() {
      return SETTINGS;
    },
    async loadStatementLines() {
      return LINES;
    },
    async loadPayables() {
      return PAYABLES;
    },
    async loadApprovalQueue() {
      return APPROVALS;
    },
    async decideMatch() {
      // Sem banco, não há o que gravar. A tela revalida e continua mostrando
      // o mock — e diz ao operador, na própria interface, que está em modo
      // de demonstração. Fingir que gravou seria pior do que não gravar.
    },
    async decideApproval() {
      // idem.
    },
  };
}
