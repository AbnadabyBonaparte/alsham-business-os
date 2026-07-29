import { PERMISSIONS, canTransition } from '@alsham/accounts-payable';
import type { Payable, PayableStatus } from '@alsham/accounts-payable';

import { DataPortError } from './port';
import type { ApPort, PayableRow } from './ap-port';

/**
 * Adapter MOCKADO do Módulo 3 — a tela se prova sem banco no ar.
 *
 * ⚠️ **Lei anti-viés aplicada aos dados de exemplo.** Os fornecedores são
 * "Fornecedor Alfa", "Beta", "Gama"; as referências são `DOC-*`; as descrições
 * são genéricas. Nenhum nome de empresa, CNPJ, banco ou instrumento de
 * pagamento de país nenhum — nem aqui, nem em fixture, nem em comentário. É por
 * onde o viés costuma entrar.
 *
 * ⚠️ Este arquivo **não** contém regra de negócio própria. A única lei que ele
 * aplica é a do pacote, chamando `canTransition()` — porque um mock que aceita
 * o que o banco recusa faz a demonstração mentir sobre o produto.
 */

/** Data-base fixa: dado de demonstração não pode mudar conforme o dia. */
const HOJE = '2026-07-28';

function titulo(over: Partial<PayableRow> & { id: string; externalRef: string }): PayableRow {
  return {
    dueDate: '2026-08-15',
    amountCents: 100_000,
    settledAmountCents: 0,
    currency: 'BRL',
    supplierName: null,
    counterpartyTaxId: null,
    description: '',
    paymentMethod: null,
    status: 'open',
    createdAt: `${HOJE}T09:00:00.000Z`,
    ...over,
  };
}

const TITULOS: PayableRow[] = [
  titulo({
    id: 'p-alfa',
    externalRef: 'DOC-2026-0001',
    supplierName: 'Fornecedor Alfa',
    description: 'Serviço contratado, parcela única.',
    dueDate: '2026-08-05',
    amountCents: 450_000,
  }),
  titulo({
    id: 'p-beta',
    externalRef: 'DOC-2026-0002',
    supplierName: 'Fornecedor Beta',
    description: 'Título com liquidação parcial registrada.',
    dueDate: '2026-08-20',
    amountCents: 1_200_000,
    settledAmountCents: 400_000,
    status: 'partially_settled',
    paymentMethod: 'transferência',
  }),
  titulo({
    id: 'p-gama',
    externalRef: 'DOC-2026-0003',
    supplierName: 'Fornecedor Gama',
    // ⭐ Vencido, de propósito: é o estado que a tela precisa saber destacar.
    // Vencimento no passado não é erro — quem migra sistema tem gaveta cheia.
    description: 'Título vencido, ainda em aberto.',
    dueDate: '2026-07-10',
    amountCents: 89_900,
  }),
  titulo({
    id: 'p-delta',
    externalRef: 'DOC-2026-0004',
    supplierName: 'Fornecedor Delta',
    description: 'Título liquidado — não aceita cancelamento.',
    dueDate: '2026-07-01',
    amountCents: 250_000,
    settledAmountCents: 250_000,
    status: 'settled',
  }),
  titulo({
    id: 'p-epsilon',
    externalRef: 'DOC-2026-0005',
    supplierName: 'Fornecedor Épsilon',
    description: 'Título cancelado — continua na lista, e é o ponto.',
    dueDate: '2026-09-01',
    amountCents: 33_000,
    status: 'cancelled',
  }),
];

export function createApMockPort(): ApPort {
  // Cópia por instância: uma demonstração não contamina a outra.
  const titulos = TITULOS.map((t) => ({ ...t }));
  let proximo = 1;

  return {
    kind: 'mock',

    async listPermissions() {
      // As duas, para a demonstração exercitar a tela inteira. Quem separa
      // registrar de cancelar é o papel do tenant, no banco.
      return new Set(Object.values(PERMISSIONS));
    },

    async loadPayables() {
      return titulos.map((t) => ({ ...t }));
    },

    async createPayable(payable: Payable) {
      if (titulos.some((t) => t.externalRef === payable.externalRef)) {
        // O banco tem `unique (tenant_id, external_ref)`. O mock recusa igual,
        // com a mesma mensagem: demonstração que aceita o que produção recusa
        // ensina o operador errado.
        throw new DataPortError(
          `Já existe um título com a referência ${payable.externalRef}.`,
        );
      }
      const id = `p-novo-${proximo++}`;
      titulos.unshift({ ...payable, id, createdAt: `${HOJE}T12:00:00.000Z` });
      return { payableId: id };
    },

    async applySettlement(input: {
      payableId: string;
      settledAmountCents: number;
      status: PayableStatus;
      settlementMethod: string | null;
    }) {
      const alvo = titulos.find((t) => t.id === input.payableId);
      if (!alvo) throw new DataPortError('Título não encontrado.');
      // ⛔ O mock recusa o que o banco recusa: pagar a maior. Um mock
      // permissivo faria a demonstração prometer o que o produto nega.
      if (input.settledAmountCents > alvo.amountCents) {
        throw new DataPortError(
          'O valor liquidado passaria do valor do título. Pagar a maior é recusado por este módulo — confira o valor.',
        );
      }
      alvo.settledAmountCents = input.settledAmountCents;
      alvo.status = input.status;
      if (input.settlementMethod !== null) alvo.paymentMethod = input.settlementMethod;
    },

    async updateStatus({ payableId, status }: { payableId: string; status: PayableStatus }) {
      const alvo = titulos.find((t) => t.id === payableId);
      if (!alvo) throw new DataPortError('Título não encontrado.');
      if (!canTransition(alvo.status, status)) {
        throw new DataPortError(
          `Um título ${alvo.status} não pode passar para ${status}.`,
        );
      }
      alvo.status = status;
    },
  };
}
