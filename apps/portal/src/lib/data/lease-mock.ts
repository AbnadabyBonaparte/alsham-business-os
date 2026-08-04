import type {
  LeasePort,
  LeaseAgreementRow,
  LeaseSalesReportRow,
} from './lease-port';

// Dados fabricados e anônimos — modo de demonstração, sem nome de cliente.
const agreements: LeaseAgreementRow[] = [
  {
    id: 'mock-lease-1',
    storeName: 'Moda Aurora — Loja 12',
    contractRef: 'CTR-2026-014',
    revenueShare: '7% sobre o faturamento, mínimo garantido',
    status: 'active',
    endReason: '',
  },
  {
    id: 'mock-lease-2',
    storeName: 'Café do Átrio — Quiosque 3',
    contractRef: 'CTR-2026-021',
    revenueShare: '9% sobre o faturamento',
    status: 'active',
    endReason: '',
  },
  {
    id: 'mock-lease-3',
    storeName: 'Ateliê Prisma — Loja 4',
    contractRef: 'CTR-2025-198',
    revenueShare: '6% sobre o faturamento',
    status: 'ended',
    endReason: 'Fim de vigência sem renovação',
  },
];

const salesReports: LeaseSalesReportRow[] = [
  { id: 'mock-sr-1', agreementId: 'mock-lease-1', competency: '2026-07-01', amountCents: 184_500_00, currency: 'BRL', note: '' },
  { id: 'mock-sr-2', agreementId: 'mock-lease-1', competency: '2026-06-01', amountCents: 171_200_00, currency: 'BRL', note: 'Semana de liquidação no fim do mês' },
  { id: 'mock-sr-3', agreementId: 'mock-lease-2', competency: '2026-07-01', amountCents: 62_800_00, currency: 'BRL', note: '' },
  { id: 'mock-sr-4', agreementId: 'mock-lease-2', competency: '2026-06-01', amountCents: 58_100_00, currency: 'BRL', note: '' },
  { id: 'mock-sr-5', agreementId: 'mock-lease-3', competency: '2026-05-01', amountCents: 41_900_00, currency: 'BRL', note: 'Última competência antes do encerramento' },
];

export function createLeaseMockPort(): LeasePort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set<string>();
    },

    async loadAgreements() {
      return [...agreements];
    },

    async loadSalesReports() {
      return [...salesReports];
    },
  };
}
