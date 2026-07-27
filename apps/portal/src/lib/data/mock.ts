import { PERMISSIONS } from '@alsham/finance-reconciliation';
import type {
  ApprovalItem,
  BankStatement,
  CsvMapping,
  MatchingSettings,
  Payable,
  StatementLine,
} from '@alsham/finance-reconciliation';

import { DataPortError, type DataPort } from './port';

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

/**
 * Um extrato de demonstração, já importado.
 *
 * Dá à tela de fechamento algo para mostrar sem banco — inclusive a
 * divergência, que é o número que interessa.
 */
const STATEMENTS: BankStatement[] = [
  {
    id: STMT,
    tenantId: TENANT,
    accountRef: 'conta-corrente-1',
    sourceFormat: 'ofx',
    originalFilename: 'extrato-julho.ofx',
    contentHash: 'demonstracao',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    openingBalanceCents: null,
    closingBalanceCents: 1_500_000,
    currency: 'BRL',
    status: 'reconciling',
    importedAt: '2026-07-25T12:00:00.000Z',
  },
];

/**
 * O mapeamento de CSV do tenant fictício.
 *
 * Na vida real vem de `settings.import.csvMapping`. Está aqui porque o mock
 * precisa devolver *algum* mapeamento — não porque o app tenha um.
 */
const CSV_MAPPING: CsvMapping = {
  delimiter: ';',
  hasHeader: true,
  decimalSeparator: ',',
  dateOrder: 'DMY',
  columns: {
    postedAt: 'Data',
    description: 'Historico',
    amount: 'Valor',
    counterpartyName: 'Contraparte',
    externalId: 'Documento',
  },
};

/** O que uma escrita no modo de demonstração responde. */
function semBanco(): never {
  throw new DataPortError(
    'Modo de demonstração: não há banco configurado, então nada foi gravado. Configure NEXT_PUBLIC_SUPABASE_URL para operar de verdade.',
  );
}

export function createMockPort(): DataPort {
  return {
    kind: 'mock',
    async listPermissions() {
      return GRANTED;
    },
    async loadMatchingSettings() {
      return SETTINGS;
    },
    async loadCsvMapping() {
      return CSV_MAPPING;
    },
    async loadStatementLines() {
      return LINES;
    },
    async loadLinesOfStatement(statementId) {
      return LINES.filter((l) => l.statementId === statementId);
    },
    async loadOpenStatements() {
      return STATEMENTS;
    },
    async loadPayables() {
      return PAYABLES;
    },
    async loadApprovalQueue() {
      return APPROVALS;
    },
    // ── escrita ──────────────────────────────────────────────────────────
    // Sem banco não há o que gravar, e **fingir que gravou seria pior do que
    // não gravar**: o operador acharia que importou um extrato que não existe.
    // Por isso a escrita recusa com mensagem, em vez de responder "ok".
    async importStatement() {
      semBanco();
    },
    async closeStatement() {
      semBanco();
    },
    async discardStatement() {
      semBanco();
    },
    async decideMatch() {
      semBanco();
    },
    async decideApproval() {
      semBanco();
    },
  };
}
